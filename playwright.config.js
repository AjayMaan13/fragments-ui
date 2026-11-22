// playwright.config.js

// Tier 1 end-to-end tests: the real UI, built with dummy Cognito settings, in a
// real browser, talking to a fake API (page.route) so they need no AWS and no
// backend. `npm run test:e2e`. The live-stack spec is separate (live.spec.js).

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  // live.spec.js drives a deployed stack with real credentials; only run it on purpose
  testIgnore: process.env.E2E_LIVE ? [] : ['**/live.spec.js'],
  testMatch: process.env.E2E_LIVE ? ['**/live.spec.js'] : ['**/app.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    // Tier 1 serves the UI itself on PORT; the live spec points at wherever the
    // UI is running (the Cognito app client only allows the callback http://localhost:1234)
    baseURL: process.env.E2E_LIVE
      ? process.env.E2E_BASE_URL || 'http://localhost:1234'
      : `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build the UI with dummy values, then serve it. Not used for the live spec.
  webServer: process.env.E2E_LIVE
    ? undefined
    : {
        command: 'npm run build:e2e && node e2e/serve.mjs',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
