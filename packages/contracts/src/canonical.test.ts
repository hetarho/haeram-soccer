import { describe, expect, it } from 'vitest';
import { canonical } from './index';
describe('portable canonical facts', () => {
  it('normalizes object order while preserving event order', () => {
    expect(canonical({ b: [2, 1], a: { z: true, y: '1901' } })).toBe(
      canonical({ a: { y: '1901', z: true }, b: [2, 1] }),
    );
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
  it('rejects representations that JSON cannot faithfully carry', () => {
    for (const invalid of [NaN, Infinity, 1n, () => 1]) expect(() => canonical(invalid)).toThrow();
  });
});
