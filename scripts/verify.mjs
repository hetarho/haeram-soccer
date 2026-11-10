/**
 * Ordinary verification, with retained stage durations; no benchmark workload. The static stages
 * run side by side, then unit, integration and contract as one vitest run (its report split back
 * per tier by `testTier`) beside the world warm-up, then the browser specs; each phase starts only
 * after every stage of the last one passed.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch, totalmem } from 'node:os';
import { relative } from 'node:path';
import { testTier } from '../tests/config/test-tiers.ts';

const batch = process.argv.includes('--batch');
const directory = '.tmp/verification';
mkdirSync(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const report = {
  started: new Date().toISOString(),
  scope: batch ? 'batch: Chromium' : 'full: Chromium, Firefox, WebKit',
  source: {
    commit: git('rev-parse', 'HEAD'),
    tree: git('write-tree'),
    dirty: !!git('status', '--porcelain'),
    diff: git('diff', 'HEAD', '--stat'),
  },
  machine: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
  },
  cache: 'Existing caches retained; cache warmth and external host load uncontrolled.',
  stages: [],
};

const TIERS = ['unit', 'integration', 'contract'];
const combined = `${directory}/vitest-results.json`;
const tierReport = (tier) => `${directory}/${tier}-results.json`;
const checks = [
  'typecheck',
  'lint',
  'format:check',
  'validate:catalogs',
  'validate:presentation',
  'validate:i18n',
  'build',
].map((stage) => ({ stage, args: ['run', stage] }));
/**
 * One pool for every tier: each project keeps its own include and `testTimeout`. Beside it the
 * world warm-up builds the worlds cases only read, outside their timers (T771); it is a background
 * stage, ended when the tests fail, and skipped when the world cache is off (it would be discarded).
 */
const tests = [
  {
    stage: `test:${TIERS.join('+')}`,
    args: [
      'exec',
      'vitest',
      'run',
      ...TIERS.flatMap((tier) => ['--project', tier]),
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${combined}`,
    ],
    inherit: true,
    after: splitTiers,
  },
  ...(process.env.HAERAM_WORLD_CACHE === 'off'
    ? []
    : [
        {
          stage: 'warm-worlds',
          command: 'node',
          args: ['--import', 'tsx', 'scripts/warm-worlds.ts'],
          background: true,
        },
      ]),
];
const browsers = [
  {
    stage: 'test:e2e',
    args: ['run', 'test:e2e', ...(batch ? ['--project=chromium'] : [])],
    inherit: true,
  },
];
const planned = checks.length + tests.length + browsers.length;

function record(entry) {
  report.stages.push(entry);
  report.finished = entry.finished;
  report.elapsedMs = Date.parse(entry.finished) - Date.parse(report.started);
  report.passed =
    report.stages.length === planned && report.stages.every((stage) => stage.exitCode === 0);
  writeFileSync(`${directory}/latest.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Recorded ${entry.stage}: ${(entry.elapsedMs / 1000).toFixed(1)} s (${entry.exitCode})`,
  );
}

/**
 * One stage as `<command> <args>` (pnpm unless named); a piped stage replays its own output when it
 * ends, and `after` may fail a stage whose command passed.
 */
function run({ stage, command = 'pnpm', args, inherit = false, after = (entry) => entry }) {
  const started = new Date().toISOString();
  const start = performance.now();
  const output = [];
  const child = spawn(command, args, {
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout?.on('data', (chunk) => output.push([process.stdout, chunk]));
  child.stderr?.on('data', (chunk) => output.push([process.stderr, chunk]));
  let error;
  child.on('error', (failure) => (error = failure));
  const done = new Promise((resolve) =>
    child.on('close', (code, signal) => {
      for (const [stream, chunk] of output) stream.write(chunk);
      const entry = after({
        stage,
        command: [command, ...args].join(' '),
        started,
        finished: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - start),
        exitCode: code ?? 1,
        signal: signal ?? undefined,
        error: error?.message,
      });
      record(entry);
      resolve(entry);
    }),
  );
  return { child, done };
}

/** Counts as vitest's JSON reporter derives them, for one tier's share of the combined run. */
function counts(testResults) {
  const tests = testResults.flatMap((file) => file.assertionResults);
  const status = (value) => tests.filter((test) => test.status === value).length;
  const suites = testResults.flatMap((file) => {
    const failed = new Map([['', file.status === 'failed']]);
    for (const test of file.assertionResults)
      for (let depth = 1; depth <= test.ancestorTitles.length; depth++) {
        const path = test.ancestorTitles.slice(0, depth).join('\0');
        failed.set(path, failed.get(path) || test.status === 'failed');
      }
    return [...failed.values()];
  });
  const failedSuites = suites.filter(Boolean).length;
  return {
    numTotalTestSuites: suites.length,
    numPassedTestSuites: suites.length - failedSuites,
    numFailedTestSuites: failedSuites,
    numPendingTestSuites: 0,
    numTotalTests: tests.length,
    numPassedTests: status('passed'),
    numFailedTests: status('failed'),
    numPendingTests: status('skipped') + status('pending'),
    numTodoTests: status('todo'),
    success: testResults.length > 0 && !failedSuites && !status('failed'),
  };
}

/**
 * `{unit,integration,contract}-results.json`, as the separate tier runs wrote them. A tier without
 * files fails the stage, as its own `vitest run --project <tier>` would.
 */
function splitTiers(entry) {
  const all = existsSync(combined) ? JSON.parse(readFileSync(combined, 'utf8')) : undefined;
  const emptyTiers = [];
  for (const tier of TIERS) {
    const testResults = (all?.testResults ?? []).filter(
      (file) => testTier(relative(process.cwd(), file.name)) === tier,
    );
    if (!testResults.length) emptyTiers.push(tier);
    if (all)
      writeFileSync(
        tierReport(tier),
        JSON.stringify({ ...all, ...counts(testResults), testResults }),
      );
  }
  return emptyTiers.length ? { ...entry, exitCode: entry.exitCode || 1, emptyTiers } : entry;
}

// A phase's stages run together; the gate stops after a phase with its first failed stage's code.
// When a phase's other stages have ended and one failed, its background stages are ended too.
for (const report of [combined, ...TIERS.map(tierReport)]) rmSync(report, { force: true });
for (const stages of [checks, tests, browsers]) {
  const running = stages.map(run);
  const foreground = running.filter((_, index) => !stages[index].background);
  Promise.all(foreground.map(({ done }) => done)).then((entries) => {
    if (entries.some((entry) => entry.exitCode))
      for (const [index, { child }] of running.entries())
        if (stages[index].background) child.kill();
  });
  const entries = await Promise.all(running.map(({ done }) => done));
  const failed = entries.find((entry) => entry.exitCode);
  if (failed) {
    process.exitCode = failed.exitCode;
    break;
  }
}
