import { expect, it } from 'vitest';
import { observedRate } from './matchAnalysis';
it('keeps the real denominator and leaves an unattempted rate undefined', () => {
  expect(observedRate(3, 9)).toEqual({ numerator: 3, denominator: 9, percent: 100 / 3 });
  expect(observedRate(0, 0).percent).toBeUndefined();
  expect(observedRate(1, 3).percent).toBeCloseTo(100 / 3);
});
