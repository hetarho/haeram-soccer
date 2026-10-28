/** What the player on the ball does and where he plays it: the real-data mix of his cell, bent by role, traits, tactic, tags, score and head (→MATCH-8, MATCH-16). */
import type { Position, RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { lineOf } from '../player';
import { actionWeight } from '../match-weights';
import { HOST_MATH, type MatchMath } from '../portable-math';
import { CELL_BASELINES, OVERALL_PROFILE, POSITION_PROFILES, profileKey } from './baselines';
import { BOX_CONFIG, deliveries, DELIVERY_ACTION, type Delivery, type DeliveryAim } from './box';
import {
  attackFrame,
  BAND_EDGES,
  cellBand,
  cellLane,
  cellOf,
  clamp,
  goalDistance,
  inBox,
  inGoalArea,
  PITCH,
  toEngine,
  type Point,
} from './pitch';
import { reachOnPath } from './lanes';
import { chanceXg, shotBlockers, unblocked } from './resolve';
import { modelAtLeast } from './rules';
import { offsideLine } from './shape';
import { onPitch, other, skill, slotOf, type GridPlayer, type GridState } from './state';
import { TAG_CONFIG, type Tags } from './tags';

export type Action =
  'pass' | 'cross' | 'cutBack' | 'carry' | 'takeOn' | 'shot' | 'holdUp' | 'clearance';
export const ACTIONS: readonly Action[] = [
  'pass',
  'cross',
  'cutBack',
  'carry',
  'takeOn',
  'shot',
  'holdUp',
  'clearance',
];

export interface Decision {
  action: Action;
  /** Roster index of the receiver. */
  target?: number;
  /** Where a carry ends, in the engine frame. */
  point?: [number, number];
  kind?: 'short' | 'long' | 'switch' | 'through';
  lineBreaking?: boolean;
  /** Candidate model (T444, →MATCH-33): the zone a cross or cut-back is played into; `target` is its runner. */
  delivery?: DeliveryAim;
}

/** Initial values; T215 and T216 tune them. The style bends `pass` and `lineHigh`/`lineLow` are applied by T209 and T206. */
export const DECISION_CONFIG = {
  holdUp: { base: 0.03, backToGoal: 0.15 },
  cutBackShare: 0.1,
  takeOnPerPass: 0.075,
  crossShare: 0.025,
  factorRange: [0.2, 3],
  shotLine: { GK: 0, DF: 1, MF: 3.8, FW: 0.9 },
  /** Global shot-volume scale; the first uncalibrated engine produced about 25 shots a side (T215 settles it). */
  shotScale: 0.19,
  /** Global open-play cross scale: the cells' own cross shares gave under one cross a side (T215 settles it). */
  crossScale: 7.2,
  /** Extra shot weight in the box band, so a carrier shoots there instead of carrying into the goal area (T215). */
  shotBox: 0.42,
  /** Beyond `from` metres from goal a shot's weight falls by e per `scale` metres: a cell's shots come from its near end (T215). */
  longShot: { from: 28, scale: 6 },
  tactic: {
    possession: { pass: 1.1, takeOn: 0.9, shotBand5: 0.8 },
    counter: { shotInCounter: 1.1 },
    press: { shotAfterRegain: 1.2, regainSeconds: 6 },
    balanced: {},
  } satisfies Record<Tactic, object>,
  pressure: { carry: 0.6, takeOn: 1.3, takeOnDribbling: 65, clearance: 2 },
  backToGoal: { takeOn: 0.5, shot: 0.3 },
  inBehind: { shot: 0.8, carry: 1.3 },
  pocket: { takeOn: 1.2, shotBand5: 1.6 },
  /** `shot`: a leading side's shot weight per goal ahead, up to `maxLead` goals, all match long (T216). */
  leading: { minute: 75, takeOn: 0.8, clearance: 1.3, shot: 0.6, maxLead: 3 },
  /** `push`: a trailing side's shot weight per goal behind, up to `leading.maxLead` goals, all match long (T216). */
  trailing: { minute: 70, shot: 1.2, cross: 1.2, push: 1.4 },
  lowXg: 0.05,
  highXg: 0.12,
  pass: {
    reach: 60,
    reachLong: 70,
    open: 0.8,
    risk: 0.6,
    tooFar: 15,
    through: 0.8,
    long: 30,
    switch: 30,
    tau: { scale: 1, decisions: 80, composure: 150, range: [0.4, 2.5] },
    backBias: 3,
    /** Weight of backward options in every pass choice; the threat gain alone kept back passes near 9% (T215). */
    backPrior: 2.2,
  },
  /** `boxLength`: a carry that starts in the box is a step or two, not a run into the goal area (T215). */
  carry: {
    headings: [0, -30, 30, -90, 90],
    length: [6, 6],
    boxLength: [3, 3],
    pressure: 0.5,
    margin: 0.5,
  },
  keeper: { sweeper: 0.7, stopper: 0.45, press: 0.15, longRisk: 0.5 },
  /**
   * Candidate model only (→MATCH-16, MATCH-17): teammates' intentions bend the carrier's choice. A
   * teammate showing for him scores `show` more; an overlap combining with him scores `release` more
   * once it is level with him or ahead, and until then an unpressured carrier carries `wait` times
   * as often while it arrives.
   */
  combination: { show: 0.6, release: 0.9, wait: 1.5 },
  /**
   * Candidate model only (T278, →MATCH-23): the open-play cross scale, the box band's shot weight
   * and the lines' shot weights in place of `crossScale`, `shotBox` and `shotLine`, against too many
   * crosses, headed goals, goal-area shots and forwards' goals and too few defenders' goals. T321
   * gave the shadow striker his own weight, raised the midfield and defence lines' and lowered the
   * forwards' so the lines' shares of goals hold, and raised the box band's (0.52) against shots
   * from the goal area. T324 recalibrated the lines (DF 1.3, MF 7.5, FW 0.62 before) and the volume
   * scale (0.215) after through balls into the runner's path and players reacting at the kick
   * moved goals to the forwards and closer to goal. T371 (DF 3.2, MF 20, FW 0.36 before; with
   * `shotScale` 0.45 → 0.475 so the volume holds): forwards took 62.5% of the goals against
   * MATCH-23's 50–60%, so midfielders and defenders shoot a little more of the side's shots.
   */
  candidate: {
    crossScale: 6.3,
    shotBox: 0.56,
    shotLine: { GK: 0, DF: 4.5, MF: 22.5, FW: 0.3 },
    /**
     * Positions that shoot with another line's weight (T321, →MATCH-16): a 4-2-3-1 shadow striker
     * lives in the box like a forward, so the midfield line's weight made him take most of press's
     * shots. T324: he takes the forwards' weight itself instead of a weight of his own (1.5), so
     * press's volume comes from its shape and pressing.
     */
    shotPosition: { AM: 'FW' } as Partial<Record<Position, 'GK' | 'DF' | 'MF' | 'FW'>>,
    /**
     * In behind the line in a central lane in front of the box (band 5), in place of `inBehind`
     * (T321, →MATCH-16: in behind favours a shot). T324: now that a through ball reaches a runner
     * in his path, he shoots (shot 2) rather than carrying on into the goal area (carry 3 under
     * T321). In the box the shared `inBehind` holds.
     */
    inBehind: { shot: 2, carry: 1.3, pass: 0.5 },
    /**
     * The global shot-volume scale, in place of `shotScale` (T321, T324: 0.35 left validation goals
     * at 2.50 once defenders read the pass early). T370: 0.42 → 0.45 with `shotQuality`, which
     * passes up weak box shots, so the volume holds. T371: 0.475 with the lines' new weights.
     * T398: 0.43, as midfielders arriving in the box (`SHAPE_CONFIG.candidate.boxRun`) shoot
     * there too and the goals hold at 2.88. T437: 0.37 after the in-stride carry and the final-third
     * rework (T426, T441–T445), with fewer bodies blocking shots (`BOX_CONFIG.shot`): shots 15.2 →
     * 13.6 a team, goals 3.09 → 2.75 a match (calibration round 74, core 600 matches).
     */
    shotScale: 0.37,
    /**
     * Revision 4 (T481, →MATCH-16), in place of `shotLine` and `shotScale` (which revisions 1–3
     * keep): the lines' shot weights in the order a forward ≥ a midfielder ≥ a defender, since the
     * lines' shares of goals come from where they get the ball, never from suppressing a line's
     * shot choice (FW 0.3, MF 22.5, DF 4.5 left an unmarked striker shooting 5–8% of his central
     * box chances against a midfielder's 86%). The playmaker roles look a little more for the pass.
     * T482: `shotScale` 0.25 → 0.28 with its own `shotQuality` (clear chances taken more) and
     * `gain` (passes weigh the receiver's threat less, so the ball returns to midfield more often):
     * 600 matches, shots 13.6 → 11.3 a team, goals 3.13 → 2.86, pass directions inside MATCH-23, an
     * unmarked striker's goal-area chance taken 41–45 → 61–65% of the time, forwards' decisions in
     * front of the box 141 → 107 a team a match.
     */
    revision4: {
      shotLine: { GK: 0, DF: 0.5, MF: 0.8, FW: 1 },
      shotScale: 0.28,
      playmakerShot: 0.85,
      /**
       * In place of `shotQuality` (T482): a clear chance raises the shot weight up to `most`
       * times, a poor one lowers it, so the chance itself decides more of whether he shoots.
       */
      shotQuality: { ref: 0.25, power: 1, most: 2 },
      /** In place of `gain` (T482): the pull of a pass's expected-threat gain. */
      gain: 0.3,
      playmakers: [
        'regista',
        'deepLyingPlaymaker',
        'trequartista',
        'widePlaymaker',
      ] as readonly RoleId[],
    },
    /**
     * Revision 5 (T538, →MATCH-16): the carrier's judgement. `space`: his space is the distance to
     * the nearest opponent in front of him within `cone` degrees of straight ahead; below `upTo` m
     * up the pitch and with nobody closing him his carry weight is multiplied by up to
     * `1 + carry`, rising linearly from `from` to `full` metres, and a carry stretches toward that
     * space (leaving `keep` m, at most `most` m). In the final third the defence is set and `room`
     * governs instead: carrying there as freely took goals to 3.4–3.9 a match (150-match reads).
     * `contested`: a backward or lateral pass never goes to a receiver with an opponent within
     * `mark` m or along a lane an opponent reaches cleanly. `room`: a carrier at least `from` m up
     * the pitch with `space` m in front of him (or in behind) has no backward option more than
     * `back` m behind him. `wing`: a carrier on the wing (a wide lane, the opponents' half, outside
     * the box, `open` m of space ahead) has a carry heading straight down the line scoring `line`
     * more, and in front of the box (band 5) crosses `early` and carries `carry` times as often, so
     * he crosses from near the byline; a receiver on the wing scores `find` more as a pass target.
     */
    revision5: {
      space: { cone: 40, from: 8, full: 25, carry: 2, keep: 5, most: 12, upTo: 70 },
      contested: { mark: 3 },
      room: { from: 75, space: 6, back: 10 },
      wing: { open: 12, line: 1.5, early: 0.4, carry: 2, find: 0.6 },
    },
    /**
     * Revision 6 (T542, →MATCH-16): `clear`: a carrier in a central lane at least `from` m up the
     * pitch, unpressed, with no outfield opponent within `corridor` m of his line to the goal
     * centre nor within `near` m of him, has a clear chance (about 1.7 a team a match, near real
     * football's big chances; with 3 m and 6 m it was 10 and goals ran to 8 a match). In the box or
     * within `shootFrom` m of goal his shot share is at least `shot`, rising to `sharp` from 판단력
     * 40 to 90; further out his carry share is at least `carry`. He carries only within 30° of the
     * goal direction and plays no backward or lateral pass unless its receiver has a clear chance
     * nearer goal. `beat`: having just beaten his man he carries only within 30° of the goal
     * direction, `carry` times as often (3 took goals up 0.7 a match), with no backward option nor
     * a lateral one that is not ahead of him. `free`: a forward option whose receiver has nobody
     * within `near` m and whose lane nobody reaches cleanly and weighs below `lane` scores `score`
     * more. `calm`: unpressed and outside his own box his clearance weight is multiplied by
     * `clearance`.
     */
    revision6: {
      clear: { from: 70, corridor: 10, near: 8, shootFrom: 20, shot: 0.6, sharp: 0.85, carry: 0.6 },
      beat: { carry: 1 },
      free: { near: 8, lane: 0.3, score: 0.8 },
      calm: { clearance: 0.15 },
    },
    /**
     * Beyond `longShot.from` a shot's weight falls by e per this many metres, in place of
     * `longShot.scale` (T324), so the stronger midfield weight does not bring shots from 30 m+.
     * T370: 4 → 3.5, so fewer box shots do not push the shot places outside and from 30 m+.
     */
    longShotScale: 3.5,
    /**
     * A through ball into the runner's path (T324, →MATCH-16, `throughPoint`): `lead` metres ahead
     * of him, never deeper than `depth`, when the line leaves `space` metres behind it; `score` is
     * the pull of a runner in behind in the pass choice, in place of `pass.through`, since such a
     * ball now really puts him through. T397: `score` 0.4 → 2, with `past.through` halving it for
     * a man already past the line: completed through balls 0.46 → 0.67 a team (MATCH-30 0.60–0.85).
     */
    through: { lead: 5, depth: 88, score: 2, space: 12 },
    /**
     * Press's shot weight in the opponents' half just after a regain, in place of
     * `tactic.press.shotAfterRegain` (T324): its pressing already wins the ball closer to goal.
     */
    shotAfterRegain: 1,
    /** Take-on volume outside the box against the position profiles' rate (T324). */
    takeOnScale: 1.35,
    /**
     * The score state (T345, →MATCH-2, MATCH-16), in place of `leading.shot` and `trailing.push`:
     * a leading side's shot weight per goal ahead and a trailing side's per goal behind, up to
     * `leading.maxLead` goals, all match long. A lead is protected and a deficit chased harder,
     * so more matches come back level and fewer favourites run away with them (MATCH-2's
     * outcome curve: favourites won too often and draws were short at every gap).
     */
    leadingShot: 0.5,
    trailingPush: 1.6,
    /**
     * Shot selection in the box (T370, →MATCH-16, MATCH-30): a shot's weight there is scaled by
     * its chance's xG (pressure included) against `ref` to the power `power`, at most `most` times,
     * so a carrier passes up a weak angle or a pressured look and a big chance keeps its weight:
     * fewer box shots and key passes, the same goals. T445: the xG reads the bodies in the shot's
     * path too (the share nobody blocks, to the power 1/his temperature), so a blocked view is
     * passed up as well, more surely with better 판단력.
     */
    shotQuality: { ref: 0.3, power: 0.5, most: 1 },
    /**
     * A receiver standing past the opponents' offside line as the pass is played (T397, →MATCH-16,
     * MATCH-18): his option's prior is multiplied by `prior` and his through-ball pull by `through`.
     * A runner still level or behind keeps the full pull, so a ball in behind goes to a timed run.
     * Neutral at 1 and 1; T397 keeps the prior and halves the pull (taking it away entirely sent
     * long shots out of MATCH-23 and handed press's high line a free hand).
     */
    past: { prior: 1, through: 0.5 },
    /**
     * The share of a cut-back zone's crosses played back as cut-backs, in place of `cutBackShare`
     * (T397: 0.1 → 0.5; cut-backs 0.17 → 0.23 a team, still short of MATCH-30's 0.35–0.60).
     */
    cutBackShare: 0.5,
    /**
     * A receiver's first decision on the ball (T397, →MATCH-16): facing play with pressure below
     * `pressure`, below the box band, his carry weight is multiplied by `carry`: he takes the
     * ball forward in his stride. Neutral at 1; T397 keeps 6 (progressive carries 40.8 → 46).
     */
    firstTouch: { carry: 6, pressure: 1 },
    /** The weight of a pass's expected-threat gain in the pass choice (T397). Neutral at 1. */
    gain: 1,
    /**
     * A carry from outside the box that would end in it scores this much less (T397, →MATCH-16,
     * in the heading choice's xT points): defenders close the box's edge, so a carrier there more
     * often runs across it than into it. Neutral at 0.
     */
    boxCarry: 0,
    /**
     * A carry from outside the goal area that would end in it scores this much less (T437,
     * →MATCH-16, in the heading choice's xT points): the keeper and the covering defenders close
     * the six-yard box, so a carrier in the box more often runs across it or strikes from where he
     * is than takes the ball into it. Neutral at 0. T437 keeps 15 with `DUEL_CONFIG.candidate.
     * takeOnDepth` 99: 1.23 of 1.91 goal-area shots a team followed the shooter's own carry or
     * take-on into it (round 74, 200 observed matches), and goal-area shots fell 12.9 → 6.8%
     * (MATCH-23 6–9%).
     */
    goalAreaCarry: 15,
    /**
     * Settled play in the final third (T408, →MATCH-13, MATCH-30): a passer at least `from` m up
     * the pitch weighs lateral options `lateral` and backward ones `back` times as much, and a
     * forward pass from below `from` into it `entry` times as much; a carry outside the box
     * runs `carry` times its length, and a carrier there chooses to pass `pass` times as often.
     * Neutral at 1. T408 screened them and kept none: `entry` 0.2 (with `carry` 1.1) took
     * final-third passes 167 → 145 and box entries 27.6 → 25.6 but moved offsides, ball in play
     * and MATCH-29's high-regain ordering outside; fewer passes there (`pass`) lost passes and
     * added shots, goals and box carries.
     */
    finalThird: { from: 70, lateral: 1, back: 1, entry: 1, carry: 1, pass: 1 },
    /**
     * A settled attack's patience (T411, →MATCH-13, MATCH-16): once a side has kept the ball
     * `seconds` and its carrier is in the final third (`finalThird.from`), he passes `pass`
     * times as often and shoots and crosses `shot` and `cross` times as often: a long spell
     * around the box ends. Neutral at 1. T411 kept none: like T408's `pass`, fewer passes there
     * lost passes and added shots and goals, and took offsides and tackles outside.
     */
    patience: { seconds: 30, pass: 1, shot: 1, cross: 1 },
    // T398's `arriving` (a teammate on a box run scoring more as a pass's or cut-back's target,
    // neutral at 0) is gone: T444's deliveries draw their runner among the zones attacked
    // (`BOX_CONFIG.delivery`, `chooseDelivery`).
  },
  /**
   * Candidate model only (→MATCH-8, T278): within `seconds` of a regain a listed side plays forward,
   * scoring a forward pass `forward` more and a back pass `back` times as often. T321 lengthened
   * and strengthened counter's break (8 s and 1.5 before).
   */
  direct: {
    seconds: 12,
    forward: { counter: 3 } as Partial<Record<Tactic, number>>,
    back: 0.5,
    /**
     * Candidate model only (→MATCH-8, T334): once a listed side's break has passed (outside
     * `seconds` of a regain, or with no regain) it still plays forward or long rather than
     * recycling: a forward pass scores `forward` more and a long ball or a switch `long` more, a
     * lateral pass is chosen `lateral` and a back pass `back` times as often, and its carrier
     * passes `pass` times as often against carrying on. Counter (T334): its pass share falls to
     * the lowest of the four and it beats press through its play, not its roles. The pass weights
     * hold only while the carrier stands no further than `upTo` m up the pitch (T336: in the final
     * third counter picks its passes as any side, the pass factor still applies), so fewer of its
     * balls go loose high up.
     */
    settled: {
      counter: { forward: 1, long: 0.5, lateral: 0.5, back: 0.35, pass: 0.75, upTo: 70 },
      /**
       * Balanced (T371): MATCH-8's mixed passing in its own half. Its back three built up short
       * and lost the most balls high up of the four (high turnovers conceded 9.0 a match against
       * 5.0–8.0), so below halfway it plays a long ball `long` more and recycles less.
       */
      balanced: { forward: 0, long: 0.6, lateral: 0.8, back: 0.6, pass: 1, upTo: 52.5 },
    } as Partial<
      Record<
        Tactic,
        {
          forward: number;
          long: number;
          lateral: number;
          back: number;
          pass: number;
          upTo: number;
        }
      >
    >,
  },
} as const;

const DEG = Math.PI / 180;

/** Whether `side` is breaking: within `direct.seconds` of its regain on the candidate model. */
const breaking = (s: GridState, side: 0 | 1) =>
  s.setup.model !== undefined &&
  s.lastRegain?.side === side &&
  s.elapsed - s.lastRegain.at <= DECISION_CONFIG.direct.seconds;

/** The candidate's settled-play rule for `side` once its break has passed (T334), if its tactic has one. */
const settledOf = (s: GridState, side: 0 | 1) =>
  s.setup.model !== undefined && !breaking(s, side)
    ? DECISION_CONFIG.direct.settled[s.setup.tactics[side]]
    : undefined;

/** The normalised action mix of the carrier. */
export function actionMix(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
): Record<Action, number> {
  const C = DECISION_CONFIG;
  const me = s.players[side][idx]!;
  const slot = slotOf(s, me);
  const cell = CELL_BASELINES[tags.cell]!;
  const line = lineOf(slot.position);
  const c = attackFrame(side, me.pos);
  const traits = me.player.traits;
  const tactic = s.setup.tactics[side];
  const bend = s.setup.bends[side];
  const oppBend = s.setup.bends[other(side)];
  const inCutBack = tags.band === 7 && (tags.lane === 1 || tags.lane === 3);
  const mix: Record<Action, number> = {
    pass: cell.pass * (1 - cell.crossOfPasses),
    cross: cell.pass * cell.crossOfPasses,
    cutBack: 0,
    carry: cell.carry,
    takeOn: cell.takeOn,
    shot: cell.shot,
    holdUp:
      (line === 'FW' || slot.position === 'AM') &&
      tags.lane >= 1 &&
      tags.lane <= 3 &&
      tags.orientation === 'backToGoal'
        ? C.holdUp.backToGoal
        : C.holdUp.base,
    clearance: cell.clearance,
  };
  const candidate = s.setup.model !== undefined;
  // Fewer passes kept in the final third (candidate model, T408).
  if (candidate && c[0] >= C.candidate.finalThird.from) {
    mix.pass *= C.candidate.finalThird.pass;
    // A long spell around the box ends (T411).
    const W = C.candidate.patience;
    if (s.elapsed - s.possessionSince > W.seconds) {
      mix.pass *= W.pass;
      mix.shot *= W.shot;
      mix.cross *= W.cross;
    }
  }
  if (inCutBack) {
    const share = candidate ? C.candidate.cutBackShare : C.cutBackShare;
    mix.cutBack = share * mix.cross;
    mix.cross *= 1 - share;
  }
  // The position's habits against the league's overall.
  const profile = POSITION_PROFILES[profileKey(slot.position)];
  mix.takeOn *=
    clamp(profile.takeOnPerPass / C.takeOnPerPass, C.factorRange[0], C.factorRange[1]) *
    (candidate && !inBox(c) ? C.candidate.takeOnScale : 1);
  // Revision 4 (T481, T482): its own lines and shot scale.
  const r4 = candidate && modelAtLeast(s.setup, 4) ? C.candidate.revision4 : undefined;
  const crossFactor =
    clamp(profile.crossShare / C.crossShare, C.factorRange[0], C.factorRange[1]) *
    (candidate ? C.candidate.crossScale : C.crossScale);
  mix.cross *= crossFactor;
  mix.cutBack *= crossFactor;
  // Revision 4 (T481): the lines in the order forward ≥ midfielder ≥ defender.
  const shotLine = C.candidate.shotPosition[slot.position] ?? line;
  mix.shot *=
    (r4 ? r4.shotLine[shotLine] : candidate ? C.candidate.shotLine[shotLine] : C.shotLine[line]) *
    (r4 ? r4.shotScale : candidate ? C.candidate.shotScale : C.shotScale) *
    (tags.band === 6 ? (candidate ? C.candidate.shotBox : C.shotBox) : 1) *
    s.math.exp(
      -Math.max(0, goalDistance(c, s.math) - C.longShot.from) /
        (candidate ? C.candidate.longShotScale : C.longShot.scale),
    );
  // Role and traits.
  mix.shot *= actionWeight(slot.role, traits, 'shot');
  if (r4?.playmakers.includes(slot.role)) mix.shot *= r4.playmakerShot;
  mix.takeOn *= actionWeight(slot.role, traits, 'dribble');
  mix.cross *= actionWeight(slot.role, traits, 'cross');
  mix.cutBack *= actionWeight(slot.role, traits, 'cross');
  mix.holdUp *= actionWeight(slot.role, traits, 'hold');
  if (!inBox(c)) mix.shot *= actionWeight(slot.role, traits, 'long');
  // The tactic and its style bends.
  if (tactic === 'possession') {
    mix.pass *= C.tactic.possession.pass;
    mix.takeOn *= C.tactic.possession.takeOn;
    if (tags.band === 5) mix.shot *= C.tactic.possession.shotBand5;
  }
  if (tactic === 'counter' && tags.phase === 'counter') mix.shot *= C.tactic.counter.shotInCounter;
  const settled = settledOf(s, side);
  if (settled) mix.pass *= settled.pass;
  if (
    tactic === 'press' &&
    s.lastRegain?.side === side &&
    s.elapsed - s.lastRegain.at <= C.tactic.press.regainSeconds &&
    tags.band >= 5
  )
    mix.shot *= candidate ? C.candidate.shotAfterRegain : C.tactic.press.shotAfterRegain;
  mix.pass *= 1 + bend.possession / 50;
  mix.carry *= 1 - bend.possession / 100;
  mix.shot *= (1 + bend.shot / 20) * (1 - oppBend.defense / 20);
  // The situation.
  if (candidate && inBox(c)) {
    const Q = r4 ? r4.shotQuality : C.candidate.shotQuality;
    // The bodies between the ball and the goal (T445, →MATCH-35): the share of the chance nobody
    // in its path blocks, to the power 1/his temperature, so a sharp head passes up a blocked view
    // more surely and pressure on a shaky one less (→MATCH-16); at temperature 1 it is the share.
    const open = unblocked(shotBlockers(s, side, c));
    const seen = open < 1 ? s.math.exp(s.math.log(open) / temperature(s, side, idx, tags)) : open;
    const xg = chanceXg(c, { pressure: tags.pressure, candidate: true }, s.math) * seen;
    mix.shot *= Math.min(Q.most, s.math.exp(Q.power * s.math.log(xg / Q.ref)));
  }
  if (tags.pressure >= 1) {
    mix.carry *= C.pressure.carry;
    if (skill(s, side, idx, 'dribbling') >= C.pressure.takeOnDribbling)
      mix.takeOn *= C.pressure.takeOn;
    if (tags.band <= 2) mix.clearance *= C.pressure.clearance;
  }
  if (tags.orientation === 'backToGoal') {
    mix.takeOn *= C.backToGoal.takeOn;
    mix.shot *= C.backToGoal.shot;
  }
  if (tags.inBehind && tags.band >= 5 && tags.lane >= 1 && tags.lane <= 3) {
    const through = candidate && tags.band === 5;
    const behind = through ? C.candidate.inBehind : C.inBehind;
    mix.shot *= behind.shot;
    mix.carry *= behind.carry;
    if (through) mix.pass *= C.candidate.inBehind.pass;
  }
  if (tags.pocket) {
    mix.takeOn *= C.pocket.takeOn;
    if (tags.band === 5) mix.shot *= C.pocket.shotBand5;
  }
  if (tags.lead > 0)
    mix.shot *= s.math.powInt(
      candidate ? C.candidate.leadingShot : C.leading.shot,
      Math.min(C.leading.maxLead, tags.lead),
    );
  if (tags.lead < 0)
    mix.shot *= s.math.powInt(
      candidate ? C.candidate.trailingPush : C.trailing.push,
      Math.min(C.leading.maxLead, -tags.lead),
    );
  if (tags.lead > 0 && tags.minute >= C.leading.minute) {
    mix.takeOn *= C.leading.takeOn;
    if (tags.band <= 2) mix.clearance *= C.leading.clearance;
  }
  if (tags.lead < 0 && tags.minute >= C.trailing.minute) {
    mix.shot *= C.trailing.shot;
    mix.cross *= C.trailing.cross;
  }
  // An overlap still arriving: unpressured, he holds the ball for it.
  if (tags.pressure < 1 && s.players[side].some((gp) => combination(s, gp, idx, c) === 'waiting'))
    mix.carry *= C.combination.wait;
  // His first touch on the ball, facing play with room (candidate model, T397).
  const F = C.candidate.firstTouch;
  if (
    candidate &&
    s.received?.[0] === side &&
    s.received[1] === idx &&
    tags.orientation === 'facing' &&
    tags.pressure < F.pressure &&
    tags.band < 6
  )
    mix.carry *= F.carry;
  // Open ground ahead of him (revision 5, T538): he takes it on the carry.
  const r5 = candidate && modelAtLeast(s.setup, 5) ? C.candidate.revision5 : undefined;
  if (r5 && tags.pressure < 1 && c[0] < r5.space.upTo) {
    const S = r5.space;
    const ahead = Math.min(spaceAhead(s, side, c), S.full);
    mix.carry *= 1 + S.carry * clamp((ahead - S.from) / (S.full - S.from), 0, 1);
  }
  // The flank open ahead of a wide carrier (revision 5, T538): down the line, not an early cross.
  if (r5 && tags.pressure < 1 && tags.band === 5 && onWing(s, side, c)) {
    mix.cross *= r5.wing.early;
    mix.carry *= r5.wing.carry;
  }
  // Revision 6 (T542): he goes on after beating his man, and clears only when pressed.
  const r6 = candidate && modelAtLeast(s.setup, 6) ? C.candidate.revision6 : undefined;
  if (r6 && beaten(s, side, idx)) mix.carry *= r6.beat.carry;
  const ownBox = c[0] < BAND_EDGES[2] && tags.lane >= 1 && tags.lane <= 3;
  if (r6 && tags.pressure === 0 && !ownBox) mix.clearance *= r6.calm.clearance;
  // His head on shots.
  const decisions = skill(s, side, idx, 'decisions');
  if (cell.xgPerShot !== null && cell.xgPerShot < C.lowXg) mix.shot *= 1 - (decisions - 50) / 200;
  if (cell.xgPerShot !== null && cell.xgPerShot >= C.highXg) mix.shot *= 1 + (decisions - 50) / 300;
  // Hard restrictions.
  if (tags.band <= 3) mix.shot = 0;
  if (tags.band < 5) {
    mix.cross = 0;
    mix.cutBack = 0;
  }
  if (tags.band >= 5) mix.clearance = 0;
  // No blind delivery (candidate model, T444, →MATCH-33): he crosses or cuts back only into a zone
  // a teammate attacks, and only when one such ball is not cut out cleanly as everyone stands
  // (T446); with none for either, he carries, passes or shoots by the rest of the mix.
  if (candidate && (mix.cross > 0 || mix.cutBack > 0)) {
    const open = deliveries(s, side, idx).filter((d) => !d.cut);
    if (!open.some((d) => DELIVERY_ACTION[d.kind] === 'cross')) mix.cross = 0;
    if (!open.some((d) => DELIVERY_ACTION[d.kind] === 'cutBack')) mix.cutBack = 0;
  }
  let total = 0;
  for (const a of ACTIONS) total += mix[a];
  if (total <= 0) return { ...mix, carry: 1 };
  for (const a of ACTIONS) mix[a] /= total;
  // A clear chance is taken (revision 6, T542): near goal he shoots, further out he carries at it;
  // the rest of the mix keeps its proportions.
  if (r6 && tags.pressure < 1 && clearChance(s, side, c)) {
    const K = r6.clear;
    const close = inBox(c) || goalDistance(c, s.math) <= K.shootFrom;
    const key: Action = close ? 'shot' : 'carry';
    const floor = close
      ? K.shot + (K.sharp - K.shot) * clamp((decisions - 40) / 50, 0, 1)
      : K.carry;
    const rest = 1 - mix[key];
    if (mix[key] < floor && rest > 0)
      for (const a of ACTIONS) mix[a] = a === key ? floor : (mix[a] * (1 - floor)) / rest;
  }
  return mix;
}

type Direction = 'forward' | 'lateral' | 'back';

export interface PassOption {
  target: number;
  score: number;
  prior: number;
  direction: Direction;
  kind: NonNullable<Decision['kind']>;
  lineBreaking: boolean;
}

/** The temperature of the carrier's choices: a sharp head cools it, pressure on a shaky one heats it. */
export function temperature(s: GridState, side: 0 | 1, idx: number, tags: Tags): number {
  const T = DECISION_CONFIG.pass.tau;
  const decisions = skill(s, side, idx, 'decisions');
  const composure = skill(s, side, idx, 'composure');
  return clamp(
    T.scale *
      (1 + (60 - decisions) / T.decisions) *
      (1 + (tags.pressure * (60 - composure)) / T.composure),
    T.range[0],
    T.range[1],
  );
}

/** Pressure at a point of the attack frame: goal-side opponents weigh double. */
function pressureAt(s: GridState, side: 0 | 1, p: Point): number {
  const { hypot } = s.math;
  let sum = 0;
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp)) continue;
    const o = attackFrame(side, opp.pos);
    if (hypot(o[0] - p[0], o[1] - p[1]) <= TAG_CONFIG.pressureRadius) sum += o[0] > p[0] ? 1 : 0.5;
  }
  return sum;
}

