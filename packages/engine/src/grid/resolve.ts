/** Open-play resolution: every chosen action is settled by a duel between named players on their attributes (→MATCH-11, MATCH-13). */
import { ATTRIBUTES } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { actionWeight, finishing, goalChance, targetChance } from '../match';
import { FORMATIONS, lineOf } from '../player';
import { HOST_MATH, type MatchMath } from '../portable-math';
import { CELL_BASELINES } from './baselines';
import {
  attackFrame,
  BAND_EDGES,
  clamp,
  goalAngle,
  goalDistance,
  inBox,
  PITCH,
  toEngine,
  type Point,
} from './pitch';
import {
  onPitch,
  other,
  skill,
  slotOf,
  strengthScaled,
  type GridPlayer,
  type GridState,
} from './state';
import { TAG_CONFIG, type Tags } from './tags';
import type { Decision } from './decide';

type Kind = NonNullable<Decision['kind']>;
type Ref = [0 | 1, number];

/** `aerial`: an aerial duel decided this outcome, won by that side (post-match material, T223). */
export type Outcome =
  | { kind: 'complete'; to: [number, number]; receiver: number; aerial?: 0 | 1 }
  | { kind: 'intercepted'; by: number; at: [number, number] }
  | { kind: 'tackled'; by: number }
  | { kind: 'loose'; at: [number, number]; winner: Ref; aerial?: 0 | 1 }
  | { kind: 'out'; at: [number, number]; lastTouch: 0 | 1; over: 'touch' | 'byline' }
  /** `on` is the fouled player when he is not the one on the ball (a 50/50). */
  | { kind: 'foul'; by: number; at: [number, number]; on?: Ref }
  | { kind: 'held'; by?: number }
  | {
      kind: 'shot';
      shooter?: number;
      result: 'goal' | 'save' | 'block' | 'miss';
      xg: number;
      recordedXg: number;
      then?: 'corner' | 'loose' | 'hold' | 'goalKick';
      by?: number;
      header?: boolean;
      aerial?: 0 | 1;
    };
export type ShotOutcome = Extract<Outcome, { kind: 'shot' }>;

