import { describe, expect, it } from 'vitest';
import { bubblePlacement, nearestIndex } from './chartPoints';

describe('nearest season on a chart', () => {
  it('picks the closest point anywhere on the plot and clamps beyond its ends', () => {
    expect(nearestIndex(30, 100, 30, 590)).toBe(0);
    expect(nearestIndex(590, 100, 30, 590)).toBe(99);
    expect(nearestIndex(0, 100, 30, 590)).toBe(0);
    expect(nearestIndex(640, 100, 30, 590)).toBe(99);
    expect(nearestIndex(310, 3, 30, 590)).toBe(1);
    expect(nearestIndex(150, 3, 30, 590)).toBe(0);
    expect(nearestIndex(170, 3, 30, 590)).toBe(1);
    expect(nearestIndex(200, 1, 30, 590)).toBe(0);
  });

  it('still tells a hundred seasons apart on a phone-wide plot', () => {
    // A 294 px plot leaves 214 px for 100 points, about 2 px apart.
    const left = 30,
      right = 244,
      step = (right - left) / 99;
    for (let i = 0; i < 100; i++) {
      expect(nearestIndex(left + i * step + step * 0.45, 100, left, right)).toBe(i);
      expect(nearestIndex(left + i * step - step * 0.45, 100, left, right)).toBe(i);
    }
  });
});

describe('chart bubble placement', () => {
  it('centres over the point and clamps at the frame sides, keeping the tip on the point', () => {
    expect(bubblePlacement(150, 100, 100, 40, 300, 175)).toEqual({
      left: 100,
      top: 48,
      side: 'above',
      tip: 50,
    });
    expect(bubblePlacement(10, 100, 100, 40, 300, 175)).toMatchObject({ left: 0, tip: 10 });
    expect(bubblePlacement(295, 100, 100, 40, 300, 175)).toMatchObject({ left: 200, tip: 92 });
    // Wider than the frame (prevented by its max width) it still starts at the frame's edge.
    expect(bubblePlacement(150, 100, 400, 40, 300, 175).left).toBe(0);
  });

  it('flips below a point near the top and presses a tall bubble into the frame', () => {
    expect(bubblePlacement(150, 20, 100, 40, 300, 175)).toMatchObject({ side: 'below', top: 32 });
    expect(bubblePlacement(150, 120, 100, 150, 300, 175)).toMatchObject({ side: 'above', top: 0 });
    expect(bubblePlacement(150, 40, 100, 150, 300, 175)).toMatchObject({ side: 'below', top: 25 });
  });
});
