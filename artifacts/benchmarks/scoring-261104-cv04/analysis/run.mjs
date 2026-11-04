// T689 cv04 job runner: node run.mjs JOBS.json CONCURRENCY
// Each job {name, patch, script, args}: runs `pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts
// <script> <args>` in the worktree with T689_PATCH_FILE=<patch>, log in .tmp/cv04/logs/<name>.log.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const logs = root + '.tmp/cv04/logs/';
mkdirSync(logs, { recursive: true });
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const limit = Number(process.argv[3] ?? 8);
const status = [];
let next = 0;
const t0 = Date.now();
function start() {
  if (next >= jobs.length) return null;
  const job = jobs[next++];
  const began = Date.now();
  const out = createWriteStream(logs + job.name + '.log');
  const child = spawn(
    'pnpm',
    ['exec', 'tsx', '--import', './scripts/scoring-candidate-patch.ts', job.script, ...job.args],
    { cwd: root, env: { ...process.env, T689_PATCH_FILE: job.patch } },
  );
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  return new Promise((resolve) =>
    child.on('close', (code) => {
      status.push({ name: job.name, code, seconds: Math.round((Date.now() - began) / 1000) });
      console.log(`${new Date().toISOString()} ${job.name} exit ${code} ${Math.round((Date.now() - began) / 1000)} s`);
      resolve();
    }),
  );
}
async function lane() {
  for (;;) {
    const p = start();
    if (!p) return;
    await p;
  }
}
await Promise.all(Array.from({ length: limit }, lane));
writeFileSync(
  process.argv[2].replace(/\.json$/, '.status.json'),
  JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), status }, null, 1),
);
console.log('all done', Math.round((Date.now() - t0) / 1000), 's');
