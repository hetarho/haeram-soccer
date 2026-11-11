import type { RoleId, Tactic } from '../../../contracts/src/types';
import {
  BAND_EDGES,
  LANE_EDGES,
  PITCH,
  attackFrame,
  cellBand,
  cellLane,
  toEngine,
} from '../grid/pitch';
import { STAGING_CONFIG } from './config';
import { roleFreedom } from './tendency';
import { clamp, dist, type Vec } from './vec';

export type StagingPhase = 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'setPiece';

export interface ShapeSide {
  tactic: Tactic;
  /** By slot, with the keeper at 0. */
  roles: readonly RoleId[];
  /** By slot; omitted means everyone is present. */
  present?: readonly boolean[];
  /** Presentation-only role blend by slot; omitted is neutral (50). */
  freedom?: readonly number[];
}

export interface ShapeContext {
  sides: readonly [ShapeSide, ShapeSide];
  /** Pitch metres in the engine frame. */
  ball: Vec;
  /** Side in possession. */
  team: 0 | 1;
  phase: StagingPhase;
  /** Actual second-last defender, in each attacking side's frame, when staging bodies. */
  offside?: readonly [number, number];
}

/** Depth within the block (0 = back, 1 = front), metres across from its long axis. */
type Anchor = readonly [number, number];

/** Anchors follow the engine's formation slot order; the keeper has his own rule. */
export const FORMATION_SHAPE: Record<
  Tactic,
  { ip: readonly (Anchor | null)[]; oop: readonly (Anchor | null)[] }
> = {
  possession: {
    ip: [
      null,
      [0.1, -25],
      [0, -9],
      [0, 9],
      [0.1, 25],
      [0.3, 0],
      [0.52, -12],
      [0.52, 12],
      [0.88, -27],
      [1.0, 0],
      [0.88, 27],
    ],
    oop: [
      null,
      [0, -20],
      [0, -7],
      [0, 7],
      [0, 20],
      [0.3, 0],
      [0.55, -9],
      [0.55, 9],
      [0.58, -24],
      [1.0, 0],
      [0.58, 24],
    ],
  },
  counter: {
    ip: [
      null,
      [0.1, -25],
      [0, -9],
      [0, 9],
      [0.1, 25],
      [0.62, -26],
      [0.42, -8],
      [0.42, 8],
      [0.62, 26],
      [1.0, -7],
      [0.92, 7],
    ],
    oop: [
      null,
      [0, -20],
      [0, -7],
      [0, 7],
      [0, 20],
      [0.48, -22],
      [0.48, -7],
      [0.48, 7],
      [0.48, 22],
      [1.0, -6],
      [1.0, 6],
    ],
  },
  press: {
    ip: [
      null,
      [0.1, -25],
      [0, -9],
      [0, 9],
      [0.1, 25],
      [0.3, -7],
      [0.36, 7],
      [0.72, 0],
      [0.86, -24],
      [1.0, 0],
      [0.86, 24],
    ],
    oop: [
      null,
      [0, -20],
      [0, -7],
      [0, 7],
      [0, 20],
      [0.3, -6],
      [0.3, 6],
      [0.62, 0],
      [0.6, -22],
      [1.0, 0],
      [0.6, 22],
    ],
  },
  balanced: {
    ip: [
      null,
      [0.5, -29],
      [0, -13],
      [0, 0],
      [0, 13],
      [0.5, 29],
      [0.3, 0],
      [0.5, -10],
      [0.5, 10],
      [1.0, -7],
      [0.92, 7],
    ],
    oop: [
      null,
      [0.12, -25],
      [0, -10],
      [0, 0],
      [0, 10],
      [0.12, 25],
      [0.34, 0],
      [0.5, -9],
      [0.5, 9],
      [1.0, -6],
      [1.0, 6],
    ],
  },
};

interface Override {
  ax?: number;
  ayAbs?: number;
}

interface RoleShape {
  onShoulder?: true;
  buildUp?: Override;
  progression?: Override;
  finalThird?: Override;
}

