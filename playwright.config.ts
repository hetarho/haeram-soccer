import { defineConfig, devices } from '@playwright/test';
import { browserTestPort } from './tests/config/browser-port';
// The run's own free port unless BROWSER_TEST_PORT names one (dev reuse needs a named port).
const port = browserTestPort();
const baseURL = `http://127.0.0.1:${port}`;
/**
 * Shared CI runners play the journeys several times slower than a workstation (CI 40282838897 and
 * 40290925795: WebKit's 5 s expectations for a played-through match day, a closed match eve and a
 * committed save, Firefox's 30 s test budget), while every such journey passes locally. On CI a
 * wait never fails a journey for time: expectations get 30 s and every project several times its
 * local budget. Timeouts a spec sets itself stay as written.
 */
const CI = !!process.env.CI;
/**
 * Each local Chromium worker keeps about two of the host's twelve cores busy to the end (renderer
 * and engine worker, GPU, browser, test runner; nx10 at 1757 s, 261110), so three left half the
 * host idle. Locally Chromium runs `E2E_WORKERS` workers (default 5; `E2E_WORKERS=3` restores the
 * former width) and schedules case by case, which no spec prevents: none runs serially or shares
 * `beforeAll`/`afterAll` state, and the world cache locks per entry. CI keeps three workers and
 * file-level scheduling, so `--shard` still splits by file; Firefox and WebKit keep three locally.
 */
const localChromiumWorkers = Math.max(1, Math.trunc(Number(process.env.E2E_WORKERS)) || 5);
export default defineConfig({
  testDir: 'tests/e2e',
  // Sessions on a shared host take turns: one browser run at a time per clone.
  globalSetup: './tests/e2e/global-lock.ts',
  timeout: CI ? 150000 : 30000,
  expect: { timeout: CI ? 30000 : 5000 },
  workers: CI ? 3 : Math.max(3, localChromiumWorkers),
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
    {
      name: 'chromium',
      ...(CI ? {} : { workers: localChromiumWorkers, fullyParallel: true }),
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      // CI 39534910810 lost Firefox during initial navigation; restart its worker once.
      retries: CI ? 1 : 0,
      workers: 3,
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
      workers: 3,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
