import { expect, it } from 'vitest';
import type { SeasonArchive } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { careerRecords } from './careerRecords';
it('uses denominator-aware season records and retains inactive leaders without mutation', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Book',
    color: '#24664f',
    seed: 'book',
    difficulty: 2,
  });
  expect(careerRecords(w).finish).toBeUndefined();
  expect(careerRecords(w).scorer).toBeUndefined();
  const season = (year: number, points: number, played: number): SeasonArchive => ({
    year,
    tier: 3,
    group: 0,
    rank: 1,
    points,
    played,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: points,
    ga: 0,
    cash: '0',
    currency: 'GBP-LSD',
    income: '0',
    expense: '0',
    fans: 1000,
    rating: 40,
    manager: 'Manager',
    metrics: Array<number>(12).fill(0),
    standings: [],
    champions: [],
    europe: [],
  });
  w.history = [season(1902, 40, 20), season(1901, 30, 10)];
  w.players[0].career[0] = 7;
  w.players[0].status = 'retired';
  const before = JSON.stringify(w),
    records = careerRecords(w);
  expect(records.points!.year).toBe(1901);
  expect(records.attack!.year).toBe(1901);
  expect(records.finish!.year).toBe(1901);
  expect(records.scorer!.status).toBe('retired');
  expect(records.supporters!.year).toBe(1901);
  expect(JSON.stringify(w)).toBe(before);
});
