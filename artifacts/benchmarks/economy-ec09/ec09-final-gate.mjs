import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('.tmp/verification/ec09');
mkdirSync(directory, { recursive: true });
const report = {
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim(),
  scope: 'All verify:batch stages; unit/integration/contract run concurrently with 4/4/2 workers, Chromium with 2 workers. No test filters, skips, timeout or retry changes.',
  stages: [],
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
  report.stages.push(entry);
  save();
  console.log(`${name}: exit ${entry.code}, ${entry.seconds.toFixed(1)}s, ${log}`);
  return entry.code === 0;
}
async function phase(jobs) {
  const results = await Promise.all(jobs.map(([name, extra]) => run(name, extra)));
  return results.every(Boolean);
}
let ok = await phase([
  ['typecheck'], ['lint'], ['format:check'],
  ['validate:catalogs'], ['validate:presentation'], ['validate:i18n'],
]);
if (ok) ok = await run('build');
if (ok) ok = await phase([
  ['test:unit', ['--maxWorkers', '4']],
  ['test:integration', ['--maxWorkers', '4']],
  ['test:contract', ['--maxWorkers', '2']],
]);
if (ok) ok = await run('test:e2e', ['--project=chromium', '--workers=2']);
report.passed = ok;
report.finished = new Date().toISOString();
report.seconds = (Date.parse(report.finished) - Date.parse(report.started)) / 1000;
save();
process.exitCode = ok ? 0 : 1;
