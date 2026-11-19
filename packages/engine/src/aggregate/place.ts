import { BAND_EDGES, LANE_EDGES, cellBand, cellLane, toEngine } from '../match/pitch';
import { exp } from '../portable-math';
import { placeFor, type ShapeSide } from '../staging/shape';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './config';

/** Distance in metres, in the engine frame on both sides (→MATCH-16). */
export function placeDistance(
  sides: readonly [ShapeSide, ShapeSide],
  side: 0 | 1,
  slot: number,
  cell: number,
  inPossession: boolean,
): number {
  const band = cellBand(cell),
    lane = cellLane(cell);
  const ball = toEngine(side, [
    (BAND_EDGES[band]! + BAND_EDGES[band + 1]!) / 2,
    (LANE_EDGES[lane]! + LANE_EDGES[lane + 1]!) / 2,
  ]);
  const at = placeFor(sides, side, slot, cell, inPossession);
  return Math.sqrt((at[0] - ball[0]) ** 2 + (at[1] - ball[1]) ** 2);
}

export function placeTerm(distance: number): number {
  return Math.max(AC.place.floor, exp(-((distance / AC.place.reach) ** 2) / 2));
}

/** Rows a place table holds: one per cell and possession, at `placeKey`. */
export const PLACE_ROWS = (BAND_EDGES.length - 1) * (LANE_EDGES.length - 1) * 2;
/** A cell and possession's row in a place table. */
export const placeKey = (cell: number, inPossession: boolean) => cell * 2 + Number(inPossession);

/**
 * One side's place terms for one pairing of shapes: each row, by cell and possession, is every
 * slot's `placeTerm(placeDistance(...))`, filled when first asked and shared by every match of
 * the same shapes in the process (T941).
 */
export interface PlaceTable {
  readonly sides: readonly [ShapeSide, ShapeSide];
  readonly side: 0 | 1;
  readonly slots: number;
  readonly rows: (readonly number[] | undefined)[];
}

/** Every field `placeFor` can read from a shape (its tactic, roles, presence and freedom). */
const shapeKey = (shape: ShapeSide) =>
  `${shape.tactic}/${shape.roles.join(',')}/${shape.present?.join(',') ?? ''}/${shape.freedom?.join(',') ?? ''}`;

const PLACE_TABLES = new Map<string, PlaceTable>();

/**
 * The process's table for these shapes, side and slot count. The terms also read the attribution
 * and staging configuration: `clearPlaceTables` (through `refreshAttributionRoles`) drops every
 * table when a lab override changes it.
 */
export function placeTable(
  sides: readonly [ShapeSide, ShapeSide],
  side: 0 | 1,
  slots: number,
): PlaceTable {
  const key = `${shapeKey(sides[0])}|${shapeKey(sides[1])}|${side}|${slots}`;
  let table = PLACE_TABLES.get(key);
  if (!table) {
    table = {
      sides,
      side,
      slots,
      rows: Array<readonly number[] | undefined>(PLACE_ROWS).fill(undefined),
    };
    PLACE_TABLES.set(key, table);
  }
  return table;
}

/** Every slot's place term in this cell, on or off the ball, computed once per table. */
export function placeRow(
  table: PlaceTable,
  cell: number,
  inPossession: boolean,
): readonly number[] {
  const at = placeKey(cell, inPossession);
  let row = table.rows[at];
  if (!row) {
    row = Array.from({ length: table.slots }, (_, slot) =>
      placeTerm(placeDistance(table.sides, table.side, slot, cell, inPossession)),
    );
    table.rows[at] = row;
  }
  return row;
}

/** Drops every place table, so the next match reads the current configuration again. */
export function clearPlaceTables() {
  PLACE_TABLES.clear();
}

/** Both the band and lane reverse when a ledger cell is read by the other side. */
export const opposingCell = (cell: number) => 39 - cell;

export interface PlaceGroup {
  /** Unpinned attempts left to split. */
  count: number;
  weights: readonly number[];
  placed: readonly number[];
}

/**
 * Scratch rows `fitPlaceWeights` reuses from call to call (T983): a Float64Array of more than
 * 64 bytes is allocated outside V8's heap, which cost more than the fit's own arithmetic when every
 * call took its own. Only ever read within one call, after that call has written them.
 */
let FIT_SCRATCH = new Float64Array(0);

/**
 * One side, period and action class. Proportional fitting preserves each line's unplaced
 * expectation while the per-group normalisation preserves the group's count. Pins (shots and
 * their feeds) are excluded from both matrices, so their already drawn credits stay exact.
 */
export const PLACE_FIT_TOLERANCE = { own: 1e-10, other: 1e-3 } as const;

export function fitPlaceWeights(
  groups: readonly PlaceGroup[],
  tolerance: number = PLACE_FIT_TOLERANCE.own,
): number[][] {
  if (groups.length === 0) return [];
  const n = groups[0]!.weights.length;
  const size = n * (groups.length + 3);
  if (FIT_SCRATCH.length < size)
    FIT_SCRATCH = new Float64Array(Math.max(size, 2 * FIT_SCRATCH.length));
  // `expected`, `scale` and `actual`, then each group's `counted` row at `(3 + k) * n`.
  const expected = FIT_SCRATCH.subarray(0, n).fill(0),
    scale = FIT_SCRATCH.subarray(n, 2 * n),
    actual = FIT_SCRATCH.subarray(2 * n, 3 * n);
  for (const g of groups) {
    const sum = g.weights.reduce((a, b) => a + b, 0);
    if (sum > 0) for (let p = 0; p < n; p++) expected[p]! += (g.count * g.weights[p]!) / sum;
  }
  for (let p = 0; p < n; p++) scale[p] = expected[p]! > 0 ? 1 : 0;
  // Each group's `count * placed[p]`, the first product of `(count * placed * scale) / sum`,
  // computed once rather than in every iteration (T983): the same products in the same order.
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k]!,
      at = (3 + k) * n;
    for (let p = 0; p < n; p++) FIT_SCRATCH[at + p] = g.count * g.placed[p]!;
  }
  for (let iteration = 0; iteration < AC.place.iterations; iteration++) {
    actual.fill(0);
    for (let k = 0; k < groups.length; k++) {
      const placed = groups[k]!.placed;
      let sum = 0;
      for (let p = 0; p < n; p++) sum += placed[p]! * scale[p]!;
      if (sum > 0) {
        const at = (3 + k) * n;
        for (let p = 0; p < n; p++) actual[p]! += (FIT_SCRATCH[at + p]! * scale[p]!) / sum;
      }
    }
    // Stop on numerical convergence, not after a small fixed count that leaves a systematic
    // bias in asymmetric classes. The configured iteration count remains the bounded cap.
    let converged = true;
    for (let p = 0; p < n; p++)
      if (
        !(
          Math.abs(actual[p]! - expected[p]!) <=
          tolerance *
            (tolerance === PLACE_FIT_TOLERANCE.own ? Math.max(1, expected[p]!) : expected[p]!)
        )
      ) {
        converged = false;
        break;
      }
    if (converged) break;
    for (let p = 0; p < n; p++)
      scale[p] = actual[p]! > 0 ? (scale[p]! * expected[p]!) / actual[p]! : 0;
  }
  return groups.map((g) => g.placed.map((w, p) => w * scale[p]!));
}
