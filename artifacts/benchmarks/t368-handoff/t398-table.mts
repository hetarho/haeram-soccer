/**
 * T398 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, goals by line (FW, MF, DF), headed goals, shots, goals, box shots and the box
 * share of shots, big chances, cut-backs, the attacking counters T397 left outside, passes,
 * offsides and MATCH-29's points, and the curve; [95%] intervals, ✗ outside, ~ unresolved or
 * insufficient, no mark inside.
 *
 *   pnpm exec tsx t398-table.mts --root <tree> [--out <file.md>] <name>=<run.json>[,<run.json>] ...
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
type Row = { id: string; status: string; value?: number; interval?: [number, number] };
type Pair = Row & { kind: string; differences?: { value?: number; interval?: [number, number] }[] };
const mark = (s: string) => (s === 'inside' ? '' : s === 'outside' ? '✗' : '~');
const show = (r: Row | undefined, d = 2) =>
  r && r.value !== undefined
    ? `${r.value.toFixed(d)} [${r.interval![0].toFixed(d)}, ${r.interval![1].toFixed(d)}]${mark(r.status)}`
    : 'n/a';
const cols: [string, string, number][] = [
  ['23:goalsFW', 'FW goals %', 1],
  ['23:goalsMF', 'MF goals %', 1],
  ['23:goalsDF', 'DF goals %', 1],
  ['23:headedGoals', 'headed goals %', 1],
  ['23:goals', 'goals', 2],
  ['23:shots', 'shots', 2],
  ['23:shotsBox', 'box shots %', 1],
  ['23:shotsOutside', 'outside shots %', 1],
  ['30:boxShots', 'box shots', 2],
  ['30:bigChances', 'big chances', 2],
  ['30:bigChancesScored', 'big scored', 2],
  ['30:cutBacks', 'cut-backs', 2],
  ['30:boxEntries', 'box entries', 2],
  ['30:xtAdded', 'xT', 3],
  ['30:progressivePasses', 'prog. passes', 1],
  ['23:passes', 'passes', 1],
  ['23:offsides', 'offsides', 2],
  ['29:points:press', "press's points", 3],
  ['29:points:possession', "possession's points", 3],
  ['29:points:counter', "counter's points", 3],
  ['29:points:balanced', "balanced's points", 3],
];
const pitch = await import(`${root}/packages/engine/src/grid/pitch.ts`);
/** Box shots by the shooter's line, from each core shot's diagnostic (place and line). */
const boxShare = (samples: { diagnostics?: { shots: { x: number; y: number; line: string }[] } }[]) => {
  const box = samples.flatMap((x) => x.diagnostics?.shots ?? []).filter((x) => pitch.inBox([x.x, x.y]));
  const of = (line: string) => box.filter((x) => x.line === line).length / Math.max(1, box.length);
  return `MF ${(100 * of('MF')).toFixed(1)}% / FW ${(100 * of('FW')).toFixed(1)}%`;
};
const header = ['setting', 'core', 'MATCH-30', 'MATCH-29', ...cols.map((c) => c[1]), 'box shots by line', 'curve'];
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
        (
          JSON.parse(readFileSync(f, 'utf8')) as {
            chunks: { condition: string; samples: { condition: string }[] }[];
          }
        ).chunks,
    );
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
  print(
    `| ${[
      name,
      inside('23:'),
      inside('30:'),
      inside('29:'),
      ...cols.map(([id, , d]) => show(rows[id], d)),
      boxShare(of('core:') as never),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
