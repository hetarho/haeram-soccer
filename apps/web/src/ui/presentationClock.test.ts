import { expect, it } from 'vitest';
import {
  paceStarts,
  presentationAdvance,
  presentationAt,
  presentationTime,
  WATCH_MINUTE_MS,
  WATCH_SPEEDS,
} from './presentationClock';

it('spends longer on minutes with a higher pace and four seconds on average', () => {
  expect(WATCH_MINUTE_MS).toBe(4000);
  expect(WATCH_SPEEDS).toEqual([1, 2, 4, 8, 16]);
  // Mean pace 1: a quiet build-up minute, a busy chance and an ordinary one.
  const paces = [0.6, 1.6, 0.8];
  const starts = paceStarts(paces);
  expect(starts).toEqual([0, 2400, 8800, 12000]);
  expect(starts.at(-1)! / paces.length).toBe(WATCH_MINUTE_MS);
  // The busy minute lasts 4000 × 1.6 ms at 1x and a quarter of that at 4x.
  expect(presentationAdvance(2400, 1, paces)).toBe(1);
  expect(presentationAdvance(2400 + 3200, 1, paces)).toBe(1.5);
  expect(presentationAdvance(2200, 4, paces)).toBe(2);
  expect(presentationAdvance(1200, 1, paces)).toBe(0.5);
  // Every speed reaches the final whistle and stays there.
  for (const speed of WATCH_SPEEDS)
    expect(presentationAdvance(12000 / speed, speed, paces)).toBe(paces.length);
  expect(presentationAdvance(60000, 16, paces)).toBe(paces.length);
  // Seeking maps back onto the same clock.
  for (const position of [0, 0.25, 1, 1.75, 2.5, 3])
    expect(presentationAt(starts, presentationTime(starts, position))).toBeCloseTo(position);
  expect(presentationAdvance(1000, 1, [])).toBe(0);
  expect(presentationAdvance(0, 16, paces)).toBe(0);
});