/** Initial values (design §7.1); T215 and T216 tune them. */
export const DUEL_CONFIG = {
  pass: {
    /** Calibration offset on every cell's real completion rate (T215). */
    base: 0.07,
    passer: 1 / 250,
    marker: 1 / 300,
    risk: 0.03,
    distance: 1 / 400,
    pressure: 0.015,
    min: 0.25,
    max: 0.97,
    lost: { intercepted: 0.07, loose: 0.81, out: 0.12 },
    /** The weight the receiver a failed pass did not reach has in the loose ball that follows (T215). */
    receiverLoose: 0.35,
  },
  cross: {
    base: 0.55,
    skill: 1 / 150,
    crowd: 0.015,
    min: 0.08,
    max: 0.6,
    claim: 0.1,
    failOut: 0.15,
    /** Of the failed deliveries that stay in play, the share a defender intercepts; he heads the rest clear (T215). */
    intercept: 0.4,
    /** How far below the best header a target may be: weight e per this many aerial points (T215). */
    targetSpread: 8,
    /** A cross the attacker wins that he brings down instead of heading at goal, in open play and at a set piece (T215). */
    control: { open: 0.8, setPiece: 0.05 },
  },
  cutBack: { base: 0.43, skill: 1 / 200, min: 0.2, max: 0.7 },
  takeOn: {
    skill: 1 / 285,
    min: 0.2,
    max: 0.62,
    fail: { tackle: 0.35, foul: 0.55, loose: 0.1 },
    /** Metres beyond the defender a won take-on ends: always the middle of this range, no draw. */
    past: [5, 8],
  },
  /** A defender in his own box keeps this share of his fouls; the rest become clean tackles (T215). */
  boxFoul: 0.035,
  /** Outside the box but in his own third a defender keeps this share of his fouls on a carrier, else holds off (T215). */
  thirdFoul: 0.3,
  /** A 50/50 for a loose ball ends in a foul on its winner this often (T215). */
  looseFoul: 0.08,
  carry: { lostScale: 2, skill: 1 / 120, min: 0.01, max: 0.35, foul: 0.8 },
  holdUp: { base: 0.6, skill: 1 / 150, min: 0.3, max: 0.85 },
  aerial: { skill: 1 / 150, base: 0.5, min: 0.15, max: 0.85 },
  clearance: { out: 0.35, reach: [25, 45] },
  /**
   * Candidate model only (T278, →MATCH-23): its continuous play stopped too rarely, with fouls,
   * throw-ins and penalty goals below their bands and the ball in play above. Challenges end in a
   * foul `foul` times as often (within what a duel allows) and a defender in his own box keeps
   * `boxFoul` of his fouls; a failed pass runs loose `passLoose` of the time instead of
   * `pass.lost.loose`, the rest leaving play, and `clearanceOut` of clearances go out for a throw-in.
   */
  candidate: {
    foul: 1.2,
    boxFoul: 0.05,
    passLoose: 0.8,
    clearanceOut: 0.5,
    /**
     * Pressing in the opponent's build-up (T370, →MATCH-8, MATCH-13): of the failed passes played
     * from below `upTo` m, the defending side's tactic intercepts this share in place of
     * `pass.lost.intercepted`, taken from the loose balls, so as many still leave play. Press reads
     * the build-up most and counter, engaging around halfway, least; PPDA and high turnovers come
     * inside MATCH-30's bands with tackles and interceptions still inside MATCH-23's.
     */
    intercept: {
      upTo: 70,
      share: {
        possession: 0.175,
        press: 0.195,
        counter: 0.155,
        balanced: 0.175,
      } satisfies Record<Tactic, number>,
    },
    /**
     * Restarts and finishers (T371, →MATCH-18, MATCH-23): of the failed open-play crosses this
     * share runs over the byline for a goal kick, in place of `cross.failOut`; a cross's target
     * spreads over the box's headers by `targetSpread` aerial points, in place of
     * `cross.targetSpread`. Of the failed crosses running out, the keeper gathers `crossKeeper`
     * before they cross the line (his 공중볼 처리 area, →MATCH-11), so play goes on from his hands.
     */
    crossFailOut: 0.15,
    crossKeeper: 0,
    targetSpread: 8,
  },
} as const;
/** Whether the fixture plays the candidate model, whose `candidate` settings apply. */
const onCandidate = (s: GridState) => s.setup.model !== undefined;
/** How much more often a challenge is a foul on this fixture's model. */
const foulScale = (s: GridState) => (onCandidate(s) ? DUEL_CONFIG.candidate.foul : 1);

/** Initial values (design §7.4). */
export const SHOT_CONFIG = {
  a: -1.0,
  b: -0.11,
  c: 1.6,
  header: 0.47,
  cutBack: 1.25,
  pressure: 0.25,
  /** The least a shot's pressure factor falls to, so two or more close markers never make xG negative (T215). */
  pressureFloor: 0.2,
  freeKickWall: 0.6,
  /** The pressure a header won against a marker is taken under (T215, T216). */
  headerPressure: 1,
  onTargetSkill: 1 / 250,
  /** Share of the shared on-target model's saves the grid keeps; the rest go wide (T215). */
  saveShare: 0.5,
  block: { base: 0.4, perDefender: 0.06, skill: 1 / 300, min: 0.05, max: 0.6, lane: 2 },
  save: { hold: 0.3, corner: 0.5, loose: 0.2 },
  blockThen: { corner: 0.65 },
  penalty: { base: 0.78, min: 0.6, max: 0.92, xg: 0.76 },
  maxXg: 0.8,
  /**
   * Candidate model only (T278, →MATCH-23): a header's chance quality, in place of `header`. T371:
   * a missed shot meets a defender on its line `blockBase` of the time before his numbers and
   * skill, in place of `block.base`.
   */
  candidate: { header: 0.42, blockBase: 0.4 },
} as const;

const sigmoid = (z: number, math: MatchMath) => 1 / (1 + math.exp(-z));
const slotPosition = (s: GridState, gp: GridPlayer) =>
  FORMATIONS[s.setup.tactics[gp.side]].slots[gp.slot]?.position;

/**
 * Chance quality of a shot from `p` (the shooter's attack frame): place, angle, kind and pressure;
 * `math` is the match's (`GridState.math`).
 */
