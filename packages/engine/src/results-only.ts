/**
 * The results-only path (→MATCH-22): before the takeover, while nobody owns a club (→WORLD-13),
 * every fixture draws its score from both sides' prepared strength with the aggregate path's
 * home, goal and draw shape, names its scorers and assisters by the aggregate path's attribution
 * weights, and settles a level tie by extra time and a shoot-out (→MATCH-6). Nothing else is drawn:
 * no counters beyond goals, assists and minutes, no cards, injuries or substitutions, so the eleven
 * who start play the whole match. ← seven decades of fixtures lived in a bearable wait (→ARCH-28)
 */
import type { Line } from '../../contracts/src/player';
import type {
  Club,
  Fixture,
  MatchPlayback,
  MatchRecord,
  Metrics,
  Player,
  Score,
  Tactic,
  World,
} from '../../contracts/src/types';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './aggregate/config';
import { M } from './grid/record';
import { SHOT_CONFIG } from './grid/resolve';
import { isLevel, type DecideRule } from './grid/setup';
import { STRENGTH_CONFIG } from './grid/state';
import { npcStrength } from './match';
import { actionWeight, type MatchAction } from './match-weights';
import { FORMATIONS, isWide, levelFactor, lineOf } from './player';
import { clamp, random, zeroMetrics } from './primitives';
import { exp } from './portable-math';
import { npcTactic } from './strategy';
import { findClub, startingSquad } from './world';

/**
 * T669's Poisson fit of the aggregate path on 6,136 league fixtures between clubs nobody owns (two
 * seeds, 1930 and 1975, no difference by era): a side's goals have mean exp(`base` + `perPoint` ×
 * (its prepared strength − the other's) + `perLevel` × (the two sides' mean strength − `level`)) —
 * home ground is already in the strength, and better sides score a little more (2.5 goals a match
 * at a mean of 50, 3.0 at 90). Goal kinds take MATCH-23's middles; `assisted` is the aggregate
 * path's 0.737 assists a goal over the goals that are not penalties.
 */
export const RESULTS_ONLY_CONFIG = {
  goals: { base: 0.2504, perPoint: 0.033, perLevel: 0.00326, level: 70 },
  /**
   * Shares of goals from the penalty spot and headed (→MATCH-23: 6–9%, 14–20%) and shot from
   * outside the box (about one in eight); the rest are shots in the box.
   */
  penalty: 0.075,
  headed: 0.17,
  outside: 0.12,
  /** A goal other than a penalty has an assist this often. */
  assisted: 0.8,
  /** Extra time is a third of a match at the same rates (→MATCH-6). */
  extraTime: 30 / 90,
} as const;

/**
 * T698's placebo draw, a measurement-only override (→CLUB-48's champions part): while `salt` is
 * non-empty, every results-only fixture of season `season` (league, cup and continental alike)
 * draws from a stream carrying the salt, so that season's results are drawn afresh while every
 * other draw keeps its key. A season Y is the one starting in Y (`w.year === Y` until its close);
 * 1930 is the world's first (`HISTORY_START`, a literal here since history.ts reaches this module).
 * Production never sets the salt: with it empty the key is the released one exactly.
 */
export const RESULTS_LUCK: { salt: string; season: number } = { salt: '', season: 1930 };

/** The stream a fixture's result draws from (→ARCH-5: named by the fixture). */
function resultsKey(w: World, f: Fixture) {
  const { salt, season } = RESULTS_LUCK;
  return salt && w.year === season
    ? `${w.seed}:results:${salt}:${f.id}`
    : `${w.seed}:results:${f.id}`;
}

/** One side's eleven and what each of them is picked by, read once per XI. */
interface Eleven {
  shot: number[];
  outside: number[];
  header: number[];
  through: number[];
  cross: number[];
  /** The best penalty taker's slot, outfield. */
  taker: number;
  /** Shoot-out takers, best first and the keeper last, and each one's kick value. */
  kickers: number[];
  kick: number[];
  /** The keeper's 선방 at his slot. */
  keeping: number;
}
const elevens = new WeakMap<Player[], Map<Tactic, Eleven>>();

