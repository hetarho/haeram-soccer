/**
 * T437 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, the scoring rows (goals, xG, shots, on target, xG per shot, goal-area share, headed
 * and set-piece goals), the lanes' rows (tackles + interceptions, interceptions, PPDA, high
 * turnovers), MATCH-30's flow rows (final-third passes, box and front-of-box entries, xT,
 * progressive carries), offsides, passes, completion, cross completion, ball in play, MATCH-29's
 * orderings and the curve. [95%] intervals, ✗ outside, ~ unresolved, no mark inside.
 *
 *   pnpm exec tsx t437-table.mts --root <tree> [--out <file.md>] [--json <file>] <name>=<run.json>[,<run.json>] ...
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = flag('root')!;
const file = flag('out');
const jsonOut = flag('json');
const skip = new Set<number>();
for (const k of ['root', 'out', 'json']) {
  const i = args.indexOf(`--${k}`);
  if (i >= 0) skip.add(i).add(i + 1);
}
const runs = args.filter((_, k) => !skip.has(k));
const lines: string[] = [];
const print = (line: string) => (file ? lines.push(line) : console.log(line));
const mp = await import(`${root}/scripts/lib/match-parity.ts`);
type Row = { id: string; status: string; value?: number; interval?: [number, number] };
interface Sample {
  condition: string;
  record: { tactics: [string, string]; xg?: number[]; metrics: number[][] };
}
const mark = (s: string) => (s === 'inside' ? '' : s === 'outside' ? '✗' : '~');
const show = (r: Row | undefined, d = 3) =>
  r && r.value !== undefined
    ? `${r.value.toFixed(d)} [${r.interval![0].toFixed(d)}, ${r.interval![1].toFixed(d)}]${mark(r.status)}`
    : 'n/a';
const header = [
  'setting',
  'core',
  'MATCH-30',
  'MATCH-29',
  'invalid',
  'goals',
  'xG (team)',
  'shots',
  'on target %',
  'xG per shot',
  'goal area %',
  'headed goals %',
  'set-piece goals %',
  'tackles+interceptions',
  'interceptions',
  'PPDA',
  'high turnovers',
  'final-third passes',
  'box entries',
  'front-of-box entries',
  'xT',
  'progressive carries',
  'offsides',
  'passes',
  'completion %',
  'cross completion %',
  'ball in play',
  'MATCH-29 outside',
  'curve',
];
print(`| ${header.join(' | ')} |`);
print(`|${header.map(() => '---').join('|')}|`);
const json: Record<string, Record<string, unknown>> = {};
for (const spec of runs) {
  const at = spec.indexOf('=');
  const name = spec.slice(0, at);
  const chunks = spec
    .slice(at + 1)
    .split(',')
    .flatMap(
      (f) =>
        (
          JSON.parse(readFileSync(f, 'utf8')) as {
            chunks: { condition: string; samples: Sample[]; invalid: number }[];
          }
        ).chunks,
    );
  const invalid = chunks.reduce((a, c) => a + c.invalid, 0);
  const of = (p: string) =>
    chunks.filter((c) => c.condition.startsWith(p)).flatMap((c) => c.samples);
  const core = of('core:');
  const rows: Record<string, Row> = {};
  for (const r of mp.advancedCounterVerdicts(core) as Row[]) rows[`30:${r.id}`] = r;
  for (const r of mp.buildTargetReport(core) as Row[]) rows[`23:${r.id}`] = r;
  const pairing = of('tactics:');
  type Pair = Row & {
    kind: string;
    differences?: { value?: number; interval?: [number, number] }[];
  };
  const pairRows = pairing.length ? (mp.tacticPairingVerdicts(pairing).rows as Pair[]) : [];
  for (const r of pairRows) {
    const d = r.differences?.[0];
    rows[`29:${r.id}`] =
      r.kind === 'band' || !d
        ? r
        : { id: r.id, status: r.status, value: d.value, interval: d.interval };
  }
  const inside = (p: string) => {
    const all = Object.entries(rows).filter(([k]) => k.startsWith(p));
    return `${all.filter(([, r]) => r.status === 'inside').length}/${all.length}`;
  };
  const teams = 2 * core.length;
  const xg = core.reduce((a, s) => a + (s.record.xg?.[0] ?? 0) + (s.record.xg?.[1] ?? 0), 0) / teams;
  // M.interceptions is slot 7 of a side's metrics (packages/engine/src/grid/record.ts).
  const ints = core.reduce((a, s) => a + s.record.metrics[0]![7]! + s.record.metrics[1]![7]!, 0) / teams;
  const gap = of('gap:');
  const curve = gap.length ? mp.buildOutcomeTargetReport(gap).meanAbsoluteError : undefined;
  const outside29 = Object.entries(rows)
    .filter(([k, r]) => k.startsWith('29:') && r.status === 'outside')
    .map(([k]) => k.slice(3))
    .join(' ');
  json[name] = {
    invalid,
    xg,
    interceptions: ints,
    rows: Object.fromEntries(
      Object.entries(rows).map(([k, r]) => [k, { status: r.status, value: r.value, interval: r.interval }]),
    ),
    curve,
  };
  print(
    `| ${[
      name,
      inside('23:'),
      inside('30:'),
      pairing.length ? inside('29:') : 'n/a',
      String(invalid),
      show(rows['23:goals'], 2),
      xg.toFixed(3),
      show(rows['23:shots'], 2),
      show(rows['23:onTarget'], 1),
      show(rows['23:xgPerShot'], 3),
      show(rows['23:shotsGoalArea'], 1),
      show(rows['23:headedGoals'], 1),
      show(rows['23:setPieceGoals'], 1),
      show(rows['23:tacklesInterceptions'], 1),
      ints.toFixed(2),
      show(rows['30:ppda'], 2),
      show(rows['30:highTurnovers'], 2),
      show(rows['30:finalThirdPasses'], 1),
      show(rows['30:boxEntries'], 1),
      show(rows['30:frontOfBoxEntries'], 1),
      show(rows['30:xtAdded'], 2),
      show(rows['30:progressiveCarries'], 1),
      show(rows['23:offsides'], 2),
      show(rows['23:passes'], 1),
      show(rows['23:passCompletion'] ?? rows['23:completion'], 1),
      show(rows['23:crossCompletion'], 1),
      show(rows['23:ballInPlay'], 1),
      outside29 || '-',
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(json, null, 1));
