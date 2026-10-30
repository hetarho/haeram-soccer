/** Off the ball: formation shape by phase and tactic, role habit, pressing, marking, runs and movement (→MATCH-8, MATCH-17). */
import type { RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import type { Point } from './pitch';
import { attackFrame, bandOf, clamp, inBox, LANE_EDGES, PITCH, toEngine } from './pitch';
import { FORMATIONS, lineOf } from '../player';
import { actionWeight } from '../match-weights';
import type { MatchMath } from '../portable-math';
import { boxBackLine, boxGuardTarget, boxMarkPoint, defendingBox } from './box';
import { disciplineScale, freedomPlan, looseness } from './freedom';
import { coverShadow } from './lanes';
import type { GridPlayer, GridState } from './state';
import { minutesOn, onPitch, other, regMinute, skill, slotOf } from './state';
import { modelAtLeast } from './rules';
import { ROLE_SHIFT, SPOTS } from './spots';

/** Initial values; T215 and T216 tune them. */
export const SHAPE_CONFIG = {
  tactic: {
    possession: {
      advance: 8,
      defend: -2,
      line: [28, 55],
      press: 12,
      counterPress: 18,
      compact: 0.35,
    },
    press: { advance: 6, defend: 4, line: [30, 58], press: 16, counterPress: 18, compact: 0.4 },
    counter: { advance: 2, defend: -10, line: [18, 38], press: 8, counterPress: 0, compact: 0.3 },
    balanced: { advance: 4, defend: -4, line: [24, 45], press: 10, counterPress: 8, compact: 0.33 },
  },
  /**
   * Candidate model only (→MATCH-8, T321): tactics whose shape replaces their `tactic` entry. Press
   * steps up 4 m with the ball instead of 6, so its 4-2-3-1 does not crowd the box edge; counter's
   * low-to-mid block engages around halfway (line 22–42 instead of 18–38, press 11 instead of 8);
   * balanced keeps its stability with a deeper, more compact mid block that counter-presses 12 m
   * instead of 8. T324 restored MATCH-8's order of the shapes wherever the ball is: counter's
   * block stands 8 m deep (−5 under T321, −10 before), below balanced's, and possession, patient
   * on the ball, steps up 7 m instead of 8, below press's vertical side. T334: counter's back line
   * stands no deeper than balanced's floor (24 m, 22 before), so a high-line press finds less room
   * between it and the box (box entries conceded 40.6 → 34.9 a match); its block stays below
   * balanced's wherever the ball is. T336: without the ball counter's block does not follow a ball
   * in the opponents' half (`upfield` 0), so press, not counter, wins the most balls high up.
   * T371: balanced's mid block presses from 12 m instead of 10 and counter-presses from 8 instead
   * of 12, so it engages in the middle third and holds its shape after a loss (MATCH-8's
   * stability): with its settled play (`DECISION_CONFIG.direct.settled.balanced`) its xG conceded
   * fell toward the others' mean (−0.122 → −0.081 on validation rounds 53+54).
   */
  candidate: {
    /**
     * Revision 6 (T542, →MATCH-17): with the ball an outfielder off it, supporting or in his shape,
     * moves his target away from each teammate within `radius` m by `push` × (radius − distance),
     * scaled by his sense of space: the mean of 판단력 and 위치선정, 0 at `from`, 1 at `full`.
     */
    spread: { radius: 10, push: 1, from: 40, full: 90 },
    /**
     * Revision 8 (T561, →MATCH-17): with the ball each supporting player keeps `radius` m from his
     * teammates and one in his shape `room` m from the ball (the showing teammate's job is the
     * coordination's), so the side in possession does not pile onto the ball. The side without it
     * keeps revision 7's shape: spreading it too opened its box (600 matches: goals 3.18 → 3.53).
     * T561's reads (six observed matches): seven or more outfielders within 10 m of the ball in
     * 7.0% of samples on revision 7, 2.9% here; a room of 8 m left 4.7%, one only short of the
     * final third 3.8%.
     */
    revision8: { spread: { radius: 14 }, room: 10 },
    /**
     * Revision 6 (T542, →MATCH-32): with the ball in a central lane at least `from` m up the
     * attacking side's frame, a defending outfielder in his shape or covering a zone, goal-side of
     * the ball and within `reach` m across of the line from the ball to his goal, moves his target
     * across at his own depth `pull` × his sense (위치선정, 0 at `spread.from`, 1 at `spread.full`)
     * of the way onto that line.
     */
    screen: { from: 55, reach: 34, pull: 1 },
    /** Revision 7 (T548, `keeperOut`): how far the keeper comes out to a carrier in his box. */
    keeperOut: { share: 0.8, most: 12 },
    /**
     * Revision 9 (T579, →MATCH-35 r42): the keeper comes about half of the way (`share`) and never
     * onto the carrier: he stops at least `gap` m short of the ball, within `keeperOut.most`. Out
     * of possession an outfielder leans goal-side of the nearest attacker within `markRadius` m of
     * his place (`SHAPE_CONFIG.markRadius` before), so fewer forwards are left alone in front of
     * goal (→MATCH-16: goals held by how often such chances arise). T579's screens before the
     * keeper narrowed the shot (`SHOT_CONFIG.revision9`; 150 matches, goals a match): share 0.4
     * 4.12, 0.5 3.85, 0.6 3.92; `markRadius` 14 3.47, 18 3.45. With it (grid-bands 50 / core 80,
     * goals a match): gap 4 3.22 / 3.60, gap 3 3.32 / 3.38, share 0.4 4.02 / 3.63, share 0.6
     * 4.12 / –, `markRadius` 18 3.36 / 3.95.
     */
    revision9: { keeperOut: { share: 0.5, gap: 3 }, markRadius: 14 },
    /**
     * Revision 10 (T599, →MATCH-17/32/34): with the ball within `goalSide.near` m of his goal (his
     * frame's depth), every attacker within `zone` m of its middle has one marker: the free
     * outfielder in his shape nearest him within `pick` m, nearest pairs first (`goalSideMarks`).
     * The carrier counts; a man a teammate already presses or marks does not, nor one within
     * `room` m of the ball, whose marker would join the crowd around it. A back-line defender
     * takes only a man no more than `line` m in front of his line's depth, so the back line holds
     * and a man between the lines is the midfield's. The marker's place moves `blend` of the way
     * to `SHAPE_CONFIG.markGoalSide` m goal-side of his man, toward the goal's middle, and he is
     * not drawn onto the shooting line (`screen`); nobody else leans onto a marked man, so no
     * attacker draws two. A runner in behind is marked `runner.lead` m along his run
     * (`runnerMarkPoint`; 0 keeps revision 9's mark). T599's reads, grid-bands' 50 matches,
     * revision 10 before → this: shots a team 21.8 → 20.3, possessions ending in a shot 22.8% →
     * 21.6%, unopposed chances 10.7 → 9.6 a team, goals 4.20 → 3.56, held rows 24 → 24, seven or
     * more outfielders within 10 m of the ball at a decision 2.84% → 2.95%. Screens (50): any
     * back-line man marking (`line` 99) shots 21.2, goals 3.46; `room` 0 shots 20.1, goals 3.66,
     * crowd 3.19%; `room` 5 shots 21.1, goals 3.88; `room` 10 shots 20.1, goals 3.76, 23 rows;
     * `line` −3 shots 20.3, goals 3.50, 22 rows; `near` 55 / `zone` 35 / `pick` 14 shots 20.3,
     * goals 3.70, and with `room` 0 shots 18.5, goals 3.50 but crowd 3.20%; `runner.lead` 0
     * shots 19.9, goals 3.50, 21 rows. Held rows swing ±2 between screens on boundary rows.
     */
    revision10: {
      goalSide: { near: 40, zone: 30, pick: 12, blend: 0.8, line: 0, room: 8 },
      runner: { lead: 6 },
    },
    tactic: {
      possession: {
        advance: 7,
        defend: -2,
        line: [28, 55],
        press: 12,
        counterPress: 18,
        compact: 0.35,
      },
      press: { advance: 4, defend: 4, line: [30, 58], press: 16, counterPress: 18, compact: 0.4 },
      counter: {
        advance: 2,
        defend: -8,
        line: [24, 42],
        press: 11,
        counterPress: 0,
        compact: 0.3,
        upfield: 0,
      },
      balanced: {
        advance: 4,
        defend: -6,
        line: [24, 45],
        press: 12,
        counterPress: 8,
        compact: 0.38,
      },
    } as Partial<Record<Tactic, TacticShape>>,
    /**
     * Late runs into the box (T398, →MATCH-17, MATCH-23): a box run starts from band `from` on,
     * `odds` times as often, and `extra` roles make it too (a role also listed for runs in
     * behind then runs into the box instead). Neutral at 1, band 5 and none. T398 keeps `odds` 1.3:
     * midfielders take 34% of the box shots (30%) and score 34% of the goals, forwards 57% (61%).
     */
    boxRun: { odds: 1.3, from: 5, extra: [] as readonly RoleId[] },
    /**
     * Two-striker shapes (T398): a striker of a listed role stands `drop` m deeper in possession
     * once the ball is in front of the box, so the box is left for arriving midfielders. Neutral
     * at 0.
     */
    secondStriker: { drop: 0, roles: ['targetMan'] as readonly RoleId[] },
    /**
     * The flank beside a back three (T399, →MATCH-8, MATCH-17): out of possession, with the ball
     * at least `wide` m off the centre line and no further up the pitch than `upTo` m (the
     * defending side's frame), the ball-side wing-back closes `follow` of the way toward the ball's
     * line and the ball-side wide centre-back steps `channel` m toward the touchline, covering the
     * channel between them, and the far wing-back tucks `tuck` of the way toward the centre line,
     * one more defender in the box against the cross. Shapes with three centre-backs only;
     * neutral at 0, 0 and 0. T399 keeps `follow` 0.4 and `channel` 3 with the cross block
     * (`DUEL_CONFIG.candidate.crossPressure`): balanced's xG conceded against the others' mean
     * −0.041 → −0.017; a tucked far wing-back moved nothing (0).
     */
    flank: { follow: 0.4, channel: 3, tuck: 0, wide: 18, upTo: 60 },
  },
  lateral: 0.25,
  /** With the ball behind it the back line drops to this many metres goal-side of it, never deeper than `min`. */
  deepLine: { behindBall: 4, min: 6 },
  keeperPull: 0.08,
  keeperMax: { sweeperKeeper: 22, other: 14 },
  /** Metres a sweeper keeper steps up per metre his line stands above 20 m, once it is at 40 m. */
  sweeperStep: 0.3,
  markBlend: 0.4,
  markRadius: 10,
  /** Metres goal-side of his man a presser and a marker stand; a cover stands this far behind the presser toward goal. */
  pressGoalSide: 1.2,
  markGoalSide: 1.5,
  coverDepth: 8,
  counterPressSeconds: 5,
  /** Seconds after a turnover in which the side that lost the ball recovers faster. */
  transitionSeconds: 4,
  recoverySpeed: 1.15,
  speed: { base: 5.2, pace: 2.8, tired: 0.25 },
  run: { chance: 0.04, seconds: [4, 6], behindDepth: 6, overlapAhead: 10, boxX: 95 },
  /**
   * Candidate model only (→MATCH-8, T324): roles that also run in behind while their side breaks
   * straight after a regain (`COORDINATION_CONFIG.transition`), so a 4-4-2's wide midfielders go
   * with its forwards instead of holding their spots.
   */
  breakRoles: ['wideMidfielder'] as readonly RoleId[],
  /**
   * A corner or a free kick crossed into the box (→MATCH-18, T215): the attacking side's best headers go up,
   * the defenders mark them goal-side and hold the six-yard line; attack-frame metres of the attacking side.
   */
  setPiece: {
    box: [
      [98.5, 30.5],
      [98.5, 37.5],
      [95, 34],
      [93, 27],
      [93, 41],
    ],
    edge: [86.5, 34],
    mark: 0.8,
    zonal: [
      [101.5, 31],
      [101.5, 37],
      [100.5, 34],
    ],
    /** Outfielders of the defending side who stay upfield for the counter (revisions 1–3). */
    stayUp: 1,
    /**
     * Revision 4 (T480, →MATCH-18): a corner's numbers, each `[least, most]` drawn per corner — the
     * attacking side's outfielders kept back as rest defence and the defending side's left up as
     * outlets — and from `lateMinute` (regulation) the score's: a side behind sends more up, a side
     * ahead keeps more back and, defending, brings everyone into the box. In added time of the last
     * period a side one goal behind sends its keeper to `keeperSpot`. The rest stand at `restX`
     * goal-side of the outlets (`outletX`, `outletY`, in their own half) and at `restCoverX`
     * when there are more of them; more attackers up take `extraBox`, more defenders back
     * `extraZonal`. The extra spots and the keeper's lie more than `zone` m from every zonal one,
     * so no zone starts on a runner. Attack-frame metres of the corner's side.
     */
    numbers: {
      rest: [2, 3],
      outlets: [1, 2],
      lateMinute: 80,
      chasingRest: [1, 2],
      protectingRest: [3, 4],
      chasingOutlets: [2, 2],
      protectingOutlets: [0, 0],
      restX: 50,
      restCoverX: 45,
      outletX: 55,
      outletY: [24, 44],
      keeperSpot: [94, 30.5],
      extraBox: [
        [97, 27.5],
        [97, 40.5],
        [91, 34],
      ],
      extraZonal: [
        [101.5, 40],
        [101.5, 28],
      ],
    },
    /** Seconds after the delivery the players who went up hold their spots for the second ball. */
    stay: 8,
    /**
     * Candidate model only (T348): the defenders keep their jobs after the kick for as long. A
     * zonal or edge defender guards his spot and meets goal-side a runner who comes within `zone`
     * m of it.
     */
    zone: 3,
    /**
     * Candidate model only (T348): the keeper stands on the line from the middle of his goal to the
     * ball, `share` of its distance out but at most `depth` m, at least `line` m off his line and no
     * more than `wide` m either side of the goal's middle (a post is 3.66 m from it).
     */
    keeper: { share: 0.25, depth: 4, line: 1, wide: 4.66 },
    /**
     * Candidate model only (T348): the second ball is over once the ball is more than `area` m
     * from the goal line it is delivered at, the defenders' danger distance
     * (`INTENTION_CONFIG.danger`); the zone and goal guards are then released.
     */
    area: 30,
  },
} as const;

/**
 * A tactic's shape: metres its players step up with the ball (`advance`) and without it (`defend`),
 * its back line's bounds, its press and counter-press reach and how far the block follows the ball.
 */
export interface TacticShape {
  advance: number;
  defend: number;
  line: readonly [number, number];
  press: number;
  counterPress: number;
  compact: number;
  /**
   * Without the ball, how far the block follows a ball in the opponents' half instead of
   * `compact` (candidate shapes only, T336): below it the side drops to its block rather than
   * standing up to contest the ball high.
   */
  upfield?: number;
}

/** The shape `side`'s tactic plays on this fixture's model. */
export function tacticShape(s: GridState, side: 0 | 1): TacticShape {
  const tactic = s.setup.tactics[side];
  return (
    (s.setup.model !== undefined && SHAPE_CONFIG.candidate.tactic[tactic]) ||
    SHAPE_CONFIG.tactic[tactic]
  );
}

type Line = 'DF' | 'MF' | 'FW';
const BEHIND_ROLES = ['attackingMidfielder', 'shadowStriker', 'trequartista'];
const OVERLAP_ROLES = ['overlappingFullBack', 'attackingWingBack'];
/** Roles whose run is a late run into the box (`runPlan`); the box scene reads them too (T443). */
export const BOX_ROLES: readonly RoleId[] = ['boxToBox', 'mezzala', 'shadowStriker'];
const CENTRE = PITCH.width / 2;
const MID = PITCH.length / 2;

/**
 * Per tactic, read by `shapePlace` from its formation instead of on every call: its centre-back
 * slots, the widest of them toward the left (smallest y, first on a tie) and right touchline, and
 * whether it fields two forwards or more.
 */
const FORMATION_FACTS = Object.fromEntries(
  (Object.keys(FORMATIONS) as Tactic[]).map((tactic) => {
    const slots = FORMATIONS[tactic].slots;
    const cbs = slots.flatMap((slot, i) => (slot.position === 'CB' ? [i] : []));
    const y = (i: number) => SPOTS[tactic][i]![1];
    const widest = (left: boolean) =>
      cbs.length ? cbs.reduce((a, b) => ((left ? y(b) < y(a) : y(b) > y(a)) ? b : a)) : -1;
    return [
      tactic,
      {
        backThree: cbs.length >= 3,
        wideLeft: widest(true),
        wideRight: widest(false),
        twoForwards: slots.filter((slot) => lineOf(slot.position) === 'FW').length >= 2,
      },
    ];
  }),
) as Record<
  Tactic,
  { backThree: boolean; wideLeft: number; wideRight: number; twoForwards: boolean }
>;

const lineOfSlot = (s: GridState, gp: GridPlayer): 'GK' | Line =>
  lineOf(slotOf(s, gp).position) as 'GK' | Line;

/** Mean x, in the side's attack frame, of its on-pitch outfield players of a line (the pitch's middle when none). */
export function lineX(s: GridState, side: 0 | 1, line: Line): number {
  let sum = 0,
    count = 0;
  for (const gp of s.players[side])
    if (onPitch(gp) && lineOfSlot(s, gp) === line) {
      // `attackFrame(side, gp.pos)[0]` without allocating.
      sum += side === 0 ? gp.pos[0] : PITCH.length - gp.pos[0];
      count++;
    }
  return count ? sum / count : MID;
}

/** The x of the second-last defending player (goalkeeper counts), in the attacking side's frame. */
export function offsideLine(s: GridState, defendingSide: 0 | 1): number {
  // The two largest x in one pass: the values a descending sort would put first and second.
  const flip = defendingSide === 0;
  let first = -Infinity,
    second = -Infinity,
    count = 0;
  for (const gp of s.players[defendingSide]) {
    if (!onPitch(gp)) continue;
    const x = flip ? PITCH.length - gp.pos[0] : gp.pos[0];
    if (x > first) {
      second = first;
      first = x;
    } else if (x > second) second = x;
    count++;
  }
  return count > 1 ? second : count ? first : PITCH.length;
}

/** Whether the side lost the ball within the counter-press window. */
const lostRecently = (s: GridState, side: 0 | 1, seconds: number) =>
  s.lastLoss !== undefined && s.lastLoss.side === side && s.elapsed - s.lastLoss.at < seconds;

/** The pressers of a side while it defends, as roster indexes. */
export function pressers(s: GridState, side: 0 | 1): number[] {
  const cfg = tacticShape(s, side);
  const reach = lostRecently(s, side, SHAPE_CONFIG.counterPressSeconds)
    ? Math.max(cfg.press, cfg.counterPress)
    : cfg.press;
  const near = s.players[side]
    .filter(
      (gp) =>
        onPitch(gp) &&
        lineOfSlot(s, gp) !== 'GK' &&
        !(s.owner && s.owner[0] === side && s.owner[1] === gp.idx),
    )
    .map((gp) => ({ idx: gp.idx, d: s.math.hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) }))
    .sort((a, b) => a.d - b.d || a.idx - b.idx);
  const out: number[] = [];
  if (near[0] && near[0].d <= reach) out.push(near[0].idx);
  if (s.setup.tactics[side] === 'press' && near[1] && near[1].d <= 0.6 * reach)
    out.push(near[1].idx);
  return out;
}

