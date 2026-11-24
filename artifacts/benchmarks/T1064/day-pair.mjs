/**
 * Pairs `day.ts` runs of a baseline and a candidate tree in alternating processes, the side run
 * first alternating by round (T1064). Each run's JSON lands in `--out` as `<round>-<side>.json`;
 * the summary pairs each eve's median own-match-day time (candidate ÷ baseline, per round the
 * median log-ratio, over rounds a trimmed mean with a 95% bootstrap interval) and compares hashes.
 *
 *   node artifacts/benchmarks/T1064/day-pair.mjs --base <tree> --candidate <tree> [--rounds 4]
 *     [--eves 6] [--reps 2] [--decade 1930] [--out <dir>] [--analyse]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.indexOf(name) < 0 ? fallback : args[args.indexOf(name) + 1]);
const base = resolve(flag('--base', '.')),
  candidate = resolve(flag('--candidate', '.'));
const rounds = Number(flag('--rounds', '4'));
const eves = flag('--eves', '6'),
  reps = flag('--reps', '2'),
  decade = flag('--decade', '1930');
const out = resolve(flag('--out', '.tmp/day-pair'));
const driver = resolve(dirname(fileURLToPath(import.meta.url)), 'day.ts');
mkdirSync(out, { recursive: true });
if (!args.includes('--analyse'))
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? ['candidate', 'base'] : ['base', 'candidate'];
    for (const side of order) {
      const file = resolve(out, `${round}-${side}.json`);
      if (existsSync(file)) continue;
      const tree = side === 'base' ? base : candidate;
      const run = spawnSync(
        process.execPath,
        ['--import', 'tsx', driver, '--tree', tree, '--eves', eves, '--reps', reps, '--decade', decade, '--out', file],
        { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
      );
      if (run.status !== 0) throw new Error(`${side} round ${round} failed`);
    }
  }
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const logs = [],
  hashes = { equal: 0, differ: 0 },
  ms = { base: [], candidate: [] },
  loads = [];
for (let round = 0; round < rounds; round++) {
  const files = ['base', 'candidate'].map((s) => resolve(out, `${round}-${s}.json`));
  if (!files.every(existsSync)) continue;
  const [b, c] = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  loads.push(b.environment.loadavg[0], c.environment.loadavg[0]);
  const ratios = [];
  b.rows.forEach((row, i) => {
    const other = c.rows[i];
    if (!other || other.from !== row.from) throw new Error('eves differ');
    const same = row.hash === other.hash && row.lived === other.lived && row.playbackHash === other.playbackHash;
    hashes[same ? 'equal' : 'differ']++;
    ms.base.push(median(row.ms));
    ms.candidate.push(median(other.ms));
    ratios.push(Math.log(median(other.ms) / median(row.ms)));
  });
  if (b.final !== c.final) hashes.differ++;
  logs.push(median(ratios));
}
const trimmed = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const cut = Math.floor(s.length * 0.1);
  const kept = s.slice(cut, s.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
};
let seed = 1;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const boot = [];
for (let i = 0; i < 4000; i++) boot.push(trimmed(logs.map(() => logs[Math.floor(rand() * logs.length)])));
boot.sort((a, b) => a - b);
const ratio = Math.exp(trimmed(logs)),
  lo = Math.exp(boot[Math.floor(0.025 * boot.length)]),
  hi = Math.exp(boot[Math.floor(0.975 * boot.length)]);
const summary = {
  base,
  candidate,
  rounds: logs.length,
  eves: Number(eves),
  reps: Number(reps),
  medianMs: { base: median(ms.base), candidate: median(ms.candidate) },
  ratio: +ratio.toFixed(4),
  lo: +lo.toFixed(4),
  hi: +hi.toFixed(4),
  call: hi < 1 ? 'faster' : lo > 1 ? 'slower' : 'no difference',
  hashes,
  loads,
};
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
