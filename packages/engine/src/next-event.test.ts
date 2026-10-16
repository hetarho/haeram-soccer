import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  createWorld,
  advanceDays,
  advanceRound,
  prepareSeason,
  nextOwnFixture,
  daysUntilNextMatch,
  currentDay,
  seasonDayOf,
} from './index';
import { nextEventDays, advanceToNextEvent } from './next-event';
import { RESPONSIBILITY_KEYS } from './responsibilities';
import { stoppingReasons } from './stopping';
import { currency, priceIndex } from '../../catalogs/src/index';
function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Next Event',
    color: '#224466',
    seed: 'next-event',
    level: 'normal',
  });
  w.cash = w.income = '999999999999';
  w.settings!.mode = 'manual';
  for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
  return w;
}
describe('ordered manual next-event settlement', () => {
  it('rejects automatic, invalid manual and actual unresolved decisions before any mutation', () => {
    const w = world();
    w.settings!.mode = 'automatic';
    const before = canonical(w);
    expect(() => advanceToNextEvent(w)).toThrow('수동');
    expect(canonical(w)).toBe(before);
    w.settings!.mode = 'manual';
    w.settings!.observations.matchEve = false;
    expect(() => advanceToNextEvent(w)).toThrow('경기 이벤트');
    w.settings!.observations.matchEve = true;
    w.settings!.responsibilities.manager = 'direct';
    w.manager.interim = true;
    const pending = canonical(w);
    expect(() => advanceToNextEvent(w)).toThrow('대기 중인');
    expect(canonical(w)).toBe(pending);
  });
  it('arrives on successive own match eves and keeps exactly the one-day path facts', () => {
    const fast = world(),
      daily = structuredClone(fast);
    for (let run = 0; run < 3; run++) {
      const count = fast.ownMatches.length;
      const reasons = advanceToNextEvent(fast);
      do {
        advanceDays(daily, 1, undefined, false);
      } while (!daily.critical && !daily.bankrupt && !stoppingReasons(daily).length);
      expect(daysUntilNextMatch(fast)).toBe(1);
      expect(reasons.map((r) => r.kind)).toEqual(['match']);
      expect(fast.ownMatches.length).toBe(count + (run === 0 ? 0 : 1));
      expect(canonical(fast)).toBe(canonical(daily));
    }
  });
  it('includes an earlier European fixture rather than only the next league round', () => {
    const w = world(),
      fixture = nextOwnFixture(w)!,
      opponent = w.clubs.find((c) => c.id !== w.playerClub)!;
    w.europe = [
      {
        key: 'event-cup',
        name: 'Event Cup',
        field: 2,
        format: 'groups',
        games: 1,
        stage: '리그/조별 단계',
        clubs: [w.playerClub, opponent.id],
        fixtures: [
          {
            ...fixture,
            id: 'event-midweek',
            kind: 'europe',
            home: w.playerClub,
            away: opponent.id,
          },
        ],
        standings: {
          [w.playerClub]: { ...w.tables[w.playerClub] },
          [opponent.id]: { ...w.tables[opponent.id] },
        },
      },
    ];
    const reasons = advanceToNextEvent(w);
    expect(currentDay(w)).toBe(3);
    expect(reasons.find((r) => r.kind === 'match')?.ref).toBe('event-midweek');
    expect(w.ownMatches).toHaveLength(0);
  });
  it('includes an earlier domestic cup fixture in the same match observation', () => {
    const w = world(),
      fixture = nextOwnFixture(w)!,
      opponent = w.clubs.find((c) => c.id !== w.playerClub)!;
    w.cups = [
      {
        country: 'ENG',
        name: 'Domestic Event Cup',
        clubs: [w.playerClub, opponent.id],
        rounds: [],
        fixtures: [
          { ...fixture, id: 'event-domestic', kind: 'cup', home: w.playerClub, away: opponent.id },
        ],
      },
    ];
    const reasons = advanceToNextEvent(w);
    expect(currentDay(w)).toBe(3);
    expect(reasons.find((r) => r.kind === 'match')?.ref).toBe('event-domestic');
    expect(w.ownMatches).toHaveLength(0);
  });
  it('continues through season close and ordinary reports to the following fixture eve', () => {
    const w = world();
    while (w.round < 46 && !w.critical && !w.bankrupt) advanceRound(w, undefined, false);
    expect(w.round).toBe(46);
    const year = w.year,
      count = w.ownMatches.length;
    advanceToNextEvent(w);
    expect(w.year).toBe(year + 1);
    expect(daysUntilNextMatch(w)).toBe(1);
    expect(w.ownMatches.length).toBeGreaterThanOrEqual(count);
    expect(w.ownMatches.filter((m) => m.year === w.year)).toHaveLength(0);
    expect(w.history.at(-1)?.year).toBe(year);
  });
  it('uses the same daily calendar across leap day', () => {
    const w = world();
    const year = 1963,
      shift = year - w.year;
    w.year = year;
    // Fresh synthetic founding epoch; no played career is being moved.
    delete w.people;
    w.currency = currency('ENG', year).code;
    w.priceIndex = priceIndex('ENG', year).value;
    w.manager.since = year;
    w.manager.until = year + 3;
    if (w.manager.born !== undefined) w.manager.born += shift;
    for (const p of w.players) {
      p.born += shift;
      if (p.joined !== undefined) p.joined += shift;
      p.until += shift;
    }
    for (const member of w.staff || []) {
      member.since += shift;
      member.until += shift;
    }
    prepareSeason(w);
    const leap = seasonDayOf(year, 2, 29);
    advanceDays(w, leap - 1, undefined, false);
    const daily = structuredClone(w);
    advanceToNextEvent(w);
    do {
      advanceDays(daily, 1, undefined, false);
    } while (!stoppingReasons(daily).length && !daily.critical && !daily.bankrupt);
    expect(currentDay(w)).toBeGreaterThanOrEqual(leap);
    expect(canonical(w)).toBe(canonical(daily));
  });
  it('exposes settled days only internally and exits immediately on a mandatory interruption', () => {
    const w = world(),
      run = nextEventDays(w);
    expect(run.next().done).toBe(false);
    expect(currentDay(w)).toBe(1);
    w.critical = 'settlement failure';
    expect(run.next().done).toBe(true);
    expect(currentDay(w)).toBe(1);
  });
});
