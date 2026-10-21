/** Off the ball: formation shape by phase and tactic, role habit, pressing, marking, runs and movement (→MATCH-8, MATCH-17). */
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
  lateral: 0.25,
  /** With the ball behind it the back line drops to this many metres goal-side of it, never deeper than `min`. */
  deepLine: { behindBall: 4, min: 6 },
  keeperPull: 0.08,
  keeperMax: { sweeperKeeper: 22, other: 14 },
  /** Metres a sweeper keeper steps up per metre his line stands above 20 m, once it is at 40 m. */
  sweeperStep: 0.3,
  markBlend: 0.4,
  markRadius: 10,
  counterPressSeconds: 5,
  /** Seconds after a turnover in which the side that lost the ball recovers faster. */
  transitionSeconds: 4,
  recoverySpeed: 1.15,
  speed: { base: 5.2, pace: 2.8, tired: 0.25 },
  run: { chance: 0.04, seconds: [4, 6], behindDepth: 6, overlapAhead: 10, boxX: 95 },
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
      sum += attackFrame(side, gp.pos)[0];
      count++;
    }
  return count ? sum / count : MID;
}

/** The x of the second-last defending player (goalkeeper counts), in the attacking side's frame. */
export function offsideLine(s: GridState, defendingSide: 0 | 1): number {
  const attacking = other(defendingSide);
  const xs = s.players[defendingSide]
    .filter(onPitch)
    .map((gp) => attackFrame(attacking, gp.pos)[0])
    .sort((a, b) => b - a);
  return xs.length > 1 ? xs[1]! : (xs[0] ?? PITCH.length);
}

/** Whether the side lost the ball within the counter-press window. */
const lostRecently = (s: GridState, side: 0 | 1, seconds: number) =>
  s.lastLoss !== undefined && s.lastLoss.side === side && s.elapsed - s.lastLoss.at < seconds;

/** The pressers of a side while it defends, as roster indexes. */
export function pressers(s: GridState, side: 0 | 1): number[] {
  const cfg = SHAPE_CONFIG.tactic[s.setup.tactics[side]];
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
}

/** A player's target in the engine frame. */
export function targetOf(
  s: GridState,
  side: 0 | 1,
  idx: number,
  cache: ShapeCache = { offside: [], pressers: [], defence: [] },
): [number, number] {
  const gp = s.players[side][idx]!;
  const tactic = s.setup.tactics[side];
  const cfg = SHAPE_CONFIG.tactic[tactic];
  const b = attackFrame(side, s.ball);
  const own = lineOfSlot(s, gp);
  if (own === 'GK') {
    const sweeper = slotOf(s, gp).role === 'sweeperKeeper';
    const df = (cache.defence[side] ??= lineX(s, side, 'DF'));
    const high = sweeper && df >= 40;
    let x = 4 + (b[0] - MID) * SHAPE_CONFIG.keeperPull;
    if (high) x += SHAPE_CONFIG.sweeperStep * (df - 20);
    x = clamp(x, 2, high ? SHAPE_CONFIG.keeperMax.sweeperKeeper : SHAPE_CONFIG.keeperMax.other);
    return toEngine(side, [x, CENTRE + (b[1] - CENTRE) * 0.15]);
  }
  if (gp.run && gp.run.until > s.elapsed) return [...gp.run.target];
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
  x += (b[0] - MID) * cfg.compact;
  y += (b[1] - CENTRE) * SHAPE_CONFIG.lateral;
  if (inPossession) {
    const foe = other(side);
    x = Math.min(x, (cache.offside[foe] ??= offsideLine(s, foe)) - 0.5);
    return toEngine(side, [x, y]);
  }
  if ((cache.pressers[side] ??= pressers(s, side)).includes(idx)) {
    const goalSide = b[0] - 1.2;
    return toEngine(side, [
      own === 'DF'
        ? clamp(goalSide, lineFloor(b[0], cfg.line[0]), cfg.line[1])
        : Math.max(0, goalSide),
      b[1],
    ]);
  }
  // Another outfielder leans toward the goal-side point of the nearest attacker around his spot.
  let near: Point | undefined,
    best: number = SHAPE_CONFIG.markRadius;
  for (const opp of s.players[other(side)]) {
    if (!onPitch(opp) || lineOfSlot(s, opp) === 'GK') continue;
    const o = attackFrame(side, opp.pos);
    const d = Math.hypot(o[0] - x, o[1] - y);
    if (d <= best) [near, best] = [o, d];
  }
  if (near) {
    x += (near[0] - 1.5 - x) * SHAPE_CONFIG.markBlend;
    y += (near[1] - y) * SHAPE_CONFIG.markBlend;
  }
  if (own === 'DF') x = clamp(x, lineFloor(b[0], cfg.line[0]), cfg.line[1]);
  return toEngine(side, [x, y]);
}

/** The deepest the back line stands: its tactic's line, or goal-side of a ball played in behind it (T215). */
const lineFloor = (ball: number, line: number) =>
  Math.min(line, Math.max(SHAPE_CONFIG.deepLine.min, ball - SHAPE_CONFIG.deepLine.behindBall));

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

/** Gives eligible players of the side with the ball a chance to start a run; one draw per eligible player, in roster order. */
export function startRuns(s: GridState, side: 0 | 1, r: () => number): void {
  const b = attackFrame(side, s.ball);
  const band = bandOf(b[0]);
  if (band < 3) return;
  const line = offsideLine(s, other(side));
  const cfg = SHAPE_CONFIG.run;
  for (const gp of s.players[side]) {
    if (!onPitch(gp) || gp.slot < 0) continue;
    if (s.owner && s.owner[0] === side && s.owner[1] === gp.idx) continue;
    if (gp.run && gp.run.until > s.elapsed) continue;
    const { role } = slotOf(s, gp);
    const l = lineOfSlot(s, gp);
    const behind = l === 'FW' || BEHIND_ROLES.includes(role);
    const overlap = OVERLAP_ROLES.includes(role);
    const box = BOX_ROLES.includes(role) && band >= 5;
    if (!behind && !overlap && !box) continue;
    if (r() >= cfg.chance * actionWeight(role, gp.player.traits, 'run')) continue;
    const seconds = cfg.seconds[0] + (cfg.seconds[1] - cfg.seconds[0]) * r();
    const me = attackFrame(side, gp.pos);
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
    gp.run = {
      kind,
      until: s.elapsed + seconds,
      target: attackFrame(side, target) as [number, number],
    };
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
