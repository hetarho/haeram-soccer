/**
 * T375 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, the core rows the task watches, MATCH-29's press rows and the curve; [95%]
 * intervals, ✗ outside, ~ unresolved or insufficient, no mark inside.
 *
 *   pnpm exec tsx t375-table.mts --root <tree> <name>=<run.json> ...
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const i = args.indexOf('--root');
const root = args[i + 1]!;
const runs = args.filter((_, k) => k !== i && k !== i + 1);
const mp = await import(`${root}/scripts/lib/match-parity.ts`);
type Row = { id: string; status: string; value?: number; interval?: [number, number] };
type Pair = Row & { kind: string; differences?: { value?: number; interval?: [number, number] }[] };
const mark = (s: string) => (s === 'inside' ? '' : s === 'outside' ? '✗' : '~');
const show = (r: Row | undefined, k = 1, d = 2) =>
  r && r.value !== undefined
    ? `${(k * r.value).toFixed(d)} [${(k * r.interval![0]).toFixed(d)}, ${(k * r.interval![1]).toFixed(d)}]${mark(r.status)}`
    : 'n/a';
const cols: [string, string, number, number][] = [
  ['23:offsides', 'offsides', 1, 2],
  ['23:goals', 'goals', 1, 2],
  ['23:shots', 'shots', 1, 1],
  ['23:shotsGoalArea', 'goal-area %', 1, 1],
  ['23:shotsOutside', 'outside %', 1, 1],
  ['23:shotDistance', 'distance m', 1, 2],
  ['23:goalsMF', 'MF goals %', 1, 1],
  ['23:goalsFW', 'FW goals %', 1, 1],
  ['30:throughBalls', 'through balls', 1, 2],
  ['30:throughBallsCompleted', 'completed', 1, 2],
  ['30:boxEntries', 'box entries', 1, 1],
  ['30:xtAdded', 'xT', 1, 2],
  ['29:points:press', "press's points", 1, 3],
  ['29:winShareGap:possession-press', 'gap possession v press', 1, 3],
  ['29:winShareGap:press-counter', 'gap press v counter', 1, 3],
  ['29:winShareGap:press-balanced', 'gap press v balanced', 1, 3],
];
const header = ['setting', 'core', 'MATCH-30', 'MATCH-29', ...cols.map((c) => c[1]), 'curve'];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const spec of runs) {
  const at = spec.indexOf('=');
  const name = spec.slice(0, at);
  const chunks = (JSON.parse(readFileSync(spec.slice(at + 1), 'utf8')) as {
    chunks: { condition: string; samples: { condition: string }[] }[];
  }).chunks;
  const of = (p: string) => chunks.filter((c) => c.condition.startsWith(p)).flatMap((c) => c.samples);
  const rows: Record<string, Row> = {};
  for (const r of mp.advancedCounterVerdicts(of('core:')) as Row[]) rows[`30:${r.id}`] = r;
  for (const r of mp.buildTargetReport(of('core:')) as Row[]) rows[`23:${r.id}`] = r;
  const pairing = of('tactics:');
  if (pairing.length)
    for (const r of mp.tacticPairingVerdicts(pairing).rows as Pair[])
      rows[`29:${r.id}`] =
        r.kind === 'band'
          ? r
          : { id: r.id, status: r.status, value: r.differences?.[0]?.value, interval: r.differences?.[0]?.interval };
  const inside = (p: string) => {
    const all = Object.entries(rows).filter(([k]) => k.startsWith(p));
    return `${all.filter(([, r]) => r.status === 'inside').length}/${all.length}`;
  };
  const gap = of('gap:');
  const curve = gap.length ? mp.buildOutcomeTargetReport(gap).meanAbsoluteError : undefined;
  console.log(
    `| ${[
      name,
      inside('23:'),
      inside('30:'),
      inside('29:'),
      ...cols.map(([id, , k, d]) => show(rows[id], k, d)),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