/**
 * Metres from the attack-frame point `c` to the nearest opponent in front of it within
 * `revision5.space.cone` degrees of straight ahead (T538); Infinity with nobody there.
 */
export function spaceAhead(s: GridState, side: 0 | 1, c: Point): number {
  const { atan2, hypot } = s.math;
  const cone = DECISION_CONFIG.candidate.revision5.space.cone;
  let best = Infinity;
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp)) continue;
    const o = attackFrame(side, opp.pos);
    const dx = o[0] - c[0],
      dy = o[1] - c[1];
    if (dx <= 0 || Math.abs(atan2(dy, dx)) / DEG > cone) continue;
    best = Math.min(best, hypot(dx, dy));
  }
  return best;
}

/**
 * Whether the attack-frame point `c` is on the wing with the flank open (T538): a wide lane in the
 * opponents' half, outside the box, with `revision5.wing.open` m of space ahead.
 */
function onWing(s: GridState, side: 0 | 1, c: Point): boolean {
  const lane = cellLane(cellOf(c));
  return (
    (lane === 0 || lane === 4) &&
    c[0] >= PITCH.length / 2 &&
    !inBox(c) &&
    spaceAhead(s, side, c) >= DECISION_CONFIG.candidate.revision5.wing.open
  );
}

/**
 * Whether the attack-frame point `c` is a clear chance for `side` (T542): a central lane at least
 * `revision6.clear.from` m up the pitch with no outfield opponent within `clear.near` m of it nor
 * within `clear.corridor` m of its line to the goal centre. Pressure is the caller's to read.
 */
