import type {
  Club,
  Fixture,
  MatchPlayback,
  MatchRecord,
  Player,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random, zeroMetrics } from './primitives';
import type { PlayTrait, RoleId } from '../../contracts/src/player';
import {
  cohesionMultiplier,
  fatigueLoad,
  findClub,
  ownMultiplier,
  rating,
  startingSquad,
  unhappyPenalty,
} from './world';
import { FORMATIONS, isWide, levelFactor as positionLevelFactor, lineOf } from './player';
import { moraleStrength } from './morale';
import { npcTactic, ownTacticalProfile, tacticalProfile, type TacticalProfile } from './strategy';
import { managerStyleEffects, type StyleEffects } from './styles';
import { synergyEffects, type SynergyEffects } from './synergy';
import { buildEffects } from './build';
import { playGrid } from './grid/engine';
import { buildFrames } from './grid/playback';
import { buildGridSetup, type DecideRule } from './grid/setup';
export { MATCH_MOTION_CONFIG, motionTraits, teamMotionProfile } from './grid/playback';
export const METRICS = [
  '득점',
  '도움',
  '패스 시도',
  '패스 성공',
  '슛',
  '유효슛',
  '태클',
  '인터셉트',
  '드리블',
  '선방',
  '출전 분',
  '점유 분',
];

type Side = 0 | 1;
/** Skill offsets in the per-slot effective-skill table. */
/** The attributes a chance reads, per starting slot (→MATCH-11). */
const FINISH = 0,
  PASS = 1,
  VISION = 2,
  DRIBBLE = 3,
  PACE = 4,
  TACKLE = 5,
  POSITION = 6,
  KEEP = 7,
  STAMINA = 8,
  CROSS = 9,
  HEAD = 10,
  HANDLE = 11,
  DISTRIBUTE = 12,
  KEYS = 13;

/**
 * What a slot's role and a player's play traits make him attempt more (or less) often (→PLAYER-5,
 * PLAYER-9, MATCH-11). The weights only pick who does it: how many shots, passes and duels a side
 * plays stays as its tactical profile sets them.
 */
export type MatchAction =
  'shot' | 'box' | 'long' | 'dribble' | 'cross' | 'key' | 'press' | 'aerial' | 'run' | 'hold';
const MATCH_ACTIONS: readonly MatchAction[] = [
  'shot',
  'box',
  'long',
  'dribble',
  'cross',
  'key',
  'press',
  'aerial',
  'run',
  'hold',
];
export const ROLE_ACTION: Partial<Record<RoleId, Partial<Record<MatchAction, number>>>> = {
  stopper: { press: 1.2, aerial: 1.1 },
  ballPlayingDefender: { key: 1.1 },
  defensiveFullBack: { cross: 0.8 },
  overlappingFullBack: { cross: 1.3, run: 1.1 },
  invertedFullBack: { cross: 0.6, key: 1.1 },
  defensiveWingBack: { cross: 0.9 },
  attackingWingBack: { cross: 1.4, dribble: 1.1 },
  anchor: { press: 1.1 },
  ballWinner: { press: 1.5 },
  regista: { key: 1.4 },
  boxToBox: { run: 1.2, press: 1.2 },
  mezzala: { run: 1.2, key: 1.1 },
  deepLyingPlaymaker: { key: 1.3 },
  wideMidfielder: { cross: 1.3 },
  widePlaymaker: { key: 1.3, cross: 0.8 },
  attackingMidfielder: { key: 1.2, long: 1.2 },
  shadowStriker: { shot: 1.3, run: 1.3 },
  trequartista: { key: 1.4, dribble: 1.2 },
  traditionalWinger: { cross: 1.5, dribble: 1.2, shot: 0.8 },
  invertedWinger: { shot: 1.4, cross: 0.7, dribble: 1.2 },
  targetMan: { aerial: 1.6, hold: 1.4, shot: 1.1 },
  poacher: { box: 1.4, shot: 1.3 },
  falseNine: { key: 1.3, dribble: 1.2, shot: 0.8 },
  completeForward: { shot: 1.1, key: 1.1, aerial: 1.1 },
};
export const TRAIT_ACTION: Partial<Record<PlayTrait, Partial<Record<MatchAction, number>>>> = {
  workrate: { press: 1.2 },
  technician: { dribble: 1.4 },
  playmaker: { key: 1.4 },
  speedster: { run: 1.4 },
  linebreaker: { run: 1.3, shot: 1.1 },
  targetman: { aerial: 1.6, hold: 1.3 },
  longshot: { long: 1.5 },
  crosser: { cross: 1.5 },
  aerial: { aerial: 1.4 },
  tackler: { press: 1.2 },
  buildup: { key: 1.1 },
};
/** Offsets in MATCH_ACTIONS order; 3 (dribble) and 6 (press) only pick in the grid engine. */
const SHOT = 0,
  BOX = 1,
  LONG = 2,
  CROSSES = 4,
  KEY_PASS = 5,
  AERIAL = 7,
  RUN = 8,
  HOLD = 9,
  ACTIONS = 10;
