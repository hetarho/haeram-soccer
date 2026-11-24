/**
 * validateWorld alone, paired (T1062, →ARCH-34): `bench.ts` in N processes, the side run first
 * alternating; per process the median log-ratio (candidate over baseline) of its paired reps, over
 * processes the trimmed mean with a 95% bootstrap interval, for CPU and wall time.
 *   node --import tsx bench-pair.ts --db <file> --base <tree> --candidate <tree> [--processes 6] [--reps 6] --out <dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { median, verdict } from '../../../scripts/perf/stats';

const args = process.argv.slice(2);
const flag = (n: string, f?: string) => (args.indexOf(n) < 0 ? f : args[args.indexOf(n) + 1]);
const out = resolve(flag('--out')!);
mkdirSync(out, { recursive: true });
const processes = Number(flag('--processes', '6'));
const runs: any[] = [];
for (let p = 0; p < processes; p++) {
  const file = join(out, `run-${p}.json`);
  execFileSync(
    process.execPath,
    ['--import', 'tsx', resolve(import.meta.dirname, 'bench.ts'), '--db', flag('--db')!, '--base', flag('--base')!,
      '--candidate', flag('--candidate')!, '--reps', flag('--reps', '6')!, '--first', p % 2 ? 'candidate' : 'base', '--out', file],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  runs.push(JSON.parse(readFileSync(file, 'utf8')));
}
const call = (measure: 'cpu' | 'wall') => {
  const logs = runs.map((r) => median(r.base[measure].map((b: number, i: number) => Math.log(r.candidate[measure][i] / b))));
  return {
    ...verdict(logs),
    baseMedianMs: median(runs.flatMap((r) => r.base[measure])),
    candidateMedianMs: median(runs.flatMap((r) => r.candidate[measure])),
  };
};
const summary = {
  db: flag('--db'),
  processes,
  reps: Number(flag('--reps', '6')),
  hashes: [...new Set(runs.flatMap((r) => [`base:${r.base.hash}`, `candidate:${r.candidate.hash}`]))],
  rowAssemblyMedianMs: median(runs.flatMap((r) => r.rowAssemblyMs)),
  loads: runs.map((r) => r.loadavg[0]),
  cpu: call('cpu'),
  wall: call('wall'),
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