export function chanceXg(
  p: Point,
  opts: {
    header?: boolean;
    cutBack?: boolean;
    pressure?: number;
    freeKick?: boolean;
    candidate?: boolean;
  } = {},
  math: MatchMath = HOST_MATH,
): number {
  const C = SHOT_CONFIG;
  const z = C.a + C.b * goalDistance(p, math) + C.c * goalAngle(p, math);
  return (
    sigmoid(z, math) *
    (opts.header ? (opts.candidate ? C.candidate.header : C.header) : 1) *
    (opts.cutBack ? C.cutBack : 1) *
    (opts.freeKick ? C.freeKickWall : 1) *
    Math.max(C.pressureFloor, 1 - C.pressure * (opts.pressure ?? 0))
  );
}

/** What the match needs once: the level finisher's factor recorded xG is scaled by. */
export interface ShotContext {
  levelFactor: number;
}

const ATTR = {
  finishing: ATTRIBUTES.indexOf('finishing'),
  reflexes: ATTRIBUTES.indexOf('reflexes'),
};

/** The factor of the level's average finisher (starting forwards of both sides) against the average keeper. */
export function shotContext(s: GridState): ShotContext {
  let shooting = 0,
    count = 0,
    keeping = 0;
  for (const side of [0, 1] as const) {
    for (const gp of s.players[side].slice(0, 11)) {
      if (slotPosition(s, gp) === 'GK') keeping += gp.base[ATTR.reflexes]!;
      else if (lineOf(slotPosition(s, gp)!) === 'FW') {
        shooting += gp.base[ATTR.finishing]!;
        count++;
      }
    }
  }
  return {
    levelFactor: finishing(
      count ? strengthScaled(s, shooting / count) : 55,
      strengthScaled(s, keeping / 2),
      s.math,
    ),
  };
}

/**
 * Distance from `p` to the segment `a`→`b`, and where along it (0–1) the nearest point lies;
 * `hypot` is the match's.
 */
function toSegment(
  p: Point,
  a: Point,
  b: Point,
  hypot: MatchMath['hypot'],
): { d: number; t: number } {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
  return { d: hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

function nearestToSegment(s: GridState, side: 0 | 1, a: Point, b: Point) {
  let best: { gp: GridPlayer; d: number; t: number } | undefined;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const q = toSegment(attackFrame(side, gp.pos), a, b, s.math.hypot);
    if (!best || q.d < best.d) best = { gp, ...q };
  }
  return best;
}

function laneRisk(s: GridState, side: 0 | 1, a: Point, b: Point): number {
  const { exp, hypot } = s.math;
  let risk = 0;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const o = attackFrame(side, gp.pos);
    const t = ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy) / len2;
    if (t > 0 && t < 1) risk += exp(-toSegment(o, a, b, hypot).d / 2);
  }
  return risk;
}

/**
 * The winner of a loose ball among the two nearest players of each side, weighted 1/(distance + 1); one draw.
 * `receiver`, the player a failed pass did not reach, weighs `DUEL_CONFIG.pass.receiverLoose` of that.
 */
