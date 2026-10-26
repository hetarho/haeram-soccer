import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.BROWSER_TEST_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
/**
 * Shared CI runners play the journeys several times slower than a workstation (CI 40282838897 and
 * 40290925795: WebKit's 5 s expectations for a played-through match day, a closed match eve and a
 * committed save, Firefox's 30 s test budget), while every such journey passes locally. On CI a
 * wait never fails a journey for time: expectations get 30 s and every project several times its
 * local budget. Timeouts a spec sets itself stay as written.
 */
const CI = !!process.env.CI;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: CI ? 150000 : 30000,
  expect: { timeout: CI ? 30000 : 5000 },
  workers: 3,
  // On CI each failing journey also becomes a check annotation, readable on the run page
  // without the job log.
  reporter: [
    ...(CI ? ([['github'], ['dot']] as const) : ([['list']] as const)),
    ['json', { outputFile: '.tmp/verification/e2e-results.json' }],
  ],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: process.env.PREVIEW_BUILD ? 'pnpm run preview' : `pnpm run dev --port ${port}`,
    env: { PORT: String(port) },
    url: baseURL,
    reuseExistingServer: !CI && !process.env.PREVIEW_BUILD,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      // CI 39534910810 lost Firefox during initial navigation; restart its worker once.
      retries: CI ? 1 : 0,
      use: { ...devices['Desktop Firefox'] },
    },
    // Software-rendered WebKit on CI runs the multi-round journeys two to three times slower;
    // one project budget replaces chasing whichever journey crosses 30 s next. Its web process
    // also stalls or crashes now and then (no paints, a click that never lands, "Page crashed")
    // in a different journey each run, locally too (2 of 106 on 261014), so CI gives WebKit two
    // retries and reports such journeys as flaky.
    {
      name: 'webkit',
      timeout: CI ? 300000 : 90000,
      retries: CI ? 2 : 0,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
