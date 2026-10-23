/**
 * T370 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, the MATCH-30 counters the task moves (chances, carries, pressing), the core rows
 * they could push out, MATCH-29's widest rows and the curve; [95%] intervals, ✗ outside,
 * ~ unresolved or insufficient, no mark inside.
 *
 *   pnpm exec tsx t370-table.mts --root <tree> <name>=<run.json> ...
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
const show = (r: Row | undefined, d = 2) =>
  r && r.value !== undefined
    ? `${r.value.toFixed(d)} [${r.interval![0].toFixed(d)}, ${r.interval![1].toFixed(d)}]${mark(r.status)}`
    : 'n/a';
const cols: [string, string, number][] = [
  ['30:bigChances', 'big chances', 3],
  ['30:bigChancesScored', 'scored', 3],
  ['30:boxShots', 'box shots', 2],
  ['30:keyPasses', 'key passes', 2],
  ['30:xa', 'xA', 3],
  ['30:progressiveCarries', 'prog. carries', 1],
  ['30:progressivePasses', 'prog. passes', 1],
  ['30:ppda', 'PPDA', 2],
  ['30:highTurnovers', 'high turnovers', 2],
  ['23:goals', 'goals', 2],
  ['23:shots', 'shots', 2],
  ['23:xgPerShot', 'xG a shot', 3],
  ['23:passes', 'passes', 0],
  ['23:passCompletion', 'completion %', 1],
  ['23:tacklesInterceptions', 'tackles+int.', 1],
  ['23:throwIns', 'throw-ins', 2],
  ['23:shotsGoalArea', 'goal-area %', 1],
  ['23:goalsMF', 'MF goals %', 1],
  ['23:setPieceGoals', 'set-piece goals %', 1],
  ['29:points:press', "press's points", 3],
  ['29:points:balanced', "balanced's points", 3],
  ['29:points:possession', "possession's points", 3],
];
const header = ['setting', 'core', 'MATCH-30', 'MATCH-29', ...cols.map((c) => c[1]), 'curve'];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const spec of runs) {
  const at = spec.indexOf('=');
  const name = spec.slice(0, at);
  const chunks = (
    JSON.parse(readFileSync(spec.slice(at + 1), 'utf8')) as {
      chunks: { condition: string; samples: { condition: string }[] }[];
    }
  ).chunks;
  const of = (p: string) =>
    chunks.filter((c) => c.condition.startsWith(p)).flatMap((c) => c.samples);
  const rows: Record<string, Row> = {};
  for (const r of mp.advancedCounterVerdicts(of('core:')) as Row[]) rows[`30:${r.id}`] = r;
  for (const r of mp.buildTargetReport(of('core:')) as Row[]) rows[`23:${r.id}`] = r;
  const pairing = of('tactics:');
  if (pairing.length)
    for (const r of mp.tacticPairingVerdicts(pairing).rows as Pair[])
      rows[`29:${r.id}`] =
        r.kind === 'band'
          ? r
          : {
              id: r.id,
              status: r.status,
              value: r.differences?.[0]?.value,
              interval: r.differences?.[0]?.interval,
            };
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
      ...cols.map(([id, , d]) => show(rows[id], d)),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
