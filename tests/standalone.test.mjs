import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserManager } from '../dist/core/browser.js';

test('standalone mode launches and owns its Chromium instance', { skip: Boolean(process.env.AVITO_CDP_URL) }, async () => {
  const manager = new BrowserManager();
  try {
    await manager.initialize();
    const page = await manager.getPage();
    assert.equal(page.url(), 'about:blank');
    assert.equal(manager.isInitialized(), true);
  } finally {
    await manager.close();
  }
  assert.equal(manager.isInitialized(), false);
});
