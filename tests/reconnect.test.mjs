import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserManager } from '../dist/core/browser.js';

test('CDP manager reconnects after its transport disconnects', { skip: !process.env.AVITO_CDP_URL }, async () => {
  const manager = new BrowserManager();
  try {
    await manager.initialize();
    await manager.getPage();
    await manager.browser.close(); // Playwright detaches; Chrome stays running.
    assert.equal(manager.isInitialized(), false);
    const page = await manager.getPage();
    assert.equal(page.isClosed(), false);
    assert.equal(manager.isInitialized(), true);
  } finally {
    await manager.close();
  }
});
