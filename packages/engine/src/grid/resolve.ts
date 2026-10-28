/** Open-play resolution: every chosen action is settled by a duel between named players on their attributes (→MATCH-11, MATCH-13). */
import { ATTRIBUTES } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { actionWeight } from '../match-weights';
import { finishing, goalChance, targetChance } from '../match-rules';
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
import { modelAtLeast } from './rules';
import { TAG_CONFIG, type Tags } from './tags';
import type { Decision } from './decide';
import {
  BOX_CONFIG,
  DELIVERY_ACTION,
  deliveryPoint,
  deliveryReach,
  lofted,
  type DeliveryAim,
} from './box';
import { byId } from './coordination';
import { cleanReach, LANE_CONFIG, reachOnPath, type LaneReach } from './lanes';
import { flightSeconds, reachSeconds } from './movement';
import { speedOf } from './shape';

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
      /**
       * Candidate model (T445): a loose block or save's second ball — where the blocker or keeper
       * met the shot (`via`), where the ball meets its `winner` (`at`), all engine frame.
       */
      via?: [number, number];
      at?: [number, number];
      winner?: Ref;
    };
export type ShotOutcome = Extract<Outcome, { kind: 'shot' }>;

/** Initial values; T215 and T216 tune them. */
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
   * T371: `boxFoul` 0.05 → 0.06, so penalty goals reach MATCH-23's 6–9% (6.1% → 7.7%). T437:
   * `foul` 1.3, as more failed passes are cut out than run loose into a 50/50 (`intercept`), and
   * `boxFoul` 0.046, so a defender's fouls in his box hold where they were while play reaches the
   * box's edge more often than the goal area: fouls 9.96 → 10.32 a team, penalty goals 7.5 → 7.8%
   * (calibration round 74, core 600 matches).
   */
  candidate: {
    foul: 1.3,
    boxFoul: 0.046,
    /** Revision 4 (T482), in place of `cross.base`: a set-piece or crossed delivery's base chance. */
    revision4CrossBase: 0.7,
    /** Revision 4 (T482), in place of `foul`: how much more often a challenge is a foul. */
    revision4Foul: 1.5,
    // T398's `crossArriving` (a teammate on a box run counting more aerial-rating points as the
    // cross's target, neutral at 0) is gone: an open-play delivery's runner is drawn among the
    // zones attacked (T444, `BOX_CONFIG.delivery`, `resolveDelivery`).
    /**
     * A cross under pressure (T399, →MATCH-11): a crosser with a defender on him (his `pressure`
     * tag, up to 1) delivers `crossPressure` less often, the closed-down cross being blocked.
     * Neutral at 0. T399 keeps 0.15: cross completion 24.4 → 22.2% (MATCH-23 20–30%), with the
     * wing-back beside a back three closing the crosser (`SHAPE_CONFIG.candidate.flank`).
     */
    crossPressure: 0.15,
    passLoose: 0.8,
    /**
     * Revision 6 (T542, →MATCH-31): a failed pass neither cut out nor run loose by the draws above
     * ends `overrun` × its length past its target, at most `most` m; it leaves play only when that
     * point is off the pitch, and runs loose there otherwise.
     */
    misplaced: { overrun: 0.3, most: 10 },
    /**
     * A pass played within the final third (T411, →MATCH-13): from and to at least `from` m up
     * the pitch, completed `malus` less often, the crowded ground in front of the box. Neutral
     * at 0. T411 kept none: 0.15 with fewer entries (`DECISION_CONFIG.candidate.finalThird`) took
     * final-third passes completed 112 → 80 (inside), box entries 27 → 21 and xT 4.7 → 3.9 with
     * offsides and tackles held, but goals 2.89 → 2.5, since fewer completed balls there make fewer
     * chances.
     */
    finalThirdPass: { from: 70, malus: 0 },
    clearanceOut: 0.5,
    /**
     * Pressing in the opponent's build-up (T370, →MATCH-8, MATCH-13): of the failed passes played
     * from below `upTo` m, the defending side's tactic intercepts this share in place of
     * `pass.lost.intercepted`, taken from the loose balls, so as many still leave play. Press reads
     * the build-up most and counter, engaging around halfway, least; PPDA and high turnovers come
     * inside MATCH-30's bands with tackles and interceptions still inside MATCH-23's. T441: the
     * share (and `pass.lost.intercepted` from `upTo` on) splits only a failed pass an opponent
     * reaches (`reachOnPath`), who wins or deflects it; the rest are lost at the receiver.
     * T437: with only a reacher's share cut out (T441), interceptions fell to 7.7 a team, tackles
     * and interceptions to 22.9 and PPDA rose to 18.0, so the shares are 0.35–0.42: interceptions
     * 11.4, tackles and interceptions 26.7, PPDA 15.1, high turnovers 7.2 (MATCH-30 5.7–7.5, which
     * caps it; calibration round 74, core 600 matches). Counter, waiting at halfway for the pass it
     * reads, cuts out most: scaled alike (0.31), counter's win share against press fell 0.07
     * (MATCH-29); at 0.42 it holds where it was.
     */
    intercept: {
      upTo: 70,
      share: {
        possession: 0.35,
        press: 0.37,
        counter: 0.42,
        balanced: 0.35,
      } satisfies Record<Tactic, number>,
    },
    /**
     * Goal kicks (T371, →MATCH-11, MATCH-18): of the failed crosses running over the byline the
     * keeper gathers this share before they cross it, so play goes on from his hands and the
     * goal kicks come inside MATCH-23's 7–9 a team (9.35 → 8.71) without the extra
     * interceptions a cross kept in play would add.
     */
    crossKeeper: 0.47,
    /**
     * The deepest a won take-on ends (T437, →MATCH-11, the attack frame's metres), though always
     * a metre past the man he beat: a defender beaten in the box leaves the attacker a strike from
     * where he went past him, not a run into the six-yard box. Neutral at 104.5 (`takeOn.past`'s
     * own bound). T437 keeps 99, short of the goal area's band (99.5 m, where the shot's in-stride
     * carry would stay), with `DECISION_CONFIG.candidate.goalAreaCarry`.
     */
    takeOnDepth: 99,
  },
} as const;
/** Whether the fixture plays the candidate model, whose `candidate` settings apply. */
const onCandidate = (s: GridState) => s.setup.model !== undefined;
/** How much more often a challenge is a foul on this fixture's model. */
const foulScale = (s: GridState) =>
  !onCandidate(s)
    ? 1
    : modelAtLeast(s.setup, 4)
      ? DUEL_CONFIG.candidate.revision4Foul
      : DUEL_CONFIG.candidate.foul;

