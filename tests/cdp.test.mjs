import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const connect = () => chromium.connectOverCDP(process.env.AVITO_CDP_URL, {
  headers: process.env.AVITO_CDP_TOKEN_FILE ? {
    Authorization: `Bearer ${readFileSync(process.env.AVITO_CDP_TOKEN_FILE, 'utf8').trim()}`,
  } : undefined,
});
import { BrowserManager } from '../dist/core/browser.js';

const endpoint = process.env.AVITO_CDP_URL;

test('CDP attaches to the existing context and leaves external tabs/browser alive', { skip: !endpoint }, async () => {
  const observer = await connect();
  const context = observer.contexts()[0];
  const original = await context.newPage();
  await original.goto('about:blank');
  const manager = new BrowserManager();
  try {
    await manager.initialize();
    const owned = await manager.getPage();
    await owned.goto('data:text/html,cdp-mcp-owned');
    assert.ok(context.pages().some(page => page.url() === owned.url() && page !== original), 'MCP tab must be visible to a separate CDP client');
    await manager.close();
    assert.equal(original.isClosed(), false);
    assert.equal(owned.isClosed(), true);
    assert.equal(observer.isConnected(), true);
  } finally {
    await manager.close();
    await original.close();
    await observer.close();
  }
});

test('CDP recreates a manually closed MCP tab without disturbing original tabs', { skip: !endpoint }, async () => {
  const observer = await connect();
  const original = await observer.contexts()[0].newPage();
  const manager = new BrowserManager();
  try {
    await manager.initialize();
    const owned = await manager.getPage();
    await owned.close();
    const replacement = await manager.getPage();
    assert.notEqual(replacement, owned);
    assert.equal(replacement.isClosed(), false);
    assert.equal(original.isClosed(), false);
  } finally {
    await manager.close();
    await original.close();
    await observer.close();
  }
});