export function looseWinner(s: GridState, at: Point, r: () => number, receiver?: Ref): Ref {
  const { hypot } = s.math;
  const near: { ref: Ref; w: number }[] = [];
  const weight = (side: 0 | 1, idx: number, d: number) =>
    (receiver && receiver[0] === side && receiver[1] === idx ? DUEL_CONFIG.pass.receiverLoose : 1) /
    (d + 1);
  for (const side of [0, 1] as const)
    near.push(
      ...s.players[side]
        .filter(onPitch)
        .map((gp) => ({
          ref: [side, gp.idx] as Ref,
          d: hypot(gp.pos[0] - at[0], gp.pos[1] - at[1]),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .map(({ ref, d }) => ({ ref, w: weight(ref[0], ref[1], d) })),
    );
  let u = r() * near.reduce((sum, n) => sum + n.w, 0);
  for (const n of near) {
    u -= n.w;
    if (u <= 0) return n.ref;
  }
  return near[near.length - 1]!.ref;
}

/** A 50/50 at `at`: the winner, or now and then (never in a box) a foul on him by the nearest opponent. */
export function looseBall(
  s: GridState,
  at: [number, number],
  r: () => number,
  receiver?: Ref,
): Outcome {
  const winner = looseWinner(s, at, r, receiver);
  const foe = other(winner[0]);
  if (inBox(attackFrame(winner[0], at)) || r() >= DUEL_CONFIG.looseFoul * foulScale(s))
    return { kind: 'loose', at, winner };
  let by: GridPlayer | undefined,
    d = Infinity;
  for (const gp of s.players[foe]) {
    if (!onPitch(gp)) continue;
    const v = s.math.hypot(gp.pos[0] - at[0], gp.pos[1] - at[1]);
    if (v < d) [by, d] = [gp, v];
  }
  if (!by) return { kind: 'loose', at, winner };
  return { kind: 'foul', by: by.idx, at, on: winner };
}

/** Where a ball played from `from` through `to` first leaves the pitch (engine frame). */
function exitPoint(from: Point, to: Point): { at: [number, number]; over: 'touch' | 'byline' } {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const tx = dx > 0 ? (PITCH.length - from[0]) / dx : dx < 0 ? -from[0] / dx : Infinity;
  const ty = dy > 0 ? (PITCH.width - from[1]) / dy : dy < 0 ? -from[1] / dy : Infinity;
  const t = Math.max(1, Math.min(tx, ty));
  return {
    at: [clamp(from[0] + dx * t, 0, PITCH.length), clamp(from[1] + dy * t, 0, PITCH.width)],
    over: ty < tx ? 'touch' : 'byline',
  };
}

/**
 * A pass. Draws, in order: completion; on failure the split; for a loose ball the winner.
 * Offside is checked by the caller before this resolves (T210). `at` (engine frame) is where the
 * ball is played when not to the receiver's feet: a through ball into his path (T324).
 */
export function resolvePass(
  s: GridState,
  side: 0 | 1,
  idx: number,
  target: number,
  tags: Tags,
  kind: Kind,
  lineBreaking: boolean,
  r: () => number,
  bonus = 0,
  at?: readonly [number, number],
): Outcome {
  const P = DUEL_CONFIG.pass;
  const from = attackFrame(side, s.players[side][idx]!.pos);
  const receiver = s.players[side][target]!;
  const to = attackFrame(side, at ?? receiver.pos);
  const dist = s.math.hypot(to[0] - from[0], to[1] - from[1]);
  const keeper = slotPosition(s, s.players[side][idx]!) === 'GK';
  const long = kind === 'long' || kind === 'through' || kind === 'switch' || lineBreaking;
  const passer = keeper
    ? skill(s, side, idx, 'distribution')
    : long
      ? (skill(s, side, idx, 'passing') + skill(s, side, idx, 'vision')) / 2
      : skill(s, side, idx, 'passing');
  const marker = nearestToSegment(s, side, from, to);
  const markerSkill = marker ? skill(s, other(side), marker.gp.idx, 'positioning') : 60;
  const base = CELL_BASELINES[tags.cell]!.passCompletion;
  const p = clamp(
    base +
      P.base +
      (passer - 60) * P.passer -
      (markerSkill - 60) * P.marker -
      P.risk * laneRisk(s, side, from, to) -
      Math.max(0, dist - 20) * P.distance -
      P.pressure * tags.pressure +
      s.setup.bends[side].pass / 100 +
      bonus,
    P.min,
    P.max,
  );
  if (r() < p) return { kind: 'complete', to: toEngine(side, to), receiver: target };
  const u = r();
  const I = DUEL_CONFIG.candidate.intercept;
  const intercepted =
    onCandidate(s) && from[0] < I.upTo ? I.share[s.setup.tactics[other(side)]] : P.lost.intercepted;
  if (u < intercepted && marker) {
    const at = toEngine(side, [
      from[0] + (to[0] - from[0]) * marker.t,
      from[1] + (to[1] - from[1]) * marker.t,
    ]);
    return { kind: 'intercepted', by: marker.gp.idx, at };
  }
  const loose = onCandidate(s) ? DUEL_CONFIG.candidate.passLoose : P.lost.loose;
  if (u < P.lost.intercepted + loose) return looseBall(s, toEngine(side, to), r, [side, target]);
  const exit = exitPoint(toEngine(side, from), toEngine(side, to));
  return { kind: 'out', at: exit.at, lastTouch: side, over: exit.over };
}

const aerialRating = (s: GridState, side: 0 | 1, idx: number, header: number) =>
  header * skill(s, side, idx, 'heading') + (1 - header) * skill(s, side, idx, 'strength');

/** An aerial duel at `at`: the attacker's chance by 0.6 heading + 0.4 strength against the defender's; one draw. */
export function resolveAerial(
  s: GridState,
  attacker: Ref,
  defender: Ref,
  at: Point,
  r: () => number,
): Outcome {
  const A = DUEL_CONFIG.aerial;
  const diff =
    aerialRating(s, attacker[0], attacker[1], 0.6) - aerialRating(s, defender[0], defender[1], 0.6);
  const winner = r() < clamp(A.base + diff * A.skill, A.min, A.max) ? attacker : defender;
  return { kind: 'loose', at: [at[0], at[1]], winner };
}

/** A shot by `(side, idx)` from where he stands: open play, a header, a cut-back chance or a direct free kick. */
export function resolveShot(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Pick<Tags, 'pressure'>,
  ctx: ShotContext,
  r: () => number,
  opts: { header?: boolean; cutBack?: boolean; freeKick?: boolean } = {},
): ShotOutcome {
  const C = SHOT_CONFIG;
  const from = attackFrame(side, s.players[side][idx]!.pos);
  const xg = chanceXg(
    from,
    {
      ...opts,
      pressure: tags.pressure,
      candidate: onCandidate(s),
    },
    s.math,
  );
  const hard = tags.pressure >= 1 || xg >= 0.3;
  const main = opts.header ? skill(s, side, idx, 'heading') : skill(s, side, idx, 'finishing');
  const shooting =
    (hard ? 0.65 : 0.8) * main + (hard ? 0.35 : 0.2) * skill(s, side, idx, 'composure');
  const keeper =
    s.players[other(side)].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[other(side)][0]!;
  const goal = goalChance(xg, shooting, skill(s, other(side), keeper.idx, 'reflexes'), s.math);
  const onTarget = targetChance(goal, shooting);
  const recordedXg = Math.min(C.maxXg, xg * ctx.levelFactor);
  const u = r();
  if (u < goal) return { kind: 'shot', shooter: idx, result: 'goal', xg, recordedXg };
  if (u < goal + (onTarget - goal) * C.saveShare) {
    const v = r();
    const then = v < C.save.hold ? 'hold' : v < C.save.hold + C.save.corner ? 'corner' : 'loose';
    return { kind: 'shot', shooter: idx, result: 'save', xg, recordedXg, then, by: keeper.idx };
  }
  // A miss: a defender on the shot line may have got in the way.
  const end: Point = [PITCH.length, PITCH.width / 2];
  let lane = 0,
    blocker: GridPlayer | undefined,
    near = Infinity;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp) || gp === keeper) continue;
    const q = toSegment(attackFrame(side, gp.pos), from, end, s.math.hypot);
    if (q.d <= C.block.lane) {
      lane++;
      if (q.d < near) [blocker, near] = [gp, q.d];
    }
  }
  const p = clamp(
    (onCandidate(s) ? C.candidate.blockBase : C.block.base) +
      C.block.perDefender * lane +
      (blocker ? (skill(s, other(side), blocker.idx, 'positioning') - 55) * C.block.skill : 0),
    C.block.min,
    C.block.max,
  );
  if (blocker && r() < p) {
    return {
      kind: 'shot',
      shooter: idx,
      result: 'block',
      xg,
      recordedXg,
      then: r() < C.blockThen.corner ? 'corner' : 'loose',
      by: blocker.idx,
    };
  }
  return { kind: 'shot', shooter: idx, result: 'miss', xg, recordedXg, then: 'goalKick' };
}