export function clearChance(s: GridState, side: 0 | 1, c: Point): boolean {
  const K = DECISION_CONFIG.candidate.revision6.clear;
  const lane = cellLane(cellOf(c));
  if (c[0] < K.from || lane < 1 || lane > 3) return false;
  const { hypot } = s.math;
  const vx = PITCH.length - c[0],
    vy = PITCH.width / 2 - c[1];
  const length = hypot(vx, vy);
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp) || slotOf(s, opp).position === 'GK') continue;
    const o = attackFrame(side, opp.pos);
    const dx = o[0] - c[0],
      dy = o[1] - c[1];
    if (hypot(dx, dy) < K.near) return false;
    const t = (dx * vx + dy * vy) / (length * length);
    if (t > 0 && t < 1 && Math.abs(dx * vy - dy * vx) / length < K.corridor) return false;
  }
  return true;
}

/** Whether carrier `idx` of `side` has just beaten his man (revision 6, T542). */
const beaten = (s: GridState, side: 0 | 1, idx: number) =>
  modelAtLeast(s.setup, 6) && s.beat?.[0] === side && s.beat[1] === idx;

/**
 * What `gp`'s intention offers carrier `idx`, whose attack-frame place is `c` (candidate model,
 * →MATCH-16): `show` when he shows for him, an overlap that is `waiting` behind the carrier or ready
 * to `release` level with or ahead of him, else nothing.
 */