/** Empty rows explicitly keep the slot's anchor; the keeper rule handles both keeper roles. */
export const ROLE_SHAPE: Partial<Record<RoleId, RoleShape>> = {
  sweeperKeeper: {},
  shotStopper: {},
  stopper: {},
  coverDefender: {},
  ballPlayingDefender: { buildUp: { ayAbs: 15 } },
  defensiveFullBack: { progression: { ax: 0.22 }, finalThird: { ax: 0.34 } },
  overlappingFullBack: {
    buildUp: { ax: 0.14 },
    progression: { ax: 0.45, ayAbs: 29 },
    finalThird: { ax: 0.8, ayAbs: 30 },
  },
  invertedFullBack: {
    buildUp: { ax: 0.3, ayAbs: 9 },
    progression: { ax: 0.34, ayAbs: 10 },
    finalThird: { ax: 0.3, ayAbs: 8 },
  },
  defensiveWingBack: { progression: { ax: 0.5 }, finalThird: { ax: 0.62 } },
  attackingWingBack: {
    progression: { ax: 0.72, ayAbs: 30 },
    finalThird: { ax: 0.92, ayAbs: 30 },
  },
  boxToBox: { finalThird: { ax: 0.78, ayAbs: 6 } },
  mezzala: { progression: { ax: 0.6, ayAbs: 15 }, finalThird: { ax: 0.86, ayAbs: 13 } },
  deepLyingPlaymaker: { buildUp: { ax: 0.26 }, finalThird: { ax: 0.5 } },
  anchor: {},
  ballWinner: { finalThird: { ax: 0.45 } },
  regista: {},
  wideMidfielder: { progression: { ax: 0.7 }, finalThird: { ax: 0.9, ayAbs: 27 } },
  widePlaymaker: {},
  attackingMidfielder: {},
  trequartista: {},
  traditionalWinger: {
    progression: { ax: 0.9, ayAbs: 30 },
    finalThird: { ax: 0.97, ayAbs: 29 },
  },
  invertedWinger: {
    progression: { ax: 0.88, ayAbs: 26 },
    finalThird: { ax: 0.97, ayAbs: 15 },
  },
  shadowStriker: { finalThird: { ax: 0.92 } },
  falseNine: { buildUp: { ax: 0.72 }, progression: { ax: 0.8 }, finalThird: { ax: 0.84 } },
  targetMan: { buildUp: { ax: 0.95 }, progression: { ax: 0.95 }, finalThird: { ax: 1.0 } },
  completeForward: { buildUp: { ax: 0.88 } },
  poacher: { onShoulder: true },
};

const SHAPE = STAGING_CONFIG.shape;
const AXIS = PITCH.width / 2;
const HALFWAY = PITCH.length / 2;
const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);
const phaseKey = (phase: StagingPhase): 'buildUp' | 'progression' | 'finalThird' =>
  phase === 'buildUp' || phase === 'finalThird' ? phase : 'progression';

/** The defending side's back line in its own attack frame. */
const oopLine = (ctx: ShapeContext, side: 0 | 1): number => {
  const oop = SHAPE.oop;
  const b = attackFrame(side, ctx.ball);
  const block = SHAPE.block[ctx.sides[side].tactic];
  const raw = clamp(oop.lineBase + oop.lineSlope * b[0] + block.lineBias, oop.lineMin, oop.lineMax);
  return Math.min(raw, Math.max(oop.lineMin, b[0] - oop.behindBall));
};

/** Nominal second-last defender's line, in the attacking side's frame. */
export function nominalLineX(ctx: ShapeContext, attacking: 0 | 1): number {
  return Math.max(HALFWAY, PITCH.length - oopLine(ctx, other(attacking)));
}

const keeperSpot = (ctx: ShapeContext, side: 0 | 1, role: RoleId, b: Vec): Vec => {
  const keeper = SHAPE.keeper;
  if (side === ctx.team) {
    const ip = SHAPE.ip;
    const lineX = clamp(ip.lineBase + ip.lineSlope * b[0], ip.lineMin, ip.lineMax);
    const sweeper = role === 'sweeperKeeper';
    const gap = sweeper ? keeper.sweeperGap : keeper.gap;
    const max = sweeper ? keeper.sweeperMaxX : keeper.maxX;
    return [clamp(lineX - gap, keeper.minX, max), AXIS + (b[1] - AXIS) * keeper.lateral];
  }
  const goal: Vec = [0, AXIS];
  const d = dist(b, goal);
  if (d === 0) return [keeper.minOut, AXIS];
  const out = clamp(keeper.base + keeper.perMetre * d, keeper.minOut, keeper.maxOut);
  return [goal[0] + ((b[0] - goal[0]) / d) * out, goal[1] + ((b[1] - goal[1]) / d) * out];
};

