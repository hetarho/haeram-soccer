/**
 * T371 scratch profile of what each tactic concedes over the tactic pairings of
 * scripts/t328-counter-roles.ts outputs: per match, the opponents' xG, shots, box shots, big
 * chances, box entries, crosses, through balls, high turnovers, corners and penalties, and the
 * xG of the opponents' penalties (0.76 each) apart.
 *
 *   pnpm exec tsx t371-profile.mts --root <tree> <name>=<run.json>[,<run.json>] ...
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const i = args.indexOf('--root');
const root = args[i + 1]!;
const runs = args.filter((_, k) => k !== i && k !== i + 1);
const { TD } = await import(`${root}/packages/contracts/src/detail.ts`);
const { M } = await import(`${root}/packages/engine/src/grid/record.ts`);
type Rec = {
  xg?: [number, number];
  metrics: [number[], number[]];
  detail?: [number[], number[]];
  score: { home: number; away: number };
};
const keys = [
  'xg',
  'npxg',
  'shots',
  'boxShots',
  'bigChances',
  'boxEntries',
  'crosses',
  'throughBalls',
  'highTurnovers',
  'corners',
  'penalties',
  'goals',
] as const;
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
            chunks: { condition: string; samples: { condition: string; record: Rec }[] }[];
          }
        ).chunks,
    );
  const sum: Record<string, Record<string, number>> = {};
  const n: Record<string, number> = {};
  for (const c of chunks) {
    if (!c.condition.startsWith('tactics:')) continue;
    const tactics = c.condition.slice('tactics:'.length).split('-');
    for (const s of c.samples) {
      const r = s.record;
      for (const side of [0, 1] as const) {
        const t = tactics[side]!;
        const foe = (1 - side) as 0 | 1;
        const d = r.detail?.[foe] ?? [];
        const xg = r.xg?.[foe] ?? 0;
        const pens = d[TD.penalties] ?? 0;
        const row = (sum[t] ??= {});
        const add = (k: string, v: number) => (row[k] = (row[k] ?? 0) + v);
        add('xg', xg);
        add('npxg', xg - 0.76 * pens);
        add('shots', r.metrics[foe][M.shots] ?? 0);
        add('boxShots', d[TD.boxShots] ?? 0);
        add('bigChances', d[TD.bigChances] ?? 0);
        add('boxEntries', d[TD.boxEntries] ?? 0);
        add('crosses', d[TD.crosses] ?? 0);
        add('throughBalls', d[TD.throughBalls] ?? 0);
        add('highTurnovers', d[TD.highTurnovers] ?? 0);
        add('corners', d[TD.corners] ?? 0);
        add('penalties', pens);
        add('goals', foe === 0 ? r.score.home : r.score.away);
        n[t] = (n[t] ?? 0) + 1;
      }
    }
  }
  console.log(`${name}: conceded a match`);
  console.log(`| tactic | n | ${keys.join(' | ')} |`);
  for (const [t, row] of Object.entries(sum))
    console.log(
      `| ${t} | ${n[t]} | ${keys.map((k) => ((row[k] ?? 0) / n[t]!).toFixed(k === 'xg' || k === 'npxg' ? 3 : 2)).join(' | ')} |`,
    );
}
