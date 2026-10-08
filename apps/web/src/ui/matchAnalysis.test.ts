import { expect, it } from 'vitest';
import { createWorld, simulateMatch, nextOwnFixture } from '../../../../packages/engine/src/index';
import { matchRates, observedRate } from './matchAnalysis';
it('keeps real home/away denominators and leaves an unattempted rate undefined', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Report',
    color: '#24664f',
    seed: 'report',
    difficulty: 2,
  });
  const record = simulateMatch(w, nextOwnFixture(w)!, false, true).record;
  const rows = matchRates(record);
  expect(rows[0].home).toEqual(observedRate(record.metrics[0][3], record.metrics[0][2]));
  expect(rows[0].away).toEqual(observedRate(record.metrics[1][3], record.metrics[1][2]));
  expect(rows[3].home.denominator).toBe(90);
  expect(rows[3].home.percent! + rows[3].away.percent!).toBeCloseTo(100);
  expect(observedRate(0, 0).percent).toBeUndefined();
  expect(observedRate(1, 3).percent).toBeCloseTo(100 / 3);
});
