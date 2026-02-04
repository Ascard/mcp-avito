/**
 * URL builder for Avito search
 */

import type { SearchFilters } from '../core/types.js';

const AVITO_BASE_URL = 'https://www.avito.ru';

export function buildSearchUrl(filters: SearchFilters): string {
  const { query, priceMin, priceMax, locationId, page, sort } = filters;

  // Base search URL
  let url = `${AVITO_BASE_URL}/rossiya`;

  // Add query parameter
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }

  // Price filters
  if (priceMin !== undefined) {
    params.set('pmin', priceMin.toString());
  }
  if (priceMax !== undefined) {
    params.set('pmax', priceMax.toString());
  }

  // Location (if specified)
  // Note: locationId might need different handling based on Avito's URL structure

  // Pagination
  if (page && page > 1) {
    params.set('p', page.toString());
  }

  // Sorting
  if (sort && sort !== 'default') {
    // Avito sorting parameters (need to verify actual values)
    const sortMap: Record<string, string> = {
      date: '104', // newest first
      price_asc: '1',
      price_desc: '2',
    };
    if (sortMap[sort]) {
      params.set('s', sortMap[sort]);
    }
  }

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

export function normalizeItemUrl(url: string): string {
  // Ensure URL is absolute
  if (url.startsWith('/')) {
    return `${AVITO_BASE_URL}${url}`;
  }
  if (!url.startsWith('http')) {
    return `${AVITO_BASE_URL}/${url}`;
  }
  return url;
}

export function extractItemId(url: string): string | null {
  // Extract item ID from URL
  // Example: https://www.avito.ru/item/12345678
  const match = url.match(/\/(\d+)(?:[?#]|$)/);
  return match ? match[1] : null;
}
