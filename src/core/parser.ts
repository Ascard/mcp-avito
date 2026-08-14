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

      // Avito uses data-marker attribute for items
      // Selectors may need adjustment based on actual HTML structure
      const itemElements = document.querySelectorAll('[data-marker="item"]');

      itemElements.forEach((element) => {
        try {
          // Title
          const titleEl = element.querySelector('[itemprop="name"]');
          const title = titleEl?.textContent?.trim() || '';

          // Price
          const priceEl = element.querySelector('[itemprop="price"]');
          const priceAttr = priceEl?.getAttribute('content');
          const price = priceAttr ? parseInt(priceAttr, 10) : 0;

          // URL
          const linkEl = element.querySelector('a[itemprop="url"]');
          const url = linkEl?.getAttribute('href') || '';

          // Image
          const imageEl = element.querySelector('img[itemprop="image"]');
          const imageUrl = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';

          // Location
          const locationEl = element.querySelector('[data-geo-name]');
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
          console.error('Error parsing item:', error);
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
   * Parse item details from page
   */
  async parseItemDetails(page: Page): Promise<ItemDetails> {
    const details = await page.evaluate(() => {
      // @ts-ignore - runs in browser context
      // Title
      const titleEl = document.querySelector('[data-marker="item-view/title-info"]');
      const title = titleEl?.textContent?.trim() || '';

      // Price
      const priceEl = document.querySelector('[itemprop="price"]');
      const priceAttr = priceEl?.getAttribute('content');
      const price = priceAttr ? parseInt(priceAttr, 10) : 0;

      // Description
      const descEl = document.querySelector('[itemprop="description"]');
      const fullDescription = descEl?.textContent?.trim() || '';

      // Images
      const images: string[] = [];
      const imageElements = document.querySelectorAll('[data-marker="image-frame/image-wrapper"] img');
      imageElements.forEach((img) => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (src) images.push(src);
      });

      // Seller
      const sellerNameEl = document.querySelector('[data-marker="seller-info/name"]');
      const sellerName = sellerNameEl?.textContent?.trim() || 'Unknown';

      // Location
      const locationEl = document.querySelector('[itemprop="address"]');
      const location = locationEl?.textContent?.trim() || '';

      // Views count
      const viewsEl = document.querySelector('[data-marker="item-view/total-views"]');
      const viewsText = viewsEl?.textContent?.trim() || '0';
      const viewsCount = parseInt(viewsText.replace(/\D/g, ''), 10) || 0;

      // Item ID from URL
      const itemId = window.location.pathname.match(/\/(\d+)(?:[?#]|$)/)?.[1] || '';

      return {
        id: itemId,
        title,
        price,
        currency: 'RUB',
        location,
        url: window.location.href,
        imageUrl: images[0] || '',
        description: fullDescription.substring(0, 200),
        fullDescription,
        images,
        seller: {
          name: sellerName,
        },
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

    // Check for common blocking indicators
    if (
      url.includes('/blocked') ||
      url.includes('/error') ||
      title.toLowerCase().includes('blocked') ||
      title.toLowerCase().includes('access denied')
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
