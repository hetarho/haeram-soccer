// T689 cv04-alt job runner (cv04-clr's `analysis/run.mjs`, its log folder moved into this evidence):
// node run.mjs JOBS.json CONCURRENCY. Each job {name, patch, script, args}: runs
// `pnpm exec tsx --import ./scripts/scoring-candidate-patch.ts <script> <args>` in the worktree
// with T689_PATCH_FILE=<patch>, log in artifacts/benchmarks/scoring-261110-cv04-alt/logs/<name>.txt.
// Writes JOBS.status.json and a JOBS.done marker when every job has finished.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const logs = fileURLToPath(new URL('../logs/', import.meta.url));
mkdirSync(logs, { recursive: true });
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const limit = Number(process.argv[3] ?? 6);
const status = [];
let next = 0;
const t0 = Date.now();
function start() {
  if (next >= jobs.length) return null;
  const job = jobs[next++];
  const outArg = job.args.indexOf('--out');
  if (outArg >= 0) mkdirSync(dirname(root + job.args[outArg + 1]), { recursive: true });
  const began = Date.now();
  // `.txt`, since the repository ignores `*.log` and the evidence keeps every log.
  const out = createWriteStream(logs + job.name + '.txt');
  const child = spawn(
    'pnpm',
    ['exec', 'tsx', '--import', './scripts/scoring-candidate-patch.ts', job.script, ...job.args],
    { cwd: root, env: { ...process.env, T689_PATCH_FILE: job.patch } },
  );
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  return new Promise((resolve) =>
    child.on('close', (code) => {
      const seconds = Math.round((Date.now() - began) / 1000);
      status.push({ name: job.name, code, seconds, end: new Date().toISOString() });
      console.log(`${new Date().toISOString()} ${job.name} exit ${code} ${seconds} s`);
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
const seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(
  process.argv[2].replace(/\.json$/, '.status.json'),
  JSON.stringify({ start: new Date(t0).toISOString(), seconds, status }, null, 1),
);
writeFileSync(process.argv[2].replace(/\.json$/, '.done'), new Date().toISOString() + '\n');
console.log('all done', seconds, 's');
if (status.some((s) => s.code !== 0)) process.exitCode = 1;