const outfieldSpot = (ctx: ShapeContext, side: 0 | 1, slot: number, role: RoleId, b: Vec): Vec => {
  const spec = ctx.sides[side];
  const [bx, by] = b;
  if (side !== ctx.team) {
    const oop = SHAPE.oop;
    const [ax0, ay0] = FORMATION_SHAPE[spec.tactic].oop[slot] as Anchor;
    return [
      oopLine(ctx, side) + ax0 * SHAPE.block[spec.tactic].depth,
      AXIS + ay0 * oop.width + (by - AXIS) * oop.lateral,
    ];
  }
  const ip = SHAPE.ip;
  const lineX = clamp(ip.lineBase + ip.lineSlope * bx, ip.lineMin, ip.lineMax);
  const fullDepth = clamp(ip.depthBase + ip.depthSlope * bx, ip.depthMin, ip.depthMax);
  const [ax0, ay0] = FORMATION_SHAPE[spec.tactic].ip[slot] as Anchor;
  const shape = ROLE_SHAPE[role];
  const line = ctx.offside?.[side] ?? nominalLineX(ctx, side);
  // The new 4-2-3-1 has two central attacking slots. Fit its block before placing their
  // anchors, so the onside cap cannot collapse the shadow striker onto the striker.
  const depth =
    spec.tactic === 'press' ? Math.min(fullDepth, line - SHAPE.onsideGap - lineX) : fullDepth;
  const freedom = roleFreedom(spec.freedom?.[slot] ?? 50);
  const anchor: Vec = [
    Math.min(lineX + ax0 * depth, line - SHAPE.onsideGap),
    AXIS + ay0 + (by - AXIS) * ip.lateral,
  ];
  const blend = (habit: Vec): Vec =>
    freedom === 1
      ? habit
      : [
          anchor[0] + (habit[0] - anchor[0]) * freedom,
          anchor[1] + (habit[1] - anchor[1]) * freedom,
        ];
  if (shape?.onShoulder) {
    const lean = clamp(
      (by - AXIS) * SHAPE.poacherLean,
      -SHAPE.poacherMaxLean,
      SHAPE.poacherMaxLean,
    );
    return blend([line - SHAPE.shoulderGap, AXIS + ay0 + lean]);
  }
  const o: Override = shape?.[phaseKey(ctx.phase)] ?? {};
  const ax = o.ax ?? ax0;
  const ayAbs = o.ayAbs ?? Math.abs(ay0);
  const flank = ay0 !== 0 ? Math.sign(ay0) : o.ayAbs !== undefined ? (by >= AXIS ? 1 : -1) : 0;
  const x = lineX + ax * depth;
  return blend([
    Math.min(x, line - SHAPE.onsideGap),
    AXIS + flank * ayAbs + (by - AXIS) * ip.lateral,
  ]);
};

/** A present slot's nominal position in the engine frame. */
export function nominalSpot(ctx: ShapeContext, side: 0 | 1, slot: number): Vec {
  const spec = ctx.sides[side];
  const role = spec.roles[slot];
  if (
    role === undefined ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= FORMATION_SHAPE[spec.tactic].ip.length ||
    (spec.present !== undefined && !spec.present[slot])
  )
    throw new RangeError();
  const b = attackFrame(side, ctx.ball);
  if (slot === 0) return toEngine(side, keeperSpot(ctx, side, role, b));
  const [x, y] = outfieldSpot(ctx, side, slot, role, b);
  const margin = STAGING_CONFIG.margin;
  return toEngine(side, [
    clamp(x, margin, PITCH.length - margin),
    clamp(y, margin, PITCH.width - margin),
  ]);
}

/** A slot's place for a ball at a cell's centre in its own attack frame. */
export function placeFor(
  sides: readonly [ShapeSide, ShapeSide],
  side: 0 | 1,
  slot: number,
  cell: number,
  inPossession: boolean,
): Vec {
  const band = cellBand(cell);
  const lane = cellLane(cell);
  const ball = toEngine(side, [
    (BAND_EDGES[band]! + BAND_EDGES[band + 1]!) / 2,
    (LANE_EDGES[lane]! + LANE_EDGES[lane + 1]!) / 2,
  ]);
  // The phase belongs to the side on the ball, which attacks the other way when defending.
  const possessionBand = inPossession ? band : BAND_EDGES.length - 2 - band;
  const phase: StagingPhase =
    possessionBand < 3 ? 'buildUp' : possessionBand < 5 ? 'progression' : 'finalThird';
  return nominalSpot({ sides, ball, team: inPossession ? side : other(side), phase }, side, slot);
}
