import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { random, ratio } from './primitives';
describe('portable primitives', () => {
  it('replays seed streams and has independent streams', () => {
    const a = random('fixture:1901'),
      b = random('fixture:1901');
    expect(Array.from({ length: 100 }, () => a())).toEqual(Array.from({ length: 100 }, () => b()));
    expect(random('world')()).not.toBe(random('match')());
  });
  it('rounds signed exact conversions half to even', () => {
    expect(ratio('5', 1n, 2n)).toBe('2');
    expect(ratio('7', 1n, 2n)).toBe('4');
    expect(ratio('-7', 1n, 2n)).toBe('-4');
    expect(ratio('10000000000000000001', 1n, 1n)).toBe('10000000000000000001');
  });
  it('conserves integer values under identity conversion', () =>
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }), (v) => {
        expect(ratio(v.toString(), 7n, 7n)).toBe(v.toString());
        return true;
      }),
    ));
});
