// Cell geometry and the dead-ball spots the fitted writer and its validator share (T820). Cells are
// MATCH-14's 5 lanes x 8 bands in a side's attack frame (`cellOf`); every point here is world frame.
import { PROTO_CONFIG } from '../core/config.ts';
import { BAND_EDGES, CENTRE, LANE_EDGES, PITCH, cellOf, toAttack } from '../core/pitch.ts';
import type { BeatKind, TeamId, Vec } from '../core/types.ts';
import { clamp, dist } from '../core/vec.ts';

/** A cell's rectangle in the side's attack frame: [x0, x1, y0, y1]. */
const rectOf = (cell: number): [number, number, number, number] => {
  const band = Math.floor(cell / 5);
  const lane = cell % 5;
  return [BAND_EDGES[band]!, BAND_EDGES[band + 1]!, LANE_EDGES[lane]!, LANE_EDGES[lane + 1]!];
};

/** The cell of a world point in `side`'s attack frame. */
export const cellAt = (side: TeamId, p: Vec): number => cellOf(toAttack(side, p));

/** A cell's centre (world frame). */
export const cellCentre = (side: TeamId, cell: number): Vec => {
  const [x0, x1, y0, y1] = rectOf(cell);
  return toAttack(side, [(x0 + x1) / 2, (y0 + y1) / 2]);
};

/** Distance between two cells' centres (metres). */
export const cellDistance = (a: number, b: number): number =>
  dist(cellCentre(0, a), cellCentre(0, b));

/** The same cell or one of its eight neighbours. */
export const cellsMeet = (a: number, b: number): boolean =>
  Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) <= 1 && Math.abs((a % 5) - (b % 5)) <= 1;

/** `p` (world) moved inside `cell` of `side`, `fit.cellMargin` from its edges. */
export const intoCell = (side: TeamId, cell: number, p: Vec): Vec => {
  const [x0, x1, y0, y1] = rectOf(cell);
  const m = PROTO_CONFIG.fit.cellMargin;
  const a = toAttack(side, p);
  const mx = Math.min(m, (x1 - x0) / 2 - 0.01);
  const my = Math.min(m, (y1 - y0) / 2 - 0.01);
  return toAttack(side, [clamp(a[0], x0 + mx, x1 - mx), clamp(a[1], y0 + my, y1 - my)]);
};

/** A point in `cell` near `wanted`, moved to at least `min` metres from `ball` when the cell allows. */
export const pointAway = (side: TeamId, cell: number, wanted: Vec, ball: Vec, min: number): Vec => {
  const p = intoCell(side, cell, wanted);
  if (dist(p, ball) >= min) return p;
  const [x0, x1, y0, y1] = rectOf(cell);
  const m = PROTO_CONFIG.fit.cellMargin;
  const attack: Vec[] = [
    [x0 + m, y0 + m],
    [x0 + m, y1 - m],
    [x1 - m, y0 + m],
    [x1 - m, y1 - m],
  ];
  const corners = attack.map((c) => intoCell(side, cell, toAttack(side, c)));
  const far = corners.filter((c) => dist(c, ball) >= min);
  if (far.length === 0) return corners.reduce((a, b) => (dist(b, ball) > dist(a, ball) ? b : a));
  return far.reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));
};

const round = (v: number): number => Math.round(v * 100) / 100;
/** A point rounded to centimetres, so a spot read back equals the spot written. */
export const spot = (p: Vec): Vec => [round(p[0]), round(p[1])];

/** Where a restart of `kind` owed to `team` is taken, from the point `at` the ball went dead. */
export function restartSpot(kind: BeatKind, team: TeamId, at: Vec): Vec {
  const a = toAttack(team, at);
  switch (kind) {
    case 'kickOff':
      return CENTRE;
    case 'throwIn':
      return spot([clamp(at[0], 1, PITCH.length - 1), at[1] < PITCH.width / 2 ? 0 : PITCH.width]);
    case 'goalKick':
      return spot(toAttack(team, [5, a[1] < PITCH.width / 2 ? 30 : 38]));
    case 'corner':
      return spot(toAttack(team, [104.5, a[1] < PITCH.width / 2 ? 0.5 : 67.5]));
    default:
      return spot(at);
  }
}

/** Where a keeper holds a ball he has saved: inside his goal area (world frame). */
export const keeperHold = (keeperTeam: TeamId): Vec => spot(toAttack(keeperTeam, [4, 34]));

/** The goal a side shoots at, aimed `offset` metres across (world frame, on the goal line). */
export const goalAim = (side: TeamId, offset: number): Vec =>
  spot(toAttack(side, [PITCH.length, PITCH.width / 2 + offset]));
