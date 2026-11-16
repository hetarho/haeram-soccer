import { defineConfig, devices } from '@playwright/test';
import { browserTestPort } from './tests/config/browser-port';
// The run's own free port unless BROWSER_TEST_PORT names one (dev reuse needs a named port).
const port = browserTestPort();
const baseURL = `http://127.0.0.1:${port}`;
/**
 * CI uses the same Chromium journeys as local full verification, with larger wait budgets for its
 * slower shared runners. Timeouts a spec sets itself stay as written.
 */
const CI = !!process.env.CI;
/**
 * Each local Chromium worker keeps about two of the host's twelve cores busy to the end (renderer
 * and engine worker, GPU, browser, test runner; nx10 at 1757 s, 261110), so three left half the
 * host idle. Locally Chromium runs `E2E_WORKERS` workers (default 5; `E2E_WORKERS=3` restores the
 * former width) and schedules case by case, which no spec prevents: none runs serially or shares
 * `beforeAll`/`afterAll` state, and the world cache locks per entry. CI runs two workers, as many
 * as its four-core runners hold at two cores each (three stretched the 1950 generation journey
 * from 142–158 s past its 180 s; 261117), and file-level scheduling, so `--shard` still splits by
 * file.
 */
const localChromiumWorkers = Math.max(1, Math.trunc(Number(process.env.E2E_WORKERS)) || 5);
export default defineConfig({
  testDir: 'tests/e2e',
  // Sessions on a shared host take turns: one browser run at a time per clone.
  globalSetup: './tests/e2e/global-lock.ts',
  timeout: CI ? 150000 : 30000,
  expect: { timeout: CI ? 30000 : 5000 },
  workers: CI ? 2 : Math.max(3, localChromiumWorkers),
  // On CI each failing journey also becomes a check annotation, readable on the run page
  // without the job log.
  reporter: [
    ...(CI ? ([['github'], ['dot']] as const) : ([['list']] as const)),
    ['json', { outputFile: '.tmp/verification/e2e-results.json' }],
  ],
  // A local trace keeps DOM snapshots, network, console and sources but no screencast: filming
  // every case cost about 41% of the journeys' CPU (53 cases, 445 s against 264 s; 261110), and
  // the filmstrip is read only when a case fails. CI traces keep their screenshots.
  use: {
    baseURL,
    trace: CI ? 'retain-on-failure' : { mode: 'retain-on-failure', screenshots: false },
  },
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
  ],
});
