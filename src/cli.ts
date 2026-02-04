#!/usr/bin/env node

/**
 * CLI interface for Avito scraper
 */

import { Command } from 'commander';
import { config } from 'dotenv';
import { AvitoScraper } from './core/scraper.js';
import { ConsoleOutput } from './plugins/output/console.js';
import { JsonOutput } from './plugins/output/json.js';
import type { SearchFilters } from './core/types.js';

// Load environment variables
config();

const program = new Command();
const consoleOutput = new ConsoleOutput();
const jsonOutput = new JsonOutput();

program
  .name('avito-scraper')
  .description('Scrape Avito marketplace for items')
  .version('1.0.0');

// Search command
program
  .command('search')
  .description('Search for items on Avito')
  .argument('<query>', 'Search query')
  .option('--price-min <number>', 'Minimum price', parseFloat)
  .option('--price-max <number>', 'Maximum price', parseFloat)
  .option('--location <id>', 'Location ID', parseInt)
  .option('--page <number>', 'Page number', parseInt, 1)
  .option('--sort <type>', 'Sort order (date|price_asc|price_desc)', 'default')
  .option('--output <file>', 'Save results to JSON file')
  .option('--headless <boolean>', 'Run browser in headless mode', (val) => val !== 'false', true)
  .action(async (query: string, options: any) => {
    const scraper = new AvitoScraper({
      headless: options.headless,
    });

    try {
      consoleOutput.displayInfo(`Searching for: "${query}"`);

      const filters: SearchFilters = {
        query,
        priceMin: options.priceMin,
        priceMax: options.priceMax,
        locationId: options.location,
        page: options.page,
        sort: options.sort,
      };

      const results = await scraper.search(filters);

      // Display in console
      consoleOutput.displayResults(results);

      // Save to file if requested
      if (options.output) {
        await jsonOutput.saveResults(results, options.output);
        consoleOutput.displaySuccess(`Results saved to ${options.output}`);
      }
    } catch (error) {
      consoleOutput.displayError(error as Error);
      process.exit(1);
    } finally {
      await scraper.close();
    }
  });

// Details command
program
  .command('details')
  .description('Get detailed information about an item')
  .argument('<url>', 'Item URL')
  .option('--output <file>', 'Save details to JSON file')
  .option('--headless <boolean>', 'Run browser in headless mode', (val) => val !== 'false', true)
  .action(async (url: string, options: any) => {
    const scraper = new AvitoScraper({
      headless: options.headless,
    });

    try {
      consoleOutput.displayInfo(`Fetching details for: ${url}`);

      const details = await scraper.getItemDetails(url);

      // Display in console
      consoleOutput.displayDetails(details);

      // Save to file if requested
      if (options.output) {
        await jsonOutput.saveDetails(details, options.output);
        consoleOutput.displaySuccess(`Details saved to ${options.output}`);
      }
    } catch (error) {
      consoleOutput.displayError(error as Error);
      process.exit(1);
    } finally {
      await scraper.close();
    }
  });

// Search all pages command
program
  .command('search-all')
  .description('Search all pages and save results')
  .argument('<query>', 'Search query')
  .requiredOption('--output <file>', 'Output JSON file (required)')
  .option('--price-min <number>', 'Minimum price', parseFloat)
  .option('--price-max <number>', 'Maximum price', parseFloat)
  .option('--location <id>', 'Location ID', parseInt)
  .option('--sort <type>', 'Sort order (date|price_asc|price_desc)', 'default')
  .option('--headless <boolean>', 'Run browser in headless mode', (val) => val !== 'false', true)
  .action(async (query: string, options: any) => {
    const scraper = new AvitoScraper({
      headless: options.headless,
    });

    try {
      consoleOutput.displayInfo(`Searching all pages for: "${query}"`);

      const filters: SearchFilters = {
        query,
        priceMin: options.priceMin,
        priceMax: options.priceMax,
        locationId: options.location,
        sort: options.sort,
      };

      const allResults: any[] = [];
      let count = 0;

      for await (const result of scraper.searchAllPages(filters)) {
        allResults.push(result);
        count++;
        if (count % 10 === 0) {
          consoleOutput.displayInfo(`Collected ${count} items...`);
        }
      }

      consoleOutput.displaySuccess(`Total collected: ${allResults.length} items`);

      // Save to file
      await jsonOutput.saveResults(allResults, options.output);
      consoleOutput.displaySuccess(`Results saved to ${options.output}`);
    } catch (error) {
      consoleOutput.displayError(error as Error);
      process.exit(1);
    } finally {
      await scraper.close();
    }
  });

program.parse();
