import { expect, it } from 'vitest';
import { createWorld, nextOwnFixture, simulateMatch } from '../../../../packages/engine/src/index';
import { fixtureDay } from '../../../../packages/engine/src/calendar';
import { ownSeasonFixtures } from './fixtures';
it('merges settled records once, excludes other clubs/seasons and keeps real calendar ordering', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Fixtures',
    color: '#24664f',
    seed: 'fixtures',
    difficulty: 2,
  });
  const next = nextOwnFixture(w)!;
  const record = simulateMatch(w, next, false, true).record;
  const initial = ownSeasonFixtures(w).length;
  w.ownMatches = [
    record,
    { ...record, id: 'past', year: w.year - 1 },
    { ...record, id: 'unrelated', home: 'other', away: 'another' },
  ];
  const before = JSON.stringify(w),
    fixtures = ownSeasonFixtures(w);
  expect(fixtures).toHaveLength(initial);
  expect(fixtures.find((f) => f.id === next.id)!.score).toEqual(record.score);
  expect(fixtures.every((f, i) => !i || fixtureDay(f) >= fixtureDay(fixtures[i - 1]))).toBe(true);
  expect(JSON.stringify(w)).toBe(before);
});