/** Values every player of a side shares in one step, computed once per side (a pure speed-up of `targetOf`). */
export interface ShapeCache {
  offside: [number?, number?];
  pressers: [number[]?, number[]?];
  defence: [number?, number?];
  /** Each side's on-pitch outfielders in roster order, the players a marker leans toward. */
  outfield?: [GridPlayer[]?, GridPlayer[]?];
  /** Each side's defence against a box scene (`defendingBox`, candidate model, T443): the ball's side, or 0. */
  box?: [number?, number?];
  /** Each side's goal-side marks near its box (`goalSideMarks`, revision 10), or null when off. */
  goalSide?: [(GoalSideMarks | null)?, (GoalSideMarks | null)?];
}

/** Revision 10's goal-side marks of a defending side (T599): its marker → his man, and the men marked. */
export interface GoalSideMarks {
  /** By the defending side's roster index: the opponent's roster index he marks, or −1. */
  man: Int8Array;
  /** By the opponent's roster index: 1 when one of them marks him. */
  taken: Uint8Array;
}

/**
 * Revision 10 (T599, `SHAPE_CONFIG.candidate.revision10.goalSide`): out of possession, with the
 * ball within `near` m of `side`'s goal, each attacker within `zone` m of the goal's middle — the
 * carrier too, but not a man a teammate already presses or marks — is paired with the free
 * outfielder (no intention) nearest him within `pick` m, nearest pairs first and equal gaps by
 * player ID, so one marker a man and one man a marker; null when the rule is off (before revision
 * 10, with the ball, or the ball further out). Read once per cache.
 */
