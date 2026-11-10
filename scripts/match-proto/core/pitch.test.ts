import { describe, expect, it } from 'vitest';
import {
  BAND_EDGES,
  BOX_X,
  BOX_Y,
  LANE_EDGES,
  bandOf,
  cellOf,
  clampToPitch,
  inBox,
  inPitch,
  laneOf,
  oppGoal,
  ownGoal,
  toAttack,
} from './pitch.ts';

describe('match-proto pitch', () => {
  it('toAttack mirrors team 1 and is its own inverse', () => {
    expect(toAttack(0, [10, 20])).toEqual([10, 20]);
    expect(toAttack(1, [10, 20])).toEqual([95, 48]);
    expect(toAttack(1, toAttack(1, [10, 20]))).toEqual([10, 20]);
    expect(toAttack(1, ownGoal(1))).toEqual(ownGoal(0));
    expect(oppGoal(0)).toEqual([105, 34]);
    expect(oppGoal(1)).toEqual([0, 34]);
  });

  it('cellOf reads lanes and bands at their edges', () => {
    expect(LANE_EDGES.map(laneOf)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(BAND_EDGES.map(bandOf)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7]);
    expect(laneOf(13.83)).toBe(0);
    expect(bandOf(88.49)).toBe(5);
    expect(cellOf([0, 0])).toBe(0);
    expect(cellOf([105, 68])).toBe(39);
    expect(cellOf([BOX_X, 34])).toBe(6 * 5 + 2);
    expect(cellOf([52.5, 43.16])).toBe(4 * 5 + 3);
  });

  it('inBox and clampToPitch', () => {
    expect(inBox([BOX_X, BOX_Y[0]])).toBe(true);
    expect(inBox([BOX_X, BOX_Y[1]])).toBe(true);
    expect(inBox([BOX_X - 0.01, 34])).toBe(false);
    expect(inBox([100, BOX_Y[0] - 0.01])).toBe(false);
    expect(clampToPitch([-3, 70])).toEqual([0, 68]);
    expect(clampToPitch([0.5, 34], 1.5)).toEqual([1.5, 34]);
    expect(clampToPitch([110, -4], -2)).toEqual([107, -2]);
    expect(inPitch([0, 0])).toBe(true);
    expect(inPitch([1, 34], 1.5)).toBe(false);
    expect(inPitch([-1, 34], -2)).toBe(true);
  });
});
