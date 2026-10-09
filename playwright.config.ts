import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.BROWSER_TEST_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  workers: 3,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: process.env.PREVIEW_BUILD ? 'pnpm run preview' : `pnpm run dev --port ${port}`,
    env: { PORT: String(port) },
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PREVIEW_BUILD,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // Software-rendered WebKit on CI runs the multi-round journeys two to three times slower;
    // one project budget replaces chasing whichever journey crosses 30 s next.
    { name: 'webkit', timeout: 90000, use: { ...devices['Desktop Safari'] } },
  ],
});
