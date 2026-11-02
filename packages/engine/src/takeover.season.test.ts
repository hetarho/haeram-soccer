import { expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { takeOver } from './takeover';
import { divisionPlaces } from './club-value';
import { simulateSeason } from './founding';
import { squad } from './world';
import { ownerlessWorld, withBooks } from './ownerless.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

it('plays a taken-over club’s first season with the existing loop', () => {
  const w = ownerlessWorld('takeover-season');
  const places = divisionPlaces(w);
  const club = w.clubs.find(
    (c) => c.country === 'ENG' && c.tier === 1 && !c.representative && places.get(c.id) === 4,
  )!;
  // Two seasons of its wage bill in the bank and a debt to pay down.
  const wages = squad(w, club).reduce((sum, p) => sum + BigInt(p.wage), 0n);
  withBooks(w, club, { cash: (2n * wages).toString(), debt: wages.toString() });
  const year = w.year;
  takeOver(w, club.id, { tier: 'industrial', traits: [] }, 'youth-academy', DISABLED_RELEASE);
  simulateSeason(w);
  expect(w.bankrupt).toBeUndefined();
  expect(w.year).toBe(year + 1);
  const season = w.history.at(-1)!;
  expect(season).toMatchObject({ year, tier: 1, played: 46 });
  expect(w.ownMatches.filter((m) => m.year === year).length).toBeGreaterThanOrEqual(46);
  expect(w.events[0]).toMatchObject({ kind: 'takeover', year });
  expect(w.owner?.takeover).toMatchObject({ year, clubId: club.id });
  expect(w.playerClub).toBe(club.id);
  expect(() => validateWorld(structuredClone(w))).not.toThrow();
});
