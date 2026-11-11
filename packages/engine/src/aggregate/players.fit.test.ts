import { describe, expect, it } from 'vitest';
import { random } from '../primitives';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './config';
import { fitPlaced, type PlacedGroup } from './players';

// Synthetic, explicitly marked test data (→ARCH-21): groups shaped like one side's period of a
// match — 14 lines, five classes, a few hundred small groups, some lines unable to act in some
// groups and place terms from the floor to 1 — fitted as revision 11 fits them (T824).
function groups(seed: string, lines = 14, classes = 5, count = 300): PlacedGroup[] {
  const r = random(seed);
  return Array.from({ length: count }, () => {
    const w = Array.from({ length: lines }, () => (r() < 0.2 ? 0 : 0.1 + 2 * r()));
    return {
      c: Math.floor(r() * classes),
      n: 1 + Math.floor(r() * 6),
      w,
      u: w.map((x) => x * Math.max(AC.place.floor, r() ** 3)),
    };
  });
}
/** Each line's expected count of each class under weights `of(g)`. */
function expected(list: readonly PlacedGroup[], lines: number, classes: number, of: 'w' | 'u') {
  const out = Array<number>(lines * classes).fill(0);
  for (const g of list) {
    const total = g[of].reduce((n, x) => n + x, 0);
    if (total > 0) g[of].forEach((x, p) => (out[p * classes + g.c]! += (g.n * x) / total));
  }
  return out;
}

describe('the place rule’s fitting (→MATCH-16, T824)', () => {
  it('returns every line’s expected totals by class to the unplaced weights’', () => {
    for (const seed of ['fit-a', 'fit-b', 'fit-c']) {
      const list = groups(seed);
      const target = expected(list, 14, 5, 'w');
      const before = expected(list, 14, 5, 'u');
      fitPlaced(list, 14, 5);
      const after = expected(list, 14, 5, 'u');
      const off = (xs: number[]) =>
        Math.max(...xs.map((x, i) => (target[i]! > 0 ? Math.abs(x - target[i]!) / target[i]! : x)));
      // The place terms alone move some lines' totals by far more than the fitted residual.
      expect(off(before)).toBeGreaterThan(0.1);
      expect(off(after)).toBeLessThan(0.005);
      // A line that never weighs anything in a class keeps weight 0 there.
      for (const g of list)
        g.w.forEach((x, p) => {
          if (x === 0) expect(g.u[p]).toBe(0);
        });
    }
  });
});