/**
 * The cross's target among the side's players inside the box: one draw weighted by 0.6 heading + 0.4 strength
 * (and the aerial habit), e per `DUEL_CONFIG.cross.targetSpread` points below the best.
 */
function headerTarget(
  s: GridState,
  side: 0 | 1,
  except: number,
  r: () => number,
): GridPlayer | undefined {
  const pool = s.players[side]
    .filter((gp) => gp.idx !== except && onPitch(gp) && inBox(attackFrame(side, gp.pos)))
    .map((gp) => ({
      gp,
      v:
        aerialRating(s, side, gp.idx, 0.6) *
        actionWeight(slotOf(s, gp).role, gp.player.traits, 'aerial'),
    }));
  if (!pool.length) return undefined;
  let top = -Infinity;
  for (const p of pool) top = Math.max(top, p.v);
  const { exp } = s.math;
  const spread = onCandidate(s)
    ? DUEL_CONFIG.candidate.targetSpread
    : DUEL_CONFIG.cross.targetSpread;
  const weights = pool.map((p) => exp((p.v - top) / spread));
  const total = weights.reduce((a, b) => a + b, 0);
  let u = r() * total;
  for (let i = 0; i < pool.length; i++) {
    u -= weights[i]!;
    if (u <= 0) return pool[i]!.gp;
  }
  return pool[pool.length - 1]!.gp;
}

