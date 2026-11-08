import { describe, expect, it } from 'vitest';
import { europeanEras } from './europe';
import { roundsFor } from './knockout';
import { beforeGroups } from './stages';

/*
 * T724: the knockout round counts moved from the host's `Math.log2` to exact integer arithmetic.
 * The old expressions live here only (tests are outside the portable-math lint block) so the new
 * forms are held equal to them on every input the engine gives.
 */
const oldRoundsFor = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
const oldBeforeGroups = (field: number, qualifier: number | undefined, round: number) =>
  !!(qualifier && round < Math.log2(field / qualifier));

describe('integer knockout round counts (T724)', () => {
  it('gives the old ⌈log₂ n⌉ rounds for every club count from 0 to 4096', () => {
    for (let n = 0; n <= 4096; n++) expect(roundsFor(n), `n=${n}`).toBe(oldRoundsFor(n));
    // Either side of every power of two up to 2³¹.
    for (let k = 1; k <= 31; k++)
      for (const n of [2 ** k - 1, 2 ** k, 2 ** k + 1])
        expect(roundsFor(n), `n=${n}`).toBe(oldRoundsFor(n));
  });

  it('places the same rounds before the groups for every European era and round 0–10', () => {
    const eras = new Map<string, { field: number; qualifier?: number }>();
    for (let year = 1900; year <= 2100; year++)
      for (const era of europeanEras(year))
        eras.set(`${era.field}/${era.qualifier}`, { field: era.field, qualifier: era.qualifier });
    // The 1991–93 Champions League (32 clubs, 8 to the groups) is the one era with a qualifier.
    expect(eras.has('32/8')).toBe(true);
    let before = 0;
    for (const { field, qualifier } of eras.values())
      for (let round = 0; round <= 10; round++) {
        const expected = oldBeforeGroups(field, qualifier, round);
        expect(beforeGroups({ field, qualifier }, round), `${field}/${qualifier} k${round}`).toBe(
          expected,
        );
        if (expected) before++;
      }
    expect(before).toBe(2);
  });

  it('agrees with the old comparison on any whole field and qualifier', () => {
    for (let field = 1; field <= 256; field++)
      for (let qualifier = 1; qualifier <= 64; qualifier++)
        for (let round = 0; round <= 10; round++)
          if (
            beforeGroups({ field, qualifier }, round) !== oldBeforeGroups(field, qualifier, round)
          )
            expect.fail(`${field}/${qualifier} k${round}`);
    for (const round of [28, 30, 31, 32, 40])
      expect(beforeGroups({ field: 32, qualifier: 8 }, round)).toBe(false);
  });
});
