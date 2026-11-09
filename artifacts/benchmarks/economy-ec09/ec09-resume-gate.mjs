import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const priorDirectory = resolve('.tmp/verification/ec09');
const archive = resolve('.tmp/verification/ec09-initial');
const directory = resolve('.tmp/verification/ec09-resume');
const prior = JSON.parse(readFileSync(`${priorDirectory}/result.json`, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const tree = git('write-tree');
if (commit !== prior.commit || tree !== prior.tree || git('status', '--porcelain'))
  throw new Error('Cannot reuse checks after any source/index/worktree change');
const required = ['typecheck', 'lint', 'format:check', 'validate:catalogs', 'validate:presentation', 'validate:i18n', 'build', 'test:unit', 'test:integration', 'test:contract'];
const reused = required.map((name) => {
  const matches = prior.stages.filter((stage) => stage.name === name);
  if (matches.length !== 1 || matches[0].code !== 0)
    throw new Error(`Missing exact successful stage: ${name}`);
  return matches[0];
});
if (!prior.finished || prior.passed)
  throw new Error('Prior run must have ended after the deliberate browser interruption');
const browser = prior.stages.filter((stage) => stage.name === 'test:e2e');
if (browser.length !== 1 || browser[0].code === 0)
  throw new Error('Expected one interrupted original browser stage');
if (existsSync(archive)) throw new Error('Preserve existing archive; do not overwrite it');
cpSync(priorDirectory, archive, { recursive: true });
mkdirSync(directory, { recursive: true });
const stages = reused.map((stage) => ({ ...stage, log: stage.log.replace(priorDirectory, archive), reusedFromIdenticalCommitAndTree: true }));
const report = {
  started: new Date().toISOString(), commit, tree,
  scope: 'All 11 verify:batch stages. Reuse the 10 successful stages on the identical clean commit/tree; rerun the complete Chromium project with 4 workers, no filters/skips/timeout/retry changes.',
  originalRun: { started: prior.started, finished: prior.finished, interruptedBrowser: { ...browser[0], log: browser[0].log.replace(priorDirectory, archive) }, reason: 'Two browser workers underused the idle 12-core host and projected beyond the outer execution window. Preserve that interrupted run without counting it as passed.' },
  stages, passed: false,
};
const save = () => writeFileSync(`${directory}/result.json`, JSON.stringify(report, null, 2));
save();
const args = ['run', 'test:e2e', '--project=chromium', '--workers=4'];
const log = `${directory}/test-e2e.log`;
const fd = openSync(log, 'w');
const start = Date.now();
const result = await new Promise((done) => {
  const child = spawn('pnpm', args, { stdio: ['ignore', fd, fd], env: process.env });
  child.once('error', (error) => done({ code: 127, error: error.message }));
  child.once('close', (code, signal) => done({ code: code ?? 1, signal }));
});
closeSync(fd);
report.stages.push({ name: 'test:e2e', command: ['pnpm', ...args].join(' '), started: new Date(start).toISOString(), seconds: (Date.now() - start) / 1000, log, ...result });
report.passed = report.stages.length === 11 && report.stages.every((stage) => stage.code === 0);
report.finished = new Date().toISOString();
report.seconds = (Date.parse(report.finished) - Date.parse(report.started)) / 1000;
save();
console.log(`Complete Chromium: exit ${result.code}; ${(report.seconds / 60).toFixed(1)} min; ${log}`);
process.exitCode = report.passed ? 0 : 1;