/**
 * A cross. Draws, in order: the target; delivery; the keeper's claim; the aerial duel; controlled or headed; then
 * the header's draws. Delivered: the keeper claims, or the target and his marker duel in the air; the attacker who
 * wins it brings it down or heads it.
 */
export function resolveCross(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  ctx: ShotContext,
  r: () => number,
): Outcome {
  const X = DUEL_CONFIG.cross;
  const foe = other(side);
  const attacker = headerTarget(s, side, idx, r);
  const defenders = s.players[foe].filter((gp) => onPitch(gp) && inBox(attackFrame(side, gp.pos)));
  const attackers = s.players[side].filter(
    (gp) => gp.idx !== idx && onPitch(gp) && inBox(attackFrame(side, gp.pos)),
  );
  const p = clamp(
    X.base +
      (skill(s, side, idx, 'crossing') - 60) * X.skill -
      Math.max(0, defenders.length - attackers.length) * X.crowd,
    X.min,
    X.max,
  );
  const delivered = r() < p;
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp));
  if (!delivered || !attacker) {
    const out = r() < (onCandidate(s) ? DUEL_CONFIG.candidate.crossFailOut : X.failOut);
    const gathers = onCandidate(s) ? DUEL_CONFIG.candidate.crossKeeper : 0;
    if (out && keeper && gathers > 0 && r() < gathers) return { kind: 'held', by: keeper.idx };
    const at = toEngine(side, [
      PITCH.length,
      clamp(attackFrame(side, s.players[side][idx]!.pos)[1], 0, PITCH.width),
    ]);
    if (out) return { kind: 'out', at, lastTouch: side, over: 'byline' };
    const spot: Point = attacker
      ? attackFrame(side, attacker.pos)
      : [PITCH.length - 10, PITCH.width / 2];
    const by = nearestDefender(s, side, spot);
    if (r() < X.intercept) return { kind: 'intercepted', by, at: toEngine(side, spot) };
    return { kind: 'loose', at: toEngine(side, spot), winner: [foe, by] };
  }
  const claimP = X.claim + (keeper ? (skill(s, foe, keeper.idx, 'handling') - 60) / 400 : 0);
  if (keeper && r() < claimP) return { kind: 'held', by: keeper.idx };
  // His marker: the defender in the box nearest to him.
  const at = attackFrame(side, attacker.pos);
  const defender = defenders.reduce<{ gp: GridPlayer; d: number } | undefined>((best, gp) => {
    const o = attackFrame(side, gp.pos);
    const d = s.math.hypot(o[0] - at[0], o[1] - at[1]);
    return !best || d < best.d ? { gp, d } : best;
  }, undefined)?.gp;
  if (defender) {
    const duel = resolveAerial(
      s,
      [side, attacker.idx],
      [foe, defender.idx],
      [88.5, attackFrame(side, attacker.pos)[1]],
      r,
    );
    if (duel.kind === 'loose' && duel.winner[0] === foe) {
      const at = toEngine(side, [88.5, attackFrame(side, attacker.pos)[1]]);
      return { kind: 'loose', at, winner: duel.winner, aerial: foe };
    }
  }
  const aerial = defender ? { aerial: side } : {};
  if (r() < (tags.phase === 'setPiece' ? X.control.setPiece : X.control.open))
    return {
      kind: 'complete',
      to: [attacker.pos[0], attacker.pos[1]],
      receiver: attacker.idx,
      ...aerial,
    };
  // A header won against a marker is a header under pressure.
  const pressure = { pressure: defender ? SHOT_CONFIG.headerPressure : 0 };
  return {
    ...resolveShot(s, side, attacker.idx, pressure, ctx, r, { header: true }),
    header: true,
    ...aerial,
  };
}

