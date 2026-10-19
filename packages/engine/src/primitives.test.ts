import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { random, ratio, scaleBy } from './primitives';
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
  it('scaleBy matches ratio for representable factors', () => {
    expect(scaleBy('12345', 1.25, 100n)).toBe(ratio('12345', 125n, 100n));
    expect(scaleBy('987654321', 0.5, 1000n)).toBe(ratio('987654321', 500n, 1000n));
    expect(scaleBy('-4000', 1.1, 10000n)).toBe(ratio('-4000', 11000n, 10000n));
    expect(scaleBy('70000', 1, 1_000_000n)).toBe('70000');
    expect(scaleBy('70000', 0, 100n)).toBe('0');
  });
  it('scaleBy rounds a factor like 0.29 instead of throwing', () => {
    expect(() => BigInt(0.29 * 100)).toThrow(RangeError);
    expect(scaleBy('1000', 0.29, 100n)).toBe('290');
    expect(scaleBy('1000', 0.1 + 0.2, 10n)).toBe('300');
  });
  it('scaleBy rounds half to even at the precision', () => {
    expect(scaleBy('5', 0.5, 10n)).toBe('2');
    expect(scaleBy('7', 0.5, 10n)).toBe('4');
    expect(scaleBy('-7', 0.5, 100n)).toBe('-4');
    expect(scaleBy('3', 1.5, 1000n)).toBe('4');
    expect(scaleBy('5', 1.5, 1000n)).toBe('8');
  });
  it('scaleBy rejects NaN, Infinity and a zero precision', () => {
    expect(() => scaleBy('100', Number.NaN, 100n)).toThrow('Invalid factor');
    expect(() => scaleBy('100', Number.POSITIVE_INFINITY, 100n)).toThrow('Invalid factor');
    expect(() => scaleBy('100', Number.NEGATIVE_INFINITY, 100n)).toThrow('Invalid factor');
    expect(() => scaleBy('100', 1, 0n)).toThrow('Invalid precision');
    expect(() => scaleBy('100', 1, -100n)).toThrow('Invalid precision');
  });
  it('scaleBy(x, f, P) equals ratio(x, round(f·P), P) for integer x and f in [0, 4]', () =>
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        fc.constantFrom(10n, 100n, 1000n, 10000n, 1_000_000n),
        (x, f, precision) => {
          const expected = ratio(
            x.toString(),
            BigInt(Math.round(f * Number(precision))),
            precision,
          );
          expect(scaleBy(x.toString(), f, precision)).toBe(expected);
          return true;
        },
      ),
    ));
});
