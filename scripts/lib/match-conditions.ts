/**
 * The corpus conditions' fixtures (→MATCH-28/29, CORPUS_CONFIG in ./match-parity.ts), the same on
 * every run that measures them: gap and tier conditions draw pool clubs in a synthetic world, every
 * other condition plays the core condition's equal top-tier pairs; a forced tactic pairing fields
 * squads built for its formations (T321). Moved from scripts/grid-bands.ts when the detailed engine's
 * runner went (T844); scripts/match-parity.ts plays them on the result path.
 */
import type { Club, Fixture, Player, Tactic, World } from '../../packages/contracts/src/types';
import {
  cohesionMultiplier,
  fatigueLoad,
  formationOf,
  integer,
  isUnavailable,
  npcSquad,
  random,
  rating,
  slotOvr,
} from '../../packages/engine/src/index';
import { careerWorld, type CareerInput } from '../../packages/engine/src/career.testkit';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import { npcMatchContext } from '../../packages/engine/src/match';
import { FORMATIONS } from '../../packages/engine/src/player';
import { type DecideRule } from '../../packages/engine/src/match/rules';
import {
  CORPUS_CONFIG,
  corpusFixtureId,
  type ParityCondition,
  type Partition,
} from './match-parity';

/** Base strengths of the pool clubs a gap condition draws around (as scripts/calibrate.ts draws its pools). */
const GAP_BASES = [77, 66, 55, 44, 86];
const POOL = 8;
let calibrationWorld: World | undefined;
const pools = new Map<number, Club[]>();
/** A pool club of a strength in a synthetic world, as scripts/calibrate.ts draws them. */
function poolClub(strength: number, u: number): { w: World; club: Club } {
  calibrationWorld ??= careerWorld({ country: 'ENG', seed: 'calibration', tier: 'midsize' });
  const w = calibrationWorld;
  const s = Math.max(15, Math.min(99, Math.round(strength)));
  let pool = pools.get(s);
  if (!pool) {
    pool = Array.from({ length: POOL }, (_, k) => {
      const club: Club = {
        id: `CAL:0:0:${s}:${k}`,
        name: `Calibration ${s}/${k}`,
        short: 'CAL',
        country: 'ENG',
        tier: 0,
        group: 0,
        strength: s,
        reputation: 50,
        fans: 10000,
        color: '#335577',
      };
      w.clubs.push(club);
      return club;
    });
    pools.set(s, pool);
  }
  return { w, club: pool[Math.floor(u * pool.length)]! };
}

let corePairs: { w: World; home: Club; away: Club }[] | undefined;
/** The core condition's world-country-roster pairs, each club on its own tactic. */
export function coreFixturePairs() {
  if (corePairs) return corePairs;
  const p = CORPUS_CONFIG.conditions[0]!.params as {
    worldSeeds: string[];
    world: Omit<CareerInput, 'seed'>;
    countries: string[];
    maxRatingGap: number;
  };
  corePairs = p.worldSeeds.flatMap((seed) => {
    const w = careerWorld({ ...p.world, seed });
    return p.countries.flatMap((country) => {
      const clubs = w.clubs
        .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
        .map((c) => ({ c, r: rating(w, c) }));
      return clubs.flatMap((a, i) =>
        clubs
          .slice(i + 1)
          .filter((b) => Math.abs(a.r - b.r) <= p.maxRatingGap)
          .map((b) => ({ w, home: a.c, away: b.c })),
      );
    });
  });
  return corePairs;
}

/** What a condition's parameters may set (CORPUS_CONFIG). */
export interface ConditionParams {
  home?: Tactic;
  away?: Tactic;
  bucket?: number;
  low?: number;
  high?: number;
  year?: number;
  fatigue?: number;
  decide?: DecideRule;
  fixture?: { year: number; round: number; kind: Fixture['kind'] };
}

/** A condition's stream of pool-club draws, consumed in fixture order (gap and tier conditions). */
export const conditionClubs = (c: ParityCondition, partition: Partition, round: number) =>
  random(`${CORPUS_CONFIG.partitions[partition].prefix}:r${round}:${c.id}:clubs`);

/**
 * A condition's `i`th fixture, the same on every path that measures it (scripts/match-parity.ts
 * plays these on the aggregate path): gap and tier conditions draw pool clubs from `r`
 * (`conditionClubs`), every other condition plays the core pairs.
 */
