import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '**/*.spec.js',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/integration/server.mjs',
    url: 'http://127.0.0.1:4178/app.html',
    reuseExistingServer: !process.env.CI,
  },
});
