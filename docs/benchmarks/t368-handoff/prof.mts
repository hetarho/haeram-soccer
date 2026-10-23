/**
 * T374 timing probe: plays `--count` core matches of validation round `--round` in this process on
 * the tree given by --root (candidate model, no trace) and prints the time a match.
 *   pnpm exec tsx --cpu-prof prof.mts --root <tree> --count 40 --round 47
 */
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const root = opt('root', '');
const imp = (p: string) => import(`${root}/${p}`);
const { MATCH_MODEL_REVISION } = await imp('packages/contracts/src/match-model.ts');
const { playGrid } = await imp('packages/engine/src/grid/engine.ts');
const { buildGridSetup } = await imp('packages/engine/src/grid/setup.ts');
const gb = await imp('scripts/grid-bands.ts');
const mp = await imp('scripts/lib/match-parity.ts');
const count = Number(opt('count', '40'));
const round = Number(opt('round', '47'));
const c = mp.conditionOf('core:equal-top-tier');
const r = gb.conditionClubs(c, 'validation', round);
const fixtures = [];
for (let i = 0; i < count; i++) fixtures.push(gb.conditionFixture(c, 'validation', round, i, r));
let steps = 0;
const started = performance.now();
for (const { w, f } of fixtures) {
  const setup = buildGridSetup(w, f, { model: MATCH_MODEL_REVISION });
  const res = playGrid(setup);
  steps += res.diagnostics.shots.length;
}
const ms = performance.now() - started;
console.log(`${root}: ${count} matches, ${(ms / count).toFixed(1)} ms a match (${steps} shots)`);
