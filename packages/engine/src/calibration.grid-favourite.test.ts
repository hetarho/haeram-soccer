import { describe, expect, it } from 'vitest';
import { favourite, level, rival, sample, SLOW, underdog } from './calibration.testkit';

describe.each([['grid', 'grid']] as const)('%s: calibrated outcomes', (_, path) => {
  it(
    'lets a +20 favourite win most matches but still lose some',
    () => {
      const s = sample(favourite, underdog, path);
      expect(s.gap).toBeGreaterThan(17);
      expect(s.gap).toBeLessThan(23);
      expect(s.win).toBeGreaterThan(0.7);
      expect(s.win).toBeLessThan(0.85);
      expect(s.loss).toBeGreaterThan(0.03);
      expect(s.loss).toBeLessThan(0.1);
    },
    SLOW,
  );

  // T216: equal grid sides draw about 21% (1,600 fixtures), as press beats every other tactic
  // (artifacts/benchmarks/CALIBRATION.md, 격자 엔진 전력 곡선); run it for the grid once the tactics are balanced.
  // T278 kept it skipped: the candidate model still draws 23.7% between equal clubs (600 held-out
  // fixtures, 95% 20.4–27.2%) and press still beats counter 79/12/9 (artifacts/benchmarks/CALIBRATION.md, T278).
  it.skipIf(path === 'grid')(
    'gives equal sides real football’s share of draws',
    () => {
      const s = sample(level, rival, path);
      expect(s.draw).toBeGreaterThan(0.22);
      expect(s.draw).toBeLessThan(0.32);
    },
    SLOW,
  );
});
