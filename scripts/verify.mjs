/**
 * Ordinary verification, with retained stage durations; no benchmark workload. The static stages
 * run side by side, then unit, integration and contract as one vitest run (its report split back
 * per tier by `testTier`) beside the world warm-up, then the browser specs; each phase starts only
 * after every stage of the last one passed.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { cpus, platform, arch, totalmem } from 'node:os';
import { relative, resolve } from 'node:path';
import { testTier } from '../tests/config/test-tiers.ts';
import { runVerificationStage } from './lib/verification-runner.ts';

const batch = process.argv.includes('--batch');
const directory = '.tmp/verification';
mkdirSync(directory, { recursive: true });
const runDirectory = resolve(
  directory,
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`,
);
mkdirSync(runDirectory, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const report = {
  started: new Date().toISOString(),
  scope: batch ? 'batch: nonbrowser' : 'full: Chromium browser journeys',
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
const browsers = batch ? [] : [{ stage: 'test:e2e', args: ['run', 'test:e2e'], inherit: true }];
const plan = [...checks, ...tests, ...browsers];
report.stages = plan.map(({ stage, command = 'pnpm', args }) => ({
  stage,
  command: [command, ...args].join(' '),
  argv: [command, ...args],
  status: 'pending',
  exitCode: null,
}));
report.directory = runDirectory;
const active = new Set();
let interrupted;

function persist() {
  const terminal = report.stages.filter((stage) =>
    ['passed', 'failed', 'cancelled', 'skipped'].includes(stage.status),
  );
  report.elapsedMs = Date.now() - Date.parse(report.started);
  report.passed = report.stages.every((stage) => stage.status === 'passed' && stage.exitCode === 0);
  report.status = interrupted
    ? 'cancelled'
    : report.stages.some((stage) => ['failed', 'cancelled'].includes(stage.status))
      ? 'failed'
      : report.passed
        ? 'passed'
        : 'running';
  if (terminal.length === plan.length) report.finished = new Date().toISOString();
  const json = JSON.stringify(report, null, 2) + '\n';
  for (const path of [`${runDirectory}/report.json`, `${directory}/latest.json`]) {
    writeFileSync(`${path}.tmp`, json);
    renameSync(`${path}.tmp`, path);
  }
}
function record(entry) {
  report.stages[report.stages.findIndex((stage) => stage.stage === entry.stage)] = entry;
  persist();
  const event = { event: 'verification-stage', ...entry };
  appendFileSync(`${runDirectory}/events.jsonl`, JSON.stringify(event) + '\n');
  console.log(JSON.stringify(event));
}
function interrupt(signal) {
  interrupted ??= { signal, at: new Date().toISOString() };
  report.interrupted = interrupted;
  persist();
  for (const run of active) run.cancel(signal);
  process.exitCode = interrupted.signal === 'SIGINT' ? 130 : 143;
}
const onTerm = () => interrupt('SIGTERM'),
  onInt = () => interrupt('SIGINT');
process.on('SIGTERM', onTerm);
process.on('SIGINT', onInt);
persist();

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
try {
  for (const stages of [checks, tests, browsers]) {
    if (interrupted) break;
    const running = stages.map((stage) => {
      const run = runVerificationStage(stage, { directory: runDirectory, onUpdate: record });
      active.add(run);
      run.done.then(() => active.delete(run));
      return run;
    });
    const foreground = running.filter((_, index) => !stages[index].background);
    Promise.all(foreground.map(({ done }) => done)).then((entries) => {
      if (entries.some((entry) => entry.exitCode !== 0))
        for (const [index, run] of running.entries()) if (stages[index].background) run.cancel();
    });
    const entries = await Promise.all(running.map(({ done }) => done));
    const failed = entries.find((entry) => entry.exitCode !== 0);
    if (failed) {
      process.exitCode ||= failed.exitCode > 0 ? failed.exitCode : 1;
      break;
    }
  }
} finally {
  process.off('SIGTERM', onTerm);
  process.off('SIGINT', onInt);
  for (const entry of report.stages)
    if (entry.status === 'pending') {
      entry.status = 'skipped';
      entry.reason = interrupted ? 'interrupted' : 'prior-stage-failure';
    }
  persist();
  const event = {
    event: 'verification-finished',
    status: report.status,
    passed: report.passed,
    exitCode: process.exitCode ?? 0,
    report: `${runDirectory}/report.json`,
  };
  (report.passed ? process.stdout : process.stderr).write(JSON.stringify(event) + '\n');
}
