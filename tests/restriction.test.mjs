import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { AvitoParser } from '../dist/core/parser.js';

test('IP restriction is a block, not a solvable CAPTCHA', { skip: !process.env.AVITO_CDP_URL }, async () => {
  const browser = await chromium.connectOverCDP(process.env.AVITO_CDP_URL, {
    headers: process.env.AVITO_CDP_TOKEN_FILE ? {
      Authorization: `Bearer ${readFileSync(process.env.AVITO_CDP_TOKEN_FILE, 'utf8').trim()}`,
    } : undefined,
  });
  const page = await browser.contexts()[0].newPage();
  try {
    await page.setContent('<title>Доступ ограничен: проблема с IP</title><body>Доступ ограничен: проблема с IP</body>');
    const parser = new AvitoParser();
    assert.equal(await parser.isBlocked(page), true);
    assert.equal(await parser.detectCaptcha(page), false);
  } finally {
    await page.close();
    await browser.close();
  }
});
