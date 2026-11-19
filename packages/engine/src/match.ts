import { message as sourceMessage } from '../../contracts/src/messages';
import { MATCH_DUEL_CONFIG, effectiveGap } from './match-rules';
export {
  MATCH_DUEL_CONFIG,
  bend,
  effectiveGap,
  finishing,
  slotSkill,
  drainPerMinute,
  goalChance,
  targetChance,
} from './match-rules';
import type {
  Club,
  Fixture,
  MatchPlayback,
  Player,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, random } from './primitives';
import { cohesionMultiplier, ownMultiplier, slotOvr } from './player-state';
import { findClub, ratingOf, startingSquad } from './world';
import { FORMATIONS } from './player';
import { moraleStrength } from './morale';
import { npcTactic, ownTacticalProfile, tacticalProfile, type TacticalProfile } from './strategy';
import { managerStyleEffects, type StyleEffects } from './styles';
import { synergyEffects, type SynergyEffects } from './synergy';
import { buildEffects } from './build';
import { talismanStrength } from './owner-traits';
import { PORTABLE_MATH, type MatchMath } from './portable-math';
import {
  activeMatchModel,
  MATCH_MODEL_REVISION,
  type MatchModelRevision,
} from '../../contracts/src/match-model';
import { clubManager } from './managerMarket';
import {
  aggregateRecord,
  matchdayRosters,
  playAggregate,
  simulateAggregate,
} from './aggregate/engine';
import type { AggregateAttributionTrace } from './aggregate/types';
import { ownMatchPlayback } from './script/playback';
import { matchDetail } from './script/detail';
import { resultsOnlyMatch } from './results-only';
import { hasOwner } from './owner';
import { eraRules, type DecideRule } from './match/rules';
export { MATCH_MOTION_CONFIG, teamMotionProfile } from './match/motion';
export { matchdayRole, playerTendencies } from './match/tendencies';
export { actionWeight, ROLE_ACTION, TRAIT_ACTION, type MatchAction } from './match-weights';

type Side = 0 | 1;
const C = MATCH_DUEL_CONFIG;

/**
 * Each side's match-day form in rating points, drawn on its own stream so fast and observed runs
 * of a fixture share it. Form is fat-tailed (Laplace): most days sit near the usual level, a few
 * are far off it — the off days on which favourites drop points.
 */
export function matchForm(w: World, f: Fixture, math: MatchMath = PORTABLE_MATH): [number, number] {
  const r = random(`${w.seed}:form:${f.id}`);
  const draw = () => {
    const u = r() - 0.5;
    return clamp(
      (-Math.sign(u) * math.log(Math.max(1e-6, 1 - 2 * Math.abs(u))) * C.form) / Math.SQRT2,
      -3 * C.form,
      3 * C.form,
    );
  };
  return [draw(), draw()];
}

export interface MatchSetup {
  w: World;
  f: Fixture;
  r: () => number;
  squads: [Player[], Player[]];
  strength: number[];
  /**
   * Points added to every player's skills: the day's form, half the difference of what the sides
   * bring beyond their XI (home ground, manager, morale) — so a point of match strength is worth
   * the same in the duels whether it comes from the squad or from around it — and half the gap
   * that diminishing returns take away.
   */
  shift: number[];
  tactics: [Tactic, Tactic];
  /** Each side's multiplier: an own player's adaptation, another club's 조직력 (→MATCH-2). */
  multiplier: ((p: Player) => number)[];
  profiles: TacticalProfile[];
  possessionChance: number;
  /** How fast each side tires: the own manager style's drain. */
  drain: number[];
}

/** What a fixture needs before kick-off, whichever engine plays it. */
export interface Prepared extends MatchSetup {
  teams: [Club, Club];
  /** The side of the owner's club, when it plays. */
  ownSide?: Side;
  style?: StyleEffects;
  synergy?: SynergyEffects;
}

/** A club nobody owns adds its named manager on the own club's formula (→MATCH-2, STAFF-17). */
export function npcMatchContext(w: World, club: Club): number {
  return (clubManager(w, club).ability - 50) / 4;
}

/**
 * Measurement only (the match lab, →LAB-2): generated XIs in slot order and their tactics, played
 * by two host clubs nobody owns with no manager, morale or 조직력 term — only home ground.
 */
export interface LabFixture {
  xis: [Player[], Player[]];
  tactics: [Tactic, Tactic];
}
/** A lab XI's rating: its slot OVRs at its own tactic, fresh and fully adapted. */
const labRating = (xi: readonly Player[], tactic: Tactic) =>
  Math.round(xi.reduce((s, p, i) => s + slotOvr(p, FORMATIONS[tactic].slots[i]!), 0) / 11);

/** The home side's ground, in strength points (→MATCH-2). */
export const HOME_STRENGTH = 3;
/**
 * Each side's match strength from what it brings (`base`: its XI and context): the gap beyond what
 * diminishing returns let count is taken off both sides evenly (`ease`), and the day's `form`
 * comes on top, so a far stronger side's bad day still shows.
 */
export function formedStrength(
  base: readonly number[],
  form: readonly number[],
  math: MatchMath = PORTABLE_MATH,
) {
  const gap = base[0]! - base[1]!,
    ease = (effectiveGap(gap, math) - gap) / 2;
  return { ease, strength: [base[0]! + ease + form[0]!, base[1]! - ease + form[1]!] };
}
/**
 * Both sides' strength in a fixture between clubs nobody owns, as `prepareMatch` prepares it for
 * the same XIs (→MATCH-2): their rating, home ground, their managers, then the gap's diminishing
 * returns and the day's form. The results-only path reads it (→MATCH-22).
 */