const ROLE_VECTORS = new Map<RoleId, Float64Array>();
/** A role's multiplier for every action, in MATCH_ACTIONS order. */
function roleVector(role: RoleId) {
  let vector = ROLE_VECTORS.get(role);
  if (!vector) {
    vector = Float64Array.from(MATCH_ACTIONS, (action) => ROLE_ACTION[role]?.[action] ?? 1);
    ROLE_VECTORS.set(role, vector);
  }
  return vector;
}
const TRAIT_VECTORS = new WeakMap<readonly PlayTrait[], Float64Array>();
/** A player's traits' product for every action; traits are replaced, never edited in place. */
function traitVector(traits: readonly PlayTrait[]) {
  let vector = TRAIT_VECTORS.get(traits);
  if (!vector) {
    vector = Float64Array.from(MATCH_ACTIONS, (action) =>
      traits.reduce((product, trait) => product * (TRAIT_ACTION[trait]?.[action] ?? 1), 1),
    );
    TRAIT_VECTORS.set(traits, vector);
  }
  return vector;
}
/** A player's weight for an action at a slot: his role's times his traits', within 0.5–2. */
export function actionWeight(role: RoleId, traits: readonly PlayTrait[], action: MatchAction) {
  const i = MATCH_ACTIONS.indexOf(action);
  return clamp(roleVector(role)[i]! * traitVector(traits)[i]!, 0.5, 2);
}

/**
 * Named tuning surface for the probabilistic path's chance model (→MATCH-22) and the strength
 * curve both engines share. Starting XI slots: 0 GK, 1–4 DEF, 5–7 MID, 8–10 FWD.
 */
export const MATCH_DUEL_CONFIG = {
  /** A chance made by a flank player is a cross this often before his weight: then a header. */
  crossChance: 0.35,
  /**
   * A 스위퍼 키퍼 reads a ball in behind or a run through on goal this often between equal
   * players, on his 속도 and 발밑 against the runner's 속도 (→PLAYER-5).
   */
  sweep: 0.05,
  /** How much more often a runner (speedster, line breaker, shadow striker) takes a chance himself. */
  runShare: 0.5,
  /** Key-duel success between equal players. */
  keySuccess: 0.62,
  /** Chance attempts are the team chance rate divided by this realized key-duel success. */
  keyRealized: 0.6,
  /** Duel-margin points (after diminishing returns) per unit of key-duel success. */
  keyScale: 250,
  /**
   * Shot attempts per point of the team chance rate: open play plus the set pieces and second
   * balls the minute model folds in, so a side takes the 10–16 shots of a top-flight match.
   */
  volume: 1.7,
  /** Most of a side's possession minutes that can become chances. */
  attemptCap: 0.75,
  /** Big chance, box and long-range expected-goal bands (about 0.1 xG per shot overall). */
  chances: {
    big: [0.24, 0.43] as const,
    box: [0.068, 0.16] as const,
    long: [0.024, 0.056] as const,
  },
  bigShare: 0.13,
  /** Duel-margin points (after diminishing returns) per unit of big-chance share. */
  bigScale: 500,
  boxShare: 0.52,
  /**
   * Expected goals scale by exp(bent (shooter attack − keeper) / finishing) and by the shooter's
   * own attack against a 55 baseline, so sharper leagues finish slightly more chances.
   */
  finishing: 90,
  sharpness: 400,
  onTarget: 0.4,
  /** Key-duel and finishing margins between two players bend towards this many points (tanh). */
  saturation: 30,
  /**
   * Diminishing returns on the whole match: a strength gap g plays as g / (1 + (g / S)⁴)^¼ —
   * close to g up to about 15 points, never more than S. A far stronger side eases off and a far
   * weaker one parks the bus, so even a massive favourite still drops points.
   */
  gapSaturation: 24,
  /**
   * Score effects: per goal of lead (up to two) a side ahead sits deeper, ceding this share of
   * the ball and creating `leadEase` as much from what it keeps, so leads get defended,
   * equalisers come and routs stay rare.
   */
  leadPossession: 0.05,
  leadEase: 0.8,
  /**
   * Match-day form: each side's strength and every player's skills move by a seeded, fat-tailed
   * draw with this standard deviation in rating points (travel, rotation, a bad day at the
   * office). It comes on top of the diminishing returns, so it is what topples favourites.
   */
  form: 7,
  /** In-match fatigue: skill points lost by 90′ per missing stamina point. */
  drainPerStamina: 1 / 12,
  pressDrain: 1.3,
  /**
   * A minute that starts with the ball just won in the opponent's third: the chance rate rises by
   * this factor and the chance is a big one this much more often.
   */
  transition: { chance: 1.25, big: 0.15 },
} as const;

