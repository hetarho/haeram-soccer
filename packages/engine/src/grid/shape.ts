/** Off the ball: formation shape by phase and tactic, role habit, pressing, marking, runs and movement (→MATCH-8, MATCH-17). */
import type { RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import type { Point } from './pitch';
import { attackFrame, bandOf, clamp, LANE_EDGES, PITCH, toEngine } from './pitch';
import { lineOf } from '../player';
import { actionWeight } from '../match';
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
        press: 10,
        counterPress: 12,
        compact: 0.38,
      },
    } as Partial<Record<Tactic, TacticShape>>,
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
const BOX_ROLES = ['boxToBox', 'mezzala', 'shadowStriker'];
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
    .map((gp) => ({ idx: gp.idx, d: Math.hypot(gp.pos[0] - s.ball[0], gp.pos[1] - s.ball[1]) }))
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
  return shapePlace(s, side, idx, cache);
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
  const spot = SPOTS[tactic][gp.slot]!;
  const inPossession = s.possession === side;
  let x = spot[0],
    y = spot[1];
  if (inPossession) {
    x += cfg.advance;
    const shift = ROLE_SHIFT[slotOf(s, gp).role];
    if (shift) {
      x += shift[0];
      y += spot[1] < CENTRE ? shift[1] : spot[1] > CENTRE ? -shift[1] : 0;
    }
  } else x += cfg.defend;
  x +=
    (bx - MID) *
    (!inPossession && bx > MID && cfg.upfield !== undefined ? cfg.upfield : cfg.compact);
  y += (by - CENTRE) * SHAPE_CONFIG.lateral;
  if (inPossession) {
    const foe = other(side);
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
  for (const opp of foes) {
    const ox = side === 0 ? opp.pos[0] : PITCH.length - opp.pos[0];
    const oy = side === 0 ? opp.pos[1] : PITCH.width - opp.pos[1];
    // The distance is at least either offset, so a man further off on one axis cannot be nearer.
    if (Math.abs(ox - x) > best || Math.abs(oy - y) > best) continue;
    const d = Math.hypot(ox - x, oy - y);
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
  if (own === 'DF') x = clamp(x, lineFloor(bx, cfg.line[0]), cfg.line[1]);
  return toEngine(side, [x, y]);
}

/** The deepest the back line stands: its tactic's line, or goal-side of a ball played in behind it (T215). */
const lineFloor = (ball: number, line: number) =>
  Math.min(line, Math.max(SHAPE_CONFIG.deepLine.min, ball - SHAPE_CONFIG.deepLine.behindBall));

/**
 * Where a presser of `gp`'s side goes for the ball at `at` (his attack frame): goal-side of it, a
 * defender within his line's bounds unless `urgent` (an urgent danger pulls him out of the line).
 */
function pressPoint(s: GridState, gp: GridPlayer, at: Point, urgent: boolean): [number, number] {
  const side = gp.side;
  const cfg = tacticShape(s, side);
  const goalSide = at[0] - SHAPE_CONFIG.pressGoalSide;
  return toEngine(side, [
    lineOfSlot(s, gp) === 'DF' && !urgent
      ? clamp(goalSide, lineFloor(at[0], cfg.line[0]), cfg.line[1])
      : Math.max(0, goalSide),
    at[1],
  ]);
}

/** Where a teammate covers `mate` of `side` (engine frame): `coverDepth` m behind him toward the own goal's centre. */
export function coverPoint(side: 0 | 1, mate: GridPlayer): [number, number] {
  const p = attackFrame(side, mate.pos);
  const dx = -p[0],
    dy = CENTRE - p[1];
  const d = Math.hypot(dx, dy);
  const depth = Math.min(SHAPE_CONFIG.coverDepth, d);
  return toEngine(side, d > 0 ? [p[0] + (dx / d) * depth, p[1] + (dy / d) * depth] : p);
}

/**
 * Where `gp`'s intention takes him now (engine frame, →MATCH-17): a press or a mark goes goal-side of
 * the opponent it tracks, a cover behind the teammate who presses; every other kind holds the target
 * it was given. A reference that has left the pitch falls back to that target.
 */
export function intentionTarget(s: GridState, gp: GridPlayer): [number, number] {
  const i = gp.intention!;
  const side = gp.side;
  const foe = i.opponent === undefined ? undefined : s.players[other(side)][i.opponent];
  const mate = i.teammate === undefined ? undefined : s.players[side][i.teammate];
  if (foe && onPitch(foe) && i.kind === 'press')
    return pressPoint(s, gp, attackFrame(side, foe.pos), i.priority === 'danger');
  if (foe && onPitch(foe) && i.kind === 'mark') {
    const o = attackFrame(side, foe.pos);
    return toEngine(side, [Math.max(0, o[0] - SHAPE_CONFIG.markGoalSide), o[1]]);
  }
  if (mate && onPitch(mate) && i.kind === 'cover') return coverPoint(side, mate);
  return [i.target[0], i.target[1]];
}

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
    const d = Math.hypot(dx, dy);
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
  const box = BOX_ROLES.includes(role) && band >= 5;
  if (!behind && !overlap && !box) return undefined;
  if (r() >= cfg.chance * actionWeight(role, gp.player.traits, 'run') * scale) return undefined;
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

/** Where a delivery into the box puts its players (engine frame): the attackers who go up, and their markers. */
export interface SetPieceScene {
  up: { gp: GridPlayer; to: [number, number] }[];
  marks: { gp: GridPlayer; to: [number, number] }[];
}

/**
 * The scene for a delivery into the box by `side`'s `taker`: its best headers take the box spots and one the
 * edge, the rest hold the rest defence where they stand; the defenders mark them goal-side, fill the six-yard
 * line and the edge, and the most advanced stay upfield. Reads the state and moves nobody.
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
  return {
    up: up.map((gp, i) => ({ gp, to: toEngine(side, spots[i]!) })),
    marks: back.flatMap((gp, i) => (marks[i] ? [{ gp, to: toEngine(side, marks[i]) }] : [])),
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
