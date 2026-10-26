/** Ordinary verification, with retained stage durations; no benchmark workload. */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch, totalmem } from 'node:os';

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
const stages = [
  'typecheck',
  'lint',
  'format:check',
  'test:unit',
  'test:integration',
  'test:contract',
  'validate:catalogs',
  'validate:presentation',
  'build',
  'test:e2e',
];
for (const stage of stages) {
  const args = ['run', stage];
  if (stage.startsWith('test:') && stage !== 'test:e2e')
    args.push(
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${directory}/${stage.slice(5)}-results.json`,
    );
  if (stage === 'test:e2e' && batch) args.push('--project=chromium');
  const started = new Date().toISOString();
  const start = performance.now();
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env });
  const entry = {
    stage,
    command: ['pnpm', ...args].join(' '),
    started,
    finished: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - start),
    exitCode: result.status ?? 1,
    error: result.error?.message,
  };
  report.stages.push(entry);
  report.finished = entry.finished;
  report.elapsedMs = Date.parse(entry.finished) - Date.parse(report.started);
  report.passed = entry.exitCode === 0 && report.stages.length === stages.length;
  writeFileSync(`${directory}/latest.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`Recorded ${stage}: ${(entry.elapsedMs / 1000).toFixed(1)} s (${entry.exitCode})`);
  if (entry.exitCode) process.exit(entry.exitCode);
}
