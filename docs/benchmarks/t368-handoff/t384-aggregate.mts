/**
 * T384 aggregate reading: the grid runner's core fixtures (grid-bands `conditionFixture`, the same
 * seeds as scripts/t328-counter-roles.ts) on the aggregate path, with offsides a team and every
 * offside by the called player's own 판단력 (`attrs.decisions`), so t384-table.mts can split them by
 * the grid's quarters. `--forward`, `--through` and `--inverse` set the aggregate's offside levers
 * (failed-pass shares, `offsideJudgement`) before the engine loads.
 *
 *   pnpm exec tsx t384-aggregate.mts --root <tree> --partition calibration --round 56 --count 2400
 *     [--forward 0.07] [--through 0.33] [--inverse 3] --out file.json
 */
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const root = opt('root', '');
if (!root) throw new Error('--root');
const imp = (p: string) => import(`${root}/${p}`);

const config = await imp('packages/engine/src/aggregate/config.ts');
const patch: { forward?: number; through?: number; inverse?: number } = {};
for (const key of ['forward', 'through', 'inverse'] as const)
  if (args.includes(`--${key}`)) patch[key] = Number(opt(key, ''));
const failed = config.AGGREGATE_CONFIG.failed.offside as { forward: number; through: number };
if (patch.forward !== undefined) failed.forward = patch.forward;
if (patch.through !== undefined) failed.through = patch.through;
if (patch.inverse !== undefined) config.AGGREGATE_ATTRIBUTION_CONFIG.offsideJudgement = patch.inverse;

const { TD, PD } = await imp('packages/contracts/src/detail.ts');
const gb = await imp('scripts/grid-bands.ts');
const mp = await imp('scripts/lib/match-parity.ts');
const agg = await imp('packages/engine/src/aggregate/engine.ts');
const runner = await imp('scripts/match-parity.ts');

const partition = opt('partition', 'calibration');
const round = Number(opt('round', '0'));
const count = Number(opt('count', '600'));
const c = mp.conditionOf('core:equal-top-tier');
const r = gb.conditionClubs(c, partition, round);
let offsides = 0;
const byRaw: Record<string, number> = {};
for (let i = 0; i < count; i++) {
  const { w, f } = gb.conditionFixture(c, partition, round, i, r);
  const { prepared, rosters } = runner.conditionedMatch(w, f, runner.conditioningOf(c.id));
  const match = agg.playAggregate(w, f, prepared, rosters);
  const record = agg.aggregateRecord(f, rosters, match);
  offsides += record.detail[0][TD.offsides] + record.detail[1][TD.offsides];
  const decisions = new Map<string, number>();
  for (const side of rosters) for (const p of side) decisions.set(p.id, p.attrs.decisions);
  for (const line of record.players) {
    const n = line.detail?.[PD.offsides] ?? 0;
    if (!n) continue;
    const key = String(decisions.get(line.id));
    byRaw[key] = (byRaw[key] ?? 0) + n;
  }
}
const out = { partition, round, count, patch, sides: 2 * count, offsides, byRaw };
writeFileSync(opt('out', 't384-aggregate.json'), JSON.stringify(out));
console.log(`aggregate ${JSON.stringify(patch)}: ${(offsides / (2 * count)).toFixed(3)} offsides a team over ${count} matches`);