/** Initial values. */
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
  /** Candidate model only (T278, →MATCH-23): a header's chance quality, in place of `header`. */
  candidate: { header: 0.42 },
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

/** An outfield opponent in a shot's path (T445) and his chance to block it. */
export interface ShotBlocker {
  gp: GridPlayer;
  chance: number;
}

/**
 * The bodies in a shot from `from` (`side`'s attack frame) on the candidate model (→MATCH-35,
 * T445, `BOX_CONFIG.shot`): every outfield opponent on the pitch ahead of the ball and within
 * `lane` m of the triangle from it to the two posts, nearest the shooter first (equal distances by
 * player ID), each with his chance to block it: `block` × his nearness (1 at the ball, `far` at
 * the goal line, by how far along the line to the goal's middle he stands) × (1 + (위치선정 − 55)
 * × `SHOT_CONFIG.block.skill`), within 0–1; a header's `block` is scaled by `header` (T437).
 */
export function shotBlockers(
  s: GridState,
  side: 0 | 1,
  from: Point,
  header = false,
): ShotBlocker[] {
  const B = BOX_CONFIG.shot;
  const block = header ? B.block * B.header : B.block;
  const { hypot } = s.math;
  const goal: Point = [PITCH.length, PITCH.width / 2];
  const posts: [Point, Point] = [
    [PITCH.length, PITCH.width / 2 - BOX_CONFIG.post],
    [PITCH.length, PITCH.width / 2 + BOX_CONFIG.post],
  ];
  const gx = goal[0] - from[0],
    gy = goal[1] - from[1];
  const len2 = gx * gx + gy * gy;
  const cross = (o: Point, a: Point, p: Point) =>
    (a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]);
  const found: (ShotBlocker & { d: number })[] = [];
  for (const gp of s.players[other(side)]) {
    if (!onPitch(gp) || gp.slot <= 0) continue;
    const o = attackFrame(side, gp.pos);
    const along = len2 > 0 ? ((o[0] - from[0]) * gx + (o[1] - from[1]) * gy) / len2 : 0;
    if (along <= 0) continue;
    const [c1, c2, c3] = [
      cross(from, posts[0], o),
      cross(posts[0], posts[1], o),
      cross(posts[1], from, o),
    ];
    const inside = (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0);
    const gap = inside
      ? 0
      : Math.min(
          toSegment(o, from, posts[0], hypot).d,
          toSegment(o, posts[0], posts[1], hypot).d,
          toSegment(o, posts[1], from, hypot).d,
        );
    if (gap > B.lane) continue;
    const near = 1 - (1 - B.far) * Math.min(1, along);
    const read = 1 + (skill(s, other(side), gp.idx, 'positioning') - 55) * SHOT_CONFIG.block.skill;
    found.push({
      gp,
      chance: clamp(block * near * read, 0, 1),
      d: hypot(o[0] - from[0], o[1] - from[1]),
    });
  }
  found.sort((a, b) => a.d - b.d || byId(a.gp, b.gp));
  return found.map(({ gp, chance }) => ({ gp, chance }));
}

