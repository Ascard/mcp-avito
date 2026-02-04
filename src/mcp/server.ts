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
import type { SearchFilters } from '../core/types.js';

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

  if (!scraper.isInitialized()) {
    await scraper.initialize();
  }

  return scraper;
}

// Define available tools
const tools: Tool[] = [
  {
    name: 'avito_search',
    description: 'Search for items on Avito.ru marketplace. Returns up to 50 results per page with item details including title, price, location, and URL.',
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
          description: 'Location ID (optional, e.g., 621540 for Russia)',
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
    description: 'Search all pages on Avito.ru for the given query. This will iterate through all available pages and return ALL matching items. Use with caution as it may take a long time and return many results.',
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
          description: 'Location ID (optional)',
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
        const filters: SearchFilters = {
          query: args.query as string,
          priceMin: args.price_min as number | undefined,
          priceMax: args.price_max as number | undefined,
          locationId: args.location_id as number | undefined,
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
        const filters: SearchFilters = {
          query: args.query as string,
          priceMin: args.price_min as number | undefined,
          priceMax: args.price_max as number | undefined,
          locationId: args.location_id as number | undefined,
          sort: (sort === 'date' || sort === 'price_asc' || sort === 'price_desc') ? sort : 'default',
        };

        const limit = (args.limit as number) || Infinity;
        const scraperInstance = await getScraper();
        const allResults = [];

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
  console.error('Shutting down MCP server...');
  if (scraper) {
    await scraper.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down MCP server...');
  if (scraper) {
    await scraper.close();
  }
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Avito MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