/** An attribute's pull at a slot: the aggregate path's skill term (→MATCH-11). */
const term = (value: number, level: number) =>
  (Math.max(1, value * level) / AC.attributeScale) ** AC.attributePower;

function elevenOf(xi: Player[], tactic: Tactic): Eleven {
  let byTactic = elevens.get(xi);
  if (!byTactic) elevens.set(xi, (byTactic = new Map()));
  let out = byTactic.get(tactic);
  if (out) return out;
  const slots = FORMATIONS[tactic].slots;
  const weight = (
    slot: number,
    table: Readonly<Record<Line, number>>,
    action: MatchAction,
    value: number,
    level: number,
  ) => {
    const p = xi[slot]!;
    return (
      table[lineOf(slots[slot]!.position)] *
      actionWeight(slots[slot]!.role, p.traits, action) *
      term(value, level)
    );
  };
  out = {
    shot: [],
    outside: [],
    header: [],
    through: [],
    cross: [],
    taker: 1,
    kickers: [],
    kick: [],
    keeping: 0,
  };
  let best = -Infinity;
  for (let slot = 0; slot < xi.length; slot++) {
    const p = xi[slot]!,
      a = p.attrs,
      position = slots[slot]!.position;
    const level = levelFactor(p.positions, position);
    out.shot.push(weight(slot, AC.shot, 'box', a.finishing, level));
    out.outside.push(weight(slot, AC.outsideShot, 'long', a.finishing, level));
    out.header.push(weight(slot, AC.header, 'aerial', a.heading, level));
    out.through.push(weight(slot, AC.through, 'key', a.vision, level));
    // Crosses come from the flanks (the aggregate path's `wide`).
    out.cross.push(
      weight(slot, AC.through, 'cross', a.crossing, level) * (isWide(position) ? AC.wide : 1),
    );
    // The penalty taker's and the shoot-out's keys (grid/setup.ts `takersFor`).
    const kick = (0.6 * a.finishing + 0.4 * a.composure) * level;
    out.kick.push(kick);
    if (slot > 0 && kick > best) [best, out.taker] = [kick, slot];
  }
  out.keeping = xi[0]!.attrs.reflexes * levelFactor(xi[0]!.positions, slots[0]!.position);
  out.kickers = xi
    .map((_, slot) => slot)
    .filter((slot) => slot > 0)
    .sort((a, b) => out!.kick[b]! - out!.kick[a]! || a - b)
    .concat(0);
  byTactic.set(tactic, out);
  return out;
}

/** Knuth's Poisson draw. */
function poisson(r: () => number, mean: number) {
  const limit = exp(-mean);
  let k = 0,
    p = r();
  while (p > limit) {
    k++;
    p *= r();
  }
  return k;
}
/** A slot drawn by weight, never `except`; the last weighted one when rounding leaves none. */
function weighted(r: () => number, weights: readonly number[], except = -1) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (i !== except) total += weights[i]!;
  let u = r() * total;
  let last = except === 1 ? 2 : 1;
  for (let i = 0; i < weights.length; i++) {
    if (i === except || !(weights[i]! > 0)) continue;
    last = i;
    if ((u -= weights[i]!) <= 0) return i;
  }
  return last;
}

/**
 * A level tie's shoot-out (→MATCH-6) by the aggregate path's rule without its minutes: the
 * eleven kick best first and the keeper last, the home side first, five each until one side cannot
 * be caught, then sudden death; each kick goes in at the penalty chance against the keeper's 선방.
 */
function shootout(r: () => number, sides: readonly [Eleven, Eleven]): Score {
  const P = SHOT_CONFIG.penalty;
  const scored = [0, 0],
    taken = [0, 0];
  const kick = (side: 0 | 1) => {
    const own = sides[side],
      keeper = sides[side === 0 ? 1 : 0].keeping;
    const kicker = own.kickers[taken[side]! % own.kickers.length]!;
    const margin = (own.kick[kicker]! - keeper) * STRENGTH_CONFIG.skillScale;
    if (r() < clamp(P.base + margin / 300, P.min, P.max)) scored[side]!++;
    taken[side]!++;
  };
  const score = (): Score => ({ home: scored[0]!, away: scored[1]! });
  for (let round = 0; round < 5; round++)
    for (const side of [0, 1] as const) {
      kick(side);
      const left = (who: 0 | 1) => 5 - taken[who]!;
      if (scored[0]! + left(0) < scored[1]! || scored[1]! + left(1) < scored[0]!) return score();
    }
  while (scored[0] === scored[1]) {
    kick(0);
    kick(1);
  }
  return score();
}

