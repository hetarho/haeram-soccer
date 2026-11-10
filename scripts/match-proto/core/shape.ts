// The shape model: every player's nominal place from the ball, the team in possession and its
// phase. One table of role behaviour that the script generator and the staging both read: the
// inverted full-back inside in build-up, the false nine off the line, the poacher on the last
// shoulder. A leaf: it imports only types, pitch, vec and config, and every number it reads is a
// table here or a named value in `PROTO_CONFIG.shape`.
import { PROTO_CONFIG } from './config.ts';
import { HALFWAY, PITCH, toAttack } from './pitch.ts';
import type { Fixture, FormationId, Phase, RoleId, Style, TeamId, Vec } from './types.ts';
import { clamp, dist } from './vec.ts';

/**
 * An anchor `[ax, ay]`: `ax` is the depth inside the team block (0 = back line, 1 = front line),
 * `ay` metres from the pitch's long axis in the team's attack frame (negative = own left, toward
 * `y = 0`).
 */
type Anchor = readonly [number, number];

/** The y of the pitch's long axis. */
const AXIS = PITCH.width / 2;

/** Anchors by slot, in possession (`ip`) and out of it (`oop`); slot 0, the keeper, is `null`. */
export const FORMATIONS = {
  '4-3-3': {
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
  '4-4-2': {
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
} as const satisfies Record<
  FormationId,
  { ip: readonly (Anchor | null)[]; oop: readonly (Anchor | null)[] }
>;

/** What a role changes of its slot's in-possession anchor: `ayAbs` replaces `|ay|`, the side is kept. */
export interface Override {
  ax?: number;
  ayAbs?: number;
}

/** The phases with a column of their own in `ROLE_SHAPE`; `counter` and `setPiece` read `progression`. */
type PhaseKey = 'buildUp' | 'progression' | 'finalThird';

interface RoleShape {
  /** Stands on the last defender's shoulder in every phase instead of in the block. */
  onShoulder?: true;
  buildUp?: Override;
  progression?: Override;
  finalThird?: Override;
}

/** Role behaviour in possession; a role not listed keeps its slot's anchor. */
export const ROLE_SHAPE: Partial<Record<RoleId, RoleShape>> = {
  ballPlayingDefender: { buildUp: { ayAbs: 15 } },
  fullBack: { progression: { ax: 0.22 }, finalThird: { ax: 0.34 } },
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
  boxToBox: { finalThird: { ax: 0.78, ayAbs: 6 } },
  mezzala: { progression: { ax: 0.6, ayAbs: 15 }, finalThird: { ax: 0.86, ayAbs: 13 } },
  ballWinner: { finalThird: { ax: 0.45 } },
  wideMidfielder: { progression: { ax: 0.7 }, finalThird: { ax: 0.9, ayAbs: 27 } },
  traditionalWinger: {
    progression: { ax: 0.9, ayAbs: 30 },
    finalThird: { ax: 0.97, ayAbs: 29 },
  },
  invertedWinger: {
    progression: { ax: 0.88, ayAbs: 26 },
    finalThird: { ax: 0.97, ayAbs: 15 },
  },
  falseNine: { buildUp: { ax: 0.72 }, progression: { ax: 0.8 }, finalThird: { ax: 0.84 } },
  targetMan: { buildUp: { ax: 0.95 }, progression: { ax: 0.95 }, finalThird: { ax: 1.0 } },
  poacher: { onShoulder: true },
};

export interface ShapeContext {
  fixture: Fixture;
  /** Ball position, world frame. */
  ball: Vec;
  /** Team in possession. */
  team: TeamId;
  /** Phase of the team in possession. */
  phase: Phase;
  /** Current positions of all 22 by index (world frame); absent = read the defending line from the nominal block. */
  positions?: readonly Vec[];
}

const SHAPE = PROTO_CONFIG.shape;

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

const phaseKey = (phase: Phase): PhaseKey =>
  phase === 'buildUp' || phase === 'finalThird' ? phase : 'progression';

const styleOf = (fixture: Fixture, team: TeamId): Style => fixture.teams[team].style;

/** The out-of-possession back line of team `d` for this ball, as an x in `d`'s attack frame. */
const oopLine = (fixture: Fixture, ball: Vec, d: TeamId): number => {
  const oop = SHAPE.oop;
  const b = toAttack(d, ball);
  const raw = clamp(
    oop.lineBase + oop.lineSlope * b[0] + oop.lineBias[styleOf(fixture, d)],
    oop.lineMin,
    oop.lineMax,
  );
  // The line never stands ahead of a ball played behind it.
  return Math.min(raw, Math.max(oop.lineMin, b[0] - oop.behindBall));
};

/** The offside line `attacking` plays against, as an x in `attacking`'s attack frame, from actual positions. */
export function offsideLineX(
  fixture: Fixture,
  positions: readonly Vec[],
  attacking: TeamId,
): number {
  const xs = fixture.teams[other(attacking)].players
    .map((p) => toAttack(attacking, positions[p.index])[0])
    .sort((a, b) => b - a);
  // The second-last defender; the keeper counts.
  return Math.max(xs[1], HALFWAY);
}

/** The same line read from the defending team's nominal block for this ball. */
export function nominalLineX(
  ctx: Pick<ShapeContext, 'fixture' | 'ball'>,
  attacking: TeamId,
): number {
  return Math.max(HALFWAY, PITCH.length - oopLine(ctx.fixture, ctx.ball, other(attacking)));
}

/** `offsideLineX` when `ctx.positions` is given, else `nominalLineX`. */
export function lineFor(ctx: ShapeContext, attacking: TeamId): number {
  return ctx.positions
    ? offsideLineX(ctx.fixture, ctx.positions, attacking)
    : nominalLineX(ctx, attacking);
}

/** The keeper's place in his attack frame. */
const keeperSpot = (ctx: ShapeContext, team: TeamId, role: RoleId, b: Vec): Vec => {
  const keeper = SHAPE.keeper;
  if (team === ctx.team) {
    const ip = SHAPE.ip;
    const lineX = clamp(ip.lineBase + ip.lineSlope * b[0], ip.lineMin, ip.lineMax);
    const sweeper = role === 'sweeperKeeper';
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

/** An outfield player's place in his attack frame, before the margin clamp. */
const outfieldSpot = (ctx: ShapeContext, team: TeamId, slot: number, role: RoleId, b: Vec): Vec => {
  const spec = ctx.fixture.teams[team];
  const [bx, by] = b;
  if (team !== ctx.team) {
    const oop = SHAPE.oop;
    const [ax0, ay0] = FORMATIONS[spec.formation].oop[slot] as Anchor;
    // Out of possession role overrides do not apply.
    return [
      oopLine(ctx.fixture, ctx.ball, team) + ax0 * oop.depth[spec.style],
      AXIS + ay0 * oop.width + (by - AXIS) * oop.lateral,
    ];
  }
  const ip = SHAPE.ip;
  const lineX = clamp(ip.lineBase + ip.lineSlope * bx, ip.lineMin, ip.lineMax);
  const depth = clamp(ip.depthBase + ip.depthSlope * bx, ip.depthMin, ip.depthMax);
  const [ax0, ay0] = FORMATIONS[spec.formation].ip[slot] as Anchor;
  const shape = ROLE_SHAPE[role];
  const line = lineFor(ctx, team);
  if (shape?.onShoulder) {
    const lean = clamp(
      (by - AXIS) * SHAPE.poacherLean,
      -SHAPE.poacherMaxLean,
      SHAPE.poacherMaxLean,
    );
    return [line - SHAPE.shoulderGap, AXIS + ay0 + lean];
  }
  const o: Override = shape?.[phaseKey(ctx.phase)] ?? {};
  const ax = o.ax ?? ax0;
  const ayAbs = o.ayAbs ?? Math.abs(ay0);
  // A central anchor given a width goes to the ball's side.
  const side = ay0 !== 0 ? Math.sign(ay0) : o.ayAbs !== undefined ? (by >= AXIS ? 1 : -1) : 0;
  const x = lineX + ax * depth;
  // Nobody in possession but the shoulder role stands beyond the line.
  return [Math.min(x, line - SHAPE.onsideGap), AXIS + side * ayAbs + (by - AXIS) * ip.lateral];
};

/** A player's nominal place, world frame. */
export function nominalSpot(ctx: ShapeContext, index: number): Vec {
  const player = ctx.fixture.players[index];
  const team = player.team;
  const b = toAttack(team, ctx.ball);
  if (player.slot === 0) return toAttack(team, keeperSpot(ctx, team, player.role, b));
  const [x, y] = outfieldSpot(ctx, team, player.slot, player.role, b);
  const margin = PROTO_CONFIG.margin;
  return toAttack(team, [
    clamp(x, margin, PITCH.length - margin),
    clamp(y, margin, PITCH.width - margin),
  ]);
}
