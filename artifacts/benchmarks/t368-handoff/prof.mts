/**
 * T374 timing probe: plays `--count` core matches of `--partition` round `--round` in this process
 * on the tree given by --root (candidate model, no trace) and prints the time a match. T375: also
 * prints the facts digest (record, elapsed and diagnostics, as `grid-throughput.test.ts` digests
 * them) of all the matches, so two trees can be shown to play the same football; `--patch <json>`
 * patches the candidate configs like `probe.mts`.
 *   pnpm exec tsx --cpu-prof prof.mts --root <tree> --count 40 --round 47 [--partition validation]
 */
import { createHash } from 'node:crypto';

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
const patch = opt('patch', '');
if (patch) {
  const variants = await imp('scripts/t328-counter-roles-variants.ts');
  for (const p of variants.behaviourOf('', patch)) variants.applyBehaviour(p);
}
const count = Number(opt('count', '40'));
const round = Number(opt('round', '47'));
const partition = opt('partition', 'validation');
const c = mp.conditionOf('core:equal-top-tier');
const r = gb.conditionClubs(c, partition, round);
const fixtures = [];
for (let i = 0; i < count; i++) fixtures.push(gb.conditionFixture(c, partition, round, i, r));
let steps = 0;
const hash = createHash('sha256');
const started = performance.now();
for (const { w, f } of fixtures) {
  const setup = buildGridSetup(w, f, { model: MATCH_MODEL_REVISION });
  const res = playGrid(setup);
  steps += res.diagnostics.shots.length;
  const { record, elapsed, diagnostics } = res;
  hash.update(JSON.stringify({ record, elapsed, diagnostics }));
}
const ms = performance.now() - started;
console.log(
  `${root}: ${partition} r${round}, ${count} matches, ${(ms / count).toFixed(1)} ms a match (${steps} shots), facts ${hash.digest('hex').slice(0, 16)}`,
);