export function combination(
  s: GridState,
  gp: GridPlayer,
  idx: number,
  c: Point,
): 'show' | 'waiting' | 'release' | undefined {
  const i = gp.intention;
  if (!i || i.teammate !== idx || !onPitch(gp)) return undefined;
  if (i.kind === 'support') return i.support === 'open' ? undefined : 'show';
  if (i.kind !== 'run' || i.run !== 'overlap') return undefined;
  return attackFrame(gp.side, gp.pos)[0] >= c[0] ? 'release' : 'waiting';
}

/** The scored receivers a carrier may find; `filter` narrows who counts. */
export function passOptions(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  opts: {
    crossOnly?: boolean;
    backBias?: number;
    riskScale?: number;
    filter?: (gp: GridPlayer) => boolean;
    /** The carrier's own choice on revision 5 (T538): no unsafe recycling, no far back pass with room. */
    judge?: boolean;
  } = {},
): PassOption[] {
  const P = DECISION_CONFIG.pass;
  const { atan2, exp, hypot } = s.math;
  const foe = other(side);
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const slot = slotOf(s, me);
  const reach = slot.position === 'GK' || slot.position === 'CB' ? P.reachLong : P.reach;
  const baseline = CELL_BASELINES[tags.cell]!;
  const profile = POSITION_PROFILES[profileKey(slot.position)];
  const xt0 = baseline.xT;
  const opponents = s.players[foe].filter(onPitch).map((gp) => attackFrame(side, gp.pos));
  const dfDeep = lineDepth(s, foe, side, 'DF');
  const mfDeep = lineDepth(s, foe, side, 'MF');
  const offside = offsideLine(s, foe);
  const candidates: { gp: GridPlayer; p: Point; dist: number; dir: Direction }[] = [];
  for (const gp of s.players[side]) {
    if (gp.idx === idx || !onPitch(gp) || (opts.filter && !opts.filter(gp))) continue;
    const p = attackFrame(side, gp.pos);
    const dist = hypot(p[0] - c[0], p[1] - c[1]);
    if (dist > reach || dist < 1e-9) continue;
    if (opts.crossOnly && !inBox(p)) continue;
    const angle = Math.abs(atan2(p[1] - c[1], p[0] - c[0])) / DEG;
    candidates.push({
      gp,
      p,
      dist,
      dir: angle <= 45 ? 'forward' : angle >= 135 ? 'back' : 'lateral',
    });
  }
  const count: Record<Direction, number> = { forward: 0, lateral: 0, back: 0 };
  for (const cand of candidates) count[cand.dir]++;
  // Straight after a regain a breaking side goes forward (candidate model, →MATCH-8).
  const D = DECISION_CONFIG.direct;
  const direct = breaking(s, side) ? (D.forward[s.setup.tactics[side]] ?? 0) : 0;
  // Once the break has passed a listed side still goes forward or long (candidate, T334), up to
  // `upTo` m up the pitch (T336).
  const rule = settledOf(s, side);
  const settled = rule && c[0] <= rule.upTo ? rule : undefined;
  const candidate = s.setup.model !== undefined;
  const past = DECISION_CONFIG.candidate.past;
  // The carrier's judgement on revision 5 (T538): who he never plays back or across to.
  const judge =
    opts.judge && modelAtLeast(s.setup, 5) ? DECISION_CONFIG.candidate.revision5 : undefined;
  const room =
    judge &&
    c[0] >= judge.room.from &&
    (tags.inBehind || spaceAhead(s, side, c) >= judge.room.space);
  // Revision 6 (T542): a clear chance, a beaten man and a free man ahead.
  const r6 =
    opts.judge && modelAtLeast(s.setup, 6) ? DECISION_CONFIG.candidate.revision6 : undefined;
  const clear = r6 !== undefined && tags.pressure < 1 && clearChance(s, side, c);
  const beat = r6 !== undefined && beaten(s, side, idx);
  const gainWeight = !candidate
    ? 1
    : modelAtLeast(s.setup, 4)
      ? DECISION_CONFIG.candidate.revision4.gain
      : DECISION_CONFIG.candidate.gain;
  const options: PassOption[] = [];
  for (const { gp, p, dist, dir } of candidates) {
    if (room && dir === 'back' && p[0] < c[0] - judge!.room.back) continue;
    // Past his man he plays nothing that goes back past him (T542).
    if (beat && (dir === 'back' || (dir === 'lateral' && p[0] <= c[0]))) continue;
    // In a clear chance only a teammate with a clearer one nearer goal is worth turning to.
    if (
      clear &&
      dir !== 'forward' &&
      !(clearChance(s, side, p) && goalDistance(p, s.math) < goalDistance(c, s.math))
    )
      continue;
    const gain = (CELL_BASELINES[cellOf(p)]!.xT - xt0) * 100 * gainWeight;
    let nearest = Infinity,
      risk = 0;
    const dx = p[0] - c[0],
      dy = p[1] - c[1];
    for (const o of opponents) {
      // The distance is at least either offset (with V8's and the portable hypot alike): a man
      // further off on one axis leaves `nearest` as it is. An offset that is not a number still
      // reaches Math.min, which makes `nearest` NaN as before.
      const ox = o[0] - p[0],
        oy = o[1] - p[1];
      if (
        (Math.abs(ox) <= nearest && Math.abs(oy) <= nearest) ||
        Number.isNaN(ox) ||
        Number.isNaN(oy)
      )
        nearest = Math.min(nearest, hypot(ox, oy));
      if (candidate) continue;
      const t = ((o[0] - c[0]) * dx + (o[1] - c[1]) * dy) / (dist * dist);
      if (t > 0 && t < 1) risk += exp(-hypot(o[0] - (c[0] + t * dx), o[1] - (c[1] + t * dy)) / 2);
    }
    // The candidate weighs who reaches the path as it stands (→MATCH-16, MATCH-31, T441).
    const path = candidate ? reachOnPath(s, side, me.pos, gp.pos, 0) : undefined;
    if (path) risk = path.weight;
    // A contested target is only ever a forward pass's risk (T538).
    if (judge && dir !== 'forward' && (nearest < judge.contested.mark || path?.clean)) continue;
    const open = Math.min(1, (Number.isFinite(nearest) ? nearest : 8) / 8);
    const behindRun = gp.run?.kind === 'behind' && gp.run.until > s.elapsed;
    // A man already past the offside line as the ball is played (candidate model, T397).
    const beyondLine = candidate && p[0] > offside;
    const through =
      behindRun || p[0] > offside
        ? (candidate ? DECISION_CONFIG.candidate.through.score : P.through) *
          actionWeight(slotOf(s, gp).role, gp.player.traits, 'key') *
          (beyondLine ? past.through : 1)
        : 0;
    const combo = combination(s, gp, idx, c);
    // A teammate free on the wing with room ahead (revision 5, T538).
    const wing = judge && onWing(s, side, p) ? judge.wing.find : 0;
    // A free man ahead (revision 6, T542).
    const free =
      r6 &&
      dir === 'forward' &&
      nearest >= r6.free.near &&
      path !== undefined &&
      !path.clean &&
      path.weight < r6.free.lane
        ? r6.free.score
        : 0;
    const kind: PassOption['kind'] =
      through > 0
        ? 'through'
        : Math.abs(dy) > P.switch
          ? 'switch'
          : dist > P.long
            ? 'long'
            : 'short';
    const score =
      (dir === 'forward' ? direct + (settled?.forward ?? 0) : 0) +
      (settled && (kind === 'long' || kind === 'switch') ? settled.long : 0) +
      gain +
      P.open * open -
      P.risk * (opts.riskScale ?? 1) * risk -
      Math.max(0, dist - P.tooFar) / 10 +
      through +
      wing +
      free +
      (combo === 'show'
        ? DECISION_CONFIG.combination.show
        : combo === 'release'
          ? DECISION_CONFIG.combination.release
          : 0);
    let prior = (baseline[dir] * Math.sqrt(profile[dir] / OVERALL_PROFILE[dir])) / count[dir];
    if (dir === 'back') prior *= P.backPrior * (opts.backBias ?? 1) * (direct ? D.back : 1);
    if (settled && dir !== 'forward') prior *= dir === 'back' ? settled.back : settled.lateral;
    if (beyondLine) prior *= past.prior;
    // Settled play in the final third (candidate model, T408).
    if (candidate) {
      const F = DECISION_CONFIG.candidate.finalThird;
      if (c[0] >= F.from) prior *= dir === 'lateral' ? F.lateral : dir === 'back' ? F.back : 1;
      else if (dir === 'forward' && p[0] >= F.from) prior *= F.entry;
    }
    const lineBreaking =
      (dfDeep !== undefined && c[0] <= dfDeep && p[0] > dfDeep) ||
      (mfDeep !== undefined && c[0] <= mfDeep && p[0] > mfDeep);
    options.push({ target: gp.idx, score, prior, direction: dir, kind, lineBreaking });
  }
  return options;
}

