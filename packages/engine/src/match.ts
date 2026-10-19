import type {
  Club,
  Fixture,
  MatchEvent,
  MatchPlayback,
  MatchRecord,
  Player,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random, zeroMetrics } from './primitives';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../contracts/src/detail';
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
import { MatchMotion } from './motion';
export { MATCH_MOTION_CONFIG, motionTraits, teamMotionProfile, visibleEvents } from './motion';
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
type Zone = 0 | 1 | 2;
/** Skill offsets in the per-slot effective-skill table. */
/** The attributes a duel reads, per starting slot (→MATCH-11). */
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
const SHOT = 0,
  BOX = 1,
  LONG = 2,
  DRIBBLES = 3,
  CROSSES = 4,
  KEY_PASS = 5,
  PRESS = 6,
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
 * Named tuning surface for the duel chain. Starting XI slots: 0 GK, 1–4 DEF, 5–7 MID, 8–10 FWD.
 * Zones follow the attacking direction: 0 build-up, 1 midfield, 2 final third.
 */
export const MATCH_DUEL_CONFIG = {
  /** Pass attempts planned for one possession minute; a turnover ends the chain early. */
  passes: [11, 21] as const,
  /** Share of passes that try to move the ball into the next zone. */
  progressive: { balanced: 0.34, possession: 0.26, counter: 0.46, press: 0.38 } as Record<
    Tactic,
    number
  >,
  /** Share of passes played back into the previous zone to recycle possession. */
  backward: 0.16,
  progressivePenalty: 0.07,
  recyclingBonus: 0.035,
  /** Percentage-point weight of one passing/defense point against the team accuracy. */
  passerWeight: 1 / 380,
  markerWeight: 1 / 420,
  /**
   * A failed pass is lost to the marker this often (the first part counts as a tackle on the
   * passer, the rest as an interception); otherwise a teammate recovers the loose ball.
   */
  tackleShare: 0.22,
  interceptShare: 0.5,
  /** Share of midfield/final-third actions by a midfielder or forward that are dribbles. */
  dribbleShare: 0.08,
  /**
   * A flank player's final-third pass is a cross this often before his weight (about a dozen a
   * side a match); its completion between equal players is `crossSuccess`, the crosser's 크로스
   * against the defender's 공중볼 and the keeper's 공중볼 처리.
   */
  crossShare: 0.36,
  crossSuccess: 0.24,
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
  block: 0.25,
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
   * Where each tactic defends: pass success taken off the opponent while it builds up in its own
   * two thirds (`high`) and while it attacks the final third (`low`). Pressing wins the ball high
   * and leaves space behind; a counter side cedes the build-up and stays compact.
   */
  lines: {
    balanced: { high: 0, low: 0 },
    possession: { high: 0.02, low: 0 },
    counter: { high: -0.03, low: 0.035 },
    press: { high: 0.07, low: 0 },
  } as Record<Tactic, { high: number; low: number }>,
  /**
   * A minute that starts with the ball just won in the opponent's third: the chance rate rises by
   * this factor and the chance is a big one this much more often.
   */
  transition: { chance: 1.25, big: 0.15 },
} as const;

/**
 * Who carries the ball in each zone and who marks there, from a side's formation lines: defenders
 * build up, midfielders carry through the middle, forwards, the central midfielder and the flank
 * players who attack (wide midfielders, wing-backs, overlapping full-backs) reach the final third;
 * forwards mark the build-up, midfielders the middle, defenders the final third.
 */
