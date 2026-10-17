import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { AvitoParser } from '../dist/core/parser.js';

test('listing detail price is read from current Avito price marker', { skip: !process.env.AVITO_CDP_URL }, async () => {
  const tokenFile = process.env.AVITO_CDP_TOKEN_FILE;
  const browser = await chromium.connectOverCDP(process.env.AVITO_CDP_URL, {
    headers: tokenFile ? { Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` } : undefined,
  });
  const page = await browser.contexts()[0].newPage();
  try {
    await page.setContent('<div data-marker="item-view/title-info">Книга</div><span data-marker="item-view/item-price">600\u00a0₽\u00a0</span>');
    assert.equal((await new AvitoParser().parseItemDetails(page)).price, 600);
  } finally {
    await page.close();
    await browser.close();
  }
});
