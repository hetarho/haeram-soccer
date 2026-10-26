/** Off the ball: formation shape by phase and tactic, role habit, pressing, marking, runs and movement (→MATCH-8, MATCH-17). */
import type { RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import type { Point } from './pitch';
import { attackFrame, bandOf, clamp, LANE_EDGES, PITCH, toEngine } from './pitch';
import { FORMATIONS, lineOf } from '../player';
import { actionWeight } from '../match-weights';
import type { MatchMath } from '../portable-math';
import { boxBackLine, boxGuardTarget, boxMarkPoint, defendingBox } from './box';
import { freedomPlan, looseness } from './freedom';
import { coverShadow } from './lanes';
import type { GridPlayer, GridState } from './state';
import { minutesOn, onPitch, other, skill, slotOf } from './state';
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
    /** Outfielders of the defending side who stay upfield for the counter. */
    stayUp: 1,
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
  // A loose shape (revision 2, T432): an outfielder keeps part of his distance from his place.
  const k = gp.slot > 0 ? looseness(s, side) : 0;
  return k ? [place[0] + (gp.pos[0] - place[0]) * k, place[1] + (gp.pos[1] - place[1]) * k] : place;
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
  const jobSlot = FORMATIONS[tactic].slots[job]!;
  const line = job === gp.slot ? own : (lineOf(jobSlot.position) as Line);
  const spot = SPOTS[tactic][job]!;
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
    const slots = FORMATIONS[tactic].slots;
    const cbs = slots.flatMap((slot, i) => (slot.position === 'CB' ? [i] : []));
    if (cbs.length >= 3) {
      const left = by < CENTRE;
      const pos = jobSlot.position;
      if ((left && pos === 'LWB') || (!left && pos === 'RWB')) y += (by - y) * F.follow;
      else if ((left && pos === 'RWB') || (!left && pos === 'LWB')) y += (CENTRE - y) * F.tuck;
      const wide = cbs.reduce((a, b) =>
        (
          left
            ? SPOTS[tactic][b]![1] < SPOTS[tactic][a]![1]
            : SPOTS[tactic][b]![1] > SPOTS[tactic][a]![1]
        )
          ? b
          : a,
      );
      if (job === wide) y += left ? -F.channel : F.channel;
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
      FORMATIONS[tactic].slots.filter((slot) => lineOf(slot.position) === 'FW').length >= 2
    )
      x -= SS.drop;
    x = Math.min(x, (cache.offside[foe] ??= offsideLine(s, foe)) - 0.5);
    return toEngine(side, [x, y]);
  }
  // On the candidate model only a press intention presses; this is the pre-feature presser.
  if (s.setup.model === undefined && (cache.pressers[side] ??= pressers(s, side)).includes(idx))
    return pressPoint(s, gp, [bx, by], false);
  // Another outfielder leans toward the goal-side point of the nearest attacker around his spot.
  let best: number = SHAPE_CONFIG.markRadius;
  // `attackFrame` inlined, so the scan allocates nothing.
  let found = false,
    nx = 0,
    ny = 0;
  const foe = other(side);
  const foes = ((cache.outfield ??= [])[foe] ??= s.players[foe].filter(
    (opp) => onPitch(opp) && lineOfSlot(s, opp) !== 'GK',
  ));
  const { hypot } = s.math;
  for (const opp of foes) {
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
    return boxMarkPoint(side, foe) ?? goalSideOf(side, foe);
  if (i.kind === 'cover' && i.box) return boxGuardTarget(s, gp, i.box.zone, i.box.ball);
  if (i.kind === 'cover' && i.zone) return guardPoint(s, gp, i.zone);
  if (mate && onPitch(mate) && i.kind === 'cover') return coverPoint(side, mate, s.math);
  return [i.target[0], i.target[1]];
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
}

/**
 * The scene for a delivery into the box by `side`'s `taker`: its best headers take the box spots and one the
 * edge, the rest hold the rest defence where they stand; the defenders mark them goal-side, fill the six-yard
 * line and the edge, and the most advanced stay upfield. Only players on the pitch take part, so a dismissed
 * player neither goes up nor is marked. Reads the state and moves nobody.
 */
export function setPieceTargets(s: GridState, side: 0 | 1, taker: number): SetPieceScene {
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