export function npcStrength(
  w: World,
  f: Fixture,
  teams: readonly [Club, Club],
  squads: readonly [Player[], Player[]],
): number[] {
  const context = [HOME_STRENGTH + npcMatchContext(w, teams[0]), npcMatchContext(w, teams[1])];
  const base = [
    ratingOf(w, teams[0], squads[0]) + context[0]!,
    ratingOf(w, teams[1], squads[1]) + context[1]!,
  ];
  return formedStrength(base, matchForm(w, f)).strength;
}

export function prepareMatch(
  w: World,
  f: Fixture,
  math: MatchMath = PORTABLE_MATH,
  lab?: LabFixture,
): Prepared {
  const home = findClub(w, f.home),
    away = findClub(w, f.away);
  const teams: [Club, Club] = [home, away];
  const squads: [Player[], Player[]] = lab
    ? [lab.xis[0], lab.xis[1]]
    : [startingSquad(w, home, f), startingSquad(w, away, f)];
  const tactics: [Tactic, Tactic] =
    lab?.tactics ??
    (teams.map((c) => (c.id === w.playerClub ? w.tactic : npcTactic(c))) as [Tactic, Tactic]);
  // The own club's manager style, build and synergies; clubs nobody owns play their tactic.
  const ownSide = lab
    ? undefined
    : home.id === w.playerClub
      ? 0
      : away.id === w.playerClub
        ? 1
        : undefined;
  const style = ownSide === undefined ? undefined : managerStyleEffects(w);
  const synergy = ownSide === undefined ? undefined : synergyEffects(w);
  // 승리의 부적 lifts the own club alone, the one exception to equal terms (→OWNER-6).
  const ownStrength = (side: 0 | 1) =>
    (w.manager.ability - 50) / 4 +
    moraleStrength(w) +
    style!.strength +
    (side === 0 ? buildEffects(w).homeStrength : 0) +
    talismanStrength(w);
  // A club nobody owns adds its named manager on the own club's formula, its morale at the neutral
  // 60 adding nothing (→MATCH-2, T466). Styles stay the own club's (→STAFF-14).
  const sideContext = (side: 0 | 1) =>
    lab ? 0 : side === ownSide ? ownStrength(side) : npcMatchContext(w, teams[side]);
  // What each side brings beyond its XI: home ground, then the manager and morale terms.
  const context = [HOME_STRENGTH + sideContext(0), sideContext(1)];
  const form = matchForm(w, f, math);
  // The XIs just chosen are the ones `rating` would choose again (T450).
  const base = lab
    ? [labRating(squads[0], tactics[0]) + context[0], labRating(squads[1], tactics[1]) + context[1]]
    : [ratingOf(w, home, squads[0]) + context[0], ratingOf(w, away, squads[1]) + context[1]];
  const { ease, strength } = formedStrength(base, form, math);
  const shift = [
    form[0] + (context[0] - context[1]) / 2 + ease,
    form[1] + (context[1] - context[0]) / 2 - ease,
  ];
  const profiles = [0, 1].map((side) =>
    side === ownSide
      ? ownTacticalProfile(w, squads[side], tactics[side], tactics[1 - side])
      : tacticalProfile(squads[side], tactics[side], tactics[1 - side]),
  );
  const drain = [0, 1].map((side) => (side === ownSide ? style!.drain : 1));
  return {
    w,
    f,
    r: random(`${w.seed}:match:${f.id}`),
    squads,
    strength,
    shift,
    tactics,
    multiplier: teams.map((club) =>
      lab ? () => 1 : club.id === w.playerClub ? ownMultiplier : () => cohesionMultiplier(club),
    ),
    profiles,
    drain,
    possessionChance:
      clamp(
        50 + (strength[0] - strength[1]) / 2 + profiles[0].possession - profiles[1].possession,
        20,
        80,
      ) / 100,
    teams,
    ownSide,
    style,
    synergy,
  };
}

/**
 * A fixture asked of a world whose match model is not the released one (→SAVE-23): a career on an
 * earlier revision, or without a model, moves to the released one on its writer load before its
 * next fixture, so no earlier path is ever reached silently.
 */
export class UnreleasedMatchModelError extends Error {
  constructor(readonly revision: MatchModelRevision | undefined) {
    super(
      sourceMessage('copy.match.7c4e1d0a52', { p0: revision ?? '-', p1: MATCH_MODEL_REVISION }),
    );
    this.name = 'UnreleasedMatchModelError';
  }
}

/**
 * How a fixture is settled (→MATCH-22): before the takeover nobody owns a club and every fixture
 * is results-only (→WORLD-13); from it every fixture takes the aggregate path, the own club's with
 * transient action detail for its script and post-match material (→MATCH-38/25). A fixture takes
 * the same path observed or not (→MATCH-7); observing only stages its picture, and every record
 * keeps its lines. `decide` is a knockout tie's rule. The record passes the full record check once,
 * in `recordMatch`, before anything settles it (→MATCH-27).
 */
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  decide?: DecideRule,
): MatchPlayback {
  if (!hasOwner(w)) return resultsOnlyMatch(w, f, decide);
  const model = activeMatchModel(w);
  if (model !== MATCH_MODEL_REVISION) throw new UnreleasedMatchModelError(model);
  if (f.home !== w.playerClub && f.away !== w.playerClub) return simulateAggregate(w, f, decide);
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const match = playAggregate(w, f, prepared, rosters, decide, undefined, trace);
  const record = aggregateRecord(f, rosters, match, model);
  const managers = prepared.teams.map((club) =>
    club.id === w.playerClub ? w.manager : clubManager(w, club),
  );
  return ownMatchPlayback(record, rosters, () => matchDetail(match, rosters, trace), {
    managers,
    seed: `${w.seed}:${f.id}`,
    own: f.home === w.playerClub ? 0 : 1,
    observe,
  });
}
