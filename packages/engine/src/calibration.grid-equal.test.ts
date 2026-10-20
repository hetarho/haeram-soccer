import { describe, expect, it } from 'vitest';
import { level, rival, sample, SLOW } from './calibration.testkit';

describe.each([['grid', 'grid']] as const)('%s: calibrated outcomes', (_, path) => {
  it(
    'keeps equal sides close, with real football’s goals and shots',
    () => {
      const s = sample(level, rival, path);
      expect(s.win).toBeGreaterThan(s.loss);
      expect(s.goals).toBeGreaterThan(2.4);
      expect(s.goals).toBeLessThan(3.1);
      expect(s.shots).toBeGreaterThan(10);
      expect(s.shots).toBeLessThan(16);
    },
    SLOW,
  );
});