/** The chance that none of `blockers` blocks the shot (T445): the chance's share that reaches the keeper. */
export function unblocked(blockers: readonly ShotBlocker[]): number {
  let open = 1;
  for (const b of blockers) open *= 1 - b.chance;
  return open;
}

/**
 * A shot's loose second ball on the candidate model (→MATCH-31, MATCH-35, T445): it leaves `via`
 * (the blocker or the keeper, who met it) for `land` (`side`'s attack frame, kept on the pitch),
 * the shot struck `kickAt` seconds from now and reaching him its flight later. Whoever of either
 * side `reachOnPath` finds first on that path wins it where it meets him (the same point: more
 * time in hand first, then the defending side); with nobody reaching it the one who runs to its
 * resting place soonest (`reachSeconds`, equal times by player ID) wins it there. `via` himself
 * plays no part: he stands where he met the shot until it is won (`playGrid`'s motion).
 */
export function secondBall(
  s: GridState,
  side: 0 | 1,
  shooter: GridPlayer,
  via: GridPlayer,
  land: Point,
  kickAt: number,
): Required<Pick<ShotOutcome, 'via' | 'at' | 'winner'>> {
  const start: [number, number] = [via.pos[0], via.pos[1]];
  const end = toEngine(side, [
    clamp(land[0], 0.5, PITCH.length - 0.5),
    clamp(land[1], 0.5, PITCH.width - 0.5),
  ]);
  const off = kickAt + flightSeconds(shooter.pos, start, 'shot');
  const leave = (gp: GridPlayer) => gp === via;
  // `reachOnPath` reads the opponents of the side it is given: the defenders' first, then the
  // attackers', who take it only by meeting it earlier or, at the same point, with more in hand.
  const defence = reachOnPath(s, side, start, end, off, leave).first;
  const attack = reachOnPath(s, other(side), start, end, off, leave).first;
  const first =
    attack &&
    (!defence ||
      attack.along < defence.along ||
      (attack.along === defence.along && attack.spare > defence.spare))
      ? attack
      : defence;
  if (first) return { via: start, at: first.at, winner: [first.gp.side, first.gp.idx] };
  let best: { gp: GridPlayer; t: number } | undefined;
  for (const roster of [s.players[other(side)], s.players[side]])
    for (const gp of roster) {
      if (!onPitch(gp) || gp === via) continue;
      const t = reachSeconds(gp, end, speedOf(s, gp));
      if (!best || t < best.t || (t === best.t && byId(gp, best.gp) < 0)) best = { gp, t };
    }
  const winner = best?.gp ?? via;
  return { via: start, at: end, winner: [winner.side, winner.idx] };
}

/**
 * Where a blocked shot from `from` falls (T445, `side`'s attack frame): `rebound.block` m (one
 * draw) back toward the shooter from the blocker at `by`, or back along the shot when he stands on
 * the ball.
 */
