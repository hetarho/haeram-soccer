import { describe, expect, it } from 'vitest';
import { packCareerProfiles, readCareerProfiles } from './careerProfiles';
const fixture = () => [
  ...Array.from({ length: 14 }, () => [0, 1, 2, 3]),
  [
    null,
    [1950, 243, 0.123456789, false, null, null, null],
    null,
    [1951, 0, true, true, 1951, 0, false],
  ],
  [null, null, null, null],
  [[0, 55.25, 88.125, 1952, 0], null, [1, 0, 0, 1952, 365], null],
  [[60.5, 90.125, 2, 1953, 1], [70, 80, 0, 1955, 0], null, null],
];
describe('bounded sparse career profiles', () => {
  it('preserves all-present, all-absent, alternating, false, zero and fractional values without mutation', () => {
    const people = fixture(),
      before = structuredClone(people),
      packed = packCareerProfiles(people);
    const packedBefore = structuredClone(packed);
    expect(readCareerProfiles(packed, 4)).toEqual(before);
    expect(people).toEqual(before);
    expect(packed).toEqual(packedBefore);
    expect(readCareerProfiles(packCareerProfiles(Array.from({ length: 18 }, () => [])), 0)).toEqual(
      Array.from({ length: 18 }, () => []),
    );
  });
  it('rejects incomplete, oversized, negative, fractional and nonminimal presence runs', () => {
    for (const runs of [
      [],
      [0],
      [5],
      [-1, 5],
      [1.5, 2.5],
      [0, 0, 4],
      [0, 4, 0],
      [Number.MAX_SAFE_INTEGER],
    ]) {
      const packed = packCareerProfiles(fixture());
      packed[14][1] = runs;
      expect(() => readCareerProfiles(packed, 4)).toThrow();
    }
  });
  it('rejects malformed dimensions before expanding untrusted profiles', () => {
    for (const corrupt of [
      (p: unknown[][]) => p[14].pop(),
      (p: unknown[][]) => (p[14][0] as unknown[]).pop(),
      (p: unknown[][]) => (p[14][0] as unknown[][])[0].pop(),
      (p: unknown[][]) => ((p[14][0] as unknown[])[0] = 'wrong'),
      (p: unknown[][]) => p.pop(),
    ]) {
      const packed = packCareerProfiles(fixture());
      corrupt(packed);
      expect(() => readCareerProfiles(packed, 4)).toThrow();
    }
    expect(() => readCareerProfiles([], 1_000_000)).toThrow();
    expect(() => readCareerProfiles([], -1)).toThrow();
  });
});
