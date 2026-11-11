import { describe, expect, it } from 'vitest';
import { approach, closestOnSegment, dist, norm, type Vec } from './vec';

describe('staging vec', () => {
  it('closestOnSegment clamps to the ends', () => {
    expect(closestOnSegment([0, 0], [10, 0], [5, 3])).toEqual({ point: [5, 0], t: 0.5 });
    expect(closestOnSegment([0, 0], [10, 0], [-4, 2])).toEqual({ point: [0, 0], t: 0 });
    expect(closestOnSegment([0, 0], [10, 0], [14, -2])).toEqual({ point: [10, 0], t: 1 });
    expect(closestOnSegment([3, 3], [3, 3], [9, 9])).toEqual({ point: [3, 3], t: 0 });
  });

  it('norm of the zero vector is zero', () => {
    expect(norm([0, 0])).toEqual([0, 0]);
    expect(norm([3, 4])).toEqual([0.6, 0.8]);
  });

  it('approach never overshoots', () => {
    expect(approach([0, 0], [3, 4], 2)).toEqual([1.2, 1.6]);
    expect(approach([0, 0], [3, 4], 5)).toEqual([3, 4]);
    expect(approach([0, 0], [3, 4], 50)).toEqual([3, 4]);
    let p: Vec = [0, 0];
    for (let i = 0; i < 10; i++) {
      const before = dist(p, [7, -2]);
      p = approach(p, [7, -2], 1);
      expect(dist(p, [7, -2])).toBeLessThanOrEqual(before);
    }
    expect(p).toEqual([7, -2]);
  });
});