/**
 * Who carries the ball into the final third and who defends there, from a side's formation lines:
 * forwards, the central midfielder and the flank players who attack (wide midfielders, wing-backs,
 * overlapping full-backs) carry it; the defenders face them.
 */
interface SideLines {
  finalThird: readonly number[];
  defenders: readonly number[];
  line: readonly string[];
  /** Flank slots, whose final-third passes may be crosses. */
  wide: readonly boolean[];
  roles: readonly RoleId[];
}
const ATTACKING_FLANK: ReadonlySet<RoleId> = new Set([
  'overlappingFullBack',
  'attackingWingBack',
  'defensiveWingBack',
]);
const sideLinesCache = new Map<Tactic, SideLines>();
function sideLines(tactic: Tactic): SideLines {
  let lines = sideLinesCache.get(tactic);
  if (!lines) {
    const slots = FORMATIONS[tactic].slots;
    const line = slots.map((slot) => lineOf(slot.position));
    const wide = slots.map((slot) => isWide(slot.position));
    const of = (name: string) => line.flatMap((l, i) => (l === name ? [i] : []));
    const df = of('DF'),
      mf = of('MF'),
      fw = of('FW');
    const central = mf[Math.floor(mf.length / 2)]!;
    const flank = slots.flatMap((slot, i) =>
      wide[i] && (line[i] === 'MF' || ATTACKING_FLANK.has(slot.role)) ? [i] : [],
    );
    lines = {
      finalThird: [...fw, central, ...flank],
      defenders: df,
      line,
      wide,
      roles: slots.map((slot) => slot.role),
    };
    sideLinesCache.set(tactic, lines);
  }
  return lines;
}
const pick = (pool: readonly number[], u: number) =>
  pool[Math.min(pool.length - 1, Math.floor(u * pool.length))];
/**
 * One draw `u` picks a slot of `pool` in proportion to its entry in `weights` (a side's per-slot
 * table, `stride` entries a slot from `offset`); `except` is never picked.
 */
function weighted(
  pool: readonly number[],
  u: number,
  weights: ArrayLike<number>,
  stride = 1,
  offset = 0,
  except = -1,
) {
  let total = 0;
  for (const slot of pool) if (slot !== except) total += weights[slot * stride + offset]!;
  let target = u * total;
  for (const slot of pool) {
    if (slot === except) continue;
    target -= weights[slot * stride + offset]!;
    if (target <= 0) return slot;
  }
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i] !== except) return pool[i]!;
  return pool[0]!;
}
const OUTFIELD: readonly number[] = Array.from({ length: 10 }, (_, i) => i + 1);

// Shared chance model: the team-level summary and the grid engine's finishing use the same
// functions, so both paths follow one calibrated strength curve (docs/CALIBRATION.md).
const C = MATCH_DUEL_CONFIG;
/** Diminishing returns on a skill margin: about linear up to half the saturation, then flat. */
export const bend = (margin: number) => C.saturation * Math.tanh(margin / C.saturation);
/** The strength gap a match plays at: close to the gap up to ~15 points, never past the cap. */
export const effectiveGap = (gap: number) =>
  gap / Math.sqrt(Math.sqrt(1 + (gap / C.gapSaturation) ** 4));
/** The home side's chance to hold a minute once score effects shift the ball to the side behind. */
const possessionAt = (chance: number, metrics: number[][]) =>
  chance - C.leadPossession * clamp(metrics[0][0] - metrics[1][0], -2, 2);
