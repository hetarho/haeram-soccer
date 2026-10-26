import {
  MATCH_DUEL_CONFIG,
  bend,
  effectiveGap,
  slotSkill,
  drainPerMinute,
  goalChance,
  targetChance,
} from './match-rules';
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
  Incident,
  MatchPlayback,
  MatchRecord,
  Player,
  Score,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random, zeroMetrics } from './primitives';
import type { RoleId } from '../../contracts/src/player';
import { cohesionMultiplier, findClub, ownMultiplier, ratingOf, startingSquad } from './world';
import { FORMATIONS, isWide, levelFactor as positionLevelFactor, lineOf } from './player';
import { moraleStrength } from './morale';
import { npcTactic, ownTacticalProfile, tacticalProfile, type TacticalProfile } from './strategy';
import { managerStyleEffects, type StyleEffects } from './styles';
import { synergyEffects, type SynergyEffects } from './synergy';
import { buildEffects } from './build';
import { injuryChance } from './careers';
import { HOST_MATH, type MatchMath } from './portable-math';
import {
  activeMatchModel,
  matchModelNumber,
  type MatchModelRevision,
} from '../../contracts/src/match-model';
import { clubManager } from './managerMarket';
import { simulateAggregate } from './aggregate/engine';
import { playGrid } from './grid/engine';
import { buildFrames } from './grid/playback';
import { buildGridSetup, isLevel, type DecideRule } from './grid/setup';
export { MATCH_MOTION_CONFIG, teamMotionProfile } from './grid/playback';
export { matchdayRole, playerTendencies } from './grid/tendencies';
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
import { roleVector, traitVector } from './match-weights';
export { actionWeight, ROLE_ACTION, TRAIT_ACTION, type MatchAction } from './match-weights';

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
// functions, so both paths follow one calibrated strength curve (MATCH-2). `math` is
// the host's `Math.*` unless the candidate grid passes its portable table (→ARCH-9, T358), so the
// summary and aggregate paths keep their bits.
const C = MATCH_DUEL_CONFIG;
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
/**
 * Each side's match-day form in rating points, drawn on its own stream so fast and observed runs
 * of a fixture share it. Form is fat-tailed (Laplace): most days sit near the usual level, a few
 * are far off it — the off days on which favourites drop points.
 */
