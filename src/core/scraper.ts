/**
 * Main Avito scraper
 */

import type { Page } from 'playwright';
import { BrowserManager } from './browser.js';
import { AvitoParser } from './parser.js';
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
  }

  /**
   * Initialize scraper
   */
  async initialize(): Promise<void> {
    await this.browser.initialize();
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
      // Navigate to search page
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Add random delay (anti-bot)
      if (this.options.delayMs) {
        await randomSleep(this.options.delayMs[0], this.options.delayMs[1]);
      }

      // Check for captcha
      if (await this.parser.detectCaptcha(page)) {
        throw new Error('Captcha detected') as CaptchaError;
      }

      // Check if blocked
      if (await this.parser.isBlocked(page)) {
        throw new Error('Access blocked') as ScraperError;
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
