/**
 * T384 offside readings over scripts/t328-counter-roles.ts outputs (comma-separated round files,
 * pooled; core and tactic pairings, not the gap family) and, optionally, t384-aggregate.mts outputs
 * on the same fixtures:
 * - grid: receptions from an offside position a team, calls a team and per reception, the call rate
 *   in the lowest and highest quarter of the receivers' 판단력 (the duel-scale skill the call reads,
 *   and the player's own attribute) with the ratio's 95% interval, and linebreakers' rate;
 * - both paths: the share of calls on each quarter of the player's own 판단력 (the grid receivers'
 *   quarters), and the largest gap between the two cumulative splits (MATCH-28's 8 pp CDF margin).
 * Quarters split tied values pro rata, so each holds a quarter of the receptions.
 *
 *   pnpm exec tsx t384-table.mts --grid a.json,b.json [--aggregate x.json,y.json]
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
type Hist = Record<string, [number, number]>;
interface Offside {
  sides: number;
  positions: number;
  calls: number;
  bySkill: Hist;
  byRaw: Hist;
  linebreaker: [number, number];
  /** `duel-scale|own|linebreaker|highLine` → receptions, calls. */
  joint?: Hist;
}
const merge = (into: Hist, from: Hist) => {
  for (const [k, [n, c]] of Object.entries(from)) {
    const row = (into[k] ??= [0, 0]);
    row[0] += n;
    row[1] += c;
  }
};
const grid: Required<Offside> = {
  sides: 0,
  positions: 0,
  calls: 0,
  bySkill: {},
  byRaw: {},
  linebreaker: [0, 0],
  joint: {},
};
for (const file of opt('grid')!.split(',')) {
  const run = JSON.parse(readFileSync(file, 'utf8')) as { chunks: { offside?: Offside }[] };
  for (const chunk of run.chunks) {
    const o = chunk.offside;
    if (!o) continue;
    grid.sides += o.sides;
    grid.positions += o.positions;
    grid.calls += o.calls;
    merge(grid.bySkill, o.bySkill);
    merge(grid.byRaw, o.byRaw);
    if (o.joint) merge(grid.joint, o.joint);
    grid.linebreaker[0] += o.linebreaker[0];
    grid.linebreaker[1] += o.linebreaker[1];
  }
}

/** Each quarter's receptions and calls, ties split pro rata, and the quarters' upper bounds. */
function quarters(h: Hist) {
  const keys = Object.keys(h)
    .map(Number)
    .sort((a, b) => a - b);
  const total = keys.reduce((a, k) => a + h[String(k)]![0], 0);
  const q = [0, 1, 2, 3].map(() => ({ n: 0, c: 0, upTo: 0 }));
  let seen = 0;
  for (const k of keys) {
    const [n, c] = h[String(k)]!;
    let left = n;
    while (left > 1e-9) {
      const at = Math.min(3, Math.floor((seen / total) * 4 + 1e-9));
      const room = ((at + 1) * total) / 4 - seen;
      const take = at === 3 ? left : Math.min(left, room);
      q[at]!.n += take;
      q[at]!.c += (c * take) / n;
      q[at]!.upTo = k;
      seen += take;
      left -= take;
    }
  }
  return q;
}
const f = (x: number, d = 3) => x.toFixed(d);
function ratio(h: Hist, label: string) {
  const q = quarters(h);
  const lo = q[0]!,
    hi = q[3]!;
  const value = lo.c / lo.n / (hi.c / hi.n);
  const se = Math.sqrt(1 / lo.c - 1 / lo.n + 1 / hi.c - 1 / hi.n);
  const rates = q.map((x) => `${f((100 * x.c) / x.n, 1)}% (≤${x.upTo})`).join(', ');
  console.log(
    `  by ${label} quarter: ${rates}; lowest/highest ${f(value, 2)} [${f(value * Math.exp(-1.96 * se), 2)}, ${f(value * Math.exp(1.96 * se), 2)}]`,
  );
  return q;
}
console.log(
  `grid: ${grid.sides / 2} matches (core + pairings); receptions from an offside position ${f(grid.positions / grid.sides, 2)} a team, calls ${f(grid.calls / grid.sides)} a team, ${f((100 * grid.calls) / grid.positions, 2)}% a reception`,
);
ratio(grid.bySkill, 'duel-scale 판단력');
const rawQ = ratio(grid.byRaw, 'own 판단력');
const [ln, lc] = grid.linebreaker;
console.log(`  linebreakers: ${ln} receptions, ${f((100 * lc) / Math.max(1, ln), 2)}% called`);

