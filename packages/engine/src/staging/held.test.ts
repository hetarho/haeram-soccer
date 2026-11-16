// A man held up on the ball keeps one line (`heldLine`): across the opponent on the side of his
// pass, never back toward his own goal, so he never circles the man stuck to him.
import { describe, expect, it } from 'vitest';
import { PORTABLE_MATH } from '../portable-math';
import { heldLine } from './pass';
import type { Vec } from './types';
import { dot, len } from './vec';

const forward: Vec = [1, 0];
const pos: Vec = [50, 34];
const around = (r: number, k: number, n: number): Vec => [
  pos[0] + r * PORTABLE_MATH.cos((2 * Math.PI * k) / n),
  pos[1] + r * PORTABLE_MATH.sin((2 * Math.PI * k) / n),
];

describe('heldLine', () => {
  it('faced off from in front, he moves across toward his pass, not back', () => {
    const line = heldLine(pos, [52, 34], [50, 50], forward, forward);
    expect(line[0]).toBeCloseTo(0, 9);
    expect(line[1]).toBeCloseTo(1, 9);
    expect(heldLine(pos, [52, 34], [50, 10], forward, forward)[1]).toBeCloseTo(-1, 9);
  });

  it('with the man at his back he goes on up the pitch', () => {
    const line = heldLine(pos, [48, 34], [60, 40], forward, forward);
    expect(dot(line, forward)).toBeGreaterThan(0.5);
  });

  it('from wherever the man presses, the line never points toward his own goal', () => {
    for (let k = 0; k < 24; k++) {
      const line = heldLine(pos, around(2, k, 24), [40, 20], forward, forward);
      // A unit line, or none: where across him is only back, he stands his ground.
      expect([0, 1]).toContain(Math.round(len(line) * 1e9) / 1e9);
      expect(dot(line, forward)).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
