/**
 * Browser manager with Playwright
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getRandomUserAgent } from '../utils/user-agents.js';
import type { ProxyConfig, ScraperOptions } from './types.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: ScraperOptions;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      headless: true,
      timeout: 30000,
      ...options,
    };
  }

  async initialize(proxy?: ProxyConfig): Promise<void> {
    const launchOptions: any = {
      headless: this.options.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    };

    // Add proxy if provided
    if (proxy) {
      launchOptions.proxy = {
        server: `${proxy.type}://${proxy.host}:${proxy.port}`,
      };
      if (proxy.username && proxy.password) {
        launchOptions.proxy.username = proxy.username;
        launchOptions.proxy.password = proxy.password;
      }
    }

    this.browser = await chromium.launch(launchOptions);

    // Create context with stealth settings
    this.context = await this.browser.newContext({
      userAgent: this.options.userAgent || getRandomUserAgent(),
      viewport: {
        width: 1920,
        height: 1080,
      },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
    });

    // Add stealth scripts
    await this.context.addInitScript(() => {
      // @ts-ignore - runs in browser context
      // Hide webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // @ts-ignore - runs in browser context
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // @ts-ignore - runs in browser context
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });
    });
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const page = await this.context.newPage();

    // Set timeout
    page.setDefaultTimeout(this.options.timeout || 30000);

    return page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  isInitialized(): boolean {
    return this.browser !== null && this.context !== null;
  }
}