/** Share of calls on each quarter of the own 판단력, by the grid receivers' bounds (pro rata at ties). */
function splitOf(calls: Record<string, number>) {
  const bounds = rawQ.map((x) => x.upTo);
  // Each bound value's receptions fall partly in two quarters on the grid; split calls the same way.
  const share = [0, 0, 0, 0];
  const keys = Object.keys(calls).map(Number);
  for (const k of keys) {
    const n = calls[String(k)]!;
    const at = bounds.findIndex((b) => k <= b);
    share[at < 0 ? 3 : at]! += n;
  }
  const total = share.reduce((a, b) => a + b, 0);
  return share.map((x) => x / total);
}
const gridCalls: Record<string, number> = {};
for (const [k, [, c]] of Object.entries(grid.byRaw)) gridCalls[k] = c;
const gridSplit = splitOf(gridCalls);
const show = (s: number[]) => s.map((x) => `${f(100 * x, 1)}%`).join(' / ');
console.log(`  calls by own-판단력 quarter (lowest … highest): ${show(gridSplit)}`);
// `--predict base,at,decisions,linebreaker,highLine,min,max`: a candidate setting's expected calls
// over the same receptions (the joint tally), before a screen plays it.
const predict = opt('predict');
if (predict) {
  const [base, at, k, lb, hl, min, max] = predict.split(',').map(Number) as number[];
  const bySkill: Hist = {},
    byRaw: Hist = {};
  let calls = 0;
  for (const [key, [n]] of Object.entries(grid.joint)) {
    const [d, raw, isLb, isHl] = key.split('|').map(Number) as number[];
    const chance = Math.min(
      max!,
      Math.max(min!, base! * Math.exp((at! - d!) / k!) * (isLb ? lb! : 1) * (isHl ? hl! : 1)),
    );
    calls += n * chance;
    for (const [h, x] of [
      [bySkill, d],
      [byRaw, raw],
    ] as const) {
      const row = (h[String(x)] ??= [0, 0]);
      row[0] += n;
      row[1] += n * chance;
    }
  }
  console.log(`predicted ${predict}: ${f(calls / grid.sides)} calls a team`);
  ratio(bySkill, 'duel-scale 판단력');
  ratio(byRaw, 'own 판단력');
}
const aggFiles = opt('aggregate');
if (aggFiles) {
  let sides = 0,
    offsides = 0;
  const byRaw: Record<string, number> = {};
  for (const file of aggFiles.split(',')) {
    const a = JSON.parse(readFileSync(file, 'utf8')) as {
      sides: number;
      offsides: number;
      byRaw: Record<string, number>;
    };
    sides += a.sides;
    offsides += a.offsides;
    for (const [k, n] of Object.entries(a.byRaw)) byRaw[k] = (byRaw[k] ?? 0) + n;
  }
  const split = splitOf(byRaw);
  let cdf = 0,
    gc = 0,
    ac = 0;
  for (let i = 0; i < 4; i++) {
    gc += gridSplit[i]!;
    ac += split[i]!;
    cdf = Math.max(cdf, Math.abs(gc - ac));
  }
  console.log(
    `aggregate: ${sides / 2} core matches, ${f(offsides / sides)} offsides a team; by own-판단력 quarter ${show(split)}; largest cumulative gap to the grid ${f(100 * cdf, 1)} pp`,
  );
}
