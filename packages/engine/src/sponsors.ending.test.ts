import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { advanceDays, currentDay, operate, seasonDayOf } from './index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { club } from './sponsors.testkit';

/** An owner's local contract in its final season, and the same club delegating business. */
function endingClubs() {
  const owner = club();
  operate(owner, { type: 'sign-sponsor', slot: 'local', offer: 0 });
  owner.sponsors![0].until = owner.year + 1;
  const delegated = structuredClone(owner);
  delegated.intervention = 4;
  delegated.settings = legacySettings(4);
  return { owner, delegated };
}

describe('sponsor contracts by slot', () => {
  it('tells an owner on 1 April of a contract in its final season, but not a delegating one', () => {
    // Both clubs are built once up to 31 March; 1 April and the days after are lived here.
    const { owner, delegated } = cachedWorld('march', () => {
      const clubs = endingClubs(),
        march = seasonDayOf(clubs.owner.year, 4, 1) - 1;
      for (const w of [clubs.owner, clubs.delegated])
        while (currentDay(w) < march)
          advanceDays(w, Math.min(300, march - currentDay(w)), undefined, false);
      return clubs;
    });
    const april = seasonDayOf(owner.year, 4, 1);
    for (const w of [owner, delegated]) {
      while (currentDay(w) < april)
        advanceDays(w, Math.min(300, april - currentDay(w)), undefined, false);
      advanceDays(w, 3, undefined, false);
    }
    const ending = (w: World) => (w.inbox ?? []).filter((item) => item.kind === 'sponsor-ending');
    expect(ending(owner)).toEqual([
      expect.objectContaining({
        attention: true,
        day: april,
        ref: `sponsor:local:${owner.year + 1}`,
      }),
    ]);
    expect(ending(delegated)).toEqual([]);
  });
});