export function goalSideMarks(
  s: GridState,
  side: 0 | 1,
  cache: ShapeCache = { offside: [], pressers: [], defence: [] },
): GoalSideMarks | null {
  const held = (cache.goalSide ??= [])[side];
  if (held !== undefined) return held;
  const G = SHAPE_CONFIG.candidate.revision10.goalSide;
  const foe = other(side);
  const bx = side === 0 ? s.ball[0] : PITCH.length - s.ball[0];
  if (!modelAtLeast(s.setup, 10) || s.possession === side || bx > G.near)
    return (cache.goalSide[side] = null);
  const tracked = new Uint8Array(s.players[foe].length);
  for (const gp of s.players[side]) {
    const i = gp.intention;
    if (onPitch(gp) && i && (i.kind === 'press' || i.kind === 'mark') && i.opponent !== undefined)
      tracked[i.opponent] = 1;
  }
  // Squared distances: the same nearest-first order, without a square root per pair.
  const men = s.players[foe].filter((opp) => {
    if (!onPitch(opp) || opp.slot === 0 || tracked[opp.idx]) return false;
    const carrier = s.owner !== undefined && s.owner[0] === foe && s.owner[1] === opp.idx;
    const bx = opp.pos[0] - s.ball[0],
      by = opp.pos[1] - s.ball[1];
    if (!carrier && bx * bx + by * by < G.room * G.room) return false;
    const ox = side === 0 ? opp.pos[0] : PITCH.length - opp.pos[0];
    const oy = side === 0 ? opp.pos[1] - CENTRE : CENTRE - opp.pos[1];
    return ox * ox + oy * oy <= G.zone * G.zone;
  });
  const marks: GoalSideMarks = {
    man: new Int8Array(s.players[side].length).fill(-1),
    taken: new Uint8Array(s.players[foe].length),
  };
  if (!men.length) return (cache.goalSide[side] = marks);
  const pairs: { gp: GridPlayer; opp: GridPlayer; d: number }[] = [];
  const front = (cache.defence[side] ??= lineX(s, side, 'DF')) + G.line;
  for (const gp of s.players[side]) {
    if (!onPitch(gp) || gp.slot === 0 || gp.intention) continue;
    const back = lineOfSlot(s, gp) === 'DF';
    for (const opp of men) {
      if (back && (side === 0 ? opp.pos[0] : PITCH.length - opp.pos[0]) > front) continue;
      const dx = gp.pos[0] - opp.pos[0],
        dy = gp.pos[1] - opp.pos[1];
      const d = dx * dx + dy * dy;
      if (d <= G.pick * G.pick) pairs.push({ gp, opp, d });
    }
  }
  pairs.sort(
    (a, b) =>
      a.d - b.d ||
      (a.opp.player.id < b.opp.player.id ? -1 : a.opp.player.id > b.opp.player.id ? 1 : 0) ||
      (a.gp.player.id < b.gp.player.id ? -1 : a.gp.player.id > b.gp.player.id ? 1 : 0),
  );
  for (const { gp, opp } of pairs) {
    if (marks.man[gp.idx]! >= 0 || marks.taken[opp.idx]) continue;
    marks.man[gp.idx] = opp.idx;
    marks.taken[opp.idx] = 1;
  }
  return (cache.goalSide[side] = marks);
}

