import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('CDP bridge rejects clients without its local access token', { skip: !process.env.AVITO_CDP_URL || !process.env.AVITO_CDP_TOKEN_FILE }, async () => {
  await assert.rejects(chromium.connectOverCDP(process.env.AVITO_CDP_URL), /403|401|unauthorized|Forbidden/i);
});
