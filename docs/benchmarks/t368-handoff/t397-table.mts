/**
 * T397 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, the MATCH-30 attacking counters T372 found outside (through balls, final-third
 * passes, progressive passes, box and front-of-box entries, xT, cut-backs, progressive carries,
 * big chances), line-breaking passes (unbanded), offsides, passes, shots, goals, FW goals and
 * MATCH-29's points, and the curve; [95%] intervals, ✗ outside, ~ unresolved or insufficient, no
 * mark inside.
 *
 *   pnpm exec tsx t397-table.mts --root <tree> [--out <file.md>] <name>=<run.json>[,<run.json>] ...
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
  ['30:throughBalls', 'through', 2],
  ['30:throughBallsCompleted', 'through done', 2],
  ['30:finalThirdPasses', 'F3 passes', 1],
  ['30:finalThirdCompleted', 'F3 done', 1],
  ['30:progressivePasses', 'prog. passes', 1],
  ['30:boxEntries', 'box entries', 2],
  ['30:frontOfBoxEntries', 'front entries', 1],
  ['30:xtAdded', 'xT', 3],
  ['30:cutBacks', 'cut-backs', 2],
  ['30:progressiveCarries', 'prog. carries', 1],
  ['30:bigChances', 'big chances', 2],
  ['30:bigChancesScored', 'big scored', 2],
  ['30:lineBreakingPasses', 'line-breaking', 1],
  ['23:offsides', 'offsides', 2],
  ['23:passes', 'passes', 1],
  ['23:shots', 'shots', 2],
  ['23:goals', 'goals', 2],
  ['23:goalsFW', 'FW goals %', 1],
  ['29:points:press', "press's points", 3],
  ['29:points:possession', "possession's points", 3],
  ['29:points:counter', "counter's points", 3],
  ['29:points:balanced', "balanced's points", 3],
];
const header = ['setting', 'core', 'MATCH-30', 'MATCH-29', ...cols.map((c) => c[1]), 'curve'];
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
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