/**
 * Chance attempts in one possession minute for a team chance rate; `lead` is the attacking side's
 * goal difference (score effects).
 */
const attemptChance = (chanceRate: number, transition: boolean, lead: number) =>
  Math.min(
    C.attemptCap,
    ((chanceRate * C.volume) / C.keyRealized) *
      (transition ? C.transition.chance : 1) *
      C.leadEase ** clamp(lead, 0, 2),
  );
/** The final ball or solo run beats the defender facing it. */
const keyChance = (margin: number) => clamp(C.keySuccess + bend(margin) / C.keyScale, 0.25, 0.92);
/**
 * One draw `u` sets the chance type and its quality; a wider duel margin makes better chances. The
 * shooter's weights move his other chances between the box and long range (a poacher's, a long
 * shooter's); a header is always a box chance.
 */
function chanceQuality(
  u: number,
  margin: number,
  transition: boolean,
  shape: { box: number; long: number; header?: boolean } = { box: 1, long: 1 },
) {
  if (shape.header) {
    const band = C.chances.box;
    return { xg: band[0] + (band[1] - band[0]) * u, big: false, box: true };
  }
  const big = transition
    ? clamp(C.bigShare + C.transition.big + bend(margin) / C.bigScale, 0.05, 0.5)
    : clamp(C.bigShare + bend(margin) / C.bigScale, 0.05, 0.3);
  const inBox = C.boxShare * shape.box,
    outside = (1 - big - C.boxShare) * shape.long,
    boxShare = ((1 - big) * inBox) / (inBox + outside),
    box = big + boxShare;
  const band = u < big ? C.chances.big : u < box ? C.chances.box : C.chances.long;
  const within = u < big ? u / big : u < box ? (u - big) / boxShare : (u - box) / (1 - box);
  return { xg: band[0] + (band[1] - band[0]) * within, big: u < big, box: u < box };
}
/** How much better than a chance's quality this shooter finishes against this keeper. */
export const finishing = (shooting: number, keeping: number) =>
  Math.exp(bend(shooting - keeping) / C.finishing) * (1 + (shooting - 55) / C.sharpness);
/** Goal probability of a chance of quality `xg` for this shooter against this keeper. */
export const goalChance = (xg: number, shooting: number, keeping: number) =>
  clamp(xg * finishing(shooting, keeping), 0.01, 0.8);
export const targetChance = (goal: number, shooting: number) =>
  clamp(goal + C.onTarget + (shooting - 55) / 250, goal + 0.05, 0.95);

/**
 * Each side's match-day form in rating points, drawn on its own stream so fast and observed runs
 * of a fixture share it. Form is fat-tailed (Laplace): most days sit near the usual level, a few
 * are far off it — the off days on which favourites drop points.
 */