export function conditionFixture(
  c: ParityCondition,
  partition: Partition,
  round: number,
  i: number,
  r: () => number,
): { w: World; home: Club; away: Club; f: Fixture } {
  const params = c.params as ConditionParams;
  let w: World, home: Club, away: Club;
  if (c.family === 'gap' || c.family === 'tier') {
    let hs: number, as: number;
    if (c.family === 'gap') {
      // Strengths around a tier base whose home-minus-away gap (home +3) aims at the bucket.
      const base = GAP_BASES[i % GAP_BASES.length]! + (r() - 0.5) * 6;
      const spread = params.bucket! - 3 + (r() - 0.5) * 5;
      hs = base + spread / 2;
      as = base - spread / 2;
    } else {
      hs = integer(r, params.low!, params.high!);
      as = integer(r, params.low!, params.high!);
    }
    const h = poolClub(hs, r()),
      a = poolClub(as, r());
    w = h.w;
    home = h.club;
    away = a.club === h.club ? pools.get(a.club.strength)!.find((x) => x !== h.club)! : a.club;
  } else {
    const pairs = coreFixturePairs();
    ({ w, home, away } = pairs[i % pairs.length]!);
  }
  const f: Fixture = {
    ...w.fixtures[0]!,
    ...(params.fixture ?? { year: 2024, round: 1, kind: 'league' as const }),
    ...(params.year ? { year: params.year } : {}),
    id: corpusFixtureId(partition, c.id, i, round),
    home: home.id,
    away: away.id,
  };
  return { w, home, away, f };
}

/**
 * A forced tactic pairing's matchday rosters (MATCH-29, T321), the one rule both engines' runners
 * use: a forced tactic changes only in-match behaviour and its in-match cost. Each club's squad is
 * built for the forced formation (`npcSquad` with the forced tactic's squad places, at the club's
 * own strength, so the pair stays as equal as the core condition's): its XI is that squad's
 * formation slots, its bench the next `bench[side]` available players, and every one of them
 * starts from the condition's declared squad fatigue (`fatigue`; none declared keeps the
 * generated value, which `forcedFatigueApplied` reports).
 */
export function forcedRosters(
  w: World,
  f: Fixture,
  clubs: readonly [Club, Club],
  tactics: readonly [Tactic, Tactic],
  bench: readonly [number, number],
  fatigue?: number,
): [Player[], Player[]] {
  return ([0, 1] as const).map((side) => {
    const players = npcSquad(w.seed, w.year, clubs[side], tactics[side]).map((p) =>
      fatigue === undefined ? p : { ...p, fatigue },
    );
    const xi = players.slice(0, FORMATIONS[tactics[side]].slots.length);
    const named = players
      .slice(xi.length)
      .filter((p) => !isUnavailable(w, p, clubs[side].id, f))
      .slice(0, bench[side]);
    return [...xi, ...named];
  }) as [Player[], Player[]];
}

/**
 * An XI rated at the formation it plays, as world.ts `rating` rates a club nobody owns (MATCH-2):
 * the players' OVR at their slots times the club's 조직력, less the fatigue past match fitness.
 */
export function rosterRating(club: Club, xi: readonly Player[], tactic: Tactic): number {
  const slots = formationOf(tactic);
  let ovr = 0,
    load = 0;
  xi.slice(0, slots.length).forEach((p, i) => {
    ovr += slotOvr(p, slots[i]!);
    load += fatigueLoad(p.fatigue) / 6;
  });
  return Math.round((ovr * cohesionMultiplier(club) - load) / 11);
}
/** The candidate's NPC context and home advantage, before form (MATCH-2). */
export const contextGap = (w: World, clubs: readonly [Club, Club]) =>
  3 +
  npcMatchContext(w, clubs[0], MATCH_MODEL_REVISION) -
  npcMatchContext(w, clubs[1], MATCH_MODEL_REVISION);

/** A fixture's prepared strength gap, before diminishing returns and form. */
export const fixtureGap = (w: World, clubs: readonly [Club, Club], f: Fixture) =>
  rating(w, clubs[0], f) + contextGap(w, clubs) - rating(w, clubs[1], f);

/** A forced pairing's fielded XIs and the same candidate context as ordinary fixtures. */
export const forcedGap = (
  w: World,
  clubs: readonly [Club, Club],
  rosters: readonly (readonly Player[])[],
  tactics: readonly [Tactic, Tactic],
) =>
  rosterRating(clubs[0], rosters[0]!, tactics[0]) +
  contextGap(w, clubs) -
  rosterRating(clubs[1], rosters[1]!, tactics[1]);

/** Whether a forced pairing's rosters start from its declared squad fatigue; freshness is read only then. */
export const forcedFatigueApplied = (
  rosters: readonly (readonly Player[])[],
  fatigue: number | undefined,
) => fatigue !== undefined && rosters.every((side) => side.every((p) => p.fatigue === fatigue));