/**
 * Where `passer`'s through ball to `target` is played on the candidate model (engine frame,
 * →MATCH-16): into his path, `through.lead` metres ahead of him along his run (toward goal when he
 * stands or turns), never deeper than `through.depth`, when the opponents' line leaves at least
 * `through.space` metres behind it before that depth; to his feet otherwise or when that would not
 * take the ball further from the passer. A through ball goes to a runner in behind or to a man
 * past the line whose run the offside draw found timed (`isOffside`).
 */
export function throughPoint(
  s: GridState,
  side: 0 | 1,
  passer: number,
  target: number,
): [number, number] {
  const T = DECISION_CONFIG.candidate.through;
  const gp = s.players[side][target]!;
  const feet: [number, number] = [gp.pos[0], gp.pos[1]];
  if (T.depth - offsideLine(s, other(side)) < T.space) return feet;
  const { hypot } = s.math;
  const v = gp.vel ?? [0, 0];
  const speed = hypot(v[0], v[1]);
  let dx = (side === 0 ? v[0] : -v[0]) / (speed || 1),
    dy = (side === 0 ? v[1] : -v[1]) / (speed || 1);
  if (dx <= 0) [dx, dy] = [1, 0];
  const p = attackFrame(side, gp.pos);
  const c = attackFrame(side, s.players[side][passer]!.pos);
  const x = Math.min(Math.max(p[0], T.depth), p[0] + dx * T.lead);
  const q: Point = [x, clamp(p[1] + (dy * (x - p[0])) / dx, 0.5, PITCH.width - 0.5)];
  const further = hypot(q[0] - c[0], q[1] - c[1]) > hypot(p[0] - c[0], p[1] - c[1]);
  return further ? toEngine(side, q) : feet;
}

