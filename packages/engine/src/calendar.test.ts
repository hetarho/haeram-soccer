import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  advanceDays,
  advanceRound,
  advanceToNextMatch,
  clubOf,
  currentDay,
  daysUntilNextMatch,
  fixtureDay,
  FOUNDING_YEAR,
  nextOwnFixture,
  prepareSeason,
  seasonDate,
  SEASON_END_DAY,
  seasonLength,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { world } from './calendar.testkit';

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
    expect(seasonDate(w)).toBe(`${FOUNDING_YEAR}년 8월 7일`);
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
    advanceToNextMatch(c);
    // The 30-game amateur league leaves an empty round before the third match.
    const third = nextOwnFixture(c)!;
    advanceToNextMatch(c);
    expect(currentDay(c)).toBe(fixtureDay(third));
    expect(c.round).toBeGreaterThan(3);
    while (currentDay(a) < currentDay(c)) advanceDays(a, 1);
    while (currentDay(b) < currentDay(c))
      advanceDays(b, Math.min(3, currentDay(c) - currentDay(b)));
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical(a)).toBe(canonical(c));
    expect(c.ownMatches).toHaveLength(3);
    expect(c.rankHistory?.at(-1)?.rows).toHaveLength(16);
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

  it('closes the season the day after its final round and keeps previous league memberships frozen', () => {
    // The rounds only lead to the final one; the day after it, the close, is the subject.
    const w = cachedWorld('final-round', () => {
      const w = world();
      for (let n = 0; n < 46; n++) advanceRound(w);
      return w;
    });
    expect(currentDay(w)).toBe(SEASON_END_DAY);
    const snapshots = structuredClone(w.rankHistory);
    advanceDays(w, 1);
    expect(w.year).toBe(FOUNDING_YEAR + 1);
    expect(currentDay(w)).toBe(0);
    // A new club plays its first season in the 16-club amateur league.
    expect(w.history.at(-1)).toMatchObject({ year: FOUNDING_YEAR, played: 30 });
    expect(w.rankHistory?.filter((s) => s.year === FOUNDING_YEAR)).toEqual(snapshots);
    expect(w.rankHistory?.at(-1)?.round).toBe(0);
    validateWorld(w);
  });

  it('stops a multi-day advance exactly when the club goes bankrupt', () => {
    const w = world();
    // Debt deeper than half a season's fixed costs ends the career at the next settlement.
    w.cash = '-999999999';
    advanceDays(w, 10);
    expect(currentDay(w)).toBe(7);
    expect(w.round).toBe(1);
    expect(w.bankrupt).toEqual({ year: w.year, round: 1, day: 7 });
    const snapshot = canonical(w);
    advanceToNextMatch(w);
    expect(canonical(w)).toBe(snapshot);
  });

  it('uses the correct leap-year season length and rejects a corrupted calendar', () => {
    const w = world();
    w.year = 1951;
    prepareSeason(w);
    expect(seasonLength(w)).toBe(366);
    expect(seasonLength({ ...w, year: 1952 })).toBe(365);
    w.calendar = { day: 8 };
    expect(() => validateWorld(w)).toThrow('시즌 날짜');
  });
});
