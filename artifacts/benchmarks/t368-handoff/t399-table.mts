/**
 * T399 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, MATCH-29's two rows T399 targets (counter's win share against press head to head,
 * balanced's xG conceded against the other three's mean) and every tactic's points, the crosses a
 * balanced side concedes a match, and in the four counter/balanced pairings the share of shots
 * from outside the box and offsides a team (pairing samples keep only the team rows; the forwards'
 * share by pairing comes from the calibration artifact); then goals, shots, passes and the curve. [95%] intervals, ✗ outside, ~ unresolved or insufficient, no mark inside.
 *
 *   pnpm exec tsx t399-table.mts --root <tree> [--out <file.md>] <name>=<run.json>[,<run.json>] ...
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const i = args.indexOf('--root');
const root = args[i + 1]!;
const o = args.indexOf('--out');
const file = o >= 0 ? args[o + 1] : undefined;
const runs = args.filter((_, k) => k !== i && k !== i + 1 && (o < 0 || (k !== o && k !== o + 1)));
const lines: string[] = [];
const print = (line: string) => (file ? lines.push(line) : console.log(line));
const mp = await import(`${root}/scripts/lib/match-parity.ts`);
const { TD } = await import(`${root}/packages/contracts/src/detail.ts`);
const { M } = await import(`${root}/packages/engine/src/grid/record.ts`);
type Row = { id: string; status: string; value?: number; interval?: [number, number] };
type Pair = Row & { kind: string; differences?: { value?: number; interval?: [number, number] }[] };
interface Sample {
  condition: string;
  record: {
    tactics: [string, string];
    detail?: number[][];
    metrics: number[][];
  };
  diagnostics?: { shots: { side: 0 | 1; x: number; y: number; line: string; goal: boolean }[] };
}
const mark = (s: string) => (s === 'inside' ? '' : s === 'outside' ? '✗' : '~');
const show = (r: Row | undefined, d = 3) =>
  r && r.value !== undefined
    ? `${r.value.toFixed(d)} [${r.interval![0].toFixed(d)}, ${r.interval![1].toFixed(d)}]${mark(r.status)}`
    : 'n/a';
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const header = [
  'setting',
  'core',
  'MATCH-30',
  'MATCH-29',
  'counter ≥ press',
  "balanced's xG conceded (others' mean − balanced)",
  "possession's points",
  "press's points",
  "counter's points",
  "balanced's points",
  'crosses balanced concedes',
  'crosses / completion',
  'counter/balanced: outside shots %',
  'offsides a team',
  'goals',
  'shots',
  'passes',
  'curve',
];
print(`| ${header.join(' | ')} |`);
print(`|${header.map(() => '---').join('|')}|`);
for (const spec of runs) {
  const at = spec.indexOf('=');
  const name = spec.slice(0, at);
  const chunks = spec
    .slice(at + 1)
    .split(',')
    .flatMap(
      (f) =>
        (JSON.parse(readFileSync(f, 'utf8')) as { chunks: { condition: string; samples: Sample[] }[] })
          .chunks,
    );
  const of = (p: string) =>
    chunks.filter((c) => c.condition.startsWith(p)).flatMap((c) => c.samples);
  const rows: Record<string, Row> = {};
  for (const r of mp.advancedCounterVerdicts(of('core:')) as Row[]) rows[`30:${r.id}`] = r;
  for (const r of mp.buildTargetReport(of('core:')) as Row[]) rows[`23:${r.id}`] = r;
  const pairing = of('tactics:');
  for (const r of mp.tacticPairingVerdicts(pairing).rows as Pair[])
    rows[`29:${r.id}`] =
      r.kind === 'band'
        ? r
        : {
            id: r.id,
            status: r.status,
            value: r.differences?.at(-1)?.value,
            interval: r.differences?.at(-1)?.interval,
          };
  const inside = (p: string) => {
    const all = Object.entries(rows).filter(([k]) => k.startsWith(p));
    return `${all.filter(([, r]) => r.status === 'inside').length}/${all.length}`;
  };
  // Crosses a balanced side concedes: the opponent's attempted crosses, both venues.
  const crosses = pairing.flatMap((s) =>
    ([0, 1] as const).flatMap((side) =>
      s.record.tactics[side] === 'balanced' && s.record.detail
        ? [s.record.detail[side === 0 ? 1 : 0]![TD.crosses]!]
        : [],
    ),
  );
  const cb = pairing.filter((s) =>
    s.record.tactics.every((t) => t === 'counter' || t === 'balanced'),
  );
  const team = (k: 'shots' | 'box') =>
    cb.reduce(
      (a, s) =>
        a +
        ([0, 1] as const).reduce(
          (b, side) =>
            b + (k === 'shots' ? s.record.metrics[side]![M.shots]! : (s.record.detail?.[side]?.[TD.boxShots] ?? 0)),
          0,
        ),
      0,
    );
  const outside = 1 - team('box') / Math.max(1, team('shots'));
  const offsides = mean(
    cb.flatMap((s) => (s.record.detail ? [s.record.detail[0]![TD.offsides]!, s.record.detail[1]![TD.offsides]!] : [])),
  );
  const gap = of('gap:');
  const curve = gap.length ? mp.buildOutcomeTargetReport(gap).meanAbsoluteError : undefined;
  print(
    `| ${[
      name,
      inside('23:'),
      inside('30:'),
      inside('29:'),
      show(rows['29:atLeast:counter-press']),
      show(rows['29:ordering:xgConceded']),
      show(rows['29:points:possession']),
      show(rows['29:points:press']),
      show(rows['29:points:counter']),
      show(rows['29:points:balanced']),
      mean(crosses).toFixed(2),
      `${show(rows['30:crosses'], 1)} / ${show(rows['30:crossCompletion'], 1)}`,
      (100 * outside).toFixed(1),
      offsides.toFixed(2),
      show(rows['23:goals'], 2),
      show(rows['23:shots'], 2),
      show(rows['23:passes'], 1),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