/** A player's target in the engine frame. */
export function targetOf(
  s: GridState,
  side: 0 | 1,
  idx: number,
  cache: ShapeCache = { offside: [], pressers: [], defence: [] },
): [number, number] {
  const gp = s.players[side][idx]!;
  // The candidate model's intentions (`intentions.ts`) take him where they go, ahead of his shape.
  if (gp.intention) return intentionTarget(s, gp);
  if (gp.run && gp.run.until > s.elapsed && lineOfSlot(s, gp) !== 'GK') return [...gp.run.target];
  const place = shapePlace(s, side, idx, cache);
  // A loose shape (revision 2, T432): an outfielder keeps part of his distance from his place, less
  // the more disciplined he is (T433).
  const k = gp.slot > 0 ? looseness(s, side) * disciplineScale(s, side, idx) : 0;
  const loose: [number, number] = k
    ? [place[0] + (gp.pos[0] - place[0]) * k, place[1] + (gp.pos[1] - place[1]) * k]
    : place;
  // A goal-side marker (revision 10) keeps to his man, not to the shooting line (→MATCH-32).
  if ((goalSideMarks(s, side, cache)?.man[idx] ?? -1) >= 0) return loose;
  return screen(s, gp, spread(s, gp, loose));
}

/**
 * Revision 6 (T542, →MATCH-32): without the ball, with it central in front of his goal, a
 * defender's target drawn onto the line from the ball to his goal by his 위치선정
 * (`SHAPE_CONFIG.candidate.screen`); any other target unchanged.
 */
function screen(s: GridState, gp: GridPlayer, target: [number, number]): [number, number] {
  if (!modelAtLeast(s.setup, 6) || s.possession === gp.side || lineOfSlot(s, gp) === 'GK')
    return target;
  const S = SHAPE_CONFIG.candidate.screen;
  const attacking = other(gp.side);
  const b = attackFrame(attacking, s.ball);
  if (b[0] < S.from || b[1] < LANE_EDGES[1] || b[1] > LANE_EDGES[4]) return target;
  const R = SHAPE_CONFIG.candidate.spread;
  const sense = clamp(
    (skill(s, gp.side, gp.idx, 'positioning') - R.from) / (R.full - R.from),
    0,
    1,
  );
  if (sense === 0) return target;
  const t = attackFrame(attacking, target);
  // Only a defender goal-side of the ball, across at his own depth, so each tactic keeps its block.
  if (t[0] <= b[0]) return target;
  const line = b[1] + ((PITCH.width / 2 - b[1]) * (t[0] - b[0])) / (PITCH.length - b[0]);
  if (Math.abs(t[1] - line) > S.reach) return target;
  return toEngine(attacking, [t[0], t[1] + (line - t[1]) * S.pull * sense]);
}

/**
 * Revision 6 (T542, →MATCH-17): with the ball, an outfielder's target kept clear of his teammates
 * by his sense of space (`SHAPE_CONFIG.candidate.spread`); any other target unchanged. A support
 * intention takes it when it is set (`setIntention`), a place in the shape every time it is read.
 */
export function spread(s: GridState, gp: GridPlayer, target: [number, number]): [number, number] {
  const r8 = modelAtLeast(s.setup, 8);
  if (!modelAtLeast(s.setup, 6) || s.possession !== gp.side || lineOfSlot(s, gp) === 'GK')
    return target;
  if (s.owner && s.owner[0] === gp.side && s.owner[1] === gp.idx) return target;
  const S = SHAPE_CONFIG.candidate.spread;
  const radius = r8 ? SHAPE_CONFIG.candidate.revision8.spread.radius : S.radius;
  const sense = clamp(
    ((skill(s, gp.side, gp.idx, 'decisions') + skill(s, gp.side, gp.idx, 'positioning')) / 2 -
      S.from) /
      (S.full - S.from),
    0,
    1,
  );
  let [x, y] = target;
  // Revision 8 (T561): with the ball, room around the carrier for the showing teammate alone.
  const room = SHAPE_CONFIG.candidate.revision8.room;
  if (r8 && s.possession === gp.side && gp.intention?.kind !== 'support') {
    const dx = x - s.ball[0],
      dy = y - s.ball[1];
    const d = s.math.hypot(dx, dy);
    if (d < room && d > 1e-9) [x, y] = [s.ball[0] + (dx / d) * room, s.ball[1] + (dy / d) * room];
  }
  if (sense === 0) return [clamp(x, 0, PITCH.length), clamp(y, 0, PITCH.width)];
  for (const mate of s.players[gp.side]) {
    if (mate === gp) continue;
    const dx = x - mate.pos[0],
      dy = y - mate.pos[1];
    // `hypot` (portable or the host's) is never below the larger magnitude, so a mate a radius off
    // on either axis is out of reach without it.
    if (Math.abs(dx) >= radius || Math.abs(dy) >= radius) continue;
    if (!onPitch(mate) || lineOfSlot(s, mate) === 'GK') continue;
    const d = s.math.hypot(dx, dy);
    if (d >= radius || d < 1e-9) continue;
    const k = (S.push * sense * (radius - d)) / d;
    x += dx * k;
    y += dy * k;
  }
  return [clamp(x, 0, PITCH.length), clamp(y, 0, PITCH.width)];
}

/**
 * A player's place in his side's shape now (engine frame), whatever he intends: his slot's phase
 * spot moved by role habit, block height and the ball, the keeper's own place, the pre-feature
 * presser's press. Coordination reads it as the zone a player leaves for a job (→MATCH-17).
 */
