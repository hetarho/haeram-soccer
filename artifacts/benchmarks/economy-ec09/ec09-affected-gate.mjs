import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('.tmp/verification/ec09-affected');
const priorDirectory = resolve('.tmp/verification/ec09-resume');
const file = 'tests/e2e/management.spec.ts';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const prior = JSON.parse(readFileSync(`${priorDirectory}/result.json`, 'utf8'));
const commit = git('rev-parse', 'HEAD');
if (!prior.finished || prior.passed) throw new Error('Expected the completed whole-browser run with its known test-fixture failure');
if (git('status', '--porcelain')) throw new Error('Pre-push source must be clean');
const changed = git('diff', '--name-only', prior.commit, commit).split('\n').filter(Boolean);
if (!changed.includes(file) || changed.some((p) => p !== file && !p.startsWith('spec/') && !p.startsWith('artifacts/')))
  throw new Error('Prior checks cannot be reused: changes extend beyond metadata and the single reviewed E2E spec');
const hash = (x) => createHash('sha256').update(x).digest('hex');
const approved = execFileSync('git', ['show', `39886dfc95d21319771786465b364b0586d787bb:${file}`]);
if (hash(approved) !== hash(readFileSync(file))) throw new Error('Management spec differs from the exact independently reviewed patch');
const required = ['typecheck', 'lint', 'format:check', 'validate:catalogs', 'validate:presentation', 'validate:i18n', 'build', 'test:unit', 'test:integration', 'test:contract'];
for (const name of required) {
  const entries = prior.stages.filter((stage) => stage.name === name);
  if (entries.length !== 1 || entries[0].code !== 0) throw new Error(`Missing successful original stage ${name}`);
}
const originalBrowser = prior.stages.filter((stage) => stage.name === 'test:e2e');
if (originalBrowser.length !== 1 || originalBrowser[0].code === 0) throw new Error('Expected one failed full-browser receipt');
function cases(log) {
  return [...log.matchAll(/^\s*(✓|✘|✗|×|-)\s+(\d+)\s+\[chromium\]\s+›\s+(tests\/e2e\/[^:\r\n]+):(\d+):(\d+)\s+›\s+(.+)$/gm)].map((m) => ({
    outcome: m[1], ordinal: Number(m[2]), file: m[3],
    title: m[6].replace(/\s+\([\d.]+(?:ms|s|m)\)\s*$/, ''),
  }));
}
const oldLog = readFileSync(originalBrowser[0].log, 'utf8');
const total = Number(oldLog.match(/Running (\d+) tests using 4 workers/)?.[1]);
const oldCases = cases(oldLog);
if (total !== 348 || oldCases.length !== total || new Set(oldCases.map((c) => c.ordinal)).size !== total)
  throw new Error('Cannot prove complete original browser coverage');
const failed = oldCases.filter((c) => !['✓', '-'].includes(c.outcome));
if (failed.length !== 1 || failed[0].file !== file) throw new Error('Additional browser failures require a separate repair');
const oldManagement = oldCases.filter((c) => c.file === file);
const unchanged = oldCases.filter((c) => c.file !== file);
if (oldManagement.length !== 2 || unchanged.length !== 346 || unchanged.some((c) => !['✓', '-'].includes(c.outcome)))
  throw new Error('Unchanged browser cases are not all accounted for');
mkdirSync(directory, { recursive: true });
const report = {
  started: new Date().toISOString(), commit, tree: git('write-tree'),
  scope: 'Pre-push batch: refresh all six fast checks, retain the unchanged build/unit/integration/contract receipts, and replace exactly the two management-spec results after running that complete affected file. App source/config and every other test file remain byte-identical to the 348-case whole-browser run.',
  originalWholeBrowser: { commit: prior.commit, log: originalBrowser[0].log, total, failed, unchangedCases: unchanged },
  approvedSpec: { commit: '39886dfc95d21319771786465b364b0586d787bb', file, sha256: hash(approved) },
  stages: prior.stages.filter((s) => ['build', 'test:unit', 'test:integration', 'test:contract'].includes(s.name)).map((s) => ({ ...s, reusedFromUnchangedComputation: prior.commit })),
  passed: false,
};
const save = () => writeFileSync(`${directory}/result.json`, JSON.stringify(report, null, 2));
async function run(name, extra = []) {
  const start = Date.now();
  const log = `${directory}/${name.replaceAll(':', '-')}.log`;
  const fd = openSync(log, 'w');
  const args = ['run', name, ...extra];
  const result = await new Promise((done) => {
    const child = spawn('pnpm', args, { stdio: ['ignore', fd, fd], env: process.env });
    child.once('error', (error) => done({ code: 127, error: error.message }));
    child.once('close', (code, signal) => done({ code: code ?? 1, signal }));
  });
  closeSync(fd);
  const entry = { name, command: ['pnpm', ...args].join(' '), started: new Date(start).toISOString(), seconds: (Date.now() - start) / 1000, log, ...result };
  report.stages.push(entry); save();
  console.log(`${name}: exit ${entry.code}, ${entry.seconds.toFixed(1)}s, ${log}`);
  return entry;
}
save();
const fast = await Promise.all(['typecheck', 'lint', 'format:check', 'validate:catalogs', 'validate:presentation', 'validate:i18n'].map((name) => run(name)));
let ok = fast.every((entry) => entry.code === 0);
if (ok) {
  const browser = await run('test:e2e', ['--project=chromium', '--workers=2', file]);
  ok = browser.code === 0;
  if (ok) {
    const fresh = cases(readFileSync(browser.log, 'utf8'));
    const oldNames = oldManagement.map((c) => c.title).sort();
    if (fresh.length !== 2 || fresh.some((c) => c.file !== file || c.outcome !== '✓') || JSON.stringify(fresh.map((c) => c.title).sort()) !== JSON.stringify(oldNames))
      throw new Error('Affected-file results do not replace the exact two original scenarios');
    report.browserCoverage = { selected: total, reusedUnchanged: unchanged.length, freshlyPassed: fresh.length, passed: unchanged.filter((c) => c.outcome === '✓').length + fresh.length, existingSkipped: unchanged.filter((c) => c.outcome === '-').length, failures: 0 };
  }
}
report.passed = ok && report.stages.length === 11 && report.stages.every((s) => s.code === 0) && !!report.browserCoverage;
report.finished = new Date().toISOString();
save();
process.exitCode = report.passed ? 0 : 1;
