/**
 * T408 screen table over scripts/t328-counter-roles.ts outputs: one markdown row a run with the
 * inside counts, the MATCH-30 flow rows T408 targets (final-third passes and completed, box and
 * front-of-box entries, xT, progressive carries, cut-backs, through balls) and passes, build-up
 * passes, shots, goals and the curve. [95%] intervals, ✗ outside, ~ unresolved, no mark inside.
 *
 *   pnpm exec tsx t408-table.mts --root <tree> [--out <file.md>] <name>=<run.json>[,<run.json>] ...
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
const header = [
  'setting',
  'core',
  'MATCH-30',
  'MATCH-29',
  'final-third passes',
  'completed',
  'box entries',
  'front-of-box entries',
  'xT',
  'progressive carries',
  'cut-backs',
  'through balls',
  'passes',
  'progressive passes',
  'shots',
  'goals',
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
  for (const r of mp.tacticPairingVerdicts(pairing).rows as Row[]) rows[`29:${r.id}`] = r;
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
      pairing.length ? inside('29:') : 'n/a',
      show(rows['30:finalThirdPasses'], 1),
      show(rows['30:finalThirdCompleted'], 1),
      show(rows['30:boxEntries'], 1),
      show(rows['30:frontOfBoxEntries'], 1),
      show(rows['30:xtAdded'], 2),
      show(rows['30:progressiveCarries'], 1),
      show(rows['30:cutBacks'], 2),
      show(rows['30:throughBalls'], 2),
      show(rows['23:passes'], 1),
      show(rows['30:progressivePasses'], 1),
      show(rows['23:shots'], 2),
      show(rows['23:goals'], 2),
      curve === undefined || curve === null ? 'n/a' : (100 * curve).toFixed(2),
    ].join(' | ')} |`,
  );
}
if (file) writeFileSync(file, `${lines.join('\n')}\n`);
