/**
 * URL builder for Avito search
 */

import type { SearchFilters } from '../core/types.js';

const AVITO_BASE_URL = 'https://www.avito.ru';

export function normalizeLocationSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

export function buildSearchUrl(filters: SearchFilters): string {
  const { query, priceMin, priceMax, locationSlug, radiusKm, latitude, longitude, localOnly, page, sort } = filters;

  // Avito scopes a search by the location path (for example /moskva).
  // Numeric location IDs alone do not change the path.
  const searchLocation = locationSlug ? normalizeLocationSlug(locationSlug) : 'rossiya';
  const url = `${AVITO_BASE_URL}/${searchLocation || 'rossiya'}`;

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

  // Avito's location toggle is encoded as localPriority: 0 = normal mixed
  // results, 1 = stay inside/prioritize the selected geography. Radius search
  // adds geoCoords + radius/searchRadius around the selected location.
  if (radiusKm !== undefined) {
    if (latitude !== undefined && longitude !== undefined) {
      params.set('geoCoords', latitude.toString() + ',' + longitude.toString());
    }
    params.set('localPriority', localOnly ? '1' : '0');
    params.set('radius', radiusKm.toString());
    params.set('searchRadius', radiusKm.toString());
  } else if (localOnly !== undefined) {
    params.set('localPriority', localOnly ? '1' : '0');
  }

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