export function blockRebound(from: Point, by: Point, r: () => number): Point {
  const [lo, hi] = BOX_CONFIG.shot.rebound.block;
  const d = lo + (hi - lo) * r();
  let dx = from[0] - by[0],
    dy = from[1] - by[1];
  let n = Math.sqrt(dx * dx + dy * dy);
  if (n < 0.1) {
    [dx, dy] = [from[0] - PITCH.length, from[1] - PITCH.width / 2];
    n = Math.sqrt(dx * dx + dy * dy) || 1;
  }
  return [by[0] + (dx / n) * d, by[1] + (dy / n) * d];
}

/**
 * Where a save the keeper at `keeper` parries loose falls (T445, the attack frame): `rebound.save`
 * m out from him, `rebound.wide` m sideways a metre out toward the side of the goal the shot came
 * from (`from`), one draw each; a shot from the goal's middle line (a penalty from its spot) is
 * pushed to a side one more draw picks.
 */
export function saveRebound(from: Point, keeper: Point, r: () => number): Point {
  const R = BOX_CONFIG.shot.rebound;
  const mid = PITCH.width / 2;
  const d = R.save[0] + (R.save[1] - R.save[0]) * r();
  const spread = R.wide[0] + (R.wide[1] - R.wide[0]) * r();
  const toward = from[1] < mid ? -1 : from[1] > mid ? 1 : r() < 0.5 ? -1 : 1;
  const wide = spread * toward;
  const n = Math.sqrt(1 + wide * wide);
  return [keeper[0] - d / n, keeper[1] + (wide / n) * d];
}

/** The pre-feature lane term: e^(−d/2) for each opponent beside the segment; the candidate reads `reachOnPath`. */
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
  if (dx === 0 && dy === 0) {
    // A ball played to where it already is (T437: on the candidate a carrier and his receiver
    // can stand on the same spot on a line, both kept on the pitch) has no direction to run in;
    // it leaves over the nearest line rather than at a position of 0 × ∞.
    const lines = [from[0], PITCH.length - from[0], from[1], PITCH.width - from[1]];
    const k = lines.indexOf(Math.min(...lines));
    const at: [number, number] = [
      k === 0 ? 0 : k === 1 ? PITCH.length : clamp(from[0], 0, PITCH.length),
      k === 2 ? 0 : k === 3 ? PITCH.width : clamp(from[1], 0, PITCH.width),
    ];
    return { at, over: k < 2 ? 'byline' : 'touch' };
  }
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
 *
 * On the candidate model (→MATCH-11, MATCH-31, T441) the lane is who reaches the ball's path,
 * kicked `kickAt` seconds from now (`reachOnPath`): the marker is the opponent it meets first, on
 * his 위치선정 (none: an even 60), a keeper's distribution's as any pass's (MATCH-11 r29), and the
 * lane term `LANE_CONFIG.risk` × the reaching opponents' summed weights. A failed pass the split
 * gives to an interception is that opponent's, and only when one reaches it: he wins it at his
 * reach point within `LANE_CONFIG.reach` with `LANE_CONFIG.sure` to spare, else deflects it loose
 * there; with nobody reaching it the ball is lost at its receiver (or out) instead.
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
  kickAt = 0,
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
  const lane = onCandidate(s)
    ? reachOnPath(s, side, s.players[side][idx]!.pos, at ?? receiver.pos, kickAt)
    : undefined;
  const first = lane?.first;
  // The defender the pass plays against (→MATCH-11): on the candidate the one who reaches its
  // path first, the pre-feature path's the one nearest the segment.
  const marker = lane ? undefined : nearestToSegment(s, side, from, to);
  const against = lane ? first?.gp : marker?.gp;
  const markerSkill = against ? skill(s, other(side), against.idx, 'positioning') : 60;
  const base = CELL_BASELINES[tags.cell]!.passCompletion;
  const p = clamp(
    base +
      P.base +
      (passer - 60) * P.passer -
      (markerSkill - 60) * P.marker -
      (lane ? LANE_CONFIG.risk * lane.weight : P.risk * laneRisk(s, side, from, to)) -
      Math.max(0, dist - 20) * P.distance -
      P.pressure * tags.pressure +
      s.setup.bends[side].pass / 100 +
      bonus -
      (onCandidate(s) &&
      from[0] >= DUEL_CONFIG.candidate.finalThirdPass.from &&
      to[0] >= DUEL_CONFIG.candidate.finalThirdPass.from
        ? DUEL_CONFIG.candidate.finalThirdPass.malus
        : 0),
    P.min,
    P.max,
  );
  if (r() < p) return { kind: 'complete', to: toEngine(side, to), receiver: target };
  const u = r();
  const I = DUEL_CONFIG.candidate.intercept;
  const intercepted =
    onCandidate(s) && from[0] < I.upTo ? I.share[s.setup.tactics[other(side)]] : P.lost.intercepted;
  if (lane) {
    if (u < intercepted && first)
      return cleanReach(first)
        ? { kind: 'intercepted', by: first.gp.idx, at: first.at }
        : looseBall(s, first.at, r, [side, target]);
  } else if (u < intercepted && marker) {
    const at = toEngine(side, [
      from[0] + (to[0] - from[0]) * marker.t,
      from[1] + (to[1] - from[1]) * marker.t,
    ]);
    return { kind: 'intercepted', by: marker.gp.idx, at };
  }
  const loose = onCandidate(s) ? DUEL_CONFIG.candidate.passLoose : P.lost.loose;
  if (u < P.lost.intercepted + loose) return looseBall(s, toEngine(side, to), r, [side, target]);
  // A misplaced pass runs a few metres past its target; only near a line does it leave play (T542).
  let end: Point = to;
  if (modelAtLeast(s.setup, 6) && dist > 0) {
    const M = DUEL_CONFIG.candidate.misplaced;
    const over = Math.min(M.most, M.overrun * dist);
    end = [to[0] + ((to[0] - from[0]) / dist) * over, to[1] + ((to[1] - from[1]) / dist) * over];
    // Nobody meant it for where it stops: its receiver has no head start there.
    if (end[0] >= 0 && end[0] <= PITCH.length && end[1] >= 0 && end[1] <= PITCH.width)
      return looseBall(s, toEngine(side, end), r);
  }
  const exit = exitPoint(toEngine(side, from), toEngine(side, end));
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

