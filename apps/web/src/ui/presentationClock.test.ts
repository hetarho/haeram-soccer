import { expect, it } from 'vitest';
import { presentationAdvance, WATCH_MINUTE_MS, WATCH_SPEEDS } from './presentationClock';
it('maps four real seconds to one minute at 1x for motion and summary samples', () => {
  expect(WATCH_MINUTE_MS).toBe(4000);
  expect(WATCH_SPEEDS).toEqual([1, 2, 4, 8]);
  expect(presentationAdvance(4000, 1, 90)).toBe(1);
  expect(presentationAdvance(4000, 1, 2700)).toBe(30);
  expect(presentationAdvance(1000, 4, 2700)).toBe(30);
  expect(presentationAdvance(360000, 1, 2700)).toBe(2700);
  expect(presentationAdvance(1000, 1, 0, 0)).toBe(0);
});