export function matchForm(w: World, f: Fixture): [number, number] {
  const r = random(`${w.seed}:form:${f.id}`);
  const draw = () => {
    const u = r() - 0.5;
    return clamp(
      (-Math.sign(u) * Math.log(Math.max(1e-6, 1 - 2 * Math.abs(u))) * C.form) / Math.SQRT2,
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

export function prepareMatch(w: World, f: Fixture): Prepared {
  const home = findClub(w, f.home),
    away = findClub(w, f.away);
  const teams: [Club, Club] = [home, away];
  const squads: [Player[], Player[]] = [startingSquad(w, home), startingSquad(w, away)];
  const tactics: [Tactic, Tactic] = teams.map((c) =>
    c.id === w.playerClub ? w.tactic : npcTactic(c),
  ) as [Tactic, Tactic];
  // The own club's manager style, build and synergies; clubs nobody owns play their tactic.
  const ownSide = home.id === w.playerClub ? 0 : away.id === w.playerClub ? 1 : undefined;
  const style = ownSide === undefined ? undefined : managerStyleEffects(w);
  const synergy = ownSide === undefined ? undefined : synergyEffects(w);
  const ownStrength = (side: 0 | 1) =>
    (w.manager.ability - 50) / 4 +
    moraleStrength(w) +
    style!.strength +
    (side === 0 ? buildEffects(w).homeStrength : 0);
  // What each side brings beyond its XI: home ground, then the manager and morale terms.
  const context = [3 + (ownSide === 0 ? ownStrength(0) : 4), ownSide === 1 ? ownStrength(1) : 4];
  const form = matchForm(w, f);
  const base = [rating(w, home) + context[0], rating(w, away) + context[1]];
  // The gap beyond what diminishing returns let count is taken off both sides evenly; the day's
  // form comes on top, so a far stronger side's bad day still shows.
  const gap = base[0] - base[1],
    ease = (effectiveGap(gap) - gap) / 2;
  const strength = [base[0] + ease + form[0], base[1] - ease + form[1]];
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
      club.id === w.playerClub ? ownMultiplier : () => cohesionMultiplier(club),
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
 * Which engine plays fixtures between other clubs of the own league, whose players are recorded
 * (→MATCH-22); T224 sets it from the measured season budget.
 */
export const OWN_LEAGUE_ENGINE: 'grid' | 'summary' = 'grid';

/**
 * The own club's matches play the grid engine, and so do own-league fixtures while
 * `OWN_LEAGUE_ENGINE` is the grid; every other fixture takes the probabilistic path. A fixture
 * takes the same path observed or not (→MATCH-7, MATCH-22); observing only adds the frames.
 * `decide` is a knockout tie's rule, passed through to the grid engine (extra time →T222).
 */
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  keepPlayers = false,
  decide?: DecideRule,
): MatchPlayback {
  const own = f.home === w.playerClub || f.away === w.playerClub;
  if (own || (keepPlayers && OWN_LEAGUE_ENGINE === 'grid')) {
    // Lines are always kept here: recordMatch saves the own ones, the scorer table reads the rest.
    const setup = buildGridSetup(w, f, { observe, recordPlayers: true, ...(decide && { decide }) });
    const result = playGrid(setup);
    return {
      record: result.record,
      frames: observe ? buildFrames(result, setup, w.seed) : [],
      squads: setup.rosters,
    };
  }
  return summaryMatch(prepareMatch(w, f));
}

/**
 * Effective skills per starting slot: pre-match fatigue, an unhappy player's penalty (→CLUB-27),
 * the day's shift and in-match drain. A short list repeats its last player so no slot indexes past
 * the end.
 */
function matchSkills({ squads, tactics, multiplier, drain: drains, shift }: MatchSetup) {
  const base = squads.map((ps, side) => {
    const table = new Float64Array(11 * KEYS);
    const slots = FORMATIONS[tactics[side]].slots;
    for (let slot = 0; slot < 11; slot++) {
      const p = ps[Math.min(slot, ps.length - 1)];
      const load = fatigueLoad(p.fatigue),
        off = unhappyPenalty(p);
      // A player brings his level at the slot and his multiplier to every attribute (→MATCH-11).
      const scale = positionLevelFactor(p.positions, slots[slot]!.position) * multiplier[side](p);
      const a = p.attrs;
      const at = (key: number, value: number, keeper = false) =>
        (table[slot * KEYS + key] = value * scale - load / (keeper ? 10 : 8) - off);
      at(FINISH, a.finishing);
      at(PASS, a.passing);
      at(VISION, a.vision);
      at(DRIBBLE, a.dribbling);
      at(PACE, a.pace);
      at(TACKLE, a.tackling);
      at(POSITION, a.positioning);
      at(KEEP, a.reflexes, true);
      at(STAMINA, a.stamina);
      at(CROSS, a.crossing);
      at(HEAD, a.heading);
      at(HANDLE, a.handling, true);
      at(DISTRIBUTE, a.distribution);
    }
    return table;
  });
  // Each slot's weight for each action: its role's times its player's traits (→MATCH-11).
  const actions = squads.map((ps, side) => {
    const roles = sideLines(tactics[side]).roles;
    const table = new Float64Array(11 * ACTIONS);
    for (let slot = 0; slot < 11; slot++) {
      const role = roleVector(roles[slot]!),
        traits = traitVector(ps[Math.min(slot, ps.length - 1)].traits);
      for (let i = 0; i < ACTIONS; i++)
        table[slot * ACTIONS + i] = Math.min(2, Math.max(0.5, role[i]! * traits[i]!));
    }
    return table;
  });
  const weight = (side: Side, slot: number, action: number) =>
    actions[side][slot * ACTIONS + action]!;
  /**
   * Each slot's share of an action a side attempts, its weight over the mean of the slots that
   * may attempt it, so the side's total stays where it was (built when first needed).
   */
  const shares = (action: number, eligible: (line: string, wide: boolean) => boolean) => {
    const built: (Float64Array | undefined)[] = [undefined, undefined];
    return (side: Side) => {
      let share = built[side];
      if (!share) {
        const { line, wide } = sideLines(tactics[side]);
        share = new Float64Array(11);
        let total = 0,
          count = 0;
        for (let slot = 0; slot < 11; slot++)
          if (eligible(line[slot]!, wide[slot]!)) {
            total += weight(side, slot, action);
            count++;
          }
        for (let slot = 0; slot < 11; slot++)
          if (eligible(line[slot]!, wide[slot]!))
            share[slot] = (weight(side, slot, action) * count) / total;
        built[side] = share;
      }
      return share;
    };
  };
  const crosses = shares(CROSSES, (line, wide) => wide && line !== 'GK');
  const drain = squads.map((ps, side) => {
    const rate = new Float64Array(11);
    for (let slot = 0; slot < 11; slot++)
      rate[slot] =
        ((100 - ps[Math.min(slot, ps.length - 1)].attrs.stamina) *
          C.drainPerStamina *
          (tactics[side] === 'press' ? C.pressDrain : 1) *
          drains[side]) /
        90;
    return rate;
  });
  // Forwards take most shots, midfielders some, defenders the occasional set piece; roles and
  // traits tilt who among them (→MATCH-11). Headers go to whoever attacks the cross best.
  const lineWeight: Record<string, number> = { FW: 3, MF: 1.1, DF: 0.2, GK: 0 };
  const aerialWeight: Record<string, number> = { FW: 3, MF: 1, DF: 0.6, GK: 0 };
  const byLine = (side: number, key: number, action: number, lines: Record<string, number>) => {
    const line = sideLines(tactics[side]).line,
      table = base[side],
      out = new Float64Array(11);
    for (let slot = 1; slot < 11; slot++)
      out[slot] =
        Math.max(1, table[slot * KEYS + key]!) *
        lines[line[slot]!]! *
        actions[side][slot * ACTIONS + action]!;
    return out;
  };
  const shooterWeights = [0, 1].map((side) => byLine(side, FINISH, SHOT, lineWeight));
  const headerWeights: (Float64Array | undefined)[] = [undefined, undefined];
  const headers = (side: Side) =>
    (headerWeights[side] ||= byLine(side, HEAD, AERIAL, aerialWeight));
  const skill = (side: Side, slot: number, key: number, minute: number) =>
    base[side][slot * KEYS + key] + shift[side] - drain[side][slot] * minute;
  const chooseShooter = (side: Side, u: number) => weighted(OUTFIELD, u, shooterWeights[side]!);
  /** The box target for a cross from `from`, never the crosser himself. */
  const chooseHeader = (side: Side, u: number, from: number) =>
    weighted(OUTFIELD, u, headers(side), 1, 0, from);
  // How often a final-third pass finds each slot: playmakers and target men most (→MATCH-11).
  const receive = actions.map((table) => {
    const out = new Float64Array(11);
    for (let slot = 0; slot < 11; slot++)
      out[slot] = table[slot * ACTIONS + KEY_PASS]! * table[slot * ACTIONS + HOLD]!;
    return out;
  });
  return {
    skill,
    /** The final-third receiver of a pass from `from` among `pool`. */
    chooseReceiver: (side: Side, pool: readonly number[], u: number, from: number) =>
      weighted(pool, u, receive[side]!, 1, 0, from),
    /**
     * How a chance is made from the ball `carrier` holds (→MATCH-11): a flank player crosses as
     * often as his weight says and the best header attacks it; otherwise the shooter is drawn by
     * weight, and a runner takes it himself more often. The key duel's margin is the final ball
     * (or the run, or the cross and the header) against the defender facing it; a 스위퍼 키퍼 may
     * read a ball in behind first.
     */
    shapeChance: (side: Side, carrier: number, minute: number, r: () => number) => {
      const other: Side = side === 0 ? 1 : 0;
      const lines = sideLines(tactics[side]);
      const cross =
        lines.wide[carrier]! && r() < Math.min(0.9, C.crossChance * crosses(side)[carrier]!);
      let shooter = cross ? chooseHeader(side, r(), carrier) : chooseShooter(side, r());
      const runner = lines.line[carrier] === 'MF' || lines.line[carrier] === 'FW';
      if (!cross && runner && shooter !== carrier) {
        const run = weight(side, carrier, RUN) - 1;
        if (run > 0 && r() < run * C.runShare) shooter = carrier;
      }
      const creator = shooter === carrier ? undefined : carrier;
      const markers = sideLines(tactics[other]).defenders;
      // A cross is met by the best in the air; anything else by whoever faces it.
      const defender = cross
        ? weighted(markers, r(), actions[other], ACTIONS, AERIAL)
        : pick(markers, r())!;
      const at = (s: Side, slot: number, key: number) => skill(s, slot, key, minute);
      const attackValue =
        creator === undefined
          ? at(side, shooter, DRIBBLE) * 0.7 + at(side, shooter, PACE) * 0.3
          : cross
            ? at(side, creator, CROSS) * 0.5 + at(side, shooter, HEAD) * 0.5
            : at(side, creator, VISION) * 0.5 + at(side, shooter, FINISH) * 0.5;
      const defenceValue = cross
        ? at(other, defender, HEAD) * 0.7 + at(other, 0, HANDLE) * 0.3
        : (at(other, defender, TACKLE) + at(other, defender, POSITION)) / 2;
      // A sweeper keeper reads the through ball or the run in behind (never a cross).
      const keeper = sideLines(tactics[other]).roles[0] === 'sweeperKeeper';
      const swept =
        keeper &&
        !cross &&
        r() <
          clamp(
            C.sweep +
              (at(other, 0, PACE) * 0.5 +
                at(other, 0, DISTRIBUTE) * 0.5 -
                at(side, shooter, PACE)) /
                400,
            0.01,
            0.12,
          );
      return {
        shooter,
        creator,
        defender,
        cross,
        swept,
        margin: attackValue - defenceValue,
        shooting: at(side, shooter, cross ? HEAD : FINISH),
        shape: {
          box: weight(side, shooter, BOX),
          long: weight(side, shooter, LONG),
          header: cross,
        },
      };
    },
  };
}

/**
 * Team-level minutes for fixtures the grid engine does not play (→MATCH-22): a calibrated chance
 * model without the touches, on the same strength curve.
 */
function summaryMatch(setup: MatchSetup) {
  const { f, r, squads, strength, tactics, profiles, possessionChance } = setup;
  const { skill, shapeChance, chooseReceiver } = matchSkills(setup);
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const highlights: MatchRecord['highlights'] = [];
  for (let minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionAt(possessionChance, metrics) ? 0 : 1;
    const other: Side = side === 0 ? 1 : 0;
    const passCount = integer(r, 5, 12);
    const accuracy = clamp(
      68 + strength[side] / 6 + profiles[side].pass - profiles[other].pressure + integer(r, -8, 8),
      35,
      96,
    );
    const passes = Math.round((passCount * accuracy) / 100);
    metrics[side][11]++;
    metrics[side][2] += passCount;
    metrics[side][3] += passes;
    if (r() < 0.24) metrics[side][8]++;
    const chanceRate = clamp(18 + profiles[side].shot - profiles[other].defense, 7, 30) / 100;
    if (r() >= attemptChance(chanceRate, false, metrics[side][0] - metrics[other][0])) {
      if (passes < passCount) {
        metrics[other][6]++;
        metrics[other][7]++;
      }
      continue;
    }
    // The final ball comes from whoever carries it into the final third, the playmakers most
    // often; the chance model decides the rest (a cross, a run, the shooter).
    const carrier = chooseReceiver(side, sideLines(tactics[side]).finalThird, r(), -1);
    const made = shapeChance(side, carrier, minute, r);
    const shooter = made.shooter,
      solo = made.creator === undefined;
    if (made.swept) {
      metrics[other][7]++;
      continue;
    }
    if (r() >= keyChance(made.margin)) {
      metrics[other][solo ? 6 : 7]++;
      continue;
    }
    const { xg } = chanceQuality(r(), made.margin, false, made.shape);
    const shooting = made.shooting;
    const goal = goalChance(xg, shooting, skill(other, 0, KEEP, minute));
    const shot = r();
    metrics[side][4]++;
    if (shot >= targetChance(goal, shooting)) continue;
    metrics[side][5]++;
    if (shot >= goal) {
      metrics[other][9]++;
      continue;
    }
    metrics[side][0]++;
    if (!solo) metrics[side][1]++;
    highlights.push({
      minute,
      side,
      player: squads[side][Math.min(shooter, squads[side].length - 1)].name,
      action: '골',
    });
  }
  metrics[0][10] = 90;
  metrics[1][10] = 90;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    players: [],
    highlights,
    tactics,
  };
  return { record, frames: [], squads };
}
