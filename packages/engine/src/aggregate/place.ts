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

/** Both the band and lane reverse when a ledger cell is read by the other side. */
export const opposingCell = (cell: number) => 39 - cell;

export interface PlaceGroup {
  /** Unpinned attempts left to split. */
  count: number;
  weights: readonly number[];
  placed: readonly number[];
}

/**
 * One side, period and action class. Proportional fitting preserves each line's unplaced
 * expectation while the per-group normalisation preserves the group's count. Pins (shots and
 * their feeds) are excluded from both matrices, so their already drawn credits stay exact.
 */
export function fitPlaceWeights(groups: readonly PlaceGroup[]): number[][] {
  if (groups.length === 0) return [];
  const n = groups[0]!.weights.length;
  const expected = Array<number>(n).fill(0);
  for (const g of groups) {
    const sum = g.weights.reduce((a, b) => a + b, 0);
    if (sum > 0) for (let p = 0; p < n; p++) expected[p]! += (g.count * g.weights[p]!) / sum;
  }
  const scale: number[] = expected.map((e) => (e > 0 ? 1 : 0));
  for (let iteration = 0; iteration < AC.place.iterations; iteration++) {
    const actual = Array<number>(n).fill(0);
    for (const g of groups) {
      let sum = 0;
      for (let p = 0; p < n; p++) sum += g.placed[p]! * scale[p]!;
      if (sum > 0)
        for (let p = 0; p < n; p++) actual[p]! += (g.count * g.placed[p]! * scale[p]!) / sum;
    }
    // Stop on numerical convergence, not after a small fixed count that leaves a systematic
    // bias in asymmetric classes. The configured iteration count remains the bounded cap.
    if (actual.every((a, p) => Math.abs(a - expected[p]!) <= 1e-10 * Math.max(1, expected[p]!)))
      break;
    for (let p = 0; p < n; p++)
      scale[p] = actual[p]! > 0 ? (scale[p]! * expected[p]!) / actual[p]! : 0;
  }
  return groups.map((g) => g.placed.map((w, p) => w * scale[p]!));
}
