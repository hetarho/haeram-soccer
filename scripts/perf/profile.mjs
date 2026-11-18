/**
 * Where a workload of the paired A/B bench (`ab.mjs`) spends its CPU, on this tree.
 *
 *   node scripts/perf/profile.mjs --workload own-match|aggregate|day|view|history [--reps n] [--warm n]
 *     [--skip n] [--top n] [--lines <function>] [--seed s]
 *
 * This tree's `workloads.ts` is bundled as `ab.mjs` bundles it (`bundle.mjs`; tsx's `__name`
 * wrappers would add 5–7%) and run in a child process: `--skip` reps
 * (for `history`, that many seasons from 1930, so a later decade can be profiled alone), `--warm`
 * reps, then `--reps` measured reps, all unprofiled and untimed but the last. The child starts the
 * V8 profiler through `node:inspector/promises` just before the measured reps and stops it after
 * them, so every table covers those reps alone. Printed: the top self and inclusive functions, and
 * with `--lines`, each function of that name's hottest bundle lines with their text. The profile and bundle paths are printed
 * so a profile can be reread.
 *
 * `--workload view` profiles a day as the Host plays it (`workloads.ts`): its reps are awaited.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, loadavg } from 'node:os';
import { bundleWorkloads } from './bundle.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const workload = arg('--workload', 'own-match');
const DEFAULTS = {
  'own-match': { reps: 12, warm: 4 },
  staging: { reps: 2, warm: 1 },
  'staging-core': { reps: 2, warm: 1 },
  'staging-first': { reps: 12, warm: 4 },
  fixture: { reps: 12, warm: 4 },
  aggregate: { reps: 20, warm: 4 },
  day: { reps: 60, warm: 0 },
  view: { reps: 60, warm: 6 },
  history: { reps: 10, warm: 1 },
};
const d = DEFAULTS[workload];
if (!d) throw new Error(`unknown workload ${workload}`);
const reps = Number(arg('--reps', d.reps)),
  warm = Number(arg('--warm', d.warm)),
  skip = Number(arg('--skip', 0)),
  top = Number(arg('--top', 25)),
  lines = arg('--lines'),
  seed = arg('--seed', 'perf-261027');

const scratch = join(tmpdir(), 'haeram-perf-profile');
mkdirSync(scratch, { recursive: true });
const tree = arg('--tree', repo);
const bundle = await bundleWorkloads(tree, join(scratch, `workloads-${process.pid}.mjs`));

// The child: skip reps and warm reps run unprofiled, the V8 profiler (inspector) covers only the
// measured reps and the child writes the .cpuprofile itself.
const CHILD = `
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
const { file, workload, seed, reps, warm, skip, out } = JSON.parse(process.argv.at(-1));
const w = (await import(pathToFileURL(file).href)).workloadOf(workload, seed);
// A rep that returns a promise (\`view\`) is awaited; a synchronous one runs without an await.
const run = async (cycled) => {
  const r = w.rep(cycled);
  if (typeof r?.then === 'function') await r;
};
for (let i = 0; i < skip; i++) await run(false);
for (let i = 0; i < warm; i++) await run(false);
const session = new Session();
session.connect();
await session.post('Profiler.enable');
await session.post('Profiler.start');
const from = process.hrtime.bigint();
for (let i = 0; i < reps; i++) await run(i < w.cycle);
const to = process.hrtime.bigint();
const { profile } = await session.post('Profiler.stop');
writeFileSync(out, JSON.stringify(profile));
console.log(JSON.stringify({ ms: Number(to - from) / 1e6, digest: w.digest() }));
`;
const name = `${workload}-${process.pid}.cpuprofile`;
const load1 = loadavg()[0];
const file = join(scratch, name);
const r = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    CHILD,
    JSON.stringify({ file: bundle, workload, seed, reps, warm, skip, out: file }),
  ],
  { encoding: 'utf8', maxBuffer: 1 << 26 },
);
if (r.status !== 0) throw new Error(`profiled run failed:\n${r.stderr}`);
const run = JSON.parse(r.stdout.trim().split('\n').at(-1));
const prof = JSON.parse(readFileSync(file, 'utf8'));

const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n);
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const keyOf = (n) => {
  const f = n.callFrame;
  const fn = f.functionName || '(anonymous)';
  return f.url ? `${fn} ${basename(f.url)}:${f.lineNumber + 1}` : fn;
};

// The profile holds the measured reps alone.
const self = new Map(),
  inclusive = new Map();
let counted = 0;
prof.samples.forEach((id) => {
  const node = byId.get(id);
  if (node.callFrame.functionName === '(idle)') return;
  counted++;
  const key = keyOf(node);
  self.set(key, (self.get(key) ?? 0) + 1);
  const seen = new Set();
  for (let n = node; n && n.callFrame.functionName !== '(root)'; n = parent.get(n.id)) {
    const k = keyOf(n);
    if (seen.has(k)) continue;
    seen.add(k);
    inclusive.set(k, (inclusive.get(k) ?? 0) + 1);
  }
});
const msPerSample = run.ms / Math.max(counted, 1);
const pct = (x, of) => `${((100 * x) / of).toFixed(1).padStart(5)}%`;
const table = (title, m) => {
  console.log(`\n${title}`);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${pct(v, counted)} ${(v * msPerSample).toFixed(0).padStart(6)} ms  ${k}`);
};

console.log(
  `${workload}: ${reps} reps after ${skip} skipped and ${warm} warm, ${run.ms.toFixed(0)} ms, ` +
    `${counted} samples, ` +
    `load1 ${load1.toFixed(2)}, digest ${run.digest}`,
);
table('self', self);
table('inclusive', inclusive);
if (lines) {
  const text = readFileSync(bundle, 'utf8').split('\n');
  const ticks = new Map();
  for (const n of prof.nodes) {
    if (n.callFrame.functionName !== lines) continue;
    const at = ticks.get(keyOf(n)) ?? new Map();
    for (const p of n.positionTicks ?? []) at.set(p.line, (at.get(p.line) ?? 0) + p.ticks);
    ticks.set(keyOf(n), at);
  }
  if (!ticks.size) console.log(`\nno function named ${lines} in the profile`);
  for (const [k, at] of ticks) {
    const total = [...at.values()].reduce((a, b) => a + b, 0);
    console.log(`\nlines of ${k} (${total} ticks, warm-up included)`);
    for (const [line, n] of [...at].sort((a, b) => b[1] - a[1]).slice(0, top))
      console.log(
        `${pct(n, total)} ${String(line).padStart(6)}  ${text[line - 1]?.trim().slice(0, 140)}`,
      );
  }
}
console.log(`\nprofile ${file}\nbundle ${bundle}`);
