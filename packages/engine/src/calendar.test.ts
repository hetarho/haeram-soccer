import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  advanceDays,
  advanceRound,
  advanceToNextMatch,
  clubOf,
  closeSeason,
  createWorld,
  currentDay,
  daysUntilNextMatch,
  fixtureDay,
  nextOwnFixture,
  prepareSeason,
  seasonDate,
  SEASON_END_DAY,
  seasonLength,
  simulateSeason,
} from './index';

function world(country: 'ENG' | 'BEL' = 'ENG') {
  const w = createWorld({
    country,
    name: 'Calendar United',
    color: '#223344',
    seed: 'calendar',
    difficulty: 2,
  });
  w.cash = '999999999999';
  return w;
}
describe('persistent season calendar', () => {
  it('advances off days without playing fixtures or charging weekly costs', () => {
    const w = world();
    const cash = w.cash;
    const players = structuredClone(w.players);
    advanceDays(w, 3);
    advanceDays(w, 3);
    expect(currentDay(w)).toBe(6);
    expect(w.round).toBe(0);
    expect(w.ownMatches).toEqual([]);
    expect(w.cash).toBe(cash);
    expect(w.players).toEqual(players);
    expect(seasonDate(w)).toBe('1901년 8월 7일');
    expect(daysUntilNextMatch(w)).toBe(1);
    const playback = advanceDays(w, 1);
    expect(w.round).toBe(1);
    expect(playback?.record.id).toBe(w.ownMatches[0].id);
    expect(w.rankHistory?.map((s) => s.round)).toEqual([0, 1]);
    validateWorld(w);
  });

  it('keeps daily, three-day and next-own-match outcomes identical across empty rounds', () => {
    const a = world();
    a.lower = true;
    clubOf(a).tier = 4;
    prepareSeason(a);
    const b = structuredClone(a);
    const c = structuredClone(a);
    advanceToNextMatch(c);
    const second = nextOwnFixture(c)!;
    advanceToNextMatch(c);
    expect(currentDay(c)).toBe(fixtureDay(second));
    expect(c.round).toBeGreaterThan(2);
    while (currentDay(a) < currentDay(c)) advanceDays(a, 1);
    while (currentDay(b) < currentDay(c))
      advanceDays(b, Math.min(3, currentDay(c) - currentDay(b)));
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).toBe(canonical(c));
    expect(c.ownMatches).toHaveLength(2);
    expect(c.rankHistory?.at(-1)?.rows).toHaveLength(8);
  });

  it('migrates older saves at the completed round without inventing earlier rank history', () => {
    const w = world();
    advanceRound(w);
    delete w.calendar;
    delete w.rankHistory;
    expect(currentDay(w)).toBe(7);
    advanceDays(w, 1);
    expect(currentDay(w)).toBe(8);
    expect(validateWorld(w).rankHistory?.map((s) => [s.round, s.day])).toEqual([[1, 7]]);
    expect(w.ownMatches).toHaveLength(1);
    validateWorld(w);
  });

  it('plays European fixtures midweek and stops at that own match', () => {
    const w = world();
    const nextLeague = nextOwnFixture(w)!;
    const opponent = w.clubs.find((c) => c.id !== w.playerClub)!;
    w.europe = [
      {
        key: 'calendar-cup',
        name: 'Calendar Cup',
        field: 2,
        format: 'groups',
        games: 1,
        stage: '리그/조별 단계',
        clubs: [w.playerClub, opponent.id],
        fixtures: [
          { ...nextLeague, id: 'midweek', kind: 'europe', home: w.playerClub, away: opponent.id },
        ],
        standings: {
          [w.playerClub]: { ...w.tables[w.playerClub] },
          [opponent.id]: { ...w.tables[opponent.id] },
        },
      },
    ];
    expect(daysUntilNextMatch(w)).toBe(4);
    const fast = structuredClone(w);
    const p = advanceToNextMatch(w);
    const fastPlayback = advanceToNextMatch(fast, undefined, false);
    expect(fastPlayback?.frames).toEqual([]);
    expect(fastPlayback?.record).toEqual(p?.record);
    expect(canonical(fast)).toBe(canonical(w));
    expect(p?.record.id).toBe('midweek');
    expect(p?.frames.length).toBeGreaterThan(0);
    expect(w.round).toBe(0);
    expect(currentDay(w)).toBe(4);
    expect(w.tables[w.playerClub].played).toBe(0);
    expect(w.europe[0].standings[w.playerClub].played).toBe(1);
    advanceDays(w, 3);
    expect(w.ownMatches).toHaveLength(2);
    expect(w.tables[w.playerClub].played).toBe(1);
    validateWorld(w);
  });

  it('retains identical match, player and season facts when the fast path skips motion', () => {
    const observed = world('BEL');
    const fast = structuredClone(observed);
    const watched = advanceToNextMatch(observed);
    const skipped = advanceToNextMatch(fast, undefined, false);
    expect(watched?.frames.length).toBeGreaterThan(0);
    expect(skipped?.frames).toEqual([]);
    expect(skipped?.record).toEqual(watched?.record);
    expect(skipped?.record.players.length).toBeGreaterThan(0);
    expect(canonical(fast)).toBe(canonical(observed));
    while (observed.round < 46) advanceRound(observed);
    closeSeason(observed);
    observed.revision++;
    simulateSeason(fast);
    expect(canonical(fast)).toBe(canonical(observed));
    expect(fast.history).toHaveLength(1);
    expect(fast.rankHistory?.filter((s) => s.year === 1901)).toHaveLength(47);
  });

  it('closes the season the day after its final round and keeps previous league memberships frozen', () => {
    const w = world();
    for (let n = 0; n < 46; n++) advanceRound(w);
    expect(currentDay(w)).toBe(SEASON_END_DAY);
    const snapshots = structuredClone(w.rankHistory);
    advanceDays(w, 1);
    expect(w.year).toBe(1902);
    expect(currentDay(w)).toBe(0);
    expect(w.history.at(-1)).toMatchObject({ year: 1901, played: 46 });
    expect(w.rankHistory?.filter((s) => s.year === 1901)).toEqual(snapshots);
    expect(w.rankHistory?.at(-1)?.round).toBe(0);
    validateWorld(w);
  });

  it('stops a multi-day advance exactly when a critical event appears', () => {
    const w = world();
    w.cash = '-999999999';
    advanceDays(w, 10);
    expect(currentDay(w)).toBe(7);
    expect(w.round).toBe(1);
    expect(w.critical).toContain('운영자금');
    const snapshot = canonical(w);
    advanceToNextMatch(w);
    expect(canonical(w)).toBe(snapshot);
  });

  it('uses the correct leap-year season length and rejects a corrupted calendar', () => {
    const w = world();
    w.year = 1903;
    prepareSeason(w);
    expect(seasonLength(w)).toBe(366);
    expect(seasonLength({ ...w, year: 1904 })).toBe(365);
    w.calendar = { day: 8 };
    expect(() => validateWorld(w)).toThrow('시즌 날짜');
  });
});
