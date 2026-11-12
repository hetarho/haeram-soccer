import { describe, expect, it } from 'vitest';
import {
  attackFrame,
  bandOf,
  BAND_EDGES,
  cellBand,
  cellKey,
  cellLane,
  cellName,
  cellOf,
  goalAngle,
  goalDistance,
  inBox,
  inGoalArea,
  LANE_EDGES,
  laneOf,
  toUnits,
  type Point,
} from './pitch';

describe('grid pitch', () => {
  it('maps every lane and band edge to the right cell', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(laneOf(LANE_EDGES[i]!)).toBe(i);
      expect(laneOf(LANE_EDGES[i + 1]! - 0.001)).toBe(i);
    }
    for (let i = 0; i < 8; i += 1) {
      expect(bandOf(BAND_EDGES[i]!)).toBe(i);
      expect(bandOf(BAND_EDGES[i + 1]! - 0.001)).toBe(i);
    }
    expect(laneOf(68)).toBe(4);
    expect(bandOf(105)).toBe(7);
    expect(laneOf(-3)).toBe(0);
    expect(bandOf(-3)).toBe(0);
    expect(cellOf([105, 68])).toBe(39);
    expect(cellOf([0, 0])).toBe(0);
    expect(cellOf([60, 34])).toBe(4 * 5 + 2);
    expect(cellBand(cellOf([90, 20]))).toBe(6);
    expect(cellLane(cellOf([90, 20]))).toBe(1);
    expect(cellKey(cellOf([90, 34]))).toBe('central.box');
  });

  it('names special cells as football media do', () => {
    expect(cellName(cellOf([80, 34]))).toBe('아크 정면');
    expect(cellName(cellOf([94, 34]))).toBe('페널티 스폿 부근');
    expect(cellName(cellOf([102, 20]))).toBe('왼쪽 컷백 구역');
    expect(cellName(cellOf([102, 48]))).toBe('오른쪽 컷백 구역');
    expect(cellName(cellOf([102, 34]))).toBe('골 에어리어');
    expect(cellName(cellOf([102, 34]), 'near')).toBe('니어 포스트');
    expect(cellName(cellOf([102, 34]), 'far')).toBe('파 포스트');
    expect(cellName(cellOf([94, 5]))).toBe('왼쪽 박스 옆 측면');
    expect(cellName(cellOf([94, 63]))).toBe('오른쪽 박스 옆 측면');
    expect(cellName(cellOf([102, 5]))).toBe('왼쪽 코너 부근');
    expect(cellName(cellOf([102, 63]))).toBe('오른쪽 코너 부근');
    expect(cellName(cellOf([80, 20]))).toBe('왼쪽 하프스페이스 박스 앞');
    expect(cellName(cellOf([10, 34]))).toBe('중앙 우리 박스');
  });

  it("mirrors points into the away side's attack frame", () => {
    const p: Point = [30, 10];
    expect(attackFrame(0, p)).toEqual(p);
    expect(attackFrame(1, p)).toEqual([75, 58]);
    expect(attackFrame(1, attackFrame(1, p))).toEqual(p);
  });

  it("measures goal distance and the posts' angle", () => {
    const spot: Point = [94, 34];
    expect(goalDistance(spot)).toBeCloseTo(11, 6);
    expect(goalAngle(spot)).toBeCloseTo(0.642, 3);
    expect(goalDistance([105, 34])).toBe(0);
    expect(goalAngle([60, 34])).toBeLessThan(goalAngle([94, 34]));
  });

  it('converts to playback units and mirrors the second half', () => {
    expect(toUnits([105, 68], 1)).toEqual([100, 100]);
    expect(toUnits([0, 0], 1)).toEqual([0, 0]);
    const [x1, y1] = toUnits([21, 17], 1);
    const [x2, y2] = toUnits([21, 17], 2);
    expect(x1).toBeCloseTo(20, 9);
    expect(y1).toBeCloseTo(25, 9);
    expect(x2).toBeCloseTo(80, 9);
    expect(y2).toBeCloseTo(75, 9);
    expect(toUnits([21, 17], 3)).toEqual(toUnits([21, 17], 1));
    expect(toUnits([21, 17], 4)).toEqual(toUnits([21, 17], 2));
  });

  it('knows the penalty box and goal area', () => {
    expect(inBox([88.5, 13.84])).toBe(true);
    expect(inBox([88.4, 34])).toBe(false);
    expect(inBox([100, 54.17])).toBe(false);
    expect(inGoalArea([99.5, 24.84])).toBe(true);
    expect(inGoalArea([99.4, 34])).toBe(false);
    expect(inGoalArea([104, 43.17])).toBe(false);
  });
});
