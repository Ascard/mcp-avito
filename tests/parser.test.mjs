/**
 * Parser tests: run the real AvitoParser against local fixture pages
 * (file:// URLs, no network / no captcha involved).
 *
 * Fixtures:
 *   item-page-new.html    — 2024+ markup: JSON-LD + data-marker, no itemprop price/description
 *   item-page-legacy.html — old microdata markup, no JSON-LD
 *   search-page.html      — search cards, geo-text classes instead of data-geo-name
 *
 * Run: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AvitoParser } from '../dist/core/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => pathToFileURL(join(here, 'fixtures', name)).href;

async function withPage(fixtureName, fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(fixture(fixtureName), { waitUntil: 'load' });
    return await fn(new AvitoParser(), page);
  } finally {
    await browser.close();
  }
}

test('details: new markup — JSON-LD wins, DOM fills gaps', async () => {
  await withPage('item-page-new.html', async (parser, page) => {
    const d = await parser.parseItemDetails(page);

    assert.equal(d.title, 'iPhone 13, 128 ГБ, SIM + eSIM');
    assert.equal(d.price, 19990);
    assert.equal(d.currency, 'RUB');
    assert.ok(d.fullDescription.includes('состояние отличное'), 'description from JSON-LD');
    assert.equal(d.id, '4718346312');
    assert.equal(d.seller.name, 'K-Mobile');
    assert.equal(d.viewsCount, 7574);
    // location comes from DOM marker (not in JSON-LD)
    assert.ok(d.location.includes('Калининград'), `location, got: ${d.location}`);
    // images: JSON-LD array
    assert.deepEqual(d.images, [
      'https://cdn.avito.ru/images/1.jpg',
      'https://cdn.avito.ru/images/2.jpg',
    ]);
    assert.equal(d.imageUrl, 'https://cdn.avito.ru/images/1.jpg');
    // specifications parsed from item-params list
    assert.deepEqual(d.specifications, {
      'Состояние': 'Б/у',
      'Память': '128 ГБ',
      'Цвет': 'черный',
    });
    // canonical URL without tracking junk
    assert.ok(d.url.startsWith('https://www.avito.ru/kaliningrad/telefony/iphone_13'));
  });
});

test('details: legacy microdata markup — fallback path works', async () => {
  await withPage('item-page-legacy.html', async (parser, page) => {
    const d = await parser.parseItemDetails(page);

    assert.equal(d.title, 'iPhone 12, 64 ГБ');
    assert.equal(d.price, 23990);
    assert.ok(d.fullDescription.includes('без комплектации'));
    assert.equal(d.location, 'Москва, Тверской район');
    assert.equal(d.seller.name, 'Иван');
    assert.equal(d.viewsCount, 120);
    assert.equal(d.id, '3648418641');
    assert.deepEqual(d.images, ['https://cdn.avito.ru/images/legacy1.jpg']);
  });
});

test('firewall stub ("Доступ ограничен") is detected by title even when body is in an iframe', async () => {
  await withPage('blocked-page.html', async (parser, page) => {
    assert.equal(await parser.isBlocked(page), true, 'isBlocked');
    assert.equal(await parser.detectCaptcha(page), true, 'detectCaptcha');
  });
});

test('search: cards without data-geo-name still yield location; price falls back to text', async () => {
  await withPage('search-page.html', async (parser, page) => {
    const items = await parser.parseSearchResults(page);

    assert.equal(items.length, 2);

    assert.equal(items[0].id, '4718346312');
    assert.equal(items[0].title, 'iPhone 13, 128 ГБ, SIM + eSIM');
    assert.equal(items[0].price, 19990);
    assert.ok(items[0].location.includes('Калининград'), `location, got: ${items[0].location}`);
    assert.ok(items[0].url.includes('4718346312'));

    // second card has no meta price — parsed from "22 990 ₽" text
    assert.equal(items[1].price, 22990);
    assert.ok(items[1].location.includes('Казань'), `location, got: ${items[1].location}`);
  });
});
