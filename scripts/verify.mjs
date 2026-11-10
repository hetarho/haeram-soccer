/**
 * Ordinary verification, with retained stage durations; no benchmark workload. The static stages
 * run side by side, then unit, integration and contract as one vitest run (its report split back
 * per tier by `testTier`), then the browser specs; each phase starts only after the last passed.
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
const checks = [
  'typecheck',
  'lint',
  'format:check',
  'validate:catalogs',
  'validate:presentation',
  'validate:i18n',
  'build',
].map((stage) => ({ stage, args: ['run', stage] }));
/** One pool for every tier: each project keeps its own include and `testTimeout`. */
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
  },
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

/** One stage as `pnpm <args>`; a stage sharing its phase replays its own output when it ends. */
function run({ stage, args, inherit = false }) {
  return new Promise((resolve) => {
    const started = new Date().toISOString();
    const start = performance.now();
    const output = [];
    const child = spawn('pnpm', args, {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    child.stdout?.on('data', (chunk) => output.push([process.stdout, chunk]));
    child.stderr?.on('data', (chunk) => output.push([process.stderr, chunk]));
    let error;
    child.on('error', (failure) => (error = failure));
    child.on('close', (code) => {
      for (const [stream, chunk] of output) stream.write(chunk);
      const entry = {
        stage,
        command: ['pnpm', ...args].join(' '),
        started,
        finished: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - start),
        exitCode: code ?? 1,
        error: error?.message,
      };
      record(entry);
      resolve(entry);
    });
  });
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

/** `{unit,integration,contract}-results.json`, as the separate tier runs wrote them. */
function splitTiers() {
  if (!existsSync(combined)) return;
  const all = JSON.parse(readFileSync(combined, 'utf8'));
  for (const tier of TIERS) {
    const testResults = all.testResults.filter(
      (file) => testTier(relative(process.cwd(), file.name)) === tier,
    );
    writeFileSync(
      `${directory}/${tier}-results.json`,
      JSON.stringify({ ...all, ...counts(testResults), testResults }),
    );
  }
}

// A phase's stages run together; the gate stops after a phase with its first failed stage's code.
rmSync(combined, { force: true });
for (const [stages, after] of [[checks], [tests, splitTiers], [browsers]]) {
  const entries = await Promise.all(stages.map(run));
  after?.();
  const failed = entries.find((entry) => entry.exitCode);
  if (failed) {
    process.exitCode = failed.exitCode;
    break;
  }
}