/** The deepest (largest x in the passer's frame) outfield player of an opponent line. */
function lineDepth(
  s: GridState,
  defending: 0 | 1,
  attacking: 0 | 1,
  line: 'DF' | 'MF',
): number | undefined {
  let deepest: number | undefined;
  for (const gp of s.players[defending]) {
    if (!onPitch(gp) || lineOf(slotOf(s, gp).position) !== line) continue;
    const x = attackFrame(attacking, gp.pos)[0];
    deepest = deepest === undefined ? x : Math.max(deepest, x);
  }
  return deepest;
}

/** The probabilities `choosePass` draws from, aligned with the options; `math` is the match's. */
export function passProbabilities(
  options: readonly Pick<PassOption, 'score' | 'prior'>[],
  tau: number,
  math: MatchMath = HOST_MATH,
): number[] {
  if (!options.length) return [];
  // Math.max folded over the scores: the same value as spreading them, without the copies.
  let top = -Infinity;
  for (const o of options) top = Math.max(top, o.score);
  const { exp } = math;
  const weights = options.map((o) => o.prior * exp((o.score - top) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  return total > 0 ? weights.map((w) => w / total) : options.map(() => 1 / options.length);
}

/** One draw from `items` by their probabilities. */
export function draw<T>(items: readonly T[], probabilities: readonly number[], r: () => number): T {
  let u = r();
  for (let i = 0; i < items.length; i++) {
    u -= probabilities[i]!;
    if (u < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function choosePass(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
  opts: { crossOnly?: boolean; backBias?: number } = {},
): { target: number; kind: NonNullable<Decision['kind']>; lineBreaking: boolean } | undefined {
  const options = passOptions(s, side, idx, tags, { ...opts, judge: true });
  if (!options.length) return undefined;
  const chosen = draw(
    options,
    passProbabilities(options, temperature(s, side, idx, tags), s.math),
    r,
  );
  return { target: chosen.target, kind: chosen.kind, lineBreaking: chosen.lineBreaking };
}

/**
 * The zone and runner a carrier who crosses or cuts back plays to (candidate model, T444,
 * →MATCH-33): one draw among `deliveries` of that action by `exp(score / τ)` with his temperature,
 * so a sharper head finds the free, suited runner more surely. Each score loses
 * `BOX_CONFIG.delivery.risk` × its path's reach (T446, →MATCH-31), as a pass's loses its lane's.
 * Undefined with none to play to, or when every one is cut out cleanly as everyone stands.
 */
export function chooseDelivery(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  action: 'cross' | 'cutBack',
  r: () => number,
): Delivery | undefined {
  const options = deliveries(s, side, idx).filter((d) => DELIVERY_ACTION[d.kind] === action);
  if (options.every((d) => d.cut)) return undefined;
  const risk = BOX_CONFIG.delivery.risk;
  const weighed = options.map((d) => ({ score: d.score - risk * d.reach, prior: 1 }));
  return draw(options, passProbabilities(weighed, temperature(s, side, idx, tags), s.math), r);
}

/** Where a carry ends (engine frame): five headings scored by the xT they gain and the pressure they meet. */
export function chooseCarry(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): [number, number] {
  const K = DECISION_CONFIG.carry;
  const { atan2, cos, exp, sin } = s.math;
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  const toGoal = atan2(PITCH.width / 2 - c[1], PITCH.length - c[0]);
  const [base, spread] = inBox(c) ? K.boxLength : K.length;
  const drawn =
    (base + spread * r()) *
    (s.setup.model !== undefined && !inBox(c) ? DECISION_CONFIG.candidate.finalThird.carry : 1);
  // Into the open ground ahead of him on revision 5 (T538).
  const S = DECISION_CONFIG.candidate.revision5.space;
  const length =
    modelAtLeast(s.setup, 5) && tags.pressure < 1 && c[0] < S.upTo
      ? Math.max(drawn, Math.min(spaceAhead(s, side, c) - S.keep, S.most))
      : drawn;
  const xt0 = CELL_BASELINES[tags.cell]!.xT;
  // Down the line on the wing (revision 5, T538): straight up the pitch, as a sixth heading.
  const wing =
    modelAtLeast(s.setup, 5) && tags.pressure < 1 && onWing(s, side, c)
      ? DECISION_CONFIG.candidate.revision5.wing.line
      : undefined;
  // Straight at goal in a clear chance or past a beaten man (revision 6, T542).
  const onward =
    modelAtLeast(s.setup, 6) &&
    (beaten(s, side, idx) || (tags.pressure < 1 && clearChance(s, side, c)));
  const headings = onward ? K.headings.filter((deg) => Math.abs(deg) <= 30) : K.headings;
  const angles = headings.map((deg) => toGoal + deg * DEG);
  if (wing !== undefined) angles.push(0);
  const ends = angles.map((a): Point => {
    return [
      clamp(c[0] + length * cos(a), K.margin, PITCH.length - K.margin),
      clamp(c[1] + length * sin(a), K.margin, PITCH.width - K.margin),
    ];
  });
  // Into the box from outside it (candidate model, T397).
  const boxCarry =
    s.setup.model !== undefined && !inBox(c) ? DECISION_CONFIG.candidate.boxCarry : 0;
  // Into the goal area from outside it (candidate model, T437).
  const goalAreaCarry =
    s.setup.model !== undefined && !inGoalArea(c) ? DECISION_CONFIG.candidate.goalAreaCarry : 0;
  const scores = ends.map(
    (p, i) =>
      (wing !== undefined && i === headings.length ? wing : 0) +
      (CELL_BASELINES[cellOf(p)]!.xT - xt0) * 100 -
      K.pressure * pressureAt(s, side, p) -
      (boxCarry && inBox(p) ? boxCarry : 0) -
      (goalAreaCarry && inGoalArea(p) ? goalAreaCarry : 0),
  );
  const tau = temperature(s, side, idx, tags);
  let top = -Infinity;
  for (const v of scores) top = Math.max(top, v);
  const weights = scores.map((v) => exp((v - top) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  const end = draw(
    ends,
    weights.map((w) => w / total),
    r,
  );
  const [x, y] = attackFrame(side, end);
  return [x, y];
}

/** The goalkeeper's distribution: short to a defender, else long to a forward or wide player upfield. */
export function keeperDistribution(
  s: GridState,
  side: 0 | 1,
  r: () => number,
): { target: number; kind: 'short' | 'long' } {
  const K = DECISION_CONFIG.keeper;
  const idx = s.owner && s.owner[0] === side ? s.owner[1] : 0;
  const me = s.players[side][idx]!;
  const tags = keeperTags(s, side, idx);
  const sweeper = slotOf(s, me).role === 'sweeperKeeper';
  const shortChance =
    (sweeper ? K.sweeper : K.stopper) - (s.setup.tactics[other(side)] === 'press' ? K.press : 0);
  const back = (gp: GridPlayer) =>
    ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(slotOf(s, gp).position);
  const front = (gp: GridPlayer) => {
    const p = attackFrame(side, gp.pos);
    const position = slotOf(s, gp).position;
    return (
      p[0] >= PITCH.length / 2 &&
      (lineOf(position) === 'FW' || ['LM', 'RM', 'LWB', 'RWB'].includes(position))
    );
  };
  const wantShort = r() < shortChance;
  let options = passOptions(
    s,
    side,
    idx,
    tags,
    wantShort ? { filter: back } : { filter: front, riskScale: K.longRisk },
  );
  const kind: 'short' | 'long' = wantShort ? 'short' : 'long';
  if (!options.length) options = passOptions(s, side, idx, tags);
  if (!options.length) return { target: idx === 0 ? 1 : 0, kind };
  const chosen = draw(
    options,
    passProbabilities(options, temperature(s, side, idx, tags), s.math),
    r,
  );
  return { target: chosen.target, kind };
}

/** The tags a keeper's distribution needs: his own cell and the pressure on him. */
function keeperTags(s: GridState, side: 0 | 1, idx: number): Tags {
  const me = s.players[side][idx]!;
  const c = attackFrame(side, me.pos);
  return {
    cell: cellOf(c),
    band: cellBand(cellOf(c)),
    lane: cellLane(cellOf(c)),
    phase: 'buildUp',
    pressure: pressureAt(s, side, c),
    nearest: 0,
    orientation: 'facing',
    betweenLines: false,
    pocket: false,
    inBehind: false,
    channel: false,
    overload: 0,
    lead: s.score[side] - s.score[other(side)],
    minute: Math.floor(s.elapsed / 60) + 1,
    menDiff: 0,
  };
}

/** One decision: the action with one draw, then its target. */
export function decide(
  s: GridState,
  side: 0 | 1,
  idx: number,
  tags: Tags,
  r: () => number,
): Decision {
  const me = s.players[side][idx]!;
  if (slotOf(s, me).position === 'GK') {
    const { target, kind } = keeperDistribution(s, side, r);
    return { action: 'pass', target, kind };
  }
  const mix = actionMix(s, side, idx, tags);
  const action = draw(
    ACTIONS,
    ACTIONS.map((a) => mix[a]),
    r,
  );
  if ((action === 'cross' || action === 'cutBack') && s.setup.model !== undefined) {
    // Into a zone a teammate attacks (T444); the mix leaves no cross or cut-back without one.
    const delivery = chooseDelivery(s, side, idx, tags, action, r);
    if (delivery) {
      const { zone, kind, ball } = delivery;
      return { action, target: delivery.runner, delivery: { zone, kind, ball } };
    }
  } else if (action === 'pass' || action === 'cross' || action === 'cutBack') {
    const pass = choosePass(s, side, idx, tags, r, action === 'pass' ? {} : { crossOnly: true });
    if (pass)
      return { action, target: pass.target, kind: pass.kind, lineBreaking: pass.lineBreaking };
  } else if (action !== 'carry') return { action };
  // A carry, or a pass nobody could receive: carry on, or clear when pressed deep.
  if (action !== 'carry' && tags.pressure >= 1 && tags.band <= 2) return { action: 'clearance' };
  return { action: 'carry', point: chooseCarry(s, side, idx, tags, r) };
}
