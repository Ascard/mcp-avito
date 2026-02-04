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
      await this.proxyManager.loadFromFile(this.options.proxy.listFile);
    }

    // Get proxy for browser initialization
    const proxy = this.proxyManager?.getProxy() || undefined;
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
    console.error(`Searching: ${url}`);

    const page = await this.browser.newPage();

    try {
      // Rotate proxy if needed
      if (this.proxyManager && this.options.proxy?.rotateOnError) {
        const proxy = this.proxyManager.getProxy();
        if (proxy) {
          // Note: Changing proxy requires re-initializing browser
          // For now, we'll use the same proxy throughout the session
        }
      }
      // Navigate to search page
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });

      // Wait for page to stabilize
      await page.waitForTimeout(3000);

      // Add random delay (anti-bot)
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }

      // Check for captcha (with error handling)
      try {
        if (await this.parser.detectCaptcha(page)) {
          // If not headless, give user time to solve captcha manually
          if (!this.options.headless) {
            console.error('\n⚠️  Captcha detected! Please solve it in the browser window.');
            console.error('Waiting 60 seconds for manual solution...\n');
            await page.waitForTimeout(60000);

            // Check again after waiting
            if (await this.parser.detectCaptcha(page)) {
              throw new Error('Captcha still present after manual solution attempt') as CaptchaError;
            }
            console.error('✓ Captcha appears to be solved, continuing...\n');
          } else {
            throw new Error('Captcha detected') as CaptchaError;
          }
        }
      } catch (error: any) {
        if (error.message?.includes('Captcha')) {
          throw error;
        }
        console.error('Warning: Could not check for captcha:', error.message);
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
        console.error('Warning: Could not check if blocked:', error.message);
      }

      // Wait for results
      const hasResults = await this.parser.waitForResults(page);
      if (!hasResults) {
        console.error('No results found or page did not load properly');
        return [];
      }

      // Parse results
      const results = await this.parser.parseSearchResults(page);
      console.error(`Found ${results.length} results`);

      return results;
    } finally {
      await page.close();
    }
  }

  /**
   * Get item details
   */
  async getItemDetails(url: string): Promise<ItemDetails> {
    if (!this.browser.isInitialized()) {
      await this.initialize();
    }

    console.error(`Fetching details: ${url}`);

    const page = await this.browser.newPage();

    try {
      // Navigate to item page
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Add random delay
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }

      // Check for captcha
      if (await this.parser.detectCaptcha(page)) {
        throw new Error('Captcha detected') as CaptchaError;
      }

      // Parse details
      const details = await this.parser.parseItemDetails(page);

      return details;
    } finally {
      await page.close();
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
}
