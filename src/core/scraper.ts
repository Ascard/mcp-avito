/**
 * Main Avito scraper
 */

import type { Page } from 'playwright';
import { BrowserManager } from './browser.js';
import { AvitoParser } from './parser.js';
import { ProxyManager } from './proxy-manager.js';
import { buildSearchUrl } from '../utils/url-builder.js';
import { randomSleep } from '../utils/delays.js';
import type {
  SearchFilters,
  SearchResult,
  ItemDetails,
  ScraperOptions,
  ScraperError,
  CaptchaError,
} from './types.js';

export class AvitoScraper {
  private browser: BrowserManager;
  private parser: AvitoParser;
  private options: ScraperOptions;
  private proxyManager: ProxyManager | null = null;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      retries: 3,
      delayMs: [1000, 3000],
      captchaTimeoutMs: 120000,
      captchaPollMs: 3000,
      manualCaptchaFallback: true,
      ...options,
    };

    this.browser = new BrowserManager(this.options);
    this.parser = new AvitoParser();

    // Initialize proxy manager if proxy options provided
    if (this.options.proxy?.enabled) {
      this.proxyManager = new ProxyManager(
        [],
        this.options.proxy.rotation || 'sequential',
        this.options.proxy.rotateEveryN || 0
      );
    }
  }

  /**
   * Initialize scraper
   */
  async initialize(): Promise<void> {
    // Load proxies if configured
    if (this.proxyManager && this.options.proxy?.listFile) {
      console.error(`Загружаем прокси из: ${this.options.proxy.listFile}`);
      const count = await this.proxyManager.loadFromFile(this.options.proxy.listFile);
      console.error(`Загружено ${count} прокси`);
    }

    // Get proxy for browser initialization
    const proxy = this.proxyManager?.getProxy() || undefined;
    if (proxy) {
      console.error(`Инициализируем браузер с прокси: ${proxy.type}://${proxy.host}:${proxy.port}`);
    }
    await this.browser.initialize(proxy);
  }

  /**
   * Search for items
   */
  async search(filters: SearchFilters): Promise<SearchResult[]> {
    if (!this.browser.isInitialized()) {
      await this.initialize();
    }

    const url = buildSearchUrl(filters);
    console.error(`Ищем: ${url}`);

    // Reuse the same page/window across requests instead of opening a new
    // browser window every time (which looks suspicious and triggers captcha).
    // A fresh page is only created on the first request.
    let page = await this.browser.getPage();

    {
      // Rotate proxy if needed
      if (this.proxyManager && this.options.proxy?.rotateOnError) {
        const proxy = this.proxyManager.getProxy();
        if (proxy) {
          // Note: Changing proxy requires re-initializing browser
          // For now, we'll use the same proxy throughout the session
        }
      }
      // Navigate to search page.
      // Note: do NOT wait for 'load' — Avito pages keep hanging requests
      // (trackers, hcaptcha) that may never let the load event fire,
      // which would time out page.goto even though the content is ready.
      // Content readiness is handled by waitForResults() below.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait for page to stabilize
      await page.waitForTimeout(3000);

      // Add random delay (anti-bot)
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }

      // Check for captcha (with error handling).
      // If captcha is detected in headless mode and manualCaptchaFallback is
      // enabled, restart the browser in headed mode so the user can solve it.
      try {
        if (await this.parser.detectCaptcha(page)) {
          page = await this.resolveCaptcha(page, url);
        }
      } catch (error: any) {
        if (error.message?.includes('Captcha')) {
          throw error;
        }
        console.error('Предупреждение: не удалось проверить капчу:', error.message);
      }

      // Check if blocked
      try {
        if (await this.parser.isBlocked(page)) {
          throw new Error('Access blocked') as ScraperError;
        }
      } catch (error: any) {
        if (error.message?.includes('Access blocked')) {
          throw error;
        }
        console.error('Предупреждение: не удалось проверить блокировку:', error.message);
      }

      // Wait for results
      const hasResults = await this.parser.waitForResults(page);
      if (!hasResults) {
        console.error('Результаты не найдены или страница не загрузилась');
        return [];
      }

      // Parse results
      const results = await this.parser.parseSearchResults(page);
      console.error(`Найдено ${results.length} объявлений`);

      return results;
    }
  }

  /**
   * Resolve a captcha that was detected on the page.
   *
   * - headed mode: show the popup in the window and wait for the user to solve it.
   * - headless mode + manualCaptchaFallback: restart the browser in headed mode
   *   (so the user can actually see it), navigate back to the URL, then show the
   *   popup and wait.
   *
   * @returns the page on which the captcha is considered solved.
   * @throws CaptchaError if the captcha is not solved in time or fallback is off.
   */
  private async resolveCaptcha(page: Page, url: string): Promise<Page> {
    // Headless without fallback: we can't show the browser window, fail fast.
    if (this.options.headless && !this.options.manualCaptchaFallback) {
      throw new Error('Captcha detected') as CaptchaError;
    }

    // Headless with fallback: restart in headed mode so the user can solve it.
    if (this.options.headless && this.options.manualCaptchaFallback) {
      console.error('\n⚠️  Обнаружена капча в headless-режиме.');
      console.error('Перезапускаем браузер в видимом режиме, чтобы вы могли решить её вручную...\n');

      await this.browser.close();

      this.options.headless = false;
      const proxy = this.proxyManager?.getProxy() || undefined;
      await this.browser.initialize(proxy);

      // Navigate to the same URL in the newly opened (visible) window.
      const freshPage = await this.browser.getPage();
      await freshPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      return this.waitForCaptchaResolution(freshPage);
    }

    // Headed mode: just ask the user to solve it in the current window.
    return this.waitForCaptchaResolution(page);
  }

  /**
   * Show the captcha popup in the window and poll until the user solves it,
   * or until the timeout expires.
   */
  private async waitForCaptchaResolution(page: Page): Promise<Page> {
    const captchaTimeout = this.options.captchaTimeoutMs || 120000;
    const pollMs = this.options.captchaPollMs || 3000;

    console.error('\n⚠️  Обнаружена капча! Пожалуйста, решите её в окне браузера.');
    await this.showCaptchaPopup(page, captchaTimeout);

    const startedAt = Date.now();
    let solved = false;
    while (Date.now() - startedAt < captchaTimeout) {
      if (!(await this.parser.detectCaptcha(page))) {
        solved = true;
        break;
      }
      const remaining = Math.max(0, Math.round((captchaTimeout - (Date.now() - startedAt)) / 1000));
      await this.updateCaptchaPopup(page, remaining);
      await page.waitForTimeout(pollMs);
    }

    await this.hideCaptchaPopup(page);

    if (!solved) {
      throw new Error('Captcha still present after manual solution attempt') as CaptchaError;
    }
    console.error('✓ Капча решена, продолжаем...\n');

    return page;
  }

  /**
   * Show a popup in the browser window asking the user to solve the captcha.
   * The banner is small, pinned to a corner and does NOT block the page —
   * pointer-events pass through so the user can see and interact with the
   * captcha behind it.
   */
  private async showCaptchaPopup(page: Page, timeoutMs: number): Promise<void> {
    await page.evaluate(
      (timeoutMs) => {
        const popupId = '__avito_captcha_popup__';
        document.getElementById(popupId)?.remove();

        // Container: fixed, corner-pinned, click-through.
        const container = document.createElement('div');
        container.id = popupId;
        container.style.cssText = [
          'position: fixed',
          'top: 12px',
          'right: 12px',
          'width: 300px',
          'z-index: 2147483647',
          'pointer-events: none',
          'font-family: Arial, sans-serif',
        ].join(';');

        // Box: only this element is interactive.
        const box = document.createElement('div');
        box.style.cssText = [
          'background: #fff',
          'border: 1px solid #d0d0d0',
          'border-radius: 10px',
          'padding: 14px 18px',
          'box-shadow: 0 4px 20px rgba(0,0,0,0.25)',
          'pointer-events: auto',
        ].join(';');

        box.innerHTML = [
          '<div style="font-size:22px;margin-bottom:6px;">⚠️ Капча</div>',
          '<div style="font-size:13px;color:#444;line-height:1.5;margin-bottom:10px;">',
          'Avito запросил проверку. Решите капчу прямо на странице.',
          '</div>',
          '<div id="__avito_captcha_timer__" style="font-size:12px;color:#888;"></div>',
        ].join('');

        container.appendChild(box);
        document.body.appendChild(container);

        const timerEl = document.getElementById('__avito_captcha_timer__')!;
        const seconds = Math.round(timeoutMs / 1000);
        timerEl.textContent = `Ожидание: до ${seconds} сек. Проверяем автоматически после решения.`;
      },
      timeoutMs
    );
  }

  /**
   * Update the popup timer text.
   */
  private async updateCaptchaPopup(page: Page, remainingSec: number): Promise<void> {
    await page.evaluate(
      (remainingSec) => {
        const timerEl = document.getElementById('__avito_captcha_timer__');
        if (timerEl) {
          timerEl.textContent = `Ожидание: осталось ~${remainingSec} сек. Проверяем автоматически после решения.`;
        }
      },
      remainingSec
    );
  }

  /**
   * Remove the captcha popup from the page.
   */
  private async hideCaptchaPopup(page: Page): Promise<void> {
    await page.evaluate(() => {
      document.getElementById('__avito_captcha_popup__')?.remove();
    });
  }

  /**
   * TEMPORARY diagnostic tool: navigate to the page in the shared browser and
   * return raw DOM structure diagnostics (marker inventory, first item HTML,
   * body text) so we can reverse-engineer current Avito selectors.
   */
  async debugDom(url: string): Promise<any> {
    if (!this.browser.isInitialized()) {
      await this.initialize();
    }

    console.error(`[DEBUG] Открываем: ${url}`);
    let page = await this.browser.getPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    try {
      if (await this.parser.detectCaptcha(page)) {
        page = await this.resolveCaptcha(page, url);
      }
    } catch (error: any) {
      console.error('[DEBUG] Не удалось проверить капчу:', error.message);
    }

    return page.evaluate(() => {
      const markerCounts: Record<string, number> = {};
      document.querySelectorAll('[data-marker]').forEach((el) => {
        const mk = el.getAttribute('data-marker');
        if (mk) markerCounts[mk] = (markerCounts[mk] || 0) + 1;
      });

      const allMarkers = Object.entries(markerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80);

      const firstItem = document.querySelector('[data-marker="item"]');
      const firstItemHtml = firstItem ? firstItem.outerHTML.slice(0, 5000) : null;

      const geoEls = Array.from(document.querySelectorAll('[data-geo-name]')).map(
        (el) => el.outerHTML.slice(0, 300)
      );
      const dateEls = Array.from(document.querySelectorAll('[data-marker="item-date"]')).map(
        (el) => el.outerHTML.slice(0, 300)
      );
      const mappedEls = Array.from(document.querySelectorAll('[itemprop]')).map((el) => {
        const props: string[] = [];
        el.querySelectorAll('*').forEach((child) => {
          const p = child.getAttribute('itemprop');
          if (p) props.push(p);
        });
        return {
          tag: el.tagName,
          itemprop: el.getAttribute('itemprop'),
          text: (el.textContent || '').trim().slice(0, 80),
          childProps: props.slice(0, 10),
          html: el.outerHTML.slice(0, 250),
        };
      });

      return {
        finalUrl: window.location.href,
        title: document.title,
        itemCount: document.querySelectorAll('[data-marker="item"]').length,
        allMarkers,
        firstItemHtml,
        geoEls: geoEls.slice(0, 5),
        dateEls: dateEls.slice(0, 8),
        mappedEls: mappedEls.slice(0, 25),
        bodyHead: (document.body?.innerText || '').slice(0, 300),
      };
    });
  }

  /**
   * Get item details
   */
  async getItemDetails(url: string): Promise<ItemDetails> {
    if (!this.browser.isInitialized()) {
      await this.initialize();
    }

    console.error(`Получаем детали: ${url}`);

    let page = await this.browser.getPage();

    {
      // Navigate to item page
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Add random delay
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }

      // Check for captcha (with manual fallback if headless)
      if (await this.parser.detectCaptcha(page)) {
        page = await this.resolveCaptcha(page, url);
      }

      // Parse details
      const details = await this.parser.parseItemDetails(page);

      return details;
    }
  }

  /**
   * Search all pages (generator)
   */
  async *searchAllPages(filters: SearchFilters): AsyncGenerator<SearchResult, void, undefined> {
    let currentPage = filters.page || 1;
    let hasMore = true;

    while (hasMore) {
      const results = await this.search({
        ...filters,
        page: currentPage,
      });

      if (results.length === 0) {
        hasMore = false;
        break;
      }

      for (const result of results) {
        yield result;
      }

      currentPage++;

      // Add delay between pages
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }
    }
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    await this.browser.close();
  }

  /**
   * Check if scraper is initialized
   */
  isInitialized(): boolean {
    return this.browser.isInitialized();
  }

  /**
   * Set headless mode (used to reset after a captcha fallback restart).
   */
  setHeadless(headless: boolean): void {
    this.options.headless = headless;
  }
}
