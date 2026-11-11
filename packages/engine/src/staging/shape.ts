// The shape (→MATCH-17, STAFF-22, PLAYER-5): every slot's nominal place from the ball, the side in
// possession and its phase. One table of formation anchors and role habits that the attribution,
// the script writer and the staging all read: the inverted full-back inside in build-up, the false
// nine off the line, the poacher on the last shoulder. Ported from the match prototype's
// core/shape.ts (T823): the same functions and arithmetic, under the engine's tactics and roles,
// plus the 4-2-3-1 and the 3-5-2 and the one rule the four formations needed so no two teammates
// stand on one spot (`holdOff`).
// A leaf (→ARCH-4, ARCH-33): it imports only contracts types, the pitch and staging files, and
// every number it reads is a table here or a named value in `STAGING_CONFIG.shape`.
import type { RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import {
  BAND_EDGES,
  LANE_EDGES,
  PITCH,
  attackFrame,
  bandOf,
  cellBand,
  cellLane,
} from '../grid/pitch';
import { STAGING_CONFIG } from './config';
import { clamp, dist, type Vec } from './vec';

/** The phase of the side in possession (→MATCH-15). */
export type StagingPhase = 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'setPiece';

/**
 * An anchor `[ax, ay]`: `ax` is the depth inside the side's block (0 = back line, 1 = front line),
 * `ay` metres from the pitch's long axis in the side's attack frame (negative = own left, toward
 * `y = 0`).
 */
export type Anchor = readonly [number, number];

/** One side as the shape reads it. */
export interface ShapeSide {
  tactic: Tactic;
  /** The role each slot plays, by slot (0 = keeper), as the formation of `tactic` lists them. */
  roles: readonly RoleId[];
  /** By slot; absent = all present. An absent slot has no place. */
  present?: readonly boolean[];
}

export interface ShapeContext {
  sides: readonly [ShapeSide, ShapeSide];
  /** Ball position, pitch metres (side 0's attack frame). */
  ball: Vec;
  /** Side in possession. */
  team: 0 | 1;
  /** Phase of the side in possession. */
  phase: StagingPhase;
  /** Actual places by side and slot (pitch metres); absent = read the defending line from the nominal block. */
  positions?: readonly [readonly Vec[], readonly Vec[]];
}

/** The y of the pitch's long axis. */
const AXIS = PITCH.width / 2;
const HALFWAY = PITCH.length / 2;

/**
 * Anchors by slot of each tactic's formation (→STAFF-22), in possession (`ip`) and out of it
 * (`oop`), in `FORMATIONS[tactic]` slot order (packages/engine/src/player.ts); slot 0, the keeper,
 * is `null`. The 4-3-3 and the 4-4-2 are the prototype's.
 */
export const FORMATION_SHAPE: Record<
  Tactic,
  { ip: readonly (Anchor | null)[]; oop: readonly (Anchor | null)[] }
> = {
  // 4-3-3: LB, CB, CB, RB; DM, CM, CM; LW, ST, RW.
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
  // 4-2-3-1: LB, CB, CB, RB; DM, CM; LW, AM, RW behind the ST (slots LW 8, AM 7, ST 9, RW 10).
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
  // 4-4-2: LB, CB, CB, RB; LM, CM, CM, RM; ST, ST.
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
  // 3-5-2: LWB, CB, CB, CB, RWB; DM, CM, CM; ST, ST.
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

/** What a role changes of its slot's in-possession anchor: `ayAbs` replaces `|ay|`, the side is kept. */
export interface Override {
  ax?: number;
  ayAbs?: number;
}

/** The phases with a column of their own in `ROLE_SHAPE`; `counter` and `setPiece` read `progression`. */
type PhaseKey = 'buildUp' | 'progression' | 'finalThird';

export interface RoleShape {
  /** Stands on the last defender's shoulder in every phase instead of in the block. */
  onShoulder?: true;
  buildUp?: Override;
  progression?: Override;
  finalThird?: Override;
}

/**
 * Role behaviour in possession (→PLAYER-5, MATCH-17); a role not listed keeps its slot's anchor
 * (`SLOT_ANCHOR_ROLES`), and the keepers follow the keeper rule (`SWEEPER_ROLE`).
 */
export const ROLE_SHAPE: Partial<Record<RoleId, RoleShape>> = {
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
  ballWinner: { finalThird: { ax: 0.45 } },
  wideMidfielder: { progression: { ax: 0.7 }, finalThird: { ax: 0.9, ayAbs: 27 } },
  // In the final third he arrives in the ball side's half-space beside the striker, so the line
  // that holds them both never stands him on the striker's spot (T823).
  shadowStriker: { finalThird: { ax: 0.92, ayAbs: 10 } },
  traditionalWinger: {
    progression: { ax: 0.9, ayAbs: 30 },
    finalThird: { ax: 0.97, ayAbs: 29 },
  },
  invertedWinger: {
    progression: { ax: 0.88, ayAbs: 26 },
    finalThird: { ax: 0.97, ayAbs: 15 },
  },
  falseNine: { buildUp: { ax: 0.72 }, progression: { ax: 0.8 }, finalThird: { ax: 0.84 } },
  completeForward: { buildUp: { ax: 0.88 } },
  targetMan: { buildUp: { ax: 0.95 }, progression: { ax: 0.95 }, finalThird: { ax: 1.0 } },
  poacher: { onShoulder: true },
};

/** Outfield roles that keep their slot's anchor in every phase, and the keeper who does not sweep. */
export const SLOT_ANCHOR_ROLES = [
  'stopper',
  'coverDefender',
  'anchor',
  'shotStopper',
  'regista',
  'widePlaymaker',
  'attackingMidfielder',
  'trequartista',
] as const satisfies readonly RoleId[];

/** The keeper who sweeps: higher behind his back line in possession. */
export const SWEEPER_ROLE: RoleId = 'sweeperKeeper';

const SHAPE = STAGING_CONFIG.shape;

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

const phaseKey = (phase: StagingPhase): PhaseKey =>
  phase === 'buildUp' || phase === 'finalThird' ? phase : 'progression';

const blockOf = (sides: ShapeContext['sides'], side: 0 | 1) => SHAPE.block[sides[side].tactic];

/** The out-of-possession back line of side `d` for this ball, as an x in `d`'s attack frame. */
const oopLine = (sides: ShapeContext['sides'], ball: Vec, d: 0 | 1): number => {
  const oop = SHAPE.oop;
  const b = attackFrame(d, ball);
  const raw = clamp(
    oop.lineBase + oop.lineSlope * b[0] + blockOf(sides, d).lineBias,
    oop.lineMin,
    oop.lineMax,
  );
  // The line never stands ahead of a ball played behind it.
  return Math.min(raw, Math.max(oop.lineMin, b[0] - oop.behindBall));
};

/** The offside line `attacking` plays against, as an x in `attacking`'s attack frame, from actual positions. */
export function offsideLineX(
  positions: readonly [readonly Vec[], readonly Vec[]],
  attacking: 0 | 1,
): number {
  const xs = positions[other(attacking)]
    .map((p) => attackFrame(attacking, p)[0])
    .sort((a, b) => b - a);
  // The second-last defender; the keeper counts.
  return Math.max(xs[1]!, HALFWAY);
}

/** The same line read from the defending side's nominal block for this ball. */
export function nominalLineX(ctx: Pick<ShapeContext, 'sides' | 'ball'>, attacking: 0 | 1): number {
  return Math.max(HALFWAY, PITCH.length - oopLine(ctx.sides, ctx.ball, other(attacking)));
}

/** `offsideLineX` when `ctx.positions` is given, else `nominalLineX`. */
export function lineFor(ctx: ShapeContext, attacking: 0 | 1): number {
  return ctx.positions ? offsideLineX(ctx.positions, attacking) : nominalLineX(ctx, attacking);
}

/** The keeper's place in his attack frame. */
const keeperSpot = (ctx: ShapeContext, side: 0 | 1, role: RoleId, b: Vec): Vec => {
  const keeper = SHAPE.keeper;
  if (side === ctx.team) {
    const ip = SHAPE.ip;
    const lineX = clamp(ip.lineBase + ip.lineSlope * b[0], ip.lineMin, ip.lineMax);
    const sweeper = role === SWEEPER_ROLE;
    const gap = sweeper ? keeper.sweeperGap : keeper.gap;
    const max = sweeper ? keeper.sweeperMaxX : keeper.maxX;
    return [clamp(lineX - gap, keeper.minX, max), AXIS + (b[1] - AXIS) * keeper.lateral];
  }
  // Out of possession: on the line from his goal's centre toward the ball.
  const goal: Vec = [0, AXIS];
  const d = dist(b, goal);
  if (d === 0) return [keeper.minOut, AXIS];
  const out = clamp(keeper.base + keeper.perMetre * d, keeper.minOut, keeper.maxOut);
  return [goal[0] + ((b[0] - goal[0]) / d) * out, goal[1] + ((b[1] - goal[1]) / d) * out];
};

/**
 * An outfield player's place in his attack frame, before the margin clamp, with how high in the
 * block his anchor stands (`ax`; the shoulder role highest of all).
 */
const outfieldSpot = (
  ctx: ShapeContext,
  side: 0 | 1,
  slot: number,
  role: RoleId,
  b: Vec,
): { at: Vec; height: number } => {
  const formation = FORMATION_SHAPE[ctx.sides[side].tactic];
  const [bx, by] = b;
  if (side !== ctx.team) {
    const oop = SHAPE.oop;
    const [ax0, ay0] = formation.oop[slot] as Anchor;
    // Out of possession role overrides do not apply.
    return {
      at: [
        oopLine(ctx.sides, ctx.ball, side) + ax0 * blockOf(ctx.sides, side).depth,
        AXIS + ay0 * oop.width + (by - AXIS) * oop.lateral,
      ],
      height: ax0,
    };
  }
  const ip = SHAPE.ip;
  const lineX = clamp(ip.lineBase + ip.lineSlope * bx, ip.lineMin, ip.lineMax);
  const depth = clamp(ip.depthBase + ip.depthSlope * bx, ip.depthMin, ip.depthMax);
  const [ax0, ay0] = formation.ip[slot] as Anchor;
  const shape = ROLE_SHAPE[role];
  const line = lineFor(ctx, side);
  if (shape?.onShoulder) {
    const lean = clamp(
      (by - AXIS) * SHAPE.poacherLean,
      -SHAPE.poacherMaxLean,
      SHAPE.poacherMaxLean,
    );
    return { at: [line - SHAPE.shoulderGap, AXIS + ay0 + lean], height: Infinity };
  }
  const o: Override = shape?.[phaseKey(ctx.phase)] ?? {};
  const ax = o.ax ?? ax0;
  const ayAbs = o.ayAbs ?? Math.abs(ay0);
  // A central anchor given a width goes to the ball's side.
  const across = ay0 !== 0 ? Math.sign(ay0) : o.ayAbs !== undefined ? (by >= AXIS ? 1 : -1) : 0;
  const x = lineX + ax * depth;
  // Nobody in possession but the shoulder role stands beyond the line.
  return {
    at: [Math.min(x, line - SHAPE.onsideGap), AXIS + across * ayAbs + (by - AXIS) * ip.lateral],
    height: ax,
  };
};

/** `p` kept `STAGING_CONFIG.margin` inside every line. */
const inside = (p: Vec): Vec => {
  const margin = STAGING_CONFIG.margin;
  return [clamp(p[0], margin, PITCH.length - margin), clamp(p[1], margin, PITCH.width - margin)];
};

/**
 * In possession a player the touchline holds does not stand on a teammate higher in the block (an
 * overlapping full-back under his winger against a high line): he drops off him by what their gap
 * falls short of `SHAPE.touchlineGap`, for each such teammate. The higher man never stands behind
 * him, so dropping off only opens the gap, and it grows smoothly as they close.
 */
const holdOff = (
  ctx: ShapeContext,
  side: 0 | 1,
  slot: number,
  b: Vec,
  at: Vec,
  height: number,
): Vec => {
  const margin = STAGING_CONFIG.margin;
  if (at[1] !== margin && at[1] !== PITCH.width - margin) return at;
  const spec = ctx.sides[side];
  let back = 0;
  for (let mate = 1; mate < FORMATION_SHAPE[spec.tactic].ip.length; mate++) {
    if (mate === slot || spec.present?.[mate] === false) continue;
    const their = outfieldSpot(ctx, side, mate, spec.roles[mate]!, b);
    if (their.height > height || (their.height === height && mate < slot))
      back += Math.max(0, SHAPE.touchlineGap - dist(inside(their.at), at));
  }
  return back === 0 ? at : inside([at[0] - back, at[1]]);
};

/** A slot's nominal place, pitch metres (side 0's attack frame); an absent slot has none. */
export function nominalSpot(ctx: ShapeContext, side: 0 | 1, slot: number): Vec {
  const spec = ctx.sides[side];
  if (spec.present?.[slot] === false)
    throw new Error(`the shape has no place for side ${side}'s absent slot ${slot}`);
  const role = spec.roles[slot]!;
  const b = attackFrame(side, ctx.ball);
  if (slot === 0) return attackFrame(side, keeperSpot(ctx, side, role, b));
  const { at, height } = outfieldSpot(ctx, side, slot, role, b);
  const place = inside(at);
  return attackFrame(side, side === ctx.team ? holdOff(ctx, side, slot, b, place, height) : place);
}

/** The centre of a cell (→MATCH-14), in the attack frame the cell is read in. */
export function cellCentre(cell: number): Vec {
  const band = cellBand(cell);
  const lane = cellLane(cell);
  return [
    (BAND_EDGES[band]! + BAND_EDGES[band + 1]!) / 2,
    (LANE_EDGES[lane]! + LANE_EDGES[lane + 1]!) / 2,
  ];
}

/**
 * A slot's place for a ball at the centre of `cell` (the side's own attack frame), in or out of
 * possession, phase by the cell's band. The place is returned in the same frame as `cell`, so its
 * distance to a cell's centre is read directly; the phase is that of the side in possession, from
 * the band the cell lies in from its end.
 */
export function placeFor(
  sides: readonly [ShapeSide, ShapeSide],
  side: 0 | 1,
  slot: number,
  cell: number,
  inPossession: boolean,
): Vec {
  const team = inPossession ? side : other(side);
  const ball = attackFrame(side, cellCentre(cell));
  const phase = SHAPE.phaseByBand[bandOf(attackFrame(team, ball)[0])];
  return attackFrame(side, nominalSpot({ sides, ball, team, phase }, side, slot));
}