interface SideLines {
  carriers: readonly (readonly number[])[];
  markers: readonly (readonly number[])[];
  kickoff: number;
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
      carriers: [df, mf, [...fw, central, ...flank]],
      markers: [fw, mf, df],
      kickoff: central,
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

/** Seconds of the minute for event `index` of `count`, spaced evenly inside the minute. */
const eventTime = (index: number, count: number) =>
  Math.round((3 + ((index + 0.5) * 54) / Math.max(1, count)) * 10) / 10;

// Shared chance model: the duel chain and the team-level summary resolve chances with the same
// functions, so both paths follow one calibrated strength curve (docs/CALIBRATION.md).
const C = MATCH_DUEL_CONFIG;
/** Diminishing returns on a skill margin: about linear up to half the saturation, then flat. */
const bend = (margin: number) => C.saturation * Math.tanh(margin / C.saturation);
/** The strength gap a match plays at: close to the gap up to ~15 points, never past the cap. */
export const effectiveGap = (gap: number) =>
  gap / Math.sqrt(Math.sqrt(1 + (gap / C.gapSaturation) ** 4));
/**
 * The other side starts a minute with the ball though no duel won it: the ball went out of play off
 * the side that held it (MATCH-12). After a shot it went behind off the keeper or a defender (a
 * corner); from the final third past the byline (a goal kick); anywhere else over a touchline (a
 * throw-in). Nothing is drawn, so outcomes stay where they were.
 */
const restartKind = (carrier: { zone: Zone; shot?: number }): NonNullable<MatchEvent['restart']> =>
  carrier.shot !== undefined ? 'corner' : carrier.zone === 2 ? 'goalKick' : 'throwIn';

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
const finishing = (shooting: number, keeping: number) =>
  Math.exp(bend(shooting - keeping) / C.finishing) * (1 + (shooting - 55) / C.sharpness);
/** Goal probability of a chance of quality `xg` for this shooter against this keeper. */
const goalChance = (xg: number, shooting: number, keeping: number) =>
  clamp(xg * finishing(shooting, keeping), 0.01, 0.8);
const targetChance = (goal: number, shooting: number) =>
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
  /** Where each side defends and how fast it tires: the tactic line plus the own build's cards. */
  lines: { high: number; low: number }[];
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
  const lines = tactics.map((tactic, side) => {
    const line = MATCH_DUEL_CONFIG.lines[tactic];
    return side === ownSide
      ? {
          high: line.high + style!.lineHigh + synergy!.lineHigh,
          low: line.low + style!.lineLow,
        }
      : line;
  });
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
    lines,
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
 * Own-club matches and fixtures whose players are recorded (own league scorers) play the duel
 * chain; every other fixture resolves with the same team formula without naming players.
 */
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  keepPlayers = false,
): MatchPlayback {
  const setup = prepareMatch(w, f);
  const { teams, squads, tactics } = setup;
  const [home, away] = teams;
  const own = home.id === w.playerClub || away.id === w.playerClub;
  if (!observe && !keepPlayers && !own) return summaryMatch(setup);
  const motion = observe
    ? new MatchMotion(
        `${w.seed}:${f.id}`,
        squads,
        tactics,
        teams.map((club, side) =>
          club.id === w.playerClub
            ? w.manager
            : {
                philosophy: tactics[side],
                ability: clamp(club.strength + 10),
                flexibility: 35 + (club.id.charCodeAt(club.id.length - 1) % 40),
              },
        ) as ConstructorParameters<typeof MatchMotion>[3],
      )
    : undefined;
  return duelMatch(setup, motion, keepPlayers || observe);
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
  const dribbles = shares(DRIBBLES, (line) => line === 'MF' || line === 'FW'),
    crosses = shares(CROSSES, (line, wide) => wide && line !== 'GK');
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
  /** The marker who closes a carrier down in `zone`: whoever presses hardest most often. */
  const chooseMarker = (side: Side, zone: Zone, u: number) =>
    weighted(sideLines(tactics[side]).markers[zone]!, u, actions[side], ACTIONS, PRESS);
  // How often a final-third pass finds each slot: playmakers and target men most (→MATCH-11).
  const receive = actions.map((table) => {
    const out = new Float64Array(11);
    for (let slot = 0; slot < 11; slot++)
      out[slot] = table[slot * ACTIONS + KEY_PASS]! * table[slot * ACTIONS + HOLD]!;
    return out;
  });
  return {
    base,
    skill,
    chooseHeader,
    chooseMarker,
    /** The defender who attacks a cross: the best in the air most often. */
    chooseAerial: (side: Side, u: number) =>
      weighted(sideLines(tactics[side]).markers[2]!, u, actions[side], ACTIONS, AERIAL),
    /** The final-third receiver of a pass from `from` among `pool`. */
    chooseReceiver: (side: Side, pool: readonly number[], u: number, from: number) =>
      weighted(pool, u, receive[side]!, 1, 0, from),
    /** A carrier's chance of a dribble, of a cross from the final third. */
    dribbleShare: (side: Side, slot: number) => C.dribbleShare * dribbles(side)[slot]!,
    crossShare: (side: Side, slot: number) => C.crossShare * crosses(side)[slot]!,
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
      const markers = sideLines(tactics[other]).markers[2]!;
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
 * Team-level minutes for fixtures nobody watches or records players for: the duel chain's chance
 * model without the pass-by-pass build-up, so both paths score on the same curve.
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
    // often; the duel chain's chance model decides the rest (a cross, a run, the shooter).
    const carrier = chooseReceiver(side, sideLines(tactics[side]).carriers[2]!, r(), -1);
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

/** Every action of a possession minute is a duel between named players (MATCH-11). */
function duelMatch(
  setup: MatchSetup,
  motion: MatchMotion | undefined,
  recordPlayers: boolean,
): MatchPlayback {
  const { f, r, squads, strength, tactics, profiles, possessionChance, lines } = setup;
  const c = MATCH_DUEL_CONFIG;
  const observe = !!motion;
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const contributions = squads.map((ps) => ps.map(() => zeroMetrics()));
  // Advanced counters (MATCH-13): team rows follow TD, player rows follow PD.
  const team: [number[], number[]] = [emptyTeamDetail(), emptyTeamDetail()];
  const personal = squads.map((ps) => ps.map(() => emptyPlayerDetail()));
  const frames: MatchPlayback['frames'] = [];
  const highlights: MatchRecord['highlights'] = [];
  const xg: [number, number] = [0, 0];
  const skills = matchSkills(setup),
    base = skills.base;
  let minute = 0;
  const skill = (side: Side, slot: number, key: number) => skills.skill(side, slot, key, minute);
  const credit = (side: Side, slot: number, metric: number) => {
    const row = contributions[side][slot];
    if (row) row[metric]++;
  };
  const note = (side: Side, slot: number, key: number, amount = 1) => {
    const row = personal[side][slot];
    if (row) row[key] += amount;
  };
  /** The other side won the ball from `side` in `zone`, by `slot`. */
  const regain = (side: Side, zone: Zone, slot: number) => {
    const winner: Side = side === 0 ? 1 : 0;
    if (zone <= 1) team[winner][TD.pressActions]++;
    if (zone === 0) {
      team[winner][TD.highTurnovers]++;
      note(winner, slot, PD.highTurnovers);
    }
  };
  // xG is recorded for an average finisher and keeper of this match's level, so goals minus xG
  // shows real finishing, goalkeeping and the day's form instead of a constant gap in weaker
  // leagues.
  const forwards = [0, 1].map((side) => sideLines(tactics[side]).markers[0]);
  const levelShooting =
      base.reduce(
        (sum, table, side) =>
          sum + forwards[side]!.reduce((s, slot) => s + table[slot * KEYS + FINISH], 0),
        0,
      ) / Math.max(1, forwards[0]!.length + forwards[1]!.length),
    levelKeeping = (base[0][KEEP] + base[1][KEEP]) / 2;
  const levelFactor = finishing(levelShooting, levelKeeping);
  /**
   * Who holds the ball as the minute ends; absent after a goal, when play restarts at kickoff.
   * After a shot, `shot` is the defender or keeper who touched it last.
   */
  let carrier: { side: Side; slot: number; zone: Zone; won?: boolean; shot?: number } | undefined;
  for (minute = 1; minute <= 90; minute++) {
    const side: Side = r() < possessionAt(possessionChance, metrics) ? 0 : 1;
    const other: Side = side === 0 ? 1 : 0;
    const planned = integer(r, c.passes[0], c.passes[1]);
    const accuracy =
      clamp(
        68 +
          strength[side] / 6 +
          profiles[side].pass -
          profiles[other].pressure +
          integer(r, -8, 8),
        35,
        96,
      ) / 100;
    const chanceRate = clamp(18 + profiles[side].shot - profiles[other].defense, 7, 30) / 100;
    // Winning the ball in the opponent's third and keeping it is the best playmaker.
    const transition = !!carrier?.won && carrier.side === side && carrier.zone === 2;
    const chance =
      r() < attemptChance(chanceRate, transition, metrics[side][0] - metrics[other][0]);
    metrics[side][11]++;
    let zone: Zone, slot: number;
    let restart: MatchEvent | undefined;
    if (!carrier) {
      zone = 1;
      slot = sideLines(tactics[side]).kickoff;
    } else if (carrier.side === side) {
      zone = carrier.zone;
      slot = carrier.slot;
    } else {
      // The ball went out off the other side where it held it: deep for them is high up for us.
      zone = (2 - carrier.zone) as Zone;
      slot = pick(sideLines(tactics[side]).carriers[zone], r());
      if (observe)
        restart = {
          t: 0,
          kind: 'restart',
          restart: restartKind(carrier),
          side,
          actor: slot,
          opponent: carrier.shot ?? carrier.slot,
          zone,
        };
    }
    carrier = undefined;
    const events: MatchEvent[] | undefined = observe ? (restart ? [restart] : []) : undefined;
    let action = '패스',
      actor = slot,
      lastPasser: number | undefined,
      ended = false;
    // A chance minute is a direct attack: a short build-up, then one key duel and a shot.
    const passes = chance
      ? 1 + Math.floor(r() * (tactics[side] === 'possession' ? 5 : 3))
      : planned;
    const progressive = c.progressive[tactics[side]];
    let lost = 1;
    for (let i = 0; i < passes && !ended; i++) {
      const u = r();
      const ownLine = sideLines(tactics[side]).line[slot];
      const canDribble = !chance && zone >= 1 && (ownLine === 'MF' || ownLine === 'FW');
      // A technician or a winger takes his man on more often than the side's other carriers.
      const dribbleShare = canDribble ? Math.min(0.5, skills.dribbleShare(side, slot)) : 0;
      if (canDribble && u < dribbleShare) {
        const defender = skills.chooseMarker(other, zone, u / dribbleShare);
        const beat = clamp(
          0.55 +
            (skill(side, slot, DRIBBLE) * 0.7 +
              skill(side, slot, PACE) * 0.3 -
              (skill(other, defender, TACKLE) * 0.7 + skill(other, defender, PACE) * 0.3)) /
              140,
          0.2,
          0.85,
        );
        const ok = r() < beat;
        team[side][TD.takeOns]++;
        note(side, slot, PD.takeOns);
        if (ok) {
          metrics[side][8]++;
          credit(side, slot, 8);
          zone = Math.min(2, zone + 1) as Zone;
          action = '돌파';
          actor = slot;
        } else {
          metrics[other][6]++;
          credit(other, defender, 6);
          regain(side, zone, defender);
          carrier = { side: other, slot: defender, zone: (2 - zone) as Zone, won: true };
          action = '태클';
          actor = defender;
          ended = true;
        }
        events?.push({
          t: 0,
          kind: 'dribble',
          side,
          actor: slot,
          opponent: defender,
          ok,
          lost: !ok,
          zone,
        });
        continue;
      }
      // A flank player in the final third crosses: the best header attacks it, a defender heads
      // it clear (→MATCH-11).
      const crossShare = !chance && zone === 2 ? Math.min(0.9, skills.crossShare(side, slot)) : 0;
      if (crossShare > 0 && r() < crossShare) {
        const target = skills.chooseHeader(side, r(), slot);
        const marker = skills.chooseAerial(other, r());
        const delivered = clamp(
          c.crossSuccess +
            (skill(side, slot, CROSS) -
              (skill(other, marker, HEAD) * 0.7 + skill(other, 0, HANDLE) * 0.3)) /
              150,
          0.1,
          0.6,
        );
        metrics[side][2]++;
        credit(side, slot, 2);
        team[side][TD.finalThirdPasses]++;
        note(side, slot, PD.finalThirdPasses);
        if (r() < delivered) {
          metrics[side][3]++;
          credit(side, slot, 3);
          team[side][TD.finalThirdCompleted]++;
          note(side, slot, PD.finalThirdCompleted);
          events?.push({
            t: 0,
            kind: 'pass',
            side,
            actor: slot,
            receiver: target,
            opponent: marker,
            ok: true,
            cross: true,
            zone: 2,
          });
          lastPasser = slot;
          slot = target;
          action = '크로스';
          actor = slot;
        } else {
          metrics[other][7]++;
          credit(other, marker, 7);
          regain(side, zone, marker);
          events?.push({
            t: 0,
            kind: 'pass',
            side,
            actor: slot,
            receiver: target,
            opponent: marker,
            ok: false,
            lost: true,
            cross: true,
            zone: 2,
          });
          carrier = { side: other, slot: marker, zone: 0, won: true };
          action = '인터셉트';
          actor = marker;
          ended = true;
        }
        continue;
      }
      // One draw picks the direction (forward, square, back) and who receives it.
      const v = canDribble ? (u - dribbleShare) / (1 - dribbleShare) : u;
      const low = zone < 2 ? progressive : 0,
        high = zone > 0 ? 1 - c.backward : 1;
      const forward = v < low,
        back = v >= high;
      const target = (forward ? zone + 1 : back ? zone - 1 : zone) as Zone;
      const pool = sideLines(tactics[side]).carriers[target];
      const within = forward ? v / low : back ? (v - high) / c.backward : (v - low) / (high - low);
      // Into the final third the ball finds playmakers and target men most often.
      let receiver =
        target === 2 ? skills.chooseReceiver(side, pool, within, slot) : pick(pool, within)!;
      if (receiver === slot) receiver = pool[(pool.indexOf(receiver) + 1) % pool.length];
      // Whoever presses hardest closes the passer down most often.
      const marker = skills.chooseMarker(other, zone, r());
      // A forward pass reads 시야, a keeper's pass 발밑, any other pass 패스 (→MATCH-11).
      const passing = slot === 0 ? DISTRIBUTE : forward ? VISION : PASS;
      const success = clamp(
        accuracy +
          (skill(side, slot, passing) - 55) * c.passerWeight -
          (skill(other, marker, POSITION) - 55) * c.markerWeight +
          (forward ? -c.progressivePenalty : c.recyclingBonus) -
          (zone <= 1 ? lines[other].high : lines[other].low),
        0.3,
        0.97,
      );
      metrics[side][2]++;
      credit(side, slot, 2);
      if (zone <= 1) team[side][TD.buildUpPasses]++;
      else {
        team[side][TD.finalThirdPasses]++;
        note(side, slot, PD.finalThirdPasses);
      }
      if (r() < success) {
        metrics[side][3]++;
        credit(side, slot, 3);
        if (zone === 2) {
          team[side][TD.finalThirdCompleted]++;
          note(side, slot, PD.finalThirdCompleted);
        }
        if (forward) {
          team[side][TD.progressivePasses]++;
          note(side, slot, PD.progressivePasses);
        }
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver,
          opponent: marker,
          ok: true,
          zone: target,
        });
        lastPasser = slot;
        slot = receiver;
        zone = target;
        action = '패스';
        actor = slot;
      } else if ((lost = chance ? 1 : r()) < c.interceptShare) {
        // The marker closes the passer down (a tackle) or reads the pass (an interception).
        const tackled = lost < c.tackleShare;
        metrics[other][tackled ? 6 : 7]++;
        credit(other, marker, tackled ? 6 : 7);
        regain(side, zone, marker);
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver: tackled ? undefined : receiver,
          opponent: marker,
          ok: false,
          lost: true,
          zone,
        });
        carrier = { side: other, slot: marker, zone: (2 - zone) as Zone, won: true };
        action = tackled ? '태클' : '인터셉트';
        actor = marker;
        ended = true;
      } else {
        // A loose ball: the intended receiver's line recovers it where it landed.
        events?.push({
          t: 0,
          kind: 'pass',
          side,
          actor: slot,
          receiver,
          opponent: marker,
          ok: false,
          zone,
        });
        lastPasser = undefined;
        slot = receiver;
        actor = slot;
      }
    }
    if (chance && !ended) {
      const made = skills.shapeChance(side, slot, minute, r);
      const { shooter, creator, defender, margin } = made;
      const flags = made.cross ? { cross: true } : {};
      const key = keyChance(margin);
      // The final ball is an attacking-third pass; a solo run is a take-on.
      if (creator !== undefined) {
        metrics[side][2]++;
        credit(side, creator, 2);
        team[side][TD.finalThirdPasses]++;
        note(side, creator, PD.finalThirdPasses);
      } else {
        team[side][TD.takeOns]++;
        note(side, shooter, PD.takeOns);
      }
      if (made.swept || r() >= key) {
        // The marker reads the final ball or stops the run, or the sweeper keeper comes off his
        // line for it: the chance never becomes a shot.
        const stopper = made.swept ? 0 : defender;
        if (creator !== undefined || made.swept) {
          metrics[other][7]++;
          credit(other, stopper, 7);
          action = '인터셉트';
        } else {
          metrics[other][6]++;
          credit(other, stopper, 6);
          action = '태클';
        }
        events?.push({
          t: 0,
          kind: creator === undefined ? 'dribble' : 'pass',
          side,
          actor: creator ?? shooter,
          receiver: creator === undefined ? undefined : shooter,
          opponent: stopper,
          ok: false,
          lost: true,
          ...flags,
          zone: 2,
        });
        carrier = { side: other, slot: stopper, zone: 0 };
        actor = stopper;
      } else {
        if (creator !== undefined) {
          metrics[side][3]++;
          credit(side, creator, 3);
          team[side][TD.finalThirdCompleted]++;
          note(side, creator, PD.finalThirdCompleted);
          if (zone < 2) {
            team[side][TD.progressivePasses]++;
            note(side, creator, PD.progressivePasses);
          }
          lastPasser = creator;
          events?.push({
            t: 0,
            kind: 'pass',
            side,
            actor: creator,
            receiver: shooter,
            opponent: defender,
            ok: true,
            ...flags,
            zone: 2,
          });
        } else {
          metrics[side][8]++;
          credit(side, shooter, 8);
          // Beating the last man alone makes the chance his own: no key pass, no assist.
          lastPasser = undefined;
          events?.push({
            t: 0,
            kind: 'dribble',
            side,
            actor: shooter,
            opponent: defender,
            ok: true,
            zone: 2,
          });
        }
        const quality = chanceQuality(r(), margin, transition, made.shape),
          chanceXg = quality.xg;
        const shooting = made.shooting;
        const goal = goalChance(chanceXg, shooting, skill(other, 0, KEEP)),
          onTarget = targetChance(goal, shooting);
        const blockChance = clamp(
          c.block + (skill(other, defender, POSITION) - 55) / 300,
          0.05,
          0.5,
        );
        const shotXg = Math.min(0.8, chanceXg * levelFactor);
        xg[side] += shotXg;
        metrics[side][4]++;
        credit(side, shooter, 4);
        const bigChance = quality.big,
          shotXg100 = Math.round(shotXg * 100);
        if (bigChance) team[side][TD.bigChances]++;
        if (quality.box) team[side][TD.boxShots]++;
        note(side, shooter, PD.xg, shotXg100);
        // The last completed pass before the shot is the key pass; it earns the shot's xG as xA.
        if (lastPasser !== undefined) {
          team[side][TD.keyPasses]++;
          note(side, lastPasser, PD.keyPasses);
          note(side, lastPasser, PD.xa, shotXg100);
          if (bigChance) note(side, lastPasser, PD.bigChancesCreated);
        }
        const shot = r();
        let outcome: NonNullable<MatchEvent['outcome']>;
        if (shot < onTarget) {
          metrics[side][5]++;
          credit(side, shooter, 5);
          if (shot < goal) {
            outcome = 'goal';
            metrics[side][0]++;
            credit(side, shooter, 0);
            if (bigChance) team[side][TD.bigChancesScored]++;
            if (lastPasser !== undefined) {
              metrics[side][1]++;
              credit(side, lastPasser, 1);
            }
            highlights.push({
              minute,
              side,
              player: squads[side][Math.min(shooter, squads[side].length - 1)].name,
              action: '골',
            });
            action = '골';
          } else {
            outcome = 'save';
            metrics[other][9]++;
            credit(other, 0, 9);
            carrier = { side: other, slot: 0, zone: 0, shot: 0 };
            action = '선방';
          }
        } else if ((shot - onTarget) / (1 - onTarget) < blockChance) {
          outcome = 'block';
          carrier = { side: other, slot: defender, zone: 0, shot: defender };
          action = '슛';
        } else {
          outcome = 'miss';
          // A goal kick; if the shooting side keeps the ball, it went wide off the defender.
          carrier = { side: other, slot: 0, zone: 0, shot: defender };
          action = '슛';
        }
        events?.push({
          t: 0,
          kind: 'shot',
          side,
          actor: shooter,
          opponent: outcome === 'save' || outcome === 'goal' ? 0 : defender,
          outcome,
          ...(made.cross ? { header: true } : {}),
          xg: Math.round(shotXg * 100) / 100,
          zone: 2,
        });
        actor = shooter;
      }
    }
    // Nothing lost and no shot: the same player keeps the ball into the next minute.
    if (!ended && !chance) carrier = { side, slot, zone };
    if (observe) {
      events!.forEach((event, index) => (event.t = eventTime(index, events!.length)));
      const last = events!.at(-1);
      const owner: Side = last?.lost ? other : side;
      const frame: MatchPlayback['frames'][number] = {
        minute,
        score: { home: metrics[0][0], away: metrics[1][0] },
        metrics: [metrics[0].slice(), metrics[1].slice()],
        ball: [owner === 0 ? 30 + zone * 25 : 70 - zone * 25, 50],
        side,
        player: actor,
        action,
        events,
        xg: [Math.round(xg[0] * 100) / 100, Math.round(xg[1] * 100) / 100],
      };
      Object.assign(frame, motion!.minute(frame));
      frames.push(frame);
    }
  }
  metrics[0][10] = 90;
  metrics[1][10] = 90;
  for (const ps of contributions) for (const s of ps) s[10] = 90;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    xg: [Math.round(xg[0] * 100) / 100, Math.round(xg[1] * 100) / 100],
    detail: team,
    players: recordPlayers
      ? squads.flatMap((ps, side) =>
          ps.map((p, i) => ({
            id: p.id,
            metrics: contributions[side][i],
            detail: personal[side][i],
          })),
        )
      : [],
    highlights,
    tactics,
  };
  return { record, frames, squads };
}
