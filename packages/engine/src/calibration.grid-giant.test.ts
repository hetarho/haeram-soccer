import { describe, expect, it } from 'vitest';
import { giant, minnow, sample, SLOW } from './calibration.testkit';

describe.each([['grid', 'grid']] as const)('%s: calibrated outcomes', (_, path) => {
  it(
    'never makes a massive favourite unbeatable',
    () => {
      const s = sample(giant, minnow, path);
      expect(s.gap).toBeGreaterThan(30);
      expect(s.win).toBeLessThan(0.96);
      expect(s.loss).toBeGreaterThan(0.01);
      expect(s.goals).toBeLessThan(4);
    },
    SLOW,
  );
});
