/**
 * T368 scratch report over scripts/t328-counter-roles.ts outputs: MATCH-30 counters, MATCH-23 core,
 * MATCH-29 rows and the MATCH-2 curve of a base and a candidate run (each a comma-separated list
 * of round files, pooled), with every row's status change.
 *
 *   pnpm exec tsx report.mts --root <tree> --base a.json,b.json --cand c.json,d.json
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = opt('root')!;
const mp = await import(`${root}/scripts/lib/match-parity.ts`);
interface Chunk {
  condition: string;
  samples: { condition: string }[];
  invalid: number;
  invariants: number;
}
const load = (list: string) =>
  list
    .split(',')
    .flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { chunks: Chunk[] }).chunks);
const f = (x: number | undefined, d = 3) => (x === undefined || x === null ? 'n/a' : x.toFixed(d));
type Row = { id: string; status: string; value?: number; interval?: [number, number] };
function readings(chunks: Chunk[]) {
  const of = (p: string) => chunks.filter((c) => c.condition.startsWith(p)).flatMap((c) => c.samples);
  const core = of('core:');
  const pairing = of('tactics:');
  const gap = of('gap:');
  const rows: Record<string, Row> = {};
  for (const r of mp.advancedCounterVerdicts(core) as Row[]) rows[`30:${r.id}`] = r;
  for (const r of mp.buildTargetReport(core) as Row[]) rows[`23:${r.id}`] = r;
  let pts = '';
  if (pairing.length) {
    const rep = mp.tacticPairingVerdicts(pairing);
    for (const r of rep.rows as (Row & { kind: string; differences?: { value?: number; interval?: [number, number]; status: string }[] })[]) {
      if (r.kind === 'band') rows[`29:${r.id}`] = r;
      else
        rows[`29:${r.id}`] = {
          id: r.id,
          status: r.status,
          value: r.differences?.[0]?.value,
          interval: r.differences?.[0]?.interval,
        };
    }
    pts = Object.entries(rep.tactics as Record<string, { points: { value?: number } }>)
      .map(([t, x]) => `${t} ${f(x.points.value)}`)
      .join(', ');
  }
  const curve = gap.length ? mp.buildOutcomeTargetReport(gap) : undefined;
  return {
    rows,
    pts,
    curve: curve?.meanAbsoluteError,
    buckets: curve?.rows.map((r: { bucket: number; error: number }) => `${r.bucket} ${(100 * r.error).toFixed(1)}`).join(', '),
    n: { core: core.length, pairing: pairing.length, gap: gap.length },
    invalid: chunks.reduce((a, c) => a + c.invalid, 0),
    invariants: chunks.reduce((a, c) => a + c.invariants, 0),
  };
}
const base = readings(load(opt('base')!));
const cand = opt('cand') ? readings(load(opt('cand')!)) : undefined;
const count = (rows: Record<string, Row>, prefix: string) => {
  const c: Record<string, number> = {};
  for (const [k, r] of Object.entries(rows)) if (k.startsWith(prefix)) c[r.status] = (c[r.status] ?? 0) + 1;
  return Object.entries(c)
    .map(([s, n]) => `${s} ${n}`)
    .join(', ');
};
for (const [name, x] of [['base', base], ['cand', cand]] as const) {
  if (!x) continue;
  console.log(
    `${name}: core ${x.n.core}, pairing ${x.n.pairing}, gap ${x.n.gap}; invalid ${x.invalid}, invariant failures ${x.invariants}`,
  );
  console.log(`  MATCH-30: ${count(x.rows, '30:')}`);
  console.log(`  MATCH-23: ${count(x.rows, '23:')}`);
  console.log(`  MATCH-29: ${count(x.rows, '29:')}`);
  console.log(`  curve ${f(x.curve === undefined ? undefined : 100 * x.curve, 2)} (${x.buckets}); points ${x.pts}`);
}
const keys = Object.keys(base.rows);
for (const k of keys) {
  const b = base.rows[k]!;
  const c = cand?.rows[k];
  const show = (r?: Row) =>
    r ? `${f(r.value)} [${f(r.interval?.[0])}, ${f(r.interval?.[1])}] ${r.status}` : '';
  const moved = c && c.status !== b.status;
  if (args.includes('--all') || moved || (!c && b.status !== 'inside'))
    console.log(`${moved ? '*' : ' '} ${k.padEnd(32)} ${show(b).padEnd(44)} ${c ? '→ ' + show(c) : ''}`);
}