export function shapePlace(
  s: GridState,
  side: 0 | 1,
  idx: number,
  cache: ShapeCache = { offside: [], pressers: [], defence: [] },
): [number, number] {
  const gp = s.players[side][idx]!;
  const tactic = s.setup.tactics[side];
  const cfg = tacticShape(s, side);
  const own = lineOfSlot(s, gp);
  // The ball in the side's attack frame (`attackFrame`, without allocating).
  const bx = side === 0 ? s.ball[0] : PITCH.length - s.ball[0];
  const by = side === 0 ? s.ball[1] : PITCH.width - s.ball[1];
  if (own === 'GK') {
    const out = keeperOut(s, side, bx, by);
    if (out) return toEngine(side, out);
    const sweeper = slotOf(s, gp).role === 'sweeperKeeper';
    const df = (cache.defence[side] ??= lineX(s, side, 'DF'));
    const high = sweeper && df >= 40;
    let x = 4 + (bx - MID) * SHAPE_CONFIG.keeperPull;
    if (high) x += SHAPE_CONFIG.sweeperStep * (df - 20);
    x = clamp(x, 2, high ? SHAPE_CONFIG.keeperMax.sweeperKeeper : SHAPE_CONFIG.keeperMax.other);
    return toEngine(side, [x, CENTRE + (by - CENTRE) * 0.15]);
  }
  // Revision 2 (T432): the slot whose job he plays after a swap, and where his freedom takes him.
  const freedom = freedomPlan(s, side);
  const job = freedom ? freedom.job[idx]! : gp.slot;
  const jobSlot = s.formation[side][job]!;
  const line = job === gp.slot ? own : (lineOf(jobSlot.position) as Line);
  const spot = s.spots[side][job]!;
  const inPossession = s.possession === side;
  let x = spot[0],
    y = spot[1];
  if (inPossession) {
    x += cfg.advance;
    const shift = ROLE_SHIFT[jobSlot.role];
    if (shift) {
      x += shift[0];
      y += spot[1] < CENTRE ? shift[1] : spot[1] > CENTRE ? -shift[1] : 0;
    }
  } else x += cfg.defend;
  x +=
    (bx - MID) *
    (!inPossession && bx > MID && cfg.upfield !== undefined ? cfg.upfield : cfg.compact);
  y += (by - CENTRE) * SHAPE_CONFIG.lateral;
  if (freedom) {
    x += freedom.dx[idx]!;
    y += freedom.dy[idx]!;
  }
  // The flank beside a back three, out of possession (candidate model, T399).
  const F = SHAPE_CONFIG.candidate.flank;
  if (
    !inPossession &&
    (F.follow || F.channel || F.tuck) &&
    s.setup.model !== undefined &&
    Math.abs(by - CENTRE) >= F.wide &&
    bx <= F.upTo
  ) {
    const facts = FORMATION_FACTS[tactic];
    if (facts.backThree) {
      const left = by < CENTRE;
      const pos = jobSlot.position;
      if ((left && pos === 'LWB') || (!left && pos === 'RWB')) y += (by - y) * F.follow;
      else if ((left && pos === 'RWB') || (!left && pos === 'LWB')) y += (CENTRE - y) * F.tuck;
      if (job === (left ? facts.wideLeft : facts.wideRight)) y += left ? -F.channel : F.channel;
    }
  }
  if (inPossession) {
    const foe = other(side);
    // A second striker leaves the box to arriving midfielders (candidate model, T398).
    const SS = SHAPE_CONFIG.candidate.secondStriker;
    if (
      SS.drop &&
      s.setup.model !== undefined &&
      bandOf(bx) >= 5 &&
      SS.roles.includes(jobSlot.role) &&
      FORMATION_FACTS[tactic].twoForwards
    )
      x -= SS.drop;
    x = Math.min(x, (cache.offside[foe] ??= offsideLine(s, foe)) - 0.5);
    return toEngine(side, [x, y]);
  }
  // On the candidate model only a press intention presses; this is the pre-feature presser.
  if (s.setup.model === undefined && (cache.pressers[side] ??= pressers(s, side)).includes(idx))
    return pressPoint(s, gp, [bx, by], false);
  const foe = other(side);
  const { hypot } = s.math;
  // Revision 10 (T599): near his box he marks the man his side pairs him with, goal-side.
  const marks = goalSideMarks(s, side, cache);
  const man = marks ? marks.man[idx]! : -1;
  if (marks && man >= 0) {
    const opp = s.players[foe][man]!;
    const ox = side === 0 ? opp.pos[0] : PITCH.length - opp.pos[0];
    const oy = side === 0 ? opp.pos[1] : PITCH.width - opp.pos[1];
    const d = hypot(ox, oy - CENTRE);
    const step = d > 0 ? Math.min(SHAPE_CONFIG.markGoalSide, d) / d : 0;
    const blend = SHAPE_CONFIG.candidate.revision10.goalSide.blend;
    x += (ox - ox * step - x) * blend;
    y += (oy + (CENTRE - oy) * step - y) * blend;
  } else {
    // Another outfielder leans toward the goal-side point of the nearest attacker around his spot,
    // further around it on revision 9 (T579), never onto a man a teammate marks (revision 10).
    let best: number = modelAtLeast(s.setup, 9)
      ? SHAPE_CONFIG.candidate.revision9.markRadius
      : SHAPE_CONFIG.markRadius;
    // `attackFrame` inlined, so the scan allocates nothing.
    let found = false,
      nx = 0,
      ny = 0;
    const foes = ((cache.outfield ??= [])[foe] ??= s.players[foe].filter(
      (opp) => onPitch(opp) && lineOfSlot(s, opp) !== 'GK',
    ));
    for (const opp of foes) {
      if (marks?.taken[opp.idx]) continue;
      const ox = side === 0 ? opp.pos[0] : PITCH.length - opp.pos[0];
      const oy = side === 0 ? opp.pos[1] : PITCH.width - opp.pos[1];
      // The distance is at least either offset, so a man further off on one axis cannot be nearer.
      if (Math.abs(ox - x) > best || Math.abs(oy - y) > best) continue;
      const d = hypot(ox - x, oy - y);
      if (d <= best) {
        found = true;
        nx = ox;
        ny = oy;
        best = d;
      }
    }
    if (found) {
      x += (nx - SHAPE_CONFIG.markGoalSide - x) * SHAPE_CONFIG.markBlend;
      y += (ny - y) * SHAPE_CONFIG.markBlend;
    }
  }
  // Against a box scene the back line drops toward its goal and narrows (candidate model, T443).
  if (
    line === 'DF' &&
    s.setup.model !== undefined &&
    ((cache.box ??= [])[side] ??= defendingBox(s, side) ?? 0) !== 0
  )
    return toEngine(side, boxBackLine(s, side, y));
  if (line === 'DF') x = clamp(x, lineFloor(bx, cfg.line[0]), cfg.line[1]);
  return toEngine(side, [x, y]);
}

/** The deepest the back line stands: its tactic's line, or goal-side of a ball played in behind it (T215). */
export const lineFloor = (ball: number, line: number) =>
  Math.min(line, Math.max(SHAPE_CONFIG.deepLine.min, ball - SHAPE_CONFIG.deepLine.behindBall));

/**
 * Where a presser of `gp`'s side goes for the ball at `at` (his attack frame): goal-side of it,
 * bent toward `option` (his attack frame) to keep it in his cover shadow (`coverShadow`, candidate
 * model, T442), a defender within his line's bounds unless `urgent` (an urgent danger pulls him
 * out of the line).
 */