/**
 * A shot by `(side, idx)` from where he stands: open play, a header, a cut-back chance or a direct
 * free kick, struck `kickAt` seconds from now (its second ball's timing).
 *
 * On the candidate model (→MATCH-11, MATCH-35, T445) the bodies in its path come first: one draw
 * each, nearest the shooter first (`shotBlockers`), the first who blocks it ending it; only a shot
 * nobody blocks meets the keeper, whose part (`goalChance`) reads the chance's xG without them. Its
 * xG, recorded and for big chances, is that chance's times the share nobody blocks (`unblocked`).
 * A block that stays in play and a save the keeper parries loose fall where they would and go to
 * whoever reaches them first (`secondBall`).
 */
export function resolveShot(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Pick<Tags, 'pressure'>,
  ctx: ShotContext,
  r: () => number,
  opts: { header?: boolean; cutBack?: boolean; freeKick?: boolean; kickAt?: number } = {},
): ShotOutcome {
  const C = SHOT_CONFIG;
  const { kickAt = 0, ...kind } = opts;
  const me = s.players[side][idx]!;
  const from = attackFrame(side, me.pos);
  const xg = chanceXg(
    from,
    {
      ...kind,
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
  if (onCandidate(s)) {
    const blockers = shotBlockers(s, side, from, opts.header);
    const through = xg * unblocked(blockers);
    const shot = {
      kind: 'shot',
      shooter: idx,
      xg: through,
      recordedXg: Math.min(C.maxXg, through * ctx.levelFactor),
    } as const;
    for (const { gp, chance } of blockers) {
      if (r() >= chance) continue;
      const then = r() < C.blockThen.corner ? 'corner' : 'loose';
      const block = { ...shot, result: 'block', then, by: gp.idx } as const;
      if (then === 'corner') return block;
      const land = blockRebound(from, attackFrame(side, gp.pos), r);
      return { ...block, ...secondBall(s, side, me, gp, land, kickAt) };
    }
    const u = r();
    if (u < goal) return { ...shot, result: 'goal' };
    if (u >= goal + (onTarget - goal) * C.saveShare)
      return { ...shot, result: 'miss', then: 'goalKick' };
    const v = r();
    const then = v < C.save.hold ? 'hold' : v < C.save.hold + C.save.corner ? 'corner' : 'loose';
    const save = { ...shot, result: 'save', then, by: keeper.idx } as const;
    if (then !== 'loose') return save;
    const land = saveRebound(from, attackFrame(side, keeper.pos), r);
    return { ...save, ...secondBall(s, side, me, keeper, land, kickAt) };
  }
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
    C.block.base +
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
  const weights = pool.map((p) => exp((p.v - top) / DUEL_CONFIG.cross.targetSpread));
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
  const delivered = r() < crossChance(s, side, idx, tags);
  if (!delivered || !attacker) {
    const over = crossOverhit(s, side, idx, r);
    if (over) return over;
    const spot: Point = attacker
      ? attackFrame(side, attacker.pos)
      : [PITCH.length - 10, PITCH.width / 2];
    const by = nearestDefender(s, side, spot);
    if (r() < X.intercept) return { kind: 'intercepted', by, at: toEngine(side, spot) };
    return { kind: 'loose', at: toEngine(side, spot), winner: [foe, by] };
  }
  const won = aerialDelivery(s, side, attacker, tags, r, [attacker.pos[0], attacker.pos[1]]);
  if (won.kind !== 'header') return won;
  return {
    ...resolveShot(s, side, attacker.idx, { pressure: won.pressure }, ctx, r, { header: true }),
    header: true,
    ...(won.aerial === undefined ? {} : { aerial: won.aerial }),
  };
}

/**
 * A cross's delivery chance (→MATCH-11): the crosser's 크로스 against the box's crowd (defenders
 * beyond his teammates there) and, on the candidate model, the pressure on him (T399).
 */
function crossChance(s: GridState, side: 0 | 1, idx: number, tags: Pick<Tags, 'pressure'>) {
  const X = DUEL_CONFIG.cross;
  const inBoxOf = (sd: 0 | 1) =>
    s.players[sd].filter(
      (gp) => (sd !== side || gp.idx !== idx) && onPitch(gp) && inBox(attackFrame(side, gp.pos)),
    ).length;
  return clamp(
    (modelAtLeast(s.setup, 4) ? DUEL_CONFIG.candidate.revision4CrossBase : X.base) +
      (skill(s, side, idx, 'crossing') - 60) * X.skill -
      Math.max(0, inBoxOf(other(side)) - inBoxOf(side)) * X.crowd -
      (onCandidate(s) ? DUEL_CONFIG.candidate.crossPressure * Math.min(1, tags.pressure) : 0),
    X.min,
    X.max,
  );
}

/** A cut-back's delivery chance (→MATCH-11): the passer's 크로스. */
function cutBackChance(s: GridState, side: 0 | 1, idx: number) {
  const K = DUEL_CONFIG.cutBack;
  return clamp(K.base + (skill(s, side, idx, 'crossing') - 60) * K.skill, K.min, K.max);
}

/**
 * Where a failed cross of `idx` goes out of play, if it does: over the byline `cross.failOut` of
 * the time, the keeper gathering `candidate.crossKeeper` of those first on the candidate model
 * (T371). Undefined while it stays in play. One draw, and one more for the keeper.
 */
function crossOverhit(s: GridState, side: 0 | 1, idx: number, r: () => number) {
  const keeper = s.players[other(side)].find((gp) => gp.slot === 0 && onPitch(gp));
  const out = r() < DUEL_CONFIG.cross.failOut;
  if (out && keeper && onCandidate(s) && r() < DUEL_CONFIG.candidate.crossKeeper)
    return { kind: 'held' as const, by: keeper.idx };
  if (!out) return undefined;
  const at = toEngine(side, [
    PITCH.length,
    clamp(attackFrame(side, s.players[side][idx]!.pos)[1], 0, PITCH.width),
  ]);
  return { kind: 'out' as const, at, lastTouch: side, over: 'byline' as const };
}

/**
 * A cross delivered to `attacker` where it comes down, at `to` (engine frame). Draws, in order:
 * the keeper's claim (`claim` above `cross.claim`, T447); the aerial duel with his marker, `marker`
 * when given (T446: the man who got to a lofted delivery's drop first), else the defender in the box
 * nearest to `to`;
 * controlled or headed. Having won it he brings it down at `to`, or heads it at goal: a header,
 * whose draws the caller makes, under `SHOT_CONFIG.headerPressure` when a marker contested it.
 */
function aerialDelivery(
  s: GridState,
  side: 0 | 1,
  attacker: GridPlayer,
  tags: Pick<Tags, 'phase'>,
  r: () => number,
  to: [number, number],
  marker?: GridPlayer,
  claim = 0,
): Outcome | { kind: 'header'; pressure: number; aerial?: 0 | 1 } {
  const X = DUEL_CONFIG.cross;
  const foe = other(side);
  const keeper = s.players[foe].find((gp) => gp.slot === 0 && onPitch(gp));
  const claimP =
    X.claim + claim + (keeper ? (skill(s, foe, keeper.idx, 'handling') - 60) / 400 : 0);
  if (keeper && r() < claimP) return { kind: 'held', by: keeper.idx };
  const defenders = s.players[foe].filter((gp) => onPitch(gp) && inBox(attackFrame(side, gp.pos)));
  const at = attackFrame(side, to);
  const defender =
    marker ??
    defenders.reduce<{ gp: GridPlayer; d: number } | undefined>((best, gp) => {
      const o = attackFrame(side, gp.pos);
      const d = s.math.hypot(o[0] - at[0], o[1] - at[1]);
      return !best || d < best.d ? { gp, d } : best;
    }, undefined)?.gp;
  if (defender) {
    const duel = resolveAerial(s, [side, attacker.idx], [foe, defender.idx], [88.5, at[1]], r);
    if (duel.kind === 'loose' && duel.winner[0] === foe)
      return { kind: 'loose', at: toEngine(side, [88.5, at[1]]), winner: duel.winner, aerial: foe };
  }
  const aerial = defender ? { aerial: side } : {};
  if (r() < (tags.phase === 'setPiece' ? X.control.setPiece : X.control.open))
    return { kind: 'complete', to, receiver: attacker.idx, ...aerial };
  // A header won against a marker is a header under pressure.
  return { kind: 'header', pressure: defender ? SHOT_CONFIG.headerPressure : 0, ...aerial };
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
  const to = attackFrame(side, s.players[side][target]!.pos);
  if (r() < cutBackChance(s, side, idx))
    return { kind: 'complete', to: toEngine(side, to), receiver: target };
  return { kind: 'intercepted', by: nearestDefender(s, side, to), at: toEngine(side, to) };
}

/**
 * The finish a delivery leaves its runner (T444): his next action, a first-time shot struck where
 * the ball met him at the zone. A header under the pressure its aerial duel left, else with the
 * foot, with a cut-back's chance when the ball was pulled back or squared across the goal area.
 */
export type Finish = { header: true; pressure: number } | { header: false; cutBack: boolean };

/** A delivery's outcome, and the finish it leaves its runner when it reaches him. */
export interface DeliveryResult {
  outcome: Outcome;
  finish?: Finish;
}

/**
 * An open-play cross or cut-back of `idx` on the candidate model (→MATCH-11, MATCH-31, MATCH-33,
 * T444), played into the zone `aim` names (`deliveryPoint`), not to the feet of its runner
 * `target`, as a through ball goes into the runner's path; kicked `kickAt` seconds from now.
 * - Contested first (`deliveryReach`): the first opponent the ball meets who gets there cleanly
 *   (`cleanReach`, as a pass is intercepted cleanly, T441) wins it at his reach point, past any
 *   man who only just got there before him. He cuts it out `cross.intercept` of the time and heads
 *   it clear the rest. A low ball is contested along its whole path into its zone. A lofted ball
 *   flies over the middle of its path (T446, MATCH-33 r30): only a man at the crosser's foot
 *   (`delivery.loft.foot` m) cuts it out. Its zone is the aerial duel's (MATCH-31): the men in it,
 *   or else the man who gets to its drop first (its last `delivery.loft.drop` m before the zone's
 *   edge), meet it in the air.
 * - Otherwise it is as good as its delivery (MATCH-11's 크로스): a cross's chance (`crossChance`)
 *   or a cut-back's beats a man who only just gets there. A bad cross may run out over the byline
 *   (`crossOverhit`). Otherwise a bad ball is deflected loose where the first man meets it, or with
 *   nobody reaching it lost at the zone, in a 50/50 there (`looseBall`, MATCH-31).
 * - A good lofted ball meets the keeper's claim and the aerial duel at the zone (`aerialDelivery`):
 *   its runner brings it down there or heads it. A good low one reaches him at the zone for a
 *   first-time shot with the foot. Either way it is a reception at the zone; a header or a shot is
 *   his `Finish`, struck there once he has met it (`resolveFinish`).
 */
export function resolveDelivery(
  s: GridState,
  side: 0 | 1,
  idx: number,
  target: number,
  aim: DeliveryAim,
  tags: Tags,
  r: () => number,
  kickAt = 0,
): DeliveryResult {
  const zone = deliveryPoint(side, aim);
  const high = lofted(aim.kind);
  const { first, cut, marker } = deliveryReach(s, side, s.players[side][idx]!.pos, aim, kickAt);
  const won = (by: LaneReach): Outcome =>
    r() < DUEL_CONFIG.cross.intercept
      ? { kind: 'intercepted', by: by.gp.idx, at: by.at }
      : { kind: 'loose', at: by.at, winner: [other(side), by.gp.idx] };
  if (cut) return { outcome: won(cut) };
  const cross = DELIVERY_ACTION[aim.kind] === 'cross';
  if (r() >= (cross ? crossChance(s, side, idx, tags) : cutBackChance(s, side, idx))) {
    const over = cross ? crossOverhit(s, side, idx, r) : undefined;
    return { outcome: over ?? looseBall(s, first?.at ?? zone, r, [side, target]) };
  }
  const received: Outcome = { kind: 'complete', to: zone, receiver: target };
  if (!high) return { outcome: received, finish: { header: false, cutBack: aim.kind !== 'near' } };
  const runner = s.players[side][target]!;
  const aerial = aerialDelivery(s, side, runner, tags, r, zone, marker, BOX_CONFIG.delivery.claim);
  if (aerial.kind !== 'header') return { outcome: aerial };
  return {
    outcome: { ...received, ...(aerial.aerial === undefined ? {} : { aerial: aerial.aerial }) },
    finish: { header: true, pressure: aerial.pressure },
  };
}

/**
 * A delivery's first-time finish by `(side, idx)`, struck where he stands having met the ball at
 * its zone (T444): a header under its duel's pressure, else a shot with the foot under `tags`'
 * pressure, a cut-back's chance when the ball was pulled back or squared.
 */
export function resolveFinish(
  s: GridState,
  side: 0 | 1,
  idx: number,
  finish: Finish,
  tags: Pick<Tags, 'pressure'>,
  ctx: ShotContext,
  r: () => number,
): ShotOutcome {
  if (!finish.header) return resolveShot(s, side, idx, tags, ctx, r, { cutBack: finish.cutBack });
  const pressure = { pressure: finish.pressure };
  return { ...resolveShot(s, side, idx, pressure, ctx, r, { header: true }), header: true };
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
  const beyond = foe ? attackFrame(side, foe.pos)[0] : c[0];
  const past: Point = [
    Math.min(
      PITCH.length - 0.5,
      beyond + T.past[0] + (T.past[1] - T.past[0]) / 2,
      // The candidate's depth, though always a metre past the man he beat.
      onCandidate(s) ? Math.max(DUEL_CONFIG.candidate.takeOnDepth, beyond + 1) : Infinity,
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
  const save = {
    kind: 'shot',
    shooter: idx,
    result: 'save',
    xg: C.xg,
    recordedXg: C.xg,
    then: 'loose',
    by: keeper.idx,
  } as const;
  if (!onCandidate(s)) return save;
  // The parry falls where the save sends it and goes to whoever reaches it first (T445).
  const me = s.players[side][idx]!;
  const land = saveRebound(attackFrame(side, me.pos), attackFrame(side, keeper.pos), r);
  return { ...save, ...secondBall(s, side, me, keeper, land, 0) };
}
