/**
 * Automatic-play day-step bench (T517, →WEB-18, ARCH-31): the timing every speed-up of a day's step
 * is measured with, on 5 own matches rather than 1.
 *
 *   pnpm exec tsx scripts/day-bench.ts [--country ENG] [--seed perf-261027] [--matches 5]
 *     [--tree <checkout>] [--json out.json]
 *
 * Plays a fresh 1950 founding of `--country` day by day exactly as automatic play does
 * (`advanceDays(w, 1, undefined, false)`), times every day, and stops after the first own match
 * day (the JIT warm-up, dropped) plus `--matches` measured own match days. Prints per-kind medians
 * (own match days, other days that still take ≥ 50 ms, quiet days) and a sha256 of the canonical
 * world, so a candidate must print the same hash as its baseline. It runs on the repository it
 * sits in; `--tree` loads the engine of another checkout instead (an interleaved A/B: the same
 * script, alternately on each tree).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (name: string, fallback?: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const repo = fileURLToPath(new URL('..', import.meta.url));
const tree = resolve(arg('--tree', repo)!);
const country = arg('--country', 'ENG')!;
const seed = arg('--seed', 'perf-261027')!;
const matches = Number(arg('--matches', '5'));
const jsonOut = arg('--json');
if (!Number.isInteger(matches) || matches < 1)
  throw new Error('--matches must be a whole number ≥ 1');

const engine = await import(pathToFileURL(join(tree, 'packages/engine/src/index.ts')).href);
const contracts = await import(pathToFileURL(join(tree, 'packages/contracts/src/index.ts')).href);

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const r1 = (x: number) => Number(x.toFixed(1));

const w = engine.createWorld(
  { country, name: 'Perf Town', color: '#284e35', seed, level: 'easy' },
  engine.MATCH_MODEL_RELEASE,
);
const own: number[] = [];
const busy: number[] = []; // days without our match that still take ≥ 50 ms (other fixtures)
const quiet: number[] = [];
let warm = false;
let days = 0;
const load = [loadavg()[0]!];
while (own.length < matches && days < 400 && !w.bankrupt && !w.critical) {
  const before = w.ownMatches.length;
  const t = performance.now();
  engine.advanceDays(w, 1, undefined, false);
  const ms = performance.now() - t;
  days++;
  if (w.ownMatches.length > before) {
    if (warm) own.push(ms);
    warm = true;
  } else if (ms >= 50) busy.push(ms);
  else quiet.push(ms);
}
load.push(loadavg()[0]!);
const hash = createHash('sha256').update(contracts.canonical(w)).digest('hex').slice(0, 16);
const out = {
  tree,
  country,
  seed,
  days,
  ownMatchDays: own.map(r1),
  ownMedianMs: r1(median(own)),
  otherFixtureDayMedianMs: r1(median(busy)),
  otherFixtureDays: busy.length,
  quietDayMedianMs: r1(median(quiet)),
  quietDays: quiet.length,
  totalMs: r1([...own, ...busy, ...quiet].reduce((a, b) => a + b, 0)),
  load1: load.map(r1),
  worldHash: hash,
};
console.log(JSON.stringify(out));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