function pressPoint(
  s: GridState,
  gp: GridPlayer,
  at: Point,
  urgent: boolean,
  option?: Point,
): [number, number] {
  const side = gp.side;
  const cfg = tacticShape(s, side);
  const goalSide: Point = [at[0] - SHAPE_CONFIG.pressGoalSide, at[1]];
  const [x, y] = option ? coverShadow(goalSide, at, option) : goalSide;
  return toEngine(side, [
    lineOfSlot(s, gp) === 'DF' && !urgent
      ? clamp(x, lineFloor(at[0], cfg.line[0]), cfg.line[1])
      : Math.max(0, x),
    y,
  ]);
}

/**
 * Where a teammate covers `mate` of `side` (engine frame): `coverDepth` m behind him toward the own
 * goal's centre; `math` is the match's.
 */
export function coverPoint(side: 0 | 1, mate: GridPlayer, math: MatchMath): [number, number] {
  const p = attackFrame(side, mate.pos);
  const dx = -p[0],
    dy = CENTRE - p[1];
  const d = math.hypot(dx, dy);
  const depth = Math.min(SHAPE_CONFIG.coverDepth, d);
  return toEngine(side, d > 0 ? [p[0] + (dx / d) * depth, p[1] + (dy / d) * depth] : p);
}

/**
 * Where `gp`'s intention takes him now (engine frame, →MATCH-17): a press or a mark goes goal-side of
 * the opponent it tracks (a tactical press bent to keep the option it names behind him, T442; a
 * mark of a box-scene runner between him and his zone, T443), a cover behind the teammate who
 * presses, a set-piece guard to its zone or goal (`guardPoint`), a box guard to its zone or
 * goal-side of the runner attacking it (`boxGuardTarget`); every other kind holds the target it
 * was given. A reference that has left the pitch falls back
 * to that target.
 */
export function intentionTarget(s: GridState, gp: GridPlayer): [number, number] {
  const i = gp.intention!;
  const side = gp.side;
  const foe = i.opponent === undefined ? undefined : s.players[other(side)][i.opponent];
  const mate = i.teammate === undefined ? undefined : s.players[side][i.teammate];
  if (foe && onPitch(foe) && i.kind === 'press') {
    const urgent = i.priority === 'danger';
    const option = urgent || i.shadow === undefined ? undefined : s.players[other(side)][i.shadow];
    return pressPoint(
      s,
      gp,
      attackFrame(side, foe.pos),
      urgent,
      option && onPitch(option) ? attackFrame(side, option.pos) : undefined,
    );
  }
  // A runner on a box-scene run is marked between him and his zone (T443).
  if (foe && onPitch(foe) && i.kind === 'mark')
    return boxMarkPoint(side, foe) ?? runnerMarkPoint(s, side, foe) ?? goalSideOf(side, foe);
  if (i.kind === 'cover' && i.box) return boxGuardTarget(s, gp, i.box.zone, i.box.ball);
  // A zone or a teammate covered keeps to the shooting line in front of goal (revision 6, T542).
  if (i.kind === 'cover' && i.zone) return screen(s, gp, guardPoint(s, gp, i.zone));
  if (mate && onPitch(mate) && i.kind === 'cover')
    return screen(s, gp, coverPoint(side, mate, s.math));
  return [i.target[0], i.target[1]];
}

/**
 * Revision 10 (T599, `SHAPE_CONFIG.candidate.revision10.runner`, →MATCH-17): a runner in behind is
 * marked goal-side along his run — `lead` m ahead of him toward its target, no further than it,
 * then `markGoalSide` m toward the goal's middle — so his marker goes with him into the space he
 * attacks instead of trailing where he was. Undefined before revision 10 and for any other man.
 */
function runnerMarkPoint(s: GridState, side: 0 | 1, foe: GridPlayer): [number, number] | undefined {
  const run = foe.intention;
  const { lead } = SHAPE_CONFIG.candidate.revision10.runner;
  if (!modelAtLeast(s.setup, 10) || lead <= 0 || run?.kind !== 'run' || run.run !== 'behind')
    return undefined;
  const { hypot } = s.math;
  const o = attackFrame(side, foe.pos);
  const t = attackFrame(side, run.target);
  const dx = t[0] - o[0],
    dy = t[1] - o[1];
  const d = hypot(dx, dy);
  const k = d > 0 ? Math.min(lead, d) / d : 0;
  const px = o[0] + dx * k,
    py = o[1] + dy * k;
  const g = hypot(px, py - CENTRE);
  const step = g > 0 ? Math.min(SHAPE_CONFIG.markGoalSide, g) / g : 0;
  return toEngine(side, [px - px * step, py + (CENTRE - py) * step]);
}

/** `markGoalSide` m goal-side of opponent `foe` for `side` (engine frame). */
function goalSideOf(side: 0 | 1, foe: GridPlayer): [number, number] {
  const o = attackFrame(side, foe.pos);
  return toEngine(side, [Math.max(0, o[0] - SHAPE_CONFIG.markGoalSide), o[1]]);
}

/**
 * Where a set-piece guard of `gp` stands now (engine frame, →MATCH-18, T348). The keeper guards
 * his goal (`zone` is the middle of its line) against the ball as it is now — after a kick, where
 * the delivery goes — on the line from the goal's middle to it. A zonal or edge defender guards
 * `zone`: goal-side of the opponent nearest it within `setPiece.zone` m, else on it.
 */
export function guardPoint(
  s: GridState,
  gp: GridPlayer,
  zone: readonly [number, number],
): [number, number] {
  const side = gp.side;
  const P = SHAPE_CONFIG.setPiece;
  const { hypot } = s.math;
  const z = attackFrame(side, zone);
  if (lineOfSlot(s, gp) === 'GK') {
    const b = attackFrame(side, s.ball);
    const dx = b[0] - z[0],
      dy = b[1] - z[1];
    const d = hypot(dx, dy);
    const out = Math.min(P.keeper.depth, d * P.keeper.share);
    const [x, y] = d > 0 ? [z[0] + (dx / d) * out, z[1] + (dy / d) * out] : z;
    return toEngine(side, [
      Math.max(z[0] + P.keeper.line, x),
      clamp(y, z[1] - P.keeper.wide, z[1] + P.keeper.wide),
    ]);
  }
  let near: GridPlayer | undefined,
    best: number = P.zone;
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp) || lineOfSlot(s, opp) === 'GK') continue;
    const o = attackFrame(side, opp.pos);
    const d = hypot(o[0] - z[0], o[1] - z[1]);
    // The nearest, the first in roster order among equals.
    if (d < best || (!near && d === best)) [near, best] = [opp, d];
  }
  return near ? goalSideOf(side, near) : [zone[0], zone[1]];
}

/**
 * Whether the second ball of `attacking`'s delivery is over: the ball more than `setPiece.area` m
 * from the goal line it attacks (T348).
 */
export const secondBallOver = (s: GridState, attacking: 0 | 1) =>
  attackFrame(attacking, s.ball)[0] < PITCH.length - SHAPE_CONFIG.setPiece.area;

/** How fast a player can move now, in metres per second. */
export function speedOf(s: GridState, gp: GridPlayer): number {
  const { base, pace, tired } = SHAPE_CONFIG.speed;
  const v =
    (base + (pace * gp.player.attrs.pace) / 99) * (1 - tired * Math.min(1, minutesOn(s, gp) / 90));
  return lostRecently(s, gp.side, SHAPE_CONFIG.transitionSeconds)
    ? v * SHAPE_CONFIG.recoverySpeed
    : v;
}