/** The opponent nearest to `at` (the side's attack frame). */
function nearestOpponent(s: GridState, side: 0 | 1, at: Point): GridPlayer | undefined {
  let best: GridPlayer | undefined,
    d = Infinity;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const o = attackFrame(side, gp.pos);
    const v = s.math.hypot(o[0] - at[0], o[1] - at[1]);
    if (v < d) [best, d] = [gp, v];
  }
  return best;
}

const nearestDefender = (s: GridState, side: 0 | 1, at: Point) =>
  nearestOpponent(s, side, at)?.idx ?? 0;

/** A cut-back to a teammate in the box; the next action is a forced shot with `cutBack`. One draw. */
export function resolveCutBack(
  s: GridState,
  side: 0 | 1,
  idx: number,
  target: number,
  r: () => number,
): Outcome {
  const K = DUEL_CONFIG.cutBack;
  const to = attackFrame(side, s.players[side][target]!.pos);
  const p = clamp(K.base + (skill(s, side, idx, 'crossing') - 60) * K.skill, K.min, K.max);
  if (r() < p) return { kind: 'complete', to: toEngine(side, to), receiver: target };
  return { kind: 'intercepted', by: nearestDefender(s, side, to), at: toEngine(side, to) };
}

/** The share of his fouls a defender keeps where the carrier stands (attack frame): in his box, his third, elsewhere. */
const care = (s: GridState, c: Point) =>
  inBox(c)
    ? onCandidate(s)
      ? DUEL_CONFIG.candidate.boxFoul
      : DUEL_CONFIG.boxFoul
    : c[0] >= BAND_EDGES[5]
      ? DUEL_CONFIG.thirdFoul
      : 1;

/** The nearest opponent ahead of the carrier within the pressure radius. */
export function inFront(s: GridState, side: 0 | 1, idx: number): GridPlayer | undefined {
  const c = attackFrame(side, s.players[side][idx]!.pos);
  let best: GridPlayer | undefined,
    d: number = TAG_CONFIG.pressureRadius;
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp)) continue;
    const o = attackFrame(side, gp.pos);
    const v = s.math.hypot(o[0] - c[0], o[1] - c[1]);
    if (o[0] >= c[0] && v <= d) [best, d] = [gp, v];
  }
  return best;
}

/** A take-on. Draws: success; on failure the split; for a loose ball the winner. */
export function resolveTakeOn(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): Outcome {
  const T = DUEL_CONFIG.takeOn;
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const foe = inFront(s, side, idx);
  const past: Point = [
    Math.min(
      PITCH.length - 0.5,
      (foe ? attackFrame(side, foe.pos)[0] : c[0]) + T.past[0] + (T.past[1] - T.past[0]) / 2,
    ),
    c[1],
  ];
  if (!foe) return { kind: 'complete', to: toEngine(side, past), receiver: idx };
  const edge =
    0.7 * skill(s, side, idx, 'dribbling') +
    0.3 * skill(s, side, idx, 'pace') -
    0.7 * skill(s, foe.side, foe.idx, 'tackling') -
    0.3 * skill(s, foe.side, foe.idx, 'pace');
  const p = clamp((CELL_BASELINES[tags.cell]!.takeOnSuccess ?? 0.5) + edge * T.skill, T.min, T.max);
  if (r() < p) return { kind: 'complete', to: toEngine(side, past), receiver: idx };
  const u = r();
  // A booked defender, or one in his own box, is more careful: part of his foul share becomes a clean tackle.
  const foulShare = Math.min(
    T.fail.tackle + T.fail.foul,
    T.fail.foul * (foe.yellow ? 0.6 : 1) * care(s, c) * foulScale(s),
  );
  if (u < T.fail.tackle + (T.fail.foul - foulShare)) return { kind: 'tackled', by: foe.idx };
  if (u < T.fail.tackle + T.fail.foul)
    return { kind: 'foul', by: foe.idx, at: [me.pos[0], me.pos[1]] };
  const at: [number, number] = [me.pos[0], me.pos[1]];
  return { kind: 'loose', at, winner: looseWinner(s, at, r) };
}

