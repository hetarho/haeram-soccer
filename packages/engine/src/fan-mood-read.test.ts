import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { FAN_MOOD } from './owner-config';
import { fanMoodAfter, percentOf } from './fan-mood-read';

describe('unchanged exact-money mood reads', () => {
  it('truncates exact integer ratios before Number conversion and retains unknown bases', () => {
    expect(percentOf(1n, 3n)).toBe(33.33);
    expect(percentOf(-1n, 3n)).toBe(-33.33);
    expect(percentOf(1n, 333n)).toBe(0.3);
    expect(percentOf(10000n, 3330000n)).toBe(0.3);
    expect(percentOf(0n, 3n)).toBe(0);
    for (const base of [undefined, 0n, -1n]) expect(percentOf(1n, base)).toBeUndefined();
    const amount = 900719925474099312345n,
      base = 90071992547409931234567n;
    expect(percentOf(amount, base)).toBe(0.99);
    expect(percentOf(10n ** 320n, 1n)).toBe(Infinity); // original conversion, no new range policy
  });
  it('preserves the pinned pre-extraction evaluation at fractional, sign and saturation boundaries', () => {
    // Frozen expression from a16e6d81, not a new preferred rounding rule.
    for (const before of [0, 0.005, 0.01, 1, 59.995, 60, 60.005, 99, 99.995, 100])
      for (const friendly of [false, true])
        for (const change of [
          -Infinity,
          -150,
          -20,
          -1,
          -0.2,
          -0.15,
          -0.005,
          -1e-12,
          -0,
          0,
          1e-12,
          0.005,
          0.15,
          1,
          10,
          150,
          Infinity,
        ]) {
          const w = {
            owner: { fanMood: before, traits: friendly ? ['fansFriend'] : [] },
          } as unknown as Pick<World, 'owner'>;
          const snapshot = structuredClone(w);
          Object.freeze(w.owner!.traits);
          Object.freeze(w.owner);
          Object.freeze(w);
          const scaled = change < 0 && friendly ? change * FAN_MOOD.friendly : change;
          const expected =
            Math.round(Math.max(FAN_MOOD.min, Math.min(FAN_MOOD.max, before + scaled)) * 100) / 100;
          expect(fanMoodAfter(w, change)).toBe(expected);
          expect(w).toEqual(snapshot);
        }
  });
  it('keeps the existing IEEE stored value and delta rather than repairing display ties', () => {
    const w = { owner: { fanMood: 60, traits: [] } } as unknown as Pick<World, 'owner'>;
    const after = fanMoodAfter(w, -0.15);
    expect(after).toBe(59.85);
    expect(after - w.owner!.fanMood).toBe(-0.14999999999999858);
  });
});