/**
 * Revision 7 (T548, `SHAPE_CONFIG.candidate.keeperOut`): with an opponent carrying the ball in
 * his box, the keeper comes off his line toward it along the line from his goal's middle, `share`
 * of the way and at most `most` m out, narrowing the angle; `undefined` otherwise. On revision 9
 * (T579, `revision9.keeperOut`) about half of the way and never closer than `gap` m to the ball.
 * `bx`, `by`: the ball in his side's attack frame (his goal at x 0).
 */
function keeperOut(s: GridState, side: 0 | 1, bx: number, by: number): Point | undefined {
  if (!modelAtLeast(s.setup, 7) || s.possession === side || !s.owner) return undefined;
  const K = SHAPE_CONFIG.candidate.keeperOut;
  if (!inBox(attackFrame(other(side), s.ball))) return undefined;
  const d = s.math.hypot(bx, by - CENTRE);
  if (d <= 0) return undefined;
  const R9 = SHAPE_CONFIG.candidate.revision9.keeperOut;
  const reach = modelAtLeast(s.setup, 9)
    ? Math.max(0, Math.min(K.most, d * R9.share, d - R9.gap))
    : Math.min(K.most, d * K.share);
  return [(bx / d) * reach, CENTRE + ((by - CENTRE) / d) * reach];
}

/** Every on-pitch player but the carrier takes a step toward his target. */
export function moveAll(s: GridState, dt: number): void {
  const moves: [GridPlayer, [number, number]][] = [];
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  for (const side of [0, 1] as const)
    for (const gp of s.players[side]) {
      if (!onPitch(gp) || (s.owner && s.owner[0] === side && s.owner[1] === gp.idx)) continue;
      moves.push([gp, targetOf(s, side, gp.idx, cache)]);
    }
  for (const [gp, target] of moves) {
    const dx = target[0] - gp.pos[0],
      dy = target[1] - gp.pos[1];
    const d = s.math.hypot(dx, dy);
    const step = Math.min(d, speedOf(s, gp) * dt);
    if (d > 0) {
      gp.pos[0] = clamp(gp.pos[0] + (dx / d) * step, 0, PITCH.length);
      gp.pos[1] = clamp(gp.pos[1] + (dy / d) * step, 0, PITCH.width);
    }
  }
}

/** Where the side with the ball attacks from: the ball in its frame, its band and the opponent's offside line. */
export interface RunContext {
  b: Point;
  band: number;
  line: number;
}

export function runContext(s: GridState, side: 0 | 1): RunContext {
  const b = attackFrame(side, s.ball);
  return { b, band: bandOf(b[0]), line: offsideLine(s, other(side)) };
}

/** A run a player starts: its kind, how long it lasts and where it goes (engine frame). */
export interface RunPlan {
  kind: 'behind' | 'overlap' | 'box';
  seconds: number;
  target: [number, number];
}

/**
 * Whether `gp` starts a run now (→MATCH-17): his role gives its kind, `r` draws the start at
 * `run.chance` × his run weight × `scale`, then its length and a box run's spot. Undefined when his
 * role makes no run here or the draw says no.
 */
export function runPlan(
  s: GridState,
  gp: GridPlayer,
  { b, band, line }: RunContext,
  r: () => number,
  scale = 1,
  breaking = false,
): RunPlan | undefined {
  const cfg = SHAPE_CONFIG.run;
  const { role } = slotOf(s, gp);
  const behind =
    lineOfSlot(s, gp) === 'FW' ||
    BEHIND_ROLES.includes(role) ||
    (breaking && s.setup.model !== undefined && SHAPE_CONFIG.breakRoles.includes(role));
  const overlap = OVERLAP_ROLES.includes(role);
  // Late box runs on the candidate model (T398).
  const BR = s.setup.model !== undefined ? SHAPE_CONFIG.candidate.boxRun : undefined;
  const box =
    (BOX_ROLES.includes(role) || (BR !== undefined && BR.extra.includes(role))) &&
    band >= (BR?.from ?? 5);
  if (!behind && !overlap && !box) return undefined;
  const odds = box && BR ? BR.odds : 1;
  if (r() >= cfg.chance * actionWeight(role, gp.player.traits, 'run') * scale * odds)
    return undefined;
  const seconds = cfg.seconds[0] + (cfg.seconds[1] - cfg.seconds[0]) * r();
  const me = attackFrame(gp.side, gp.pos);
  const kind = box ? 'box' : behind ? 'behind' : 'overlap';
  const target: Point =
    kind === 'box'
      ? [cfg.boxX, 30 + 8 * r()]
      : kind === 'behind'
        ? [Math.min(PITCH.length - 1, line + cfg.behindDepth), me[1]]
        : [
            Math.min(PITCH.length - 1, b[0] + cfg.overlapAhead),
            me[1] < CENTRE ? LANE_EDGES[1] / 2 : PITCH.width - LANE_EDGES[1] / 2,
          ];
  return { kind, seconds, target: toEngine(gp.side, target) };
}

/** Gives eligible players of the side with the ball a chance to start a run; one draw per eligible player, in roster order. */
export function startRuns(s: GridState, side: 0 | 1, r: () => number): void {
  const ctx = runContext(s, side);
  if (ctx.band < 3) return;
  for (const gp of s.players[side]) {
    if (!onPitch(gp) || gp.slot < 0) continue;
    if (s.owner && s.owner[0] === side && s.owner[1] === gp.idx) continue;
    if (gp.run && gp.run.until > s.elapsed) continue;
    const plan = runPlan(s, gp, ctx, r);
    if (plan) gp.run = { kind: plan.kind, until: s.elapsed + plan.seconds, target: plan.target };
  }
}

/** 0.6 heading + 0.4 strength: who goes up for a set piece and who marks him. */
const aerialOf = (s: GridState, gp: GridPlayer) =>
  0.6 * skill(s, gp.side, gp.idx, 'heading') + 0.4 * skill(s, gp.side, gp.idx, 'strength');

/**
 * Where a delivery into the box puts its players (engine frame): the attackers who go up, and the
 * defenders' places. A man-marker's place names the attacker he marks (`opponent`); a zonal or edge
 * place names nobody. `keeper` is the defending keeper, who guards his goal against the delivery
 * on the candidate model (T348); the pre-feature placement reads only the places.
 */
export interface SetPieceScene {
  up: { gp: GridPlayer; to: [number, number] }[];
  marks: { gp: GridPlayer; to: [number, number]; opponent?: GridPlayer }[];
  keeper?: GridPlayer;
  /**
   * Revision 4's corner (T480): both sides' players who stay away from the box — the attacking
   * side's rest defence, each naming the outlet he marks, and the defending side's outlets.
   */
  rest?: { gp: GridPlayer; to: [number, number]; opponent?: GridPlayer }[];
}

/**
 * The scene for a delivery into the box by `side`'s `taker`: its best headers take the box spots and one the
 * edge, the rest hold the rest defence where they stand; the defenders mark them goal-side, fill the six-yard
 * line and the edge, and the most advanced stay upfield. Only players on the pitch take part, so a dismissed
 * player neither goes up nor is marked. Reads the state and moves nobody.
 */