/** A carry to `to` (engine frame); only under pressure can the carrier be dispossessed. Draws: loss; then the foul. */
export function resolveCarry(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  to: Point,
  r: () => number,
): Outcome {
  const K = DUEL_CONFIG.carry;
  const me = s.players[side][idx]!;
  const foe = nearestToSegment(s, side, attackFrame(side, me.pos), attackFrame(side, to));
  if (tags.pressure >= 1 && foe) {
    const lost = CELL_BASELINES[tags.cell]!.lostPer100 / 100;
    const edge = skill(s, foe.gp.side, foe.gp.idx, 'tackling') - skill(s, side, idx, 'dribbling');
    const p = clamp(lost * K.lostScale * (1 + edge * K.skill), K.min, K.max);
    if (r() < p) {
      // A booked defender, or one near his own goal, is careful: the challenge he holds back is no tackle either.
      const v = r();
      const foul = Math.min(
        1,
        K.foul * (foe.gp.yellow ? 0.6 : 1) * care(s, attackFrame(side, me.pos)) * foulScale(s),
      );
      if (v < foul) return { kind: 'foul', by: foe.gp.idx, at: [me.pos[0], me.pos[1]] };
      if (v >= Math.max(K.foul, foul)) return { kind: 'tackled', by: foe.gp.idx };
    }
  }
  return { kind: 'complete', to: [to[0], to[1]], receiver: idx };
}

/** A hold-up: a shielding duel on strength; one draw. */
export function resolveHoldUp(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const H = DUEL_CONFIG.holdUp;
  const me = s.players[side][idx]!;
  const foe = nearestOpponent(s, side, attackFrame(side, me.pos));
  if (!foe) return { kind: 'held' };
  const edge = skill(s, side, idx, 'strength') - skill(s, foe.side, foe.idx, 'strength');
  if (r() < clamp(H.base + edge * H.skill, H.min, H.max)) return { kind: 'held' };
  return { kind: 'tackled', by: foe.idx };
}

/** A clearance 25–45 m upfield. Draws: out; the distance; the second-ball winner. */
export function resolveClearance(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const K = DUEL_CONFIG.clearance;
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const out = r() < (onCandidate(s) ? DUEL_CONFIG.candidate.clearanceOut : K.out);
  const reach = K.reach[0] + (K.reach[1] - K.reach[0]) * r();
  const x = clamp(c[0] + reach, 0, PITCH.length);
  if (out) {
    const y = c[1] < PITCH.width / 2 ? 0 : PITCH.width;
    return { kind: 'out', at: toEngine(side, [x, y]), lastTouch: side, over: 'touch' };
  }
  return looseBall(s, toEngine(side, [x, c[1]]), r);
}

/** A penalty between kicker and keeper; one draw. Recorded as 0.76 xG. */
export function resolvePenalty(s: GridState, side: 0 | 1, idx: number, r: () => number): Outcome {
  const C = SHOT_CONFIG.penalty;
  const foe = other(side);
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp)) ?? s.players[foe][0]!;
  const kicker = 0.6 * skill(s, side, idx, 'finishing') + 0.4 * skill(s, side, idx, 'composure');
  const p = clamp(C.base + (kicker - skill(s, foe, keeper.idx, 'reflexes')) / 300, C.min, C.max);
  if (r() < p) return { kind: 'shot', shooter: idx, result: 'goal', xg: C.xg, recordedXg: C.xg };
  return {
    kind: 'shot',
    shooter: idx,
    result: 'save',
    xg: C.xg,
    recordedXg: C.xg,
    then: 'loose',
    by: keeper.idx,
  };
}
