#!/usr/bin/env node
/**
 * Captures Chrome Web Store screenshots (1280x800) and a popup screenshot from
 * the e2e build against the local fixture page.
 *   npm run build:e2e && node scripts/store-screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const EXTENSION_PATH = resolve('dist-e2e');
const OUT_DIR = resolve('store-assets');
const APP_URL = 'http://127.0.0.1:4178/app.html';
const SOURCE = 'smart-locator-inspector';

const server = spawn(process.execPath, ['tests/integration/server.mjs'], { stdio: 'ignore' });
await new Promise((done) => setTimeout(done, 500));

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
});

try {
  await mkdir(OUT_DIR, { recursive: true });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(APP_URL);
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({})).find((tab) => tab.url === url)?.id, APP_URL);
  await worker.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ['content/content.js'] }), tabId);
  const send = (type) => worker.evaluate(([id, message]) => chrome.tabs.sendMessage(id, message), [tabId, { source: SOURCE, type, payload: {} }]);

  await send('START_INSPECTOR');
  await page.locator('#email').hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-1-hover.png') });

  await page.locator('tbody tr:nth-child(2) button').click();
  await page.mouse.move(700, 200);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-2-selected.png') });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 440, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html?tabId=${tabId}`);
  await popup.locator('.locator-card').first().waitFor();
  await popup.screenshot({ path: resolve(OUT_DIR, 'popup-playwright.png') });
  await popup.getByRole('tab', { name: /Selenium Java/ }).click();
  await popup.screenshot({ path: resolve(OUT_DIR, 'popup-selenium.png') });

  console.log(`✓ Screenshots saved to ${OUT_DIR}`);
} finally {
  await context.close();
  server.kill();
}
