import { test as base, chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the unpacked e2e build (dist-e2e) into Chromium. That build is the
 * production build plus localhost host_permissions, because automation cannot
 * click the toolbar icon to grant activeTab.
 */
const EXTENSION_PATH = resolve('dist-e2e');
const APP_URL = 'http://127.0.0.1:4178/app.html';
const SOURCE = 'smart-locator-inspector';

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!existsSync(resolve(EXTENSION_PATH, 'manifest.json'))) {
      throw new Error('dist-e2e is missing. Run "npm run build:e2e" (or "npm run test:e2e").');
    }
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

async function tabIdFor(serviceWorker, url) {
  return serviceWorker.evaluate(async (target) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === target)?.id;
  }, url);
}

async function sendToTab(serviceWorker, tabId, type, payload = {}) {
  return serviceWorker.evaluate(
    ([id, message]) => chrome.tabs.sendMessage(id, message),
    [tabId, { source: SOURCE, type, payload }],
  );
}

async function openApp(context, serviceWorker, extensionId, url = APP_URL) {
  const page = await context.newPage();
  await page.goto(url);
  const tabId = await tabIdFor(serviceWorker, page.url());
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html?tabId=${tabId}`);
  await page.bringToFront();
  return { page, popup, tabId };
}

async function startInspection(popup, page) {
  await popup.getByRole('button', { name: 'Start Inspection' }).click();
  await expect(popup.getByRole('status').filter({ hasText: 'Inspecting' })).toBeVisible();
  await page.bringToFront();
}

/** Evaluates generated Playwright code with real Playwright. Test-only. */
function toLocator(page, code) {
  return new Function('page', `return ${code};`)(page);
}

test('loads as a valid Manifest V3 extension with minimal permissions', async ({ serviceWorker, context, extensionId }) => {
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting']);
  expect(manifest.background.service_worker).toBe('background/service-worker.js');

  const popup = await context.newPage();
  const errors = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await expect(popup.getByRole('heading', { name: 'Smart Locator Inspector' })).toBeVisible();
  await expect(popup.getByText(`v${manifest.version}`)).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Start Inspection' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('hover, select and generate locators that real Playwright confirms', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup, tabId } = await openApp(context, serviceWorker, extensionId);
  await startInspection(popup, page);

  await page.locator('#login').hover();
  await expect(popup.getByLabel('Hovered element')).toContainText("page.getByRole('button', { name: 'Log in' })");

  await page.locator('#login').click();
  await expect(popup.getByRole('heading', { name: 'Selected element' })).toBeVisible();
  const firstCard = popup.locator('.locator-card').first();
  await expect(firstCard).toContainText('Recommended');
  await expect(firstCard).toContainText("page.getByRole('button', { name: 'Log in' })");
  await expect(firstCard).toContainText('Unique · selected element');

  await popup.getByRole('tab', { name: /Selenium Java/ }).click();
  await expect(popup.locator('.locator-card').first()).toContainText('driver.findElement(By.id("login"))');

  await popup.getByRole('button', { name: 'Inspect again' }).click();
  await expect.poll(async () => (await sendToTab(serviceWorker, tabId, 'GET_INSPECTOR_STATUS')).state).toBe('inspecting');
  await page.bringToFront();

  // Cross-check every candidate's match count against Playwright's own engine.
  const targets = ['#login', '#email', 'input[type=checkbox]', 'tbody tr:nth-child(2) button', 'a.link', '[data-testid="checkout-button"]', '[aria-label="Don\'t stop"]'];
  for (const selector of targets) {
    await page.locator(selector).click();
    const status = await sendToTab(serviceWorker, tabId, 'GET_INSPECTOR_STATUS');
    const target = page.locator(selector);
    const playwrightCandidates = status.selection.frameworks.playwright;
    expect(playwrightCandidates.length, selector).toBeGreaterThan(0);
    expect(playwrightCandidates[0].validation.matchesTarget, selector).toBe(true);
    for (const candidate of playwrightCandidates) {
      const locator = toLocator(page, candidate.code);
      expect(await locator.count(), `${candidate.code} for ${selector}`).toBe(candidate.validation.matchCount);
      if (candidate.validation.matchesTarget) {
        const same = await locator.evaluate((node, other) => node === other, await target.elementHandle());
        expect(same, candidate.code).toBe(true);
      }
    }
    for (const candidate of status.selection.frameworks.selenium.filter((c) => c.kind === 'css' || c.kind === 'xpath')) {
      const value = candidate.by.match(/^By\.\w+\((.*)\)$/s)[1];
      const raw = JSON.parse(value);
      const locator = page.locator(candidate.kind === 'xpath' ? `xpath=${raw}` : raw);
      expect(await locator.count(), candidate.code).toBe(candidate.validation.matchCount);
    }
  }
  await sendToTab(serviceWorker, tabId, 'STOP_INSPECTOR');
});

test('blocks page clicks while inspecting and fully restores the page after stopping', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup } = await openApp(context, serviceWorker, extensionId);
  const before = await page.evaluate(() => ({ sheets: document.adoptedStyleSheets.length, html: document.documentElement.outerHTML.length }));

  await startInspection(popup, page);
  expect(await page.locator('smart-locator-inspector-overlay').count()).toBe(1);
  await page.locator('#login').click();
  await expect(page.locator('#click-count')).toHaveText('0');

  await popup.getByRole('button', { name: 'Stop Inspection' }).click();
  await expect(popup.getByRole('status').filter({ hasText: 'Not inspecting' })).toBeVisible();
  await expect(page.locator('smart-locator-inspector-overlay')).toHaveCount(0);
  const after = await page.evaluate(() => ({ sheets: document.adoptedStyleSheets.length, html: document.documentElement.outerHTML.length }));
  expect(after).toEqual(before);

  await page.bringToFront();
  await page.locator('#login').click();
  await expect(page.locator('#click-count')).toHaveText('1');
});

test('Escape stops inspection from the page', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup, tabId } = await openApp(context, serviceWorker, extensionId);
  await startInspection(popup, page);
  await page.locator('#email').hover();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sendToTab(serviceWorker, tabId, 'GET_INSPECTOR_STATUS')).state).toBe('idle');
  await expect(page.locator('smart-locator-inspector-overlay')).toHaveCount(0);
});

test('repeated injection and restarts never duplicate listeners', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup, tabId } = await openApp(context, serviceWorker, extensionId);
  for (let i = 0; i < 3; i++) {
    await serviceWorker.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ['content/content.js'] }), tabId);
  }
  for (let i = 0; i < 2; i++) {
    await sendToTab(serviceWorker, tabId, 'START_INSPECTOR');
    await sendToTab(serviceWorker, tabId, 'STOP_INSPECTOR');
  }

  await popup.evaluate(() => {
    window.__selected = 0;
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'ELEMENT_SELECTED') window.__selected += 1;
    });
  });
  await startInspection(popup, page);
  await page.locator('#email').click();
  await expect(popup.getByRole('heading', { name: 'Selected element' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await popup.evaluate(() => window.__selected)).toBe(1);
  expect(await page.locator('smart-locator-inspector-overlay').count()).toBe(1);
});

test('copies locator and usage example from the popup', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup } = await openApp(context, serviceWorker, extensionId);
  // Chromium refuses clipboard permission grants for extension origins in
  // automation, so capture what the popup writes instead of reading it back.
  await popup.evaluate(() => {
    window.__copied = [];
    navigator.clipboard.writeText = async (text) => { window.__copied.push(text); };
  });
  await startInspection(popup, page);
  await page.locator('#email').click();

  await popup.bringToFront();
  const card = popup.locator('.locator-card').first();
  await expect(card).toContainText("page.getByRole('textbox', { name: 'Email' })");
  await card.getByRole('button', { name: 'Copy locator' }).click();
  await expect(card.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
  await card.getByRole('button', { name: 'Copy example' }).click();
  expect(await popup.evaluate(() => window.__copied)).toEqual([
    "page.getByRole('textbox', { name: 'Email' })",
    "await page.getByRole('textbox', { name: 'Email' }).fill('text');",
  ]);

  await popup.getByRole('tab', { name: /Selenium Java/ }).click();
  const seleniumCard = popup.locator('.locator-card').first();
  await seleniumCard.getByRole('button', { name: 'Copy By' }).click();
  expect((await popup.evaluate(() => window.__copied)).at(-1)).toBe('By.id("email")');

  await card.getByRole('button', { name: 'Show matches' }).click();
  await expect(popup.getByText('Highlighted 1 match on the page right now.')).toBeVisible();
});

test('handles navigation and reload while inspecting', async ({ context, serviceWorker, extensionId }) => {
  const { page, popup, tabId } = await openApp(context, serviceWorker, extensionId);
  await startInspection(popup, page);
  const badge = () => serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  await expect.poll(badge).toBe('ON');

  await page.reload();
  await expect(popup.getByText('The page reloaded or navigated, so inspection stopped.')).toBeVisible();
  await expect.poll(badge).toBe('');
  await expect(page.locator('smart-locator-inspector-overlay')).toHaveCount(0);

  await page.goto('http://127.0.0.1:4178/second.html');
  await popup.getByRole('button', { name: 'Start Inspection' }).click();
  await page.bringToFront();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(popup.locator('.locator-card').first()).toContainText("page.getByRole('button', { name: 'Continue' })");
});

test('explains restricted browser pages instead of failing silently', async ({ context, serviceWorker, extensionId }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  const tabId = await tabIdFor(serviceWorker, 'chrome://version/');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html?tabId=${tabId}`);
  await expect(popup.getByText('Chrome does not allow extensions to inspect this page')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Start Inspection' })).toBeDisabled();
  await expect(popup.getByRole('heading', { name: "This page can't be inspected" })).toBeVisible();
});
