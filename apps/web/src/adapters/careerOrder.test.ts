import { describe, expect, it } from 'vitest';
import { packCareerOrder, readCareerOrder } from './careerOrder';
const raw = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
describe('bounded exact registry permutations', () => {
  it('preserves empty, identity, reverse and mixed multi-byte permutations', () => {
    for (const order of [
      [],
      [0],
      [2, 0, 1],
      Array.from({ length: 1000 }, (_, i) => i),
      Array.from({ length: 1000 }, (_, i) => 999 - i),
      Array.from({ length: 257 }, (_, i) => (i * 131) % 257),
    ])
      expect(readCareerOrder(packCareerOrder(order), order.length)).toEqual(order);
  });
  it('rejects invalid writer permutations instead of rounding or deduplicating', () => {
    for (const order of [[1], [-1], [0.5], [0, 0], [0, 2], [NaN], [Infinity]])
      expect(() => packCareerOrder(order)).toThrow();
  });
  it('rejects malformed, excessive, duplicate, truncated and noncanonical streams', () => {
    for (const [text, count] of [
      ['', 1],
      ['AB==', 1],
      ['@@@@', 1],
      [raw([0]), 0],
      [raw([0]), -1],
      [raw([0]), 0.5],
      ['', 1_000_001],
      [raw([0, 0]), 2],
      [raw([2]), 1],
      [raw([1]), 1],
      [raw([128]), 1],
      [raw([128, 0]), 1],
      [raw([128, 128, 128, 0]), 1],
      [raw([0, 0]), 1],
    ] as [string, number][])
      expect(() => readCareerOrder(text, count)).toThrow();
  });
});