export function matchForm(w: World, f: Fixture, math: MatchMath = HOST_MATH): [number, number] {
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

/**
 * `math` is the match's table: the candidate grid passes the portable one, so its day's form and
 * gap (every skill's shift) are the same on every host (→ARCH-9, T358). `model` is the revision
 * the fixture plays: the world's active model unless a grid setup names another.
 */
export function prepareMatch(
  w: World,
  f: Fixture,
  math: MatchMath = HOST_MATH,
  model: MatchModelRevision | undefined = activeMatchModel(w),
): Prepared {
  const home = findClub(w, f.home),
    away = findClub(w, f.away);
  const teams: [Club, Club] = [home, away];
  const squads: [Player[], Player[]] = [startingSquad(w, home, f), startingSquad(w, away, f)];
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
  // From revision 3 a club nobody owns adds its named manager on the own club's formula, its
  // morale at the neutral 60 adding nothing; earlier revisions and the pre-feature model keep a
  // flat 4 (→MATCH-2, T466). Styles stay the own club's (→STAFF-14).
  const symmetric = model !== undefined && matchModelNumber(model) >= 3;
  const sideContext = (side: 0 | 1) =>
    side === ownSide
      ? ownStrength(side)
      : symmetric
        ? (clubManager(w, teams[side]).ability - 50) / 4
        : 4;
  // What each side brings beyond its XI: home ground, then the manager and morale terms.
  const context = [3 + sideContext(0), sideContext(1)];
  const form = matchForm(w, f, math);
  // The XIs just chosen are the ones `rating` would choose again (T450).
  const base = [
    ratingOf(w, home, squads[0]) + context[0],
    ratingOf(w, away, squads[1]) + context[1],
  ];
  // The gap beyond what diminishing returns let count is taken off both sides evenly; the day's
  // form comes on top, so a far stronger side's bad day still shows.
  const gap = base[0] - base[1],
    ease = (effectiveGap(gap, math) - gap) / 2;
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
// T224: grid 42.7 s a season v rules 3.0.0 5.1 s (8.4×, over 125%); summary 8.4 s
// (artifacts/benchmarks/calibration-results.json).
export const OWN_LEAGUE_ENGINE: 'grid' | 'summary' = 'summary';
let ownLeagueEngine: 'grid' | 'summary' = OWN_LEAGUE_ENGINE;
/** Measurement only (scripts/season-throughput.ts): plays the own league on the other path. */
export function setOwnLeagueEngine(engine: 'grid' | 'summary') {
  ownLeagueEngine = engine;
}

/**
 * The own club's matches play the grid engine, and so do own-league fixtures while
 * `OWN_LEAGUE_ENGINE` is the grid; every other fixture takes the probabilistic path. A fixture
 * takes the same path observed or not (→MATCH-7, MATCH-22); observing only adds the frames.
 * `decide` is a knockout tie's rule, passed through to the grid engine (extra time →T222).
 * A world on the recognized candidate model dispatches by `candidateMatch` instead.
 */
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  keepPlayers = false,
  decide?: DecideRule,
): MatchPlayback {
  const own = f.home === w.playerClub || f.away === w.playerClub;
  if (activeMatchModel(w) !== undefined) return candidateMatch(w, f, own, observe, decide);
  if (own || (keepPlayers && ownLeagueEngine === 'grid')) {
    // Lines are always kept here: recordMatch saves the own ones, the scorer table reads the rest.
    const setup = buildGridSetup(w, f, { observe, recordPlayers: true, ...(decide && { decide }) });
    const result = playGrid(setup);
    return {
      record: result.record,
      frames: observe ? buildFrames(result, setup, w.seed) : [],
      squads: setup.rosters,
    };
  }
  return summaryMatch(prepareMatch(w, f), keepPlayers, decide);
}

/**
 * The recognized candidate model's dispatch (→MATCH-22, MATCH-26, SAVE-23): every own-club fixture
 * plays the detailed engine with all named lines, and every other one — its league, a cup, a
 * playoff or Europe — the complete aggregate path with the competition's knockout `decide`.
 * Observing adds the own match's frames only; `keepPlayers` and the measurement-only
 * `setOwnLeagueEngine` never reach this choice. Both results pass the shared full record check
 * once, in `recordMatch`, before anything settles them (→MATCH-27).
 */
function candidateMatch(
  w: World,
  f: Fixture,
  own: boolean,
  observe: boolean,
  decide?: DecideRule,
): MatchPlayback {
  if (!own) return simulateAggregate(w, f, decide);
  const setup = buildGridSetup(w, f, { observe, recordPlayers: true, ...(decide && { decide }) });
  const result = playGrid(setup);
  return {
    record: result.record,
    frames: observe ? buildFrames(result, setup, w.seed) : [],
    squads: setup.rosters,
  };
}

/**
 * A player's effective attribute at a slot before the day's shift and his minutes' drain
 * (→MATCH-11): the attribute's `value` times `scale` (his level at the slot times his side's
 * multiplier), less pre-match fatigue beyond fitness — a tenth of it on a keeper's reflexes and
 * handling, an eighth on the rest — and an unhappy player's penalty (→CLUB-27). The one formula
 * of the probabilistic chance model and the aggregate path's skill accessor.
 */
/**
 * Effective skills per starting slot: pre-match fatigue, an unhappy player's penalty (→CLUB-27),
 * the day's shift and in-match drain (`slotSkill`, `drainPerMinute`). A short list repeats its
 * last player so no slot indexes past the end.
 */
function matchSkills(setup: MatchSetup) {
  const { squads, tactics, multiplier, shift } = setup;
  const base = squads.map((ps, side) => {
    const table = new Float64Array(11 * KEYS);
    const slots = FORMATIONS[tactics[side]].slots;
    for (let slot = 0; slot < 11; slot++) {
      const p = ps[Math.min(slot, ps.length - 1)];
      // A player brings his level at the slot and his multiplier to every attribute (→MATCH-11).
      const scale = positionLevelFactor(p.positions, slots[slot]!.position) * multiplier[side](p);
      const a = p.attrs;
      const at = (key: number, value: number, keeper = false) =>
        (table[slot * KEYS + key] = slotSkill(p, value, scale, keeper));
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
      rate[slot] = drainPerMinute(
        setup,
        side as Side,
        ps[Math.min(slot, ps.length - 1)].attrs.stamina,
      );
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

/** A kick in a shoot-out off the grid goes in this often (→MATCH-6). */
export const SUMMARY_KICK = 0.76;
/** Five kicks each, the home side first, ending once one side cannot be caught, then sudden death. */
function summaryShootout(r: () => number): Score {
  const scored = [0, 0];
  for (let k = 0; k < 5; k++)
    for (const side of [0, 1]) {
      if (r() < SUMMARY_KICK) scored[side]!++;
      const left = [5 - k - 1, side === 0 ? 5 - k : 5 - k - 1];
      if (scored[0]! + left[0]! < scored[1]! || scored[1]! + left[1]! < scored[0]!)
        return { home: scored[0]!, away: scored[1]! };
    }
  while (scored[0] === scored[1])
    for (const side of [0, 1]) if (r() < SUMMARY_KICK) scored[side]!++;
  return { home: scored[0]!, away: scored[1]! };
}

/**
 * Cards per team on the probabilistic path: the grid engine's measured rates
 * (T215, artifacts/benchmarks/calibration-results.json:
 * 3.93 yellows and 0.14 reds a match), so a fixture nobody watches books players as often.
 */
export const SUMMARY_DISCIPLINE = { yellows: 1.97, reds: 0.07 };
/** How often each line is booked, relative to the others. */
const CARD_LINE_WEIGHT: Record<string, number> = { GK: 0.2, DF: 1.3, MF: 1.2, FW: 0.8 };
/** Knuth's Poisson draw. */
function poisson(r: () => number, mean: number) {
  const limit = Math.exp(-mean);
  let k = 0,
    p = r();
  while (p > limit) {
    k++;
    p *= r();
  }
  return k;
}
/**
 * Cards and injuries of a fixture on the probabilistic path (→MATCH-22, →LEAGUE-15), each from a
 * stream of its own so the score stream is untouched: named starters are booked by line, sent off
 * for a second yellow, a lost goal-scoring chance or serious foul play, and hurt at CLUB-23's
 * per-match rate.
 */
function summaryIncidents({ w, f, squads, tactics }: MatchSetup): Incident[] {
  const cards = random(`${w.seed}:discipline:${f.id}`),
    hurts = random(`${w.seed}:injury:${f.id}`);
  const incidents: Incident[] = [];
  const minute = (r: () => number, from = 1) => from + Math.floor((91 - from) * r());
  for (const side of [0, 1] as const) {
    const xi = [...new Set(squads[side].slice(0, 11))];
    const booked = new Map<string, number>(),
      sent = new Set<string>();
    const pick = (unbooked = false) => {
      const pool = xi.filter((p) => !sent.has(p.id) && !(unbooked && booked.has(p.id)));
      const total = pool.reduce((sum, p) => sum + CARD_LINE_WEIGHT[lineOf(p.position)]!, 0);
      let u = cards() * total;
      for (const p of pool) if ((u -= CARD_LINE_WEIGHT[lineOf(p.position)]!) < 0) return p;
      return pool.at(-1);
    };
    const book = (p: Player, reason: Incident['reason']) => {
      const first = booked.get(p.id);
      const at = minute(cards, first ?? 1);
      if (first === undefined) {
        booked.set(p.id, at);
        incidents.push({ minute: at, side, kind: 'yellow', player: p.id, reason });
      } else {
        sent.add(p.id);
        incidents.push({ minute: at, side, kind: 'secondYellow', player: p.id, reason });
      }
    };
    // Cautions go to players not yet booked; second yellows come with the red cards below.
    for (let n = poisson(cards, SUMMARY_DISCIPLINE.yellows); n > 0; n--) {
      const p = pick(true);
      if (p) book(p, 'reckless');
    }
    for (let n = poisson(cards, SUMMARY_DISCIPLINE.reds); n > 0; n--) {
      const p = pick();
      if (!p) break;
      const u = cards();
      // About 30% of reds are second yellows, the rest a lost chance or serious foul play.
      if (u < 0.3) {
        if (!booked.has(p.id)) book(p, 'reckless');
        book(p, 'reckless');
      } else {
        sent.add(p.id);
        const reason = u < 0.8 ? 'dogso' : 'serious';
        incidents.push({ minute: minute(cards), side, kind: 'red', player: p.id, reason });
      }
    }
    const pressing = tactics[side] === 'press';
    for (const p of xi)
      if (hurts() < injuryChance(p, pressing))
        incidents.push({ minute: minute(hurts), side, kind: 'injury', player: p.id });
  }
  return incidents.sort((a, b) => a.minute - b.minute);
}

/**
 * Team-level minutes for fixtures the grid engine does not play (→MATCH-22): a calibrated chance
 * model without the touches, on the same strength curve. With `keepPlayers` (the own league) the
 * starters get lines of 90 minutes with the shots, goals and assists the model already chose.
 */
function summaryMatch(setup: MatchSetup, keepPlayers = false, decide?: DecideRule) {
  const { f, r, squads, strength, tactics, profiles, possessionChance } = setup;
  const { skill, shapeChance, chooseReceiver } = matchSkills(setup);
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const starters = squads.map((squad) => [...new Set(squad.slice(0, 11))]);
  const lines = starters.map((squad) => squad.map(() => zeroMetrics()));
  const line = (side: Side, slot: number) => lines[side][Math.min(slot, lines[side].length - 1)]!;
  const highlights: MatchRecord['highlights'] = [];
  // One minute of the chance model; extra time plays more of the same minutes (→MATCH-6).
  const playMinute = (minute: number) => {
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
      return;
    }
    // The final ball comes from whoever carries it into the final third, the playmakers most
    // often; the chance model decides the rest (a cross, a run, the shooter).
    const carrier = chooseReceiver(side, sideLines(tactics[side]).finalThird, r(), -1);
    const made = shapeChance(side, carrier, minute, r);
    const shooter = made.shooter,
      solo = made.creator === undefined;
    if (made.swept) {
      metrics[other][7]++;
      return;
    }
    if (r() >= keyChance(made.margin)) {
      metrics[other][solo ? 6 : 7]++;
      return;
    }
    const { xg } = chanceQuality(r(), made.margin, false, made.shape);
    const shooting = made.shooting;
    const goal = goalChance(xg, shooting, skill(other, 0, KEEP, minute));
    const shot = r();
    metrics[side][4]++;
    line(side, shooter)[4]++;
    if (shot >= targetChance(goal, shooting)) return;
    metrics[side][5]++;
    line(side, shooter)[5]++;
    if (shot >= goal) {
      metrics[other][9]++;
      line(other, 0)[9]++;
      return;
    }
    metrics[side][0]++;
    line(side, shooter)[0]++;
    if (!solo) {
      metrics[side][1]++;
      line(side, made.creator!)[1]++;
    }
    highlights.push({
      minute,
      side,
      player: squads[side][Math.min(shooter, squads[side].length - 1)].name,
      action: '골',
    });
  };
  for (let minute = 1; minute <= 90; minute++) playMinute(minute);
  let end = 90;
  let regulation: Score | undefined, shootout: Score | undefined;
  if (decide && isLevel(decide, metrics[0][0]!, metrics[1][0]!)) {
    regulation = { home: metrics[0][0]!, away: metrics[1][0]! };
    for (end = 91; end <= 120; end++) playMinute(end);
    end = 120;
    if (isLevel(decide, metrics[0][0]!, metrics[1][0]!)) {
      shootout = summaryShootout(random(`${setup.w.seed}:shootout:${f.id}`));
      const side = shootout.home > shootout.away ? 0 : 1;
      highlights.push({
        minute: 120,
        side,
        player: '승부차기',
        action: `승부차기 ${side === 0 ? '홈' : '원정'} 승리`,
      });
    }
  }
  metrics[0][10] = end;
  metrics[1][10] = end;
  for (const side of lines) for (const row of side) row[10] = end;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    players: keepPlayers
      ? starters.flatMap((squad, side) =>
          squad.map((p, slot) => ({ id: p.id, metrics: lines[side][slot]! })),
        )
      : [],
    highlights,
    tactics,
    incidents: summaryIncidents(setup),
    ...(regulation && { regulation }),
    ...(shootout && { shootout }),
    ...(keepPlayers && {
      lineCounts: [starters[0].length, starters[1].length] as [number, number],
    }),
  };
  return { record, frames: [], squads };
}
