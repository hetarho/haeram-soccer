/**
 * What the generation history view adds to world generation (→ARCH-28, WEB-115, T679): Node
 * `generateHistory` lived to a decade with and without `seasonDigest` in its progress callback,
 * each run in its own process, in ABBAAB order (with, without, without, with, with, without) so a
 * host load drifting during the runs falls on both sides alike. Both sides clone a progress reply
 * as the engine worker's postMessage does (→ARCH-6); the digest side clones it with the digest.
 *
 * Each run reports its wall and CPU time, the time spent inside `seasonDigest` and the clone, the
 * host's load average before and after, and the generated world's hash, which must be the same on
 * both sides: the digest only reads the world.
 *
 *   pnpm exec tsx scripts/generation-digest-cost.ts [--decade 1970] [--runs 3]
 *     [--seed generation-reference] [--out artifacts/benchmarks/T679-digest-cost.json]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TakeoverDecade } from '../packages/contracts/src/owner';
import { generateHistory } from '../packages/engine/src/history';
import { seasonDigest } from '../packages/engine/src/generation-digest';

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1]! : fallback;
};
const decade = Number(arg('decade', '1970')) as TakeoverDecade;
const seed = arg('seed', 'generation-reference');
const load = () => os.loadavg().map((value) => Math.round(value * 100) / 100);
const ms = (value: number) => Math.round(value * 10) / 10;

type Side = 'with' | 'without';
interface Run {
  side: Side;
  wallMs: number;
  cpuMs: number;
  digestMs: number;
  cloneMs: number;
  seasons: number;
  worldSha256: string;
  loadAverage: { before: number[]; after: number[] };
}

/** One generation in this process; prints its run as one JSON line. */
function child(side: Side) {
  const before = load();
  let digestMs = 0,
    cloneMs = 0,
    seasons = 0;
  const cpu = process.cpuUsage();
  const started = performance.now();
  const world = generateHistory(seed, decade, (season, w) => {
    seasons++;
    let digest;
    if (side === 'with') {
      const at = performance.now();
      digest = seasonDigest(w);
      digestMs += performance.now() - at;
    }
    const at = performance.now();
    structuredClone({
      requestId: 'r',
      ok: true,
      progress: seasons,
      season,
      ...(digest ? { digest } : {}),
    });
    cloneMs += performance.now() - at;
  });
  const wallMs = performance.now() - started;
  const used = process.cpuUsage(cpu);
  const run: Run = {
    side,
    wallMs: ms(wallMs),
    cpuMs: ms((used.user + used.system) / 1000),
    digestMs: ms(digestMs),
    cloneMs: ms(cloneMs),
    seasons,
    worldSha256: createHash('sha256').update(JSON.stringify(world)).digest('hex'),
    loadAverage: { before, after: load() },
  };
  console.log(JSON.stringify(run));
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (value: number) => Math.round(value * 1000) / 10;

function driver() {
  const runs = Number(arg('runs', '3'));
  const out = arg('out', 'artifacts/benchmarks/T679-digest-cost.json');
  const script = fileURLToPath(import.meta.url);
  const order: Side[] = [];
  for (let i = 0; i < runs; i++)
    order.push(...((i % 2 ? ['without', 'with'] : ['with', 'without']) as Side[]));
  const results: Run[] = [];
  for (const side of order) {
    const done = spawnSync(
      process.execPath,
      [...process.execArgv, script, '--child', side, '--decade', String(decade), '--seed', seed],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (done.status !== 0) throw new Error(`${side} run failed: ${done.stderr}`);
    const run = JSON.parse(done.stdout.trim().split('\n').at(-1)!) as Run;
    results.push(run);
    console.log(
      `${side.padEnd(7)} ${(run.wallMs / 1000).toFixed(2)} s wall, ${(run.cpuMs / 1000).toFixed(2)} s CPU,` +
        ` digest ${run.digestMs} ms, clone ${run.cloneMs} ms, ${run.seasons} seasons, load ${run.loadAverage.before[0]}`,
    );
  }
  const of = (side: Side) => results.filter((run) => run.side === side);
  const withRuns = of('with'),
    withoutRuns = of('without');
  // Pairs in run order: (with, without), (without, with), …: each pair ran back to back.
  const pairs = withRuns.map((run, i) => ({
    wall: run.wallMs / withoutRuns[i]!.wallMs - 1,
    cpu: run.cpuMs / withoutRuns[i]!.cpuMs - 1,
  }));
  const side = (list: Run[]) => ({
    wallMs: list.map((run) => run.wallMs),
    cpuMs: list.map((run) => run.cpuMs),
    meanWallMs: ms(mean(list.map((run) => run.wallMs))),
    meanCpuMs: ms(mean(list.map((run) => run.cpuMs))),
  });
  const hashes = new Set(results.map((run) => run.worldSha256));
  const summary = {
    with: side(withRuns),
    without: side(withoutRuns),
    /** Mean with ÷ mean without − 1, and each back-to-back pair's, in %. */
    wallAddedPct: pct(
      mean(withRuns.map((r) => r.wallMs)) / mean(withoutRuns.map((r) => r.wallMs)) - 1,
    ),
    cpuAddedPct: pct(
      mean(withRuns.map((r) => r.cpuMs)) / mean(withoutRuns.map((r) => r.cpuMs)) - 1,
    ),
    pairWallAddedPct: pairs.map((pair) => pct(pair.wall)),
    pairCpuAddedPct: pairs.map((pair) => pct(pair.cpu)),
    /** The digest's own time against its run's wall time, in % (the direct measure). */
    digestSharePct: withRuns.map((run) => pct(run.digestMs / run.wallMs)),
    digestMsPerSeason: withRuns.map((run) => ms(run.digestMs / run.seasons)),
    cloneMsPerSeason: {
      with: withRuns.map((run) => ms(run.cloneMs / run.seasons)),
      without: withoutRuns.map((run) => ms(run.cloneMs / run.seasons)),
    },
    sameWorld: hashes.size === 1,
  };
  const report = {
    task: 'T679',
    measuredAt: new Date().toISOString(),
    source: {
      head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    },
    environment: {
      node: process.version,
      cpus: `${os.cpus().length} × ${os.cpus()[0]?.model}`,
      platform: `${os.platform()} ${os.release()}`,
      memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
    },
    workload: {
      decade,
      seed,
      order: order.join(' '),
      clone: 'structuredClone of the progress reply',
    },
    runs: results,
    summary,
  };
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `added: wall ${summary.wallAddedPct}% (pairs ${summary.pairWallAddedPct.join(', ')}), CPU ${summary.cpuAddedPct}%` +
      ` (pairs ${summary.pairCpuAddedPct.join(', ')}); digest ${summary.digestSharePct.join(', ')}% of its run; same world ${summary.sameWorld}`,
  );
  console.log(`wrote ${out}`);
}

const at = process.argv.indexOf('--child');
if (at >= 0) child(process.argv[at + 1] as Side);
else driver();
