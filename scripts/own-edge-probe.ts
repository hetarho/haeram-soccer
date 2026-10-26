/**
 * T434 measurement only (ideation own-club-match-edge): does the released model still give the
 * own club an edge over clubs of the same strength? A 1950 쉬움 founding simulated on the released
 * model for 10 seasons (built once through `cachedWorld`) has its next season's own league fixtures
 * replayed by seed, each fixture on
 *   - detailed: the detailed engine the own club plays (`simulateMatch`, as played);
 *   - aggregate: the complete aggregate path every other fixture takes (`simulateAggregate`);
 * and both again with the own manager and morale set to what clubs nobody owns get (context +4:
 * morale at its start, the manager's ability so that ability, style strength and the build's home
 * strength add 4). Seed i sets `w.seed = <seed>:probe<i>` for every fixture; the world is never
 * settled, so every replay reads the same squads. Indicative, not a statistical verdict.
 *
 *   pnpm exec tsx scripts/own-edge-probe.ts --seeds 10 --seasons 10 --out <file.json>
 */
import { writeFileSync } from 'node:fs';
import { activeMatchModel } from '../packages/contracts/src/match-model';
import type { Fixture, MatchRecord, World } from '../packages/contracts/src/types';
import { buildEffects } from '../packages/engine/src/build';
import { createWorld, simulateSeason } from '../packages/engine/src/founding';
import { simulateMatch } from '../packages/engine/src/match';
import { MORALE_START, moraleStrength } from '../packages/engine/src/morale';
import { simulateAggregate } from '../packages/engine/src/aggregate/engine';
import { managerStyleEffects } from '../packages/engine/src/styles';
import { findClub, rating } from '../packages/engine/src/world';
import { cachedWorld, ENABLED_RELEASE } from '../tests/fixtures/worlds';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
};
const SEEDS = Number(arg('seeds', '10'));
const SEASONS = Number(arg('seasons', '10'));
const OUT = arg('out', '');
const FOUNDING = {
  country: 'ENG' as const,
  name: 'Probe Town',
  color: '#3A7BC2',
  seed: 'own-edge',
  level: 'easy' as const,
};

const world = cachedWorld(
  `own-edge-probe:${JSON.stringify(FOUNDING)}:${SEASONS}`,
  () => {
    const w = createWorld(FOUNDING, ENABLED_RELEASE);
    for (let s = 0; s < SEASONS; s++) simulateSeason(w);
    return w;
  },
  { input: { founding: FOUNDING, seasons: SEASONS } },
);

const own = world.playerClub;
const fixtures = world.fixtures.filter(
  (f) =>
    (f.kind === 'league' || f.kind === 'lower') &&
    f.score === undefined &&
    (f.home === own || f.away === own),
);

type Variant = 'detailed' | 'aggregate' | 'detailed-neutral' | 'aggregate-neutral';
const VARIANTS: Variant[] = ['detailed', 'aggregate', 'detailed-neutral', 'aggregate-neutral'];

/** Sets the own manager and morale to what a club nobody owns brings (context +4) for `f`. */
function neutralContext(w: World, f: Fixture) {
  const style = managerStyleEffects(w).strength;
  const home = f.home === own ? buildEffects(w).homeStrength : 0;
  w.morale = MORALE_START;
  w.manager = { ...w.manager, ability: 50 + 4 * (4 - style - home) };
}

function play(variant: Variant, f: Fixture, seed: number): MatchRecord {
  const w = world;
  const saved = { seed: w.seed, morale: w.morale, manager: w.manager };
  try {
    w.seed = `${saved.seed}:probe${seed}`;
    if (variant.endsWith('neutral')) neutralContext(w, f);
    return variant.startsWith('detailed')
      ? simulateMatch(w, f, false, true).record
      : simulateAggregate(w, f).record;
  } finally {
    w.seed = saved.seed;
    w.morale = saved.morale;
    w.manager = saved.manager;
  }
}

const ownContext = (f: Fixture) =>
  (world.manager.ability - 50) / 4 +
  moraleStrength(world) +
  managerStyleEffects(world).strength +
  (f.home === own ? buildEffects(world).homeStrength : 0);

const club = findClub(world, own);
const started = Date.now();
const rows = VARIANTS.map((variant) => {
  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0;
  const t0 = Date.now();
  for (const f of fixtures)
    for (let seed = 0; seed < SEEDS; seed++) {
      const { score } = play(variant, f, seed);
      const [us, them] = f.home === own ? [score.home, score.away] : [score.away, score.home];
      gf += us;
      ga += them;
      if (us > them) w++;
      else if (us === them) d++;
      else l++;
    }
  const n = w + d + l;
  const row = {
    variant,
    matches: n,
    ppm: (3 * w + d) / n,
    wdl: [w / n, d / n, l / n].map((x) => Math.round(1000 * x) / 10),
    goals: [gf / n, ga / n],
    seconds: (Date.now() - t0) / 1000,
  };
  console.log(JSON.stringify(row));
  return row;
});

const opponents = fixtures.map((f) =>
  rating(world, findClub(world, f.home === own ? f.away : f.home), f),
);
const summary = {
  task: 'T434',
  founding: FOUNDING,
  seasons: SEASONS,
  year: fixtures[0]?.year,
  groupKey: fixtures[0]?.groupKey,
  model: activeMatchModel(world),
  fixtures: fixtures.length,
  seeds: SEEDS,
  ownXi: rating(world, club, fixtures[0]),
  opponentXi: {
    mean: opponents.reduce((a, b) => a + b, 0) / Math.max(1, opponents.length),
    min: Math.min(...opponents),
    max: Math.max(...opponents),
  },
  manager: { ability: world.manager.ability, style: world.manager.style ?? null },
  morale: world.morale,
  ownContext: fixtures.map(ownContext).reduce((a, b) => a + b, 0) / Math.max(1, fixtures.length),
  rows,
  seconds: (Date.now() - started) / 1000,
};
console.log(JSON.stringify(summary, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
