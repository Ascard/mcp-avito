/**
 * Example: Using scraper programmatically
 */

import { AvitoScraper } from '../src/core/scraper.js';

async function main() {
  const scraper = new AvitoScraper({
    headless: true,
    delayMs: [2000, 4000], // 2-4 seconds delay
  });

  try {
    console.log('Searching for Samsung SSD...');

    const results = await scraper.search({
      query: 'Samsung SSD 2TB M.2',
      priceMax: 15000,
      sort: 'price_asc',
    });

    console.log(`Found ${results.length} results:\n`);

    results.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`   Price: ${item.price} ₽`);
      console.log(`   Location: ${item.location}`);
      console.log(`   URL: ${item.url}\n`);
    });

    // Get details of first result
    if (results.length > 0) {
      console.log('Fetching details of first item...');
      const details = await scraper.getItemDetails(results[0].url);
      console.log(`\nDetails:`);
      console.log(`Seller: ${details.seller.name}`);
      console.log(`Views: ${details.viewsCount}`);
      console.log(`Images: ${details.images.length}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await scraper.close();
  }
}

main();
