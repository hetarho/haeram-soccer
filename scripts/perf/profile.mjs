/**
 * Where a workload of the paired A/B bench (`ab.mjs`) spends its CPU, on this tree.
 *
 *   node scripts/perf/profile.mjs --workload grid|aggregate|day [--reps n] [--warm n] [--top n]
 *     [--lines <function>] [--seed s]
 *
 * This tree's `workloads.ts` is bundled as `ab.mjs` bundles it (`bundle.mjs`; tsx's `__name`
 * wrappers would add 5–7%) and run in a child process under `--cpu-prof`: `--warm` reps, then
 * `--reps` measured reps. Printed: the top self and inclusive functions over the measured reps'
 * samples (the world's build, the warm-up and the digest left out), and with `--lines`, each
 * function of that name's hottest bundle lines with their text. V8 keeps line ticks per function
 * for the whole run, so the lines also count the warm-up. The profile and bundle paths are printed
 * so a profile can be reread.
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
const workload = arg('--workload', 'grid');
const DEFAULTS = {
  grid: { reps: 18, warm: 6 },
  aggregate: { reps: 20, warm: 4 },
  day: { reps: 60, warm: 0 },
};
const d = DEFAULTS[workload];
if (!d) throw new Error(`unknown workload ${workload}`);
const reps = Number(arg('--reps', d.reps)),
  warm = Number(arg('--warm', d.warm)),
  top = Number(arg('--top', 25)),
  lines = arg('--lines'),
  seed = arg('--seed', 'perf-261027');

const scratch = join(tmpdir(), 'haeram-perf-profile');
mkdirSync(scratch, { recursive: true });
const bundle = await bundleWorkloads(repo, join(scratch, `workloads-${process.pid}.mjs`));

// The child: the measured window's ends on the profiler's clock (both CLOCK_MONOTONIC, in µs).
const CHILD = `
import { pathToFileURL } from 'node:url';
const { file, workload, seed, reps, warm } = JSON.parse(process.argv.at(-1));
const w = (await import(pathToFileURL(file).href)).workloadOf(workload, seed);
for (let i = 0; i < warm; i++) w.rep(false);
const from = process.hrtime.bigint() / 1000n;
for (let i = 0; i < reps; i++) w.rep(i < w.cycle);
const to = process.hrtime.bigint() / 1000n;
console.log(JSON.stringify({ from: String(from), to: String(to), digest: w.digest() }));
`;
const name = `${workload}-${process.pid}.cpuprofile`;
const load1 = loadavg()[0];
const r = spawnSync(
  process.execPath,
  [
    '--cpu-prof',
    '--cpu-prof-dir',
    scratch,
    '--cpu-prof-name',
    name,
    '--input-type=module',
    '-e',
    CHILD,
    JSON.stringify({ file: bundle, workload, seed, reps, warm }),
  ],
  { encoding: 'utf8', maxBuffer: 1 << 26 },
);
if (r.status !== 0) throw new Error(`profiled run failed:\n${r.stderr}`);
const run = JSON.parse(r.stdout.trim().split('\n').at(-1));
const file = join(scratch, name);
const prof = JSON.parse(readFileSync(file, 'utf8'));

const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n);
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const keyOf = (n) => {
  const f = n.callFrame;
  const fn = f.functionName || '(anonymous)';
  return f.url ? `${fn} ${basename(f.url)}:${f.lineNumber + 1}` : fn;
};

// Samples inside the measured window; the whole profile when the clocks do not line up.
const from = Number(run.from),
  to = Number(run.to);
const stamps = [];
let t = prof.startTime;
for (const dt of prof.timeDeltas) stamps.push((t += dt));
const inWindow = from >= prof.startTime && to <= prof.endTime;
const self = new Map(),
  inclusive = new Map();
let counted = 0;
prof.samples.forEach((id, i) => {
  if (inWindow && (stamps[i] < from || stamps[i] > to)) return;
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
const msPerSample = (to - from) / 1000 / Math.max(counted, 1);
const pct = (x, of) => `${((100 * x) / of).toFixed(1).padStart(5)}%`;
const table = (title, m) => {
  console.log(`\n${title}`);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${pct(v, counted)} ${(v * msPerSample).toFixed(0).padStart(6)} ms  ${k}`);
};

console.log(
  `${workload}: ${reps} reps after ${warm} warm, ${((to - from) / 1000).toFixed(0)} ms, ` +
    `${counted} samples${inWindow ? '' : ' (whole profile: window not on the profile clock)'}, ` +
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
