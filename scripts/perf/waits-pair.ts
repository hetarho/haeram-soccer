/**
 * Paired waits (T1058, →ARCH-34): `waits.ts` run on a baseline tree and a candidate tree in
 * alternating processes, the side run first alternating across rounds, every run on the same seed
 * and steps. Each wait kind's call is the per-round median log-ratio (candidate over baseline) of
 * its matched requests, over rounds a trimmed mean with a 95% bootstrap interval (`stats.ts`).
 *
 *   tsx scripts/perf/waits-pair.ts --base <tree> --candidate <tree> [--rounds 6] [--steps 20]
 *     [--seed records-room-journey] [--decade 1930] [--out <dir>] [--analyse]
 *
 * `--analyse` runs nothing: it reads the complete rounds an earlier run left in `--out`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { median, verdict } from './stats';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const analyse = args.includes('--analyse');
const base = resolve(flag('--base', '.')!),
  candidate = resolve(flag('--candidate', '.')!);
let rounds = Number(flag('--rounds', '6'));
const steps = flag('--steps', '20')!,
  seed = flag('--seed', 'records-room-journey')!,
  decade = flag('--decade', '1930')!,
  out = resolve(flag('--out', '.tmp/waits-pair')!);
mkdirSync(out, { recursive: true });
const driver = resolve(import.meta.dirname, 'waits.ts');

interface Row {
  kind: string;
  step: number;
  ms: number;
  [part: string]: unknown;
}
interface Report {
  hash: string;
  reopenedHash: string;
  rows: Row[];
  environment: { loadavg: number[] };
}
function runOnce(tree: string, file: string): Report {
  execFileSync(
    process.execPath,
    [
      ...['--import', 'tsx', driver, '--tree', tree, '--seed', seed, '--steps', steps],
      ...['--decade', decade, '--out', file],
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return JSON.parse(readFileSync(file, 'utf8')) as Report;
}
const runs: { round: number; side: 'base' | 'candidate'; report: Report; load: number }[] = [];
if (analyse) {
  const read = (side: string, round: number) => join(out, `${side}-${round}.json`);
  let round = 0;
  for (; existsSync(read('base', round)) && existsSync(read('candidate', round)); round++)
    for (const side of ['base', 'candidate'] as const) {
      const report = JSON.parse(readFileSync(read(side, round), 'utf8')) as Report;
      runs.push({ round, side, report, load: report.environment.loadavg[0]! });
    }
  rounds = round;
}
for (let round = 0; !analyse && round < rounds; round++) {
  const order = round % 2 ? (['candidate', 'base'] as const) : (['base', 'candidate'] as const);
  for (const side of order) {
    const load = loadavg()[0]!;
    const report = runOnce(side === 'base' ? base : candidate, join(out, `${side}-${round}.json`));
    runs.push({ round, side, report, load });
    console.error(`round ${round} ${side} hash ${report.hash} load ${load.toFixed(1)}`);
  }
}
const kinds = [
  'next-event',
  'advance-days',
  'save',
  'stopped-reads',
  'decision',
  'decision-save',
  'open-game',
  'export-game',
  'import-game',
];
const key = (row: Row, index: number) => `${row.kind}:${row.step}:${index}`;
const indexed = (rows: Row[]) => {
  const seen = new Map<string, number>();
  return new Map(
    rows.map((row) => {
      const at = seen.get(`${row.kind}:${row.step}`) ?? 0;
      seen.set(`${row.kind}:${row.step}`, at + 1);
      return [key(row, at), row] as const;
    }),
  );
};
const calls: Record<string, unknown> = {};
for (const kind of kinds) {
  const logs: number[] = [];
  const medians = { base: [] as number[], candidate: [] as number[] };
  for (let round = 0; round < rounds; round++) {
    const b = runs.find((r) => r.round === round && r.side === 'base')!.report;
    const c = runs.find((r) => r.round === round && r.side === 'candidate')!.report;
    const bRows = indexed(b.rows),
      cRows = indexed(c.rows),
      pairs: number[] = [];
    for (const [at, row] of bRows) {
      if (row.kind !== kind) continue;
      const other = cRows.get(at);
      if (other) {
        pairs.push(Math.log(other.ms / row.ms));
        medians.base.push(row.ms);
        medians.candidate.push(other.ms);
      }
    }
    if (pairs.length) logs.push(median(pairs));
  }
  if (logs.length)
    calls[kind] = {
      ...verdict(logs),
      samples: medians.base.length,
      baseMedianMs: median(medians.base),
      candidateMedianMs: median(medians.candidate),
    };
}
const hashes = [...new Set(runs.map((r) => `${r.side}:${r.report.hash}:${r.report.reopenedHash}`))];
const summary = {
  base,
  candidate,
  seed,
  decade: Number(decade),
  steps: Number(steps),
  rounds,
  hashes,
  loads: runs.map((r) => Number(r.load.toFixed(2))),
  calls,
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
