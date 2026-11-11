import { describe, expect, it } from 'vitest';
import { approach, closestOnSegment, dist, norm } from './vec';

describe('staging vectors', () => {
  it('projects onto a segment, including its ends and a point segment', () => {
    expect(closestOnSegment([0, 0], [10, 0], [5, 3])).toEqual({ point: [5, 0], t: 0.5 });
    expect(closestOnSegment([0, 0], [10, 0], [-4, 2])).toEqual({ point: [0, 0], t: 0 });
    expect(closestOnSegment([0, 0], [10, 0], [14, -2])).toEqual({ point: [10, 0], t: 1 });
    expect(closestOnSegment([3, 3], [3, 3], [9, 9])).toEqual({ point: [3, 3], t: 0 });
  });

  it('normalizes a direction and keeps the zero vector at zero', () => {
    expect(norm([0, 0])).toEqual([0, 0]);
    expect(norm([3, 4])).toEqual([0.6, 0.8]);
  });

  it('approaches without overshooting, moving backwards or mutating its inputs', () => {
    const from = Object.freeze([0, 0] as const);
    const to = Object.freeze([3, 4] as const);
    expect(approach(from, to, 2)).toEqual([1.2, 1.6]);
    expect(approach(from, to, 5)).toEqual(to);
    expect(approach(from, to, 50)).toEqual(to);
    expect(approach(from, to, -1)).toEqual(from);
    expect(approach(to, to, 0)).toEqual(to);
    let point: readonly [number, number] = from;
    for (let i = 0; i < 10; i++) {
      const before = dist(point, [7, -2]);
      point = approach(point, [7, -2], 1);
      expect(dist(point, [7, -2])).toBeLessThanOrEqual(before);
    }
    expect(point).toEqual([7, -2]);
  });
});
