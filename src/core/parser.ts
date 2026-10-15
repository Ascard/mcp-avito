/**
 * HTML parser for Avito pages
 */

import type { Page } from 'playwright';
import type { SearchResult, ItemDetails } from './types.js';
import { normalizeItemUrl } from '../utils/url-builder.js';

export class AvitoParser {
  /**
   * Parse search results from page
   */
  async parseSearchResults(page: Page): Promise<SearchResult[]> {
    const results = await page.evaluate(() => {
      // @ts-ignore - runs in browser context
      const items: any[] = [];
      const text = (el: Element | null | undefined): string =>
        (el?.textContent || '').trim();

      // Avito uses data-marker attribute for items
      // Selectors may need adjustment based on actual HTML structure
      const itemElements = document.querySelectorAll('[data-marker="item"]');

      itemElements.forEach((element) => {
        try {
          // Title: itemprop, else the current item-title marker
          const titleEl =
            element.querySelector('[itemprop="name"]') ||
            element.querySelector('[data-marker="item-title"]');
          const title = text(titleEl);

          // Price: itemprop content, else item-price-value marker / text
          const priceEl =
            element.querySelector('[itemprop="price"]') ||
            element.querySelector('[data-marker="item-price-value"], [data-marker="item-price"]');
          const priceAttr = priceEl?.getAttribute('content');
          const priceText =
            priceAttr ||
            text(priceEl) ||
            text(element.querySelector('[class*="price" i]'));
          const price = parseInt((priceText || '').replace(/\D/g, ''), 10) || 0;

          // URL
          const linkEl =
            element.querySelector('a[itemprop="url"]') ||
            element.querySelector('a[href*="/avito/"], a[href*="avito.ru/"], a[href^="/"]');
          const url = linkEl?.getAttribute('href') || '';

          // Image
          const imageEl = element.querySelector('img[itemprop="image"]') || element.querySelector('img');
          const imageUrl = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';

          // Location: the current item-location marker, then legacy selectors
          const locationEl =
            element.querySelector('[data-marker="item-location"]') ||
            element.querySelector('[data-geo-name]') ||
            element.querySelector('[data-marker="item-address"], [class*="geo-text" i], [class*="item-address" i], [class*="address" i]');
          const location = locationEl?.textContent?.trim() || '';

          // Description
          const descEl = element.querySelector('[class*="description"]');
          const description = descEl?.textContent?.trim() || '';

          // Date
          const dateEl = element.querySelector('[data-marker="item-date"]');
          const publishedAt = dateEl?.textContent?.trim() || '';

          // Extract ID from data attribute or URL
          const itemId =
            element.getAttribute('data-item-id') ||
            url.match(/\/(\d+)(?:[?#]|$)/)?.[1] ||
            '';

          if (title && url) {
            items.push({
              id: itemId,
              title,
              price,
              currency: 'RUB',
              location,
              url,
              imageUrl,
              description,
              publishedAt,
            });
          }
        } catch (error) {
          console.error('Ошибка при парсинге объявления:', error);
        }
      });

      return items;
    });

    // Normalize URLs
    return results.map((item) => ({
      ...item,
      url: normalizeItemUrl(item.url),
    }));
  }

  /**
   * Parse item details from page.
   *
   * Layered strategy, most stable source first (Avito's CSS classes churn
   * constantly, but structured data survives redesigns):
   *   1. JSON-LD (script[type="application/ld+json"], Product/Offer schema)
   *   2. data-marker / itemprop DOM selectors
   *   3. meta tags (og:*, meta[itemprop]) and text heuristics
   */
  async parseItemDetails(page: Page): Promise<ItemDetails> {
    const details = await page.evaluate(() => {
      const text = (el: Element | null | undefined): string =>
        (el?.textContent || '').trim();

      const meta = (sel: string): string =>
        document.querySelector(sel)?.getAttribute('content')?.trim() || '';

      // "19 990 ₽" / "19990руб." → 19990
      const parsePrice = (t: string): number => {
        const m = (t || '').replace(/\u00a0/g, ' ').match(/\d[\d\s]*/);
        return m ? parseInt(m[0].replace(/\s/g, ''), 10) || 0 : 0;
      };

      // ---------- 1. JSON-LD ----------
      let ld: any = null;
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const parsed = JSON.parse(s.textContent || '');
          const arr: any[] = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
          const product = arr.find(
            (o) =>
              o &&
              typeof o === 'object' &&
              (String(o['@type']).includes('Product') || o.offers || o.description)
          );
          if (product) {
            ld = product;
            break;
          }
        } catch {
          // Malformed JSON-LD — try the next block.
        }
      }

      // ---------- 2. data-marker / itemprop DOM ----------
      const titleDom =
        text(document.querySelector('[data-marker="item-view/title-info"]')) ||
        text(document.querySelector('h1'));

      let domPrice = 0;
      const priceEl =
        document.querySelector('[itemprop="price"]') ||
        document.querySelector('[data-marker*="price" i]');
      if (priceEl) {
        domPrice = parsePrice(priceEl.getAttribute('content') || text(priceEl));
      }
      if (!domPrice) {
        // Generic heuristic: first leaf-ish element showing "N ₽".
        for (const el of Array.from(document.querySelectorAll('span, div, p, strong, meta'))) {
          const t = el.getAttribute('content') || text(el);
          if (t.length < 40 && /₽|руб/.test(t) && /\d/.test(t)) {
            domPrice = parsePrice(t);
            break;
          }
        }
      }

      const fullDescriptionDom =
        text(document.querySelector('[itemprop="description"]')) ||
        text(
          document.querySelector(
            '[data-marker*="description" i], [class*="item-description" i], [class*="description" i]'
          )
        );

      // Item address marker, then the URL region slug (/kaliningrad/...),
      // then the header region switcher ("Калининград, район"), then
      // breadcrumb city — the plain address block is gone from the 2024+
      // item markup.
      // Canonical URL without tracking params.
      const canonical =
        document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      let canonicalPath = window.location.pathname;
      try {
        canonicalPath = new URL(canonical || window.location.href).pathname;
      } catch {
        // Keep the raw pathname if the canonical is malformed.
      }
      const pathCity = canonicalPath.split('/').filter(Boolean)[0] || '';
      const pathCityText =
        pathCity && !['rossiya', 'all'].includes(pathCity)
          ? pathCity.charAt(0).toUpperCase() + pathCity.slice(1)
          : '';
      const switcherRaw = text(
        document.querySelector('[data-marker="search-form/change-location"]')
      );
      const switcherGeneric = /во всех регионах|вся россия|^россия$/i.test(switcherRaw);
      const switcherText = switcherGeneric
        ? ''
        : switcherRaw.replace(/,\s*район\s*$/i, '');
      const crumbTexts = Array.from(
        document.querySelectorAll('[data-marker="item-navigation"] a')
      )
        .map((a) => text(a))
        .filter((t) => t && t !== 'Главная');
      const locationDom =
        text(document.querySelector('[itemprop="address"]')) ||
        text(
          document.querySelector(
            '[data-marker="item-view/item-address"], [data-marker="item-address"], [class*="geo-address" i], [class*="item-address" i]'
          )
        ) ||
        pathCityText ||
        switcherText ||
        crumbTexts[1] ||
        crumbTexts[0] ||
        '';

      const sellerNameDom =
        text(document.querySelector('[data-marker="seller-info/name"]')) ||
        text(document.querySelector('[class*="seller-info-name" i]'));

      const viewsText =
        text(document.querySelector('[data-marker="item-view/total-views"]')) ||
        text(document.querySelector('[data-marker*="views" i]'));
      const viewsCount = parseInt(viewsText.replace(/\D/g, ''), 10) || 0;

      const imagesDom: string[] = [];
      document
        .querySelectorAll('[data-marker="image-frame/image-wrapper"] img, [class*="gallery" i] img')
        .forEach((img) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && !src.startsWith('data:')) imagesDom.push(src);
        });

      // Specifications list ("Год выпуска: 2021", ...).
      const specifications: Record<string, string> = {};
      document
        .querySelectorAll('[data-marker="item-view/item-params"] li, [class*="item-params" i] li')
        .forEach((li) => {
          const t = text(li);
          const idx = t.indexOf(':');
          if (idx > 0 && idx < 60) {
            specifications[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
          }
        });

      // ---------- 3. Merge (JSON-LD wins, DOM fills gaps, meta last) ----------
      const title = ld?.name || titleDom || meta('meta[property="og:title"]');
      const price = Number(ld?.offers?.price) || domPrice || parsePrice(meta('meta[itemprop="price"]'));
      const currency =
        ld?.offers?.priceCurrency || meta('meta[itemprop="priceCurrency"]') || 'RUB';
      const fullDescription =
        (typeof ld?.description === 'string' && ld.description) ||
        fullDescriptionDom ||
        meta('meta[property="og:description"]') ||
        meta('meta[name="description"]');

      let images: string[] = imagesDom;
      const ldImages = Array.isArray(ld?.image) ? ld.image : ld?.image ? [ld.image] : [];
      if (images.length === 0 && ldImages.length > 0) {
        images = ldImages.filter((s: any) => typeof s === 'string');
      }
      if (images.length === 0) {
        const og = meta('meta[property="og:image"]');
        if (og) images = [og];
      }

      const location = locationDom || meta('meta[property="og:address"]');
      const sellerName = ld?.seller?.name || sellerNameDom || 'Unknown';

      const itemId = (canonical || window.location.pathname).match(/(\d{6,})(?:[?#]|$)/)?.[1] || '';

      return {
        id: itemId,
        title,
        price,
        currency,
        location,
        url: canonical || window.location.href,
        imageUrl: images[0] || '',
        description: String(fullDescription).substring(0, 200),
        fullDescription: String(fullDescription),
        images,
        seller: {
          name: sellerName,
        },
        specifications: Object.keys(specifications).length > 0 ? specifications : undefined,
        viewsCount,
      };
    });

    return details;
  }

  /**
   * Detect if captcha is present
   */
  async detectCaptcha(page: Page): Promise<boolean> {
    const captchaSelectors = [
      'iframe[src*="captcha"]',
      'iframe[src*="hcaptcha"]',
      '[class*="captcha"]',
      '#captcha',
      '[data-marker="captcha"]',
      '[data-marker="shield"]',
    ];

    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    }

    // Check page title
    const title = await page.title();
    if (title.toLowerCase().includes('captcha')) {
      return true;
    }

    // Avito firewall page: title "Доступ ограничен: проблема с IP".
    // The body text of this stub renders inside an iframe, so the title is
    // the only reliable signal.
    if (title.includes('Доступ ограничен') || title.includes('проблема с IP')) {
      return true;
    }

    // Avito firewall page: "Доступ ограничен: проблема с IP" + captcha
    const bodyText = (await page.evaluate(() => document.body?.innerText || '')) || '';
    if (bodyText.includes('Доступ ограничен') || bodyText.includes('проблема с IP')) {
      return true;
    }

    return false;
  }

  /**
   * Check if we got blocked or redirected
   */
  async isBlocked(page: Page): Promise<boolean> {
    const url = page.url();
    const title = await page.title();

    // Check for common blocking indicators (including the Russian firewall
    // title — the stub's body text lives in an iframe, the title doesn't).
    if (
      url.includes('/blocked') ||
      url.includes('/error') ||
      title.toLowerCase().includes('blocked') ||
      title.toLowerCase().includes('access denied') ||
      title.includes('Доступ ограничен') ||
      title.includes('проблема с IP')
    ) {
      return true;
    }

    // Avito firewall: "Доступ ограничен: проблема с IP"
    const bodyText = (await page.evaluate(() => document.body?.innerText || '')) || '';
    if (bodyText.includes('Доступ ограничен') || bodyText.includes('проблема с IP')) {
      return true;
    }

    return false;
  }

  /**
   * Wait for search results to load
   */
  async waitForResults(page: Page, timeout: number = 10000): Promise<boolean> {
    try {
      await page.waitForSelector('[data-marker="item"]', { timeout });
      return true;
    } catch {
      return false;
    }
  }
}
