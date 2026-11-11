/**
 * Cell geometry and the dead-ball spots the script writer and its validator share (→MATCH-14,
 * MATCH-18, T826), ported from the match prototype's fit/cells.ts. Cells are `band * 5 + lane` in a
 * side's attack frame (grid/pitch.ts); every point here is pitch metres in side 0's attack frame.
 * Platform-stable (→ARCH-9): `+ − × ÷`, square root, min and max only, and the metres between two
 * cells are one table of integer centimetres (`CELL_CM`).
 */
import type { ScriptBeatKind } from '../../../contracts/src/match-script';
import { BAND_EDGES, LANE_EDGES, PITCH, attackFrame, cellOf } from '../grid/pitch';
import { cellCentre as attackCentre } from '../staging/shape';
import { clamp, type Vec } from '../staging/vec';
import { SCRIPT_CONFIG } from './config';

export type Side = 0 | 1;
export const CENTRE: Vec = [PITCH.length / 2, PITCH.width / 2];

/** A cell's rectangle in the side's attack frame: [x0, x1, y0, y1]. */
const rectOf = (cell: number): [number, number, number, number] => {
  const band = Math.floor(cell / 5);
  const lane = cell % 5;
  return [BAND_EDGES[band]!, BAND_EDGES[band + 1]!, LANE_EDGES[lane]!, LANE_EDGES[lane + 1]!];
};

/** The square of the distance between two points: exact IEEE arithmetic, so comparisons agree everywhere. */
export const dist2 = (a: Vec, b: Vec): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};
export const metres = (a: Vec, b: Vec): number => Math.sqrt(dist2(a, b));

/** The cell of a point in `side`'s attack frame. */
export const cellAt = (side: Side, p: Vec): number => cellOf(attackFrame(side, p));

/** A cell's centre in pitch metres, the cell read in `side`'s attack frame. */
export const cellCentre = (side: Side, cell: number): Vec => attackFrame(side, attackCentre(cell));

/** Centimetres between two cells' centres, by cell pair: integers, built once. */
export const CELL_CM: readonly (readonly number[])[] = Array.from({ length: 40 }, (_, a) =>
  Array.from({ length: 40 }, (_, b) => Math.round(metres(attackCentre(a), attackCentre(b)) * 100)),
);
/** Centimetres between two cells' centres; a missing cell (−1) reads as cell 0. */
export const cellGap = (a: number, b: number): number => CELL_CM[Math.max(a, 0)]![Math.max(b, 0)]!;

/** The same cell or one of its eight neighbours. */
export const cellsMeet = (a: number, b: number): boolean =>
  Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 && Math.abs((a % 5) - (b % 5)) <= 1;

/** `p` moved inside `cell` of `side`, `cellMargin` from its edges. */
export const intoCell = (side: Side, cell: number, p: Vec): Vec => {
  const [x0, x1, y0, y1] = rectOf(cell);
  const m = SCRIPT_CONFIG.cellMargin;
  const a = attackFrame(side, p);
  const mx = Math.min(m, (x1 - x0) / 2 - 0.01);
  const my = Math.min(m, (y1 - y0) / 2 - 0.01);
  return attackFrame(side, [clamp(a[0], x0 + mx, x1 - mx), clamp(a[1], y0 + my, y1 - my)]);
};

/** A point in `cell` near `wanted`, moved to at least `min` metres from `ball` when the cell allows. */
export const pointAway = (side: Side, cell: number, wanted: Vec, ball: Vec, min: number): Vec => {
  const p = intoCell(side, cell, wanted);
  const min2 = min * min;
  if (dist2(p, ball) >= min2) return p;
  const [x0, x1, y0, y1] = rectOf(cell);
  const m = SCRIPT_CONFIG.cellMargin;
  const attack: Vec[] = [
    [x0 + m, y0 + m],
    [x0 + m, y1 - m],
    [x1 - m, y0 + m],
    [x1 - m, y1 - m],
  ];
  const corners = attack.map((c) => intoCell(side, cell, attackFrame(side, c)));
  const far = corners.filter((c) => dist2(c, ball) >= min2);
  if (far.length === 0) return corners.reduce((a, b) => (dist2(b, ball) > dist2(a, ball) ? b : a));
  return far.reduce((a, b) => (dist2(b, p) < dist2(a, p) ? b : a));
};

const round = (v: number): number => Math.round(v * 100) / 100;
/** A point rounded to centimetres, so a spot read back equals the spot written. */
export const spot = (p: Vec): Vec => [round(p[0]), round(p[1])];

/** Where a restart of `kind` owed to `side` is taken, from the point `at` the ball went dead. */
export function restartSpot(kind: ScriptBeatKind, side: Side, at: Vec): Vec {
  const a = attackFrame(side, at);
  switch (kind) {
    case 'kickOff':
      return CENTRE;
    case 'throwIn':
      return spot([clamp(at[0], 1, PITCH.length - 1), at[1] < PITCH.width / 2 ? 0 : PITCH.width]);
    case 'goalKick':
      return spot(attackFrame(side, [5, a[1] < PITCH.width / 2 ? 30 : 38]));
    case 'corner':
      return spot(attackFrame(side, [104.5, a[1] < PITCH.width / 2 ? 0.5 : 67.5]));
    default:
      return spot(at);
  }
}

/** Where a keeper holds a ball he has saved: inside his goal area. */
export const keeperHold = (keeperSide: Side): Vec => spot(attackFrame(keeperSide, [4, 34]));

/** The goal a side shoots at, aimed `offset` metres across (on the goal line). */
export const goalAim = (side: Side, offset: number): Vec =>
  spot(attackFrame(side, [PITCH.length, PITCH.width / 2 + offset]));
