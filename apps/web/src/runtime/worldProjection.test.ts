import { expect, it } from 'vitest';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { foundSquads } from '../../../../packages/engine/src/persisted-squads';
import { WORLD_VIEW_FIELDS, projectWorldFacts } from './worldProjection';
import { adoptSquads } from './squadActivation';
import { disciplineNames } from './disciplineNames';
import { projectedClubRating } from './squadReads';

function fixture() {
  const w = worldMarketFixture();
  w.clubs = w.clubs.slice(0, 2);
  return w;
}

it('classifies all top-level fields and excludes the persisted registry', () => {
  const w = fixture();
  foundSquads(w);
  w.npcGrowthAt = { year: w.year, round: 4 };
  w.npcRetirementAt = w.year;
  w.npcSummerAt = w.year;
  w.npcMarketAt = { year: w.year, day: 0 };
  w.playerRecords = { p: { moves: [{ year: w.year, day: 0, from: 'own', to: 'foreign', fee: '100' }] } };
  const projected = projectWorldFacts(w);
  expect(projected).not.toHaveProperty('squads');
  expect(projected).not.toHaveProperty('people');
  for (const key of ['playerRecords', 'npcGrowthAt', 'npcRetirementAt', 'npcSummerAt', 'npcMarketAt'])
    expect(projected).not.toHaveProperty(key);
  expect(Object.keys(w).every((key) => Object.hasOwn(WORLD_VIEW_FIELDS, key))).toBe(true);
  expect(() => projectWorldFacts(Object.assign(w, { futureField: ['large'] }))).toThrow();
});
it('adopts absent squads once on a copy and increments revision only once in a chain', () => {
  const w = fixture(),
    revision = w.revision;
  const adopted = adoptSquads(w, false);
  expect(w).not.toHaveProperty('squads');
  expect(adopted.squads!.foreign!.length).toBeGreaterThan(0);
  expect(adopted.revision).toBe(revision + 1);
  expect(adoptSquads(adopted, false)).toBe(adopted);
  expect(adoptSquads(w, true).revision).toBe(revision);
});
it('publishes only named discipline players and reads the worker rating without squads', () => {
  const w = fixture();
  foundSquads(w);
  // Discipline must still name a player who moved outside the matchday eighteen.
  const p = w.squads!.foreign!.at(-1)!;
  w.discipline = { year: w.year, yellows: { [p.id]: { league: 2 } }, bans: [], out: [] };
  expect(disciplineNames(w)).toEqual({ [p.id]: { name: p.name, club: 'foreign' } });
  delete w.squads;
  expect(projectedClubRating({ ...w.clubs[1]!, rating: 87 })).toBe(87);
});
