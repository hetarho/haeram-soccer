/**
 * Paired A/B speed comparison on this machine (the owner's bar, 261028: a speed-up succeeds when
 * the candidate is faster than its baseline on the machine measured, beyond the noise; no target
 * in seconds).
 *
 *   node scripts/perf/ab.mjs --base <git ref | dir> [--cand <git ref | dir>] [--workload grid]
 *     [--procs 8] [--reps n] [--warm n] [--seed s] [--json out.json]
 *
 * Each side's `workloads.ts` is bundled with esbuild from its own tree (a git ref is exported with
 * `git archive` into a scratch directory; a directory is used as it stands; the default candidate
 * is this checkout). Every process (`pair.mjs`) loads both bundles and alternates their reps
 * A B / B A, so load swings on a shared host hit both sides of a pair alike; measured on 261028,
 * separate processes per side gave A/A intervals of ±3% (aggregate) and ±5% (grid).
 *
 * Estimate: per process, the median log-ratio B/A of its pairs (main-thread CPU time, the primary
 * measure; wall time beside it); over processes, their trimmed mean with a 95% bootstrap interval. The call
 * is "faster" when the whole interval is below 1. The `day` workload reports own match days and
 * other days separately. Output hashes are compared: a result-identical change keeps them equal.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, loadavg } from 'node:os';
import { build } from 'esbuild';
import { median, verdict } from './stats.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const workload = arg('--workload', 'grid');
const DEFAULTS = {
  grid: { procs: 16, reps: 18, warm: 6 },
  aggregate: { procs: 16, reps: 20, warm: 4 },
  day: { procs: 4, reps: 60, warm: 0 },
};
const d = DEFAULTS[workload];
if (!d) throw new Error(`unknown workload ${workload}`);
const procs = Number(arg('--procs', d.procs)),
  reps = Number(arg('--reps', d.reps)),
  warm = Number(arg('--warm', d.warm)),
  seed = arg('--seed', 'perf-261027');
const scratch = join(tmpdir(), 'haeram-perf-ab');
mkdirSync(scratch, { recursive: true });

/**
 * A scratch copy of a side's `packages/` (a git ref through `git archive`, a directory copied as it
 * stands) with this harness's `workloads.ts` placed in it. Both sides are built the same way from
 * their own root, so identical sources give byte-identical bundles (measured 261028: bundles that
 * differed only in their path comments read about 0.6% apart).
 */
function treeOf(spec, name) {
  let dir;
  if (existsSync(join(spec, 'packages'))) {
    dir = join(scratch, `tree-${name}-${process.pid}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(join(spec, 'packages'), join(dir, 'packages'), { recursive: true });
  } else {
    const sha = execFileSync('git', ['-C', repo, 'rev-parse', spec], { encoding: 'utf8' }).trim();
    dir = join(scratch, `tree-${sha.slice(0, 12)}`);
    if (!existsSync(join(dir, 'packages'))) {
      mkdirSync(dir, { recursive: true });
      const tar = execFileSync('git', ['-C', repo, 'archive', sha, 'packages'], {
        maxBuffer: 1 << 30,
      });
      execFileSync('tar', ['-x', '-C', dir], { input: tar });
    }
  }
  mkdirSync(join(dir, 'scripts/perf'), { recursive: true });
  cpSync(join(here, 'workloads.ts'), join(dir, 'scripts/perf/workloads.ts'));
  return dir;
}

async function bundle(tree, name) {
  const outfile = join(scratch, `${name}-${process.pid}.mjs`);
  await build({
    absWorkingDir: tree,
    entryPoints: ['scripts/perf/workloads.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    nodePaths: [join(repo, 'node_modules')],
    banner: {
      js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
    },
  });
  return outfile;
}

const baseSpec = arg('--base');
if (!baseSpec) throw new Error('--base <git ref | dir> is required');
const candSpec = arg('--cand', repo);
const [baseFile, candFile] = await Promise.all([
  bundle(treeOf(baseSpec, 'base'), 'base'),
  bundle(treeOf(candSpec, 'cand'), 'cand'),
]);
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const bundles = { base: sha(baseFile), cand: sha(candFile) };

/**
 * A pair both of whose sides took under `MIN_MS` of CPU (a quiet day of the `day` workload) is too
 * short for the CPU clock's resolution and is left out of every ratio.
 */
const MIN_MS = 5;
const timed = (x) => x.a.cpu >= MIN_MS || x.b.cpu >= MIN_MS;

const loads = [loadavg()[0]];
const runs = [];
for (let p = 0; p < procs; p++) {
  const r = spawnSync(
    process.execPath,
    [join(here, 'pair.mjs'), baseFile, candFile, workload, seed, reps, warm, p % 2 ? 'BA' : 'AB'],
    { encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  if (r.status !== 0) throw new Error(`pair.mjs failed:\n${r.stderr}`);
  runs.push(JSON.parse(r.stdout.trim().split('\n').at(-1)));
  loads.push(loadavg()[0]);
  const logs = runs
    .at(-1)
    .pairs.filter(timed)
    .map((x) => Math.log(x.b.cpu / x.a.cpu));
  console.error(`process ${p + 1}/${procs}: cpu ×${Math.exp(median(logs)).toFixed(3)}`);
}

const labels = [...new Set(runs.flatMap((r) => r.pairs.filter(timed).map((x) => x.label)))];
const byLabel = Object.fromEntries(
  labels.map((label) => {
    const per = (k) =>
      runs
        .map((r) => r.pairs.filter((x) => x.label === label && timed(x)))
        .filter((xs) => xs.length)
        .map((xs) => median(xs.map((x) => Math.log(x.b[k] / x.a[k]))));
    const all = runs.flatMap((r) => r.pairs.filter((x) => x.label === label && timed(x)));
    return [
      label,
      {
        pairs: all.length,
        ms: {
          base: { cpu: median(all.map((x) => x.a.cpu)), wall: median(all.map((x) => x.a.wall)) },
          cand: { cpu: median(all.map((x) => x.b.cpu)), wall: median(all.map((x) => x.b.wall)) },
        },
        cpu: verdict(per('cpu')),
        wall: verdict(per('wall')),
      },
    ];
  }),
);
const hashes = {
  base: new Set(runs.map((r) => r.hashes[0])),
  cand: new Set(runs.map((r) => r.hashes[1])),
};
const summary = {
  workload,
  base: baseSpec,
  cand: candSpec,
  procs,
  reps,
  sameBundle: bundles.base === bundles.cand,
  sameHash:
    hashes.base.size === 1 && hashes.cand.size === 1 && [...hashes.base][0] === [...hashes.cand][0],
  hashes: { base: [...hashes.base], cand: [...hashes.cand] },
  ...byLabel,
  load1: loads,
};
console.log(JSON.stringify(summary, null, 2));
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify({ ...summary, runs }, null, 2));