export function setPieceTargets(
  s: GridState,
  side: 0 | 1,
  taker: number,
  r?: () => number,
): SetPieceScene {
  if (r && modelAtLeast(s.setup, 4)) return cornerScene(s, side, taker, r);
  const P = SHAPE_CONFIG.setPiece;
  const foe = other(side);
  const outfield = (sd: 0 | 1) =>
    s.players[sd].filter((gp) => onPitch(gp) && lineOfSlot(s, gp) !== 'GK');
  const up = outfield(side)
    .filter((gp) => gp.idx !== taker)
    .sort((a, b) => aerialOf(s, b) - aerialOf(s, a) || a.idx - b.idx)
    .slice(0, P.box.length + 1);
  const spots = up.map((_, i) => (P.box[i] ?? P.edge) as Point);
  const defenders = outfield(foe).sort(
    (a, b) => attackFrame(side, b.pos)[0] - attackFrame(side, a.pos)[0] || a.idx - b.idx,
  );
  const back = defenders
    .slice(0, Math.max(0, defenders.length - P.stayUp))
    .sort((a, b) => aerialOf(s, b) - aerialOf(s, a) || a.idx - b.idx);
  const marks: Point[] = [
    ...spots.slice(0, P.box.length).map((p): Point => [p[0] + P.mark, p[1]]),
    ...(P.zonal as readonly Point[]),
    [P.edge[0] + P.mark, P.edge[1]],
  ];
  // Whom each place marks: the man on that box spot, nobody on the six-yard line, the man at the edge.
  const marked: (GridPlayer | undefined)[] = [
    ...up.slice(0, P.box.length),
    ...P.zonal.map(() => undefined),
    up[P.box.length],
  ];
  const keeper = s.players[foe].find((gp) => onPitch(gp) && lineOfSlot(s, gp) === 'GK');
  return {
    up: up.map((gp, i) => ({ gp, to: toEngine(side, spots[i]!) })),
    marks: back.flatMap((gp, i) => {
      if (!marks[i]) return [];
      const opponent = marked[i];
      return [{ gp, to: toEngine(side, marks[i]), ...(opponent ? { opponent } : {}) }];
    }),
    ...(keeper ? { keeper } : {}),
  };
}

/**
 * Revision 4's corner (T480, →MATCH-18): `setPieceTargets` with its numbers drawn from `r` and set
 * by the late score (`SHAPE_CONFIG.setPiece.numbers`). The least aerial attackers stay back as rest
 * defence, goal-side of the outlets; the rest go up by aerial order to the box spots, the edge and
 * the extra box spots, the keeper too in added time one goal behind. The defending side's most
 * advanced stay up as outlets; the others mark every attacker who went up, then take the zones
 * and the extra zones.
 */
function cornerScene(s: GridState, side: 0 | 1, taker: number, r: () => number): SetPieceScene {
  const P = SHAPE_CONFIG.setPiece;
  const N = P.numbers;
  const foe = other(side);
  const outfield = (sd: 0 | 1) =>
    s.players[sd].filter((gp) => onPitch(gp) && lineOfSlot(s, gp) !== 'GK');
  const keeperOf = (sd: 0 | 1) =>
    s.players[sd].find((gp) => onPitch(gp) && lineOfSlot(s, gp) === 'GK');
  const count = ([least, most]: readonly [number, number]) =>
    least === most ? least : least + Math.min(most - least, Math.floor(r() * (most - least + 1)));
  const lead = s.score[side] - s.score[foe];
  const late = regMinute(s) >= N.lateMinute;
  const restCount = count(
    late && lead < 0 ? N.chasingRest : late && lead > 0 ? N.protectingRest : N.rest,
  );
  const outletCount = count(
    late && lead > 0 ? N.chasingOutlets : late && lead < 0 ? N.protectingOutlets : N.outlets,
  );
  const byAerial = (a: GridPlayer, b: GridPlayer) =>
    aerialOf(s, b) - aerialOf(s, a) || a.idx - b.idx;
  const attackers = outfield(side)
    .filter((gp) => gp.idx !== taker)
    .sort(byAerial);
  const kept = Math.min(restCount, attackers.length);
  const up = attackers.slice(0, attackers.length - kept);
  const back = attackers.slice(attackers.length - kept);
  const spots = [...P.box, P.edge, ...N.extraBox] as readonly Point[];
  const scene: SetPieceScene = {
    up: up.slice(0, spots.length).map((gp, i) => ({ gp, to: toEngine(side, spots[i]!) })),
    marks: [],
    rest: [],
  };
  // In added time of the last period, one goal behind: the keeper joins the attack.
  const added = (s.period === 2 && s.t >= 45 * 60) || (s.period === 4 && s.t >= 15 * 60);
  const keeper = keeperOf(side);
  if (keeper && added && lead === -1)
    scene.up.push({ gp: keeper, to: toEngine(side, N.keeperSpot) });
  // The defending side: its most advanced stay up as outlets, in their own half.
  const defenders = outfield(foe).sort(
    (a, b) => attackFrame(side, b.pos)[0] - attackFrame(side, a.pos)[0] || a.idx - b.idx,
  );
  const outlets = defenders.slice(0, Math.min(outletCount, defenders.length));
  const ys = outlets.length === 1 ? [PITCH.width / 2] : N.outletY;
  outlets.forEach((gp, i) =>
    scene.rest!.push({ gp, to: toEngine(side, [N.outletX, ys[i] ?? PITCH.width / 2]) }),
  );
  // The rest defence: one goal-side of each outlet, the others behind them in the middle.
  back.forEach((gp, i) => {
    const outlet = outlets[i];
    const covers = [PITCH.width / 2, N.outletY[0], N.outletY[1]];
    const to: Point = outlet
      ? [N.restX, ys[i] ?? PITCH.width / 2]
      : [N.restCoverX, covers[(i - outlets.length) % covers.length]!];
    scene.rest!.push({ gp, to: toEngine(side, to), ...(outlet ? { opponent: outlet } : {}) });
  });
  // Every attacker who went up is marked first (the box spots', the extra ones, the edge's), then
  // the zones and the extra zones take whoever is left.
  const markers = defenders.slice(outlets.length).sort(byAerial);
  const onBox = scene.up.filter(({ gp }) => gp !== keeper).slice(0, P.box.length);
  const atEdge = scene.up[P.box.length];
  const extra = scene.up.slice(P.box.length + 1);
  const places: { to: Point; opponent?: GridPlayer }[] = [
    ...onBox.map((u, i) => ({
      to: [P.box[i]![0] + P.mark, P.box[i]![1]] as Point,
      opponent: u.gp,
    })),
    ...extra.map((u) => {
      const [x, y] = attackFrame(side, u.to);
      return { to: [x + P.mark, y] as Point, opponent: u.gp };
    }),
    ...(atEdge && atEdge.gp !== keeper
      ? [{ to: [P.edge[0] + P.mark, P.edge[1]] as Point, opponent: atEdge.gp }]
      : []),
    ...(P.zonal as readonly Point[]).map((to) => ({ to })),
    ...(N.extraZonal as readonly Point[]).map((to) => ({ to })),
  ];
  markers.forEach((gp, i) => {
    const place = places[i];
    if (!place) return;
    scene.marks.push({
      gp,
      to: toEngine(side, place.to),
      ...(place.opponent ? { opponent: place.opponent } : {}),
    });
  });
  const theirs = keeperOf(foe);
  if (theirs) scene.keeper = theirs;
  return scene;
}

/** The attackers who went up hold their box spots until `until` (match seconds) for the second ball. */
export function holdSetPiece(scene: SetPieceScene, until: number): void {
  for (const { gp, to } of scene.up) gp.run = { kind: 'box', until, target: [to[0], to[1]] };
}

/** The pre-feature set piece: everyone in `setPieceTargets`' scene stands on his spot at once. */
export function setPieceShape(s: GridState, side: 0 | 1, taker: number, until: number): void {
  const scene = setPieceTargets(s, side, taker);
  for (const { gp, to } of [...scene.up, ...scene.marks]) gp.pos = [to[0], to[1]];
  holdSetPiece(scene, until);
}
