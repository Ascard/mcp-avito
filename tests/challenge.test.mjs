import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { AvitoParser } from '../dist/core/parser.js';

test('security verification is a manual challenge, not a hard IP block', { skip: !process.env.AVITO_CDP_URL }, async () => {
  const token = process.env.AVITO_CDP_TOKEN_FILE && readFileSync(process.env.AVITO_CDP_TOKEN_FILE, 'utf8').trim();
  const browser = await chromium.connectOverCDP(process.env.AVITO_CDP_URL, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const page = await browser.contexts()[0].newPage();
  try {
    await page.setContent('<title>Доступ ограничен: проверка безопасности</title><body>Доступ ограничен: проверка безопасности. Получение задания...</body>');
    const parser = new AvitoParser();
    assert.equal(await parser.isBlocked(page), false);
    assert.equal(await parser.detectCaptcha(page), true);
  } finally {
    await page.close();
    await browser.close();
  }
});