/**
 * A fixture's result on the results-only path: the XIs `prepareMatch` would field, their strength,
 * each side's goals drawn from it, every goal named to a scorer (the best taker for a penalty, a
 * header or a shot by the attribution weights) and, unless a penalty, often to an assister. A tie
 * that `decide` finds level plays extra time and then a shoot-out. The same fixture always gives
 * the same result; the record carries no model, since it is not the full contract (→MATCH-26).
 */
export function resultsOnlyMatch(w: World, f: Fixture, decide?: DecideRule): MatchPlayback {
  const C = RESULTS_ONLY_CONFIG;
  const teams: [Club, Club] = [findClub(w, f.home), findClub(w, f.away)];
  const squads: [Player[], Player[]] = [
    startingSquad(w, teams[0], f),
    startingSquad(w, teams[1], f),
  ];
  const tactics: [Tactic, Tactic] = [npcTactic(teams[0]), npcTactic(teams[1])];
  const strength = npcStrength(w, f, teams, squads);
  const sides = [elevenOf(squads[0], tactics[0]), elevenOf(squads[1], tactics[1])] as const;
  const lines = squads.map((xi) => xi.map(() => zeroMetrics())) as [Metrics[], Metrics[]];
  const team: [Metrics, Metrics] = [zeroMetrics(), zeroMetrics()];
  const r = random(resultsKey(w, f));
  const G = C.goals,
    lift = G.perLevel * ((strength[0]! + strength[1]!) / 2 - G.level);
  const mean = (side: 0 | 1) =>
    exp(G.base + lift + G.perPoint * (strength[side]! - strength[side === 0 ? 1 : 0]!));
  const means = [mean(0), mean(1)];
  const assistOpen = C.assisted;
  const goal = (side: 0 | 1) => {
    const own = sides[side];
    const u = r();
    const kind =
      u < C.penalty
        ? 'penalty'
        : u < C.penalty + C.headed
          ? 'header'
          : u < C.penalty + C.headed + C.outside
            ? 'outside'
            : 'shot';
    const scorer =
      kind === 'penalty'
        ? own.taker
        : weighted(r, kind === 'header' ? own.header : kind === 'outside' ? own.outside : own.shot);
    lines[side][scorer]![M.goals]!++;
    team[side][M.goals]!++;
    if (kind === 'penalty' || r() >= assistOpen) return;
    const assister = weighted(r, kind === 'header' ? own.cross : own.through, scorer);
    lines[side][assister]![M.assists]!++;
    team[side][M.assists]!++;
  };
  const play = (share: number) => {
    const goals = [poisson(r, means[0]! * share), poisson(r, means[1]! * share)];
    for (const side of [0, 1] as const) for (let n = goals[side]!; n > 0; n--) goal(side);
  };
  play(1);
  let minutes = 90;
  let regulation: Score | undefined, settled: Score | undefined;
  const level = () => !!decide && isLevel(decide, team[0][M.goals]!, team[1][M.goals]!);
  if (level()) {
    regulation = { home: team[0][M.goals]!, away: team[1][M.goals]! };
    minutes = 120;
    play(C.extraTime);
    if (level()) settled = shootout(r, sides);
  }
  for (const side of [0, 1] as const) {
    team[side][M.minutes] = minutes;
    for (const row of lines[side]) row[M.minutes] = minutes;
  }
  const record: MatchRecord = {
    ...f,
    score: { home: team[0][M.goals]!, away: team[1][M.goals]! },
    metrics: team,
    players: squads.flatMap((xi, side) =>
      xi.map((p, slot) => ({ id: p.id, metrics: lines[side]![slot]! })),
    ),
    highlights: [],
    tactics,
    incidents: [],
    lineCounts: [squads[0].length, squads[1].length],
    ...(regulation && { regulation }),
    ...(settled && { shootout: settled }),
  };
  return { record, frames: [], squads };
}
