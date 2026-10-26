#!/usr/bin/env node

/**
 * MCP Server for Avito Scraper
 * Provides tools for searching and extracting data from Avito.ru
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { AvitoScraper } from '../core/scraper.js';
import type { SearchFilters, SearchResult } from '../core/types.js';
import { normalizeLocationSlug } from '../utils/url-builder.js';

// Global scraper instance (reused across requests)
let scraper: AvitoScraper | null = null;

// Get or create scraper instance
async function getScraper(): Promise<AvitoScraper> {
  if (!scraper) {
    scraper = new AvitoScraper({
      headless: true,
      timeout: 30000,
      delayMs: [1000, 3000],
    });
  }

  // If the browser process died (e.g. crash or was killed), reset to headless
  // and re-initialize so subsequent calls get a fresh browser.
  if (!scraper.isInitialized()) {
    scraper.setHeadless(true);
    await scraper.initialize();
  }

  return scraper;
}

function parseRadiusKm(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 150) {
    throw new Error('radius_km must be an integer from 0 to 150');
  }
  return value;
}

function parseCoordinates(args: Record<string, unknown>): { latitude?: number; longitude?: number } {
  const latitude = args.latitude;
  const longitude = args.longitude;
  const hasLatitude = latitude !== undefined && latitude !== null;
  const hasLongitude = longitude !== undefined && longitude !== null;

  if (hasLatitude !== hasLongitude) {
    throw new Error('latitude and longitude must be provided together');
  }
  if (!hasLatitude) {
    return {};
  }
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('latitude must be a number from -90 to 90');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('longitude must be a number from -180 to 180');
  }
  return { latitude, longitude };
}

function resolveRequestedLocation(args: Record<string, unknown>): { slug?: string; query: string; radiusKm?: number; latitude?: number; longitude?: number; localOnly?: boolean } {
  const query = typeof args.query === 'string' ? args.query : '';
  const rawSlug = typeof args.location_slug === 'string' ? args.location_slug : undefined;
  const slug = rawSlug?.trim() ? normalizeLocationSlug(rawSlug) : undefined;
  const radiusKm = parseRadiusKm(args.radius_km);
  const localOnly = typeof args.local_only === 'boolean' ? args.local_only : undefined;
  const { latitude, longitude } = parseCoordinates(args);

  if (radiusKm !== undefined && radiusKm > 0 && (latitude === undefined || longitude === undefined)) {
    throw new Error('radius_km > 0 requires latitude and longitude');
  }

  return { slug, query, radiusKm, latitude, longitude, localOnly };
}


// Define available tools
const tools: Tool[] = [
  {
    name: 'avito_search',
    description: 'Search Avito listings. Use location_slug to scope the search, radius_km with latitude/longitude for nearby results, and local_only=true to enable Avito localPriority and return only the local block before the other-cities separator.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Samsung SSD", "iPhone 13", "MacBook Pro")',
        },
        price_min: {
          type: 'number',
          description: 'Minimum price in RUB (optional)',
        },
        price_max: {
          type: 'number',
          description: 'Maximum price in RUB (optional)',
        },
        location_id: {
          type: 'number',
          description: 'Legacy numeric location ID. Prefer location_slug because Avito scopes search by URL path.',
        },
        location_slug: {
          type: 'string',
          description: 'Avito location slug, e.g. "moskva" or "bashkortostan_oktyabrskiy".',
        },
        radius_km: {
          type: 'integer',
          minimum: 0,
          maximum: 150,
          description: 'Search radius in kilometres around the selected Avito location (0-150). Values above 0 expand the search to nearby places, like Avito Distance filter.',
        },
        local_only: {
          type: 'boolean',
          description: 'Avito "Сначала из ..." toggle. false (default) keeps the mixed results; true sends localPriority=1 and returns only items before the other-cities separator.',
        },
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
          description: 'Latitude for the radius centre. Required when radius_km is greater than 0.',
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
          description: 'Longitude for the radius centre. Required when radius_km is greater than 0 and must be provided with latitude.',
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
        },
        sort: {
          type: 'string',
          enum: ['default', 'date', 'price_asc', 'price_desc'],
          description: 'Sort order: default, date (newest first), price_asc (cheapest), price_desc (most expensive)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'avito_get_details',
    description: 'Get detailed information about a specific item on Avito.ru. Retrieves full description, seller info, parameters, images, and other details.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL of the Avito item (e.g., "https://www.avito.ru/moskva/tovary_dlya_kompyutera/...")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'avito_search_all',
    description: 'Search all Avito result pages. Use location_slug to scope the search, radius_km with latitude/longitude for nearby results, and local_only=true to return only the local block. Use with caution as this may scan many pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Samsung SSD", "iPhone 13")',
        },
        price_min: {
          type: 'number',
          description: 'Minimum price in RUB (optional)',
        },
        price_max: {
          type: 'number',
          description: 'Maximum price in RUB (optional)',
        },
        location_id: {
          type: 'number',
          description: 'Legacy numeric location ID. Prefer location_slug because Avito scopes search by URL path.',
        },
        location_slug: {
          type: 'string',
          description: 'Avito location slug, e.g. "moskva" or "bashkortostan_oktyabrskiy".',
        },
        radius_km: {
          type: 'integer',
          minimum: 0,
          maximum: 150,
          description: 'Search radius in kilometres around the selected Avito location (0-150). Values above 0 expand the search to nearby places, like Avito Distance filter.',
        },
        local_only: {
          type: 'boolean',
          description: 'Avito "Сначала из ..." toggle. false (default) keeps the mixed results; true sends localPriority=1 and returns only items before the other-cities separator.',
        },
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
          description: 'Latitude for the radius centre. Required when radius_km is greater than 0.',
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
          description: 'Longitude for the radius centre. Required when radius_km is greater than 0 and must be provided with latitude.',
        },
        sort: {
          type: 'string',
          enum: ['default', 'date', 'price_asc', 'price_desc'],
          description: 'Sort order',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (optional, default: no limit)',
        },
      },
      required: ['query'],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'avito-scraper',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'Missing arguments',
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'avito_search': {
        const sort = args.sort as string | undefined;
        const requestedLocation = resolveRequestedLocation(args);
        const filters: SearchFilters = {
          query: requestedLocation.query,
          priceMin: args.price_min as number | undefined,
          priceMax: args.price_max as number | undefined,
          locationId: args.location_id as number | undefined,
          locationSlug: requestedLocation.slug,
          radiusKm: requestedLocation.radiusKm,
          latitude: requestedLocation.latitude,
          longitude: requestedLocation.longitude,
          localOnly: requestedLocation.localOnly,
          page: (args.page as number) || 1,
          sort: (sort === 'date' || sort === 'price_asc' || sort === 'price_desc') ? sort : 'default',
        };

        const scraperInstance = await getScraper();
        const results = await scraperInstance.search(filters);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  count: results.length,
                  location_slug: requestedLocation.slug,
                  radius_km: requestedLocation.radiusKm,
                  local_only: requestedLocation.localOnly ?? false,
                  geo_coords: requestedLocation.latitude !== undefined && requestedLocation.longitude !== undefined
                    ? [requestedLocation.latitude, requestedLocation.longitude]
                    : undefined,
                  results: results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'avito_get_details': {
        const url = args.url as string;

        if (!url || !url.includes('avito.ru')) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Invalid Avito URL',
                }),
              },
            ],
            isError: true,
          };
        }

        const scraperInstance = await getScraper();
        const details = await scraperInstance.getItemDetails(url);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  details: details,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'avito_search_all': {
        const sort = args.sort as string | undefined;
        const requestedLocation = resolveRequestedLocation(args);
        const filters: SearchFilters = {
          query: requestedLocation.query,
          priceMin: args.price_min as number | undefined,
          priceMax: args.price_max as number | undefined,
          locationId: args.location_id as number | undefined,
          locationSlug: requestedLocation.slug,
          radiusKm: requestedLocation.radiusKm,
          latitude: requestedLocation.latitude,
          longitude: requestedLocation.longitude,
          localOnly: requestedLocation.localOnly,
          sort: (sort === 'date' || sort === 'price_asc' || sort === 'price_desc') ? sort : 'default',
        };

        const limit = (args.limit as number) || Infinity;
        const scraperInstance = await getScraper();
        const allResults: SearchResult[] = [];

        for await (const result of scraperInstance.searchAllPages(filters)) {
          allResults.push(result);
          if (allResults.length >= limit) {
            break;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  count: allResults.length,
                  location_slug: requestedLocation.slug,
                  radius_km: requestedLocation.radiusKm,
                  local_only: requestedLocation.localOnly ?? false,
                  geo_coords: requestedLocation.latitude !== undefined && requestedLocation.longitude !== undefined
                    ? [requestedLocation.latitude, requestedLocation.longitude]
                    : undefined,
                  results: allResults,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('Останавливаем MCP-сервер...');
  if (scraper) {
    await scraper.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Останавливаем MCP-сервер...');
  if (scraper) {
    await scraper.close();
  }
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Avito MCP сервер работает через stdio');
}

main().catch((error) => {
  console.error('Фатальная ошибка MCP-сервера:', error);
  process.exit(1);
});
