import { describe, expect, it } from 'vitest';
import type { Unavailable } from '../../contracts/src/types';
import { daysInSeason } from './calendar';
import { closeDisciplineSeason, isUnavailable, recordNpcInjury } from './discipline';
import { retainStaffPerson } from './person-careers';
import { worldMarketFixture } from './world-market.testkit';

/** Current unavailable state only: three explicit clubs, no world/season generation. */
function fixture(year = 1960, day = 0) {
  const w = worldMarketFixture();
  w.year = year;
  w.calendar = { day };
  w.squads = { foreign: [] };
  w.clubs[2]!.representative = true;
  w.discipline = { year: year - 1, yellows: {}, bans: [], out: [] };
  return w;
}
const injury = (player: string, year: number, day: number, club = 'foreign'): Unavailable => ({
  player,
  club,
  until: { year, day },
});
const league = { kind: 'league' as const, groupKey: 'fixture' };

describe('unavailable-state expiry at the existing season boundary', () => {
  it.each([1958, 1959])('uses the exact recovery day across the %i season', (year) => {
    const w = fixture(year + 1);
    const span = daysInSeason(year);
    expect(span).toBe(year === 1959 ? 366 : 365);
    const expired = injury('expired', year, span - 1);
    const recovered = injury('recovered-today', year, span);
    const future = injury('tomorrow', year, span + 1);
    w.discipline!.out = [expired, recovered, future];
    expect(isUnavailable(w, expired.player, 'foreign', league)).toBe(false);
    expect(isUnavailable(w, recovered.player, 'foreign', league)).toBe(false);
    expect(isUnavailable(w, future.player, 'foreign', league)).toBe(true);
    closeDisciplineSeason(w);
    expect(w.discipline!.out).toEqual([future]);
    expect(w.discipline!.out[0]).toBe(future);
  });

  it('uses the live day for same-year recovery and retains a long cross-year injury', () => {
    const w = fixture(1960, 10);
    const future = injury('tomorrow', 1960, 11);
    const long = injury('long-recovery', 1959, daysInSeason(1959) + 100);
    w.discipline!.out = [injury('past', 1960, 9), injury('today', 1960, 10), future, long];
    closeDisciplineSeason(w);
    expect(w.discipline!.out).toEqual([future, long]);
  });

  it('retains every future own/persisted injury including missing and retired people', () => {
    const w = fixture();
    const retired = retainStaffPerson(w, {
      id: 'retired-person',
      name: 'Retired Fixture',
      role: 'assistant',
      since: 1950,
      born: 1910,
    });
    expect(retired.playing).toBe('retired');
    const missing = injury('missing-person', 1960, 20);
    const retiredInjury = injury(retired.id, 1960, 30);
    const own = injury(w.players[0]!.id, 1960, 40, w.playerClub);
    const representative = injury('generated-player', 1960, 50, 'representative');
    expect(w.people?.[missing.player]).toBeUndefined();
    w.discipline!.out = [missing, retiredInjury, own, representative];
    const people = structuredClone(w.people);
    closeDisciplineSeason(w);
    expect(w.discipline!.out).toEqual([missing, retiredInjury, own]);
    expect(w.people).toEqual(people);
  });

  it('preserves all bans and every non-discipline fact while resetting only yellows', () => {
    const w = fixture();
    w.discipline!.bans = [
      { player: 'banned', club: 'foreign', matches: 3, scope: 'domestic', reason: 'serious' },
    ];
    w.discipline!.yellows = { booked: { league: 4, 'cup:fixture': 2 } };
    w.events = [
      {
        year: 1959,
        round: 46,
        kind: 'injury',
        title: 'Recorded injury',
        detail: 'Original incident retained',
      },
    ];
    w.playerRecords = {
      historical: {
        moves: [{ year: 1958, day: 1, from: 'own', to: 'foreign', fee: '123' }],
        lines: [{ year: 1959, club: 'foreign', appearances: 10, goals: 1, assists: 2 }],
      },
    };
    w.discipline!.out = [injury('recovered', 1950, 1), injury('active', 1960, 1)];
    const bans = w.discipline!.bans;
    const before = structuredClone(w);
    closeDisciplineSeason(w);
    expect({ ...w, discipline: before.discipline }).toEqual(before);
    expect(w.discipline!.bans).toBe(bans);
    expect(w.discipline!.bans).toEqual(before.discipline!.bans);
    expect(w.discipline!.yellows).toEqual({});
    expect(w.discipline!.year).toBe(w.year);
  });

  it('refreshes a primed availability index and observes injuries appended after close', () => {
    const w = fixture(1959);
    const expired = injury('recovered', 1959, 2);
    const future = injury('future', 1959, daysInSeason(1959) + 3);
    w.discipline!.out = [expired, future];
    expect(isUnavailable(w, expired.player, 'foreign', league)).toBe(true);
    w.year++;
    closeDisciplineSeason(w);
    expect(isUnavailable(w, expired.player, 'foreign', league)).toBe(false);
    expect(isUnavailable(w, future.player, 'foreign', league)).toBe(true);
    recordNpcInjury(w, 'new-injury', 'foreign', 7);
    expect(isUnavailable(w, 'new-injury', 'foreign', league)).toBe(true);
    expect(w.discipline!.out.map((o) => o.player)).toEqual(['future', 'new-injury']);
  });

  it('compacts more than the public bound of obsolete rows without discarding active data', () => {
    const w = fixture();
    const active = [injury('missing', 1960, 2), injury('still-out', 1959, 400)];
    w.discipline!.out = [
      ...Array.from({ length: 20001 }, (_, i) => injury(`old:${i}`, 1950 + (i % 10), 1)),
      ...active,
    ];
    expect(w.discipline!.out.length).toBeGreaterThan(20000);
    closeDisciplineSeason(w);
    expect(w.discipline!.out).toEqual(active);
    expect(w.discipline!.out.every((row, i) => row === active[i])).toBe(true);
  });

  it('leaves a world with no discipline state untouched', () => {
    const w = fixture();
    delete w.discipline;
    const before = structuredClone(w);
    closeDisciplineSeason(w);
    expect(w).toEqual(before);
  });
});
