import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { currency } from '../../catalogs/src/index';
import {
  createWorld,
  europeanEras,
  leaguePhasePairs,
  prepareEurope,
  prepareSeason,
  finishEurope,
  advanceEurope,
  advanceEconomy,
  snapshotScorers,
  quote,
  clubOf,
} from './index';
const world = () =>
  createWorld({
    country: 'FRA',
    name: 'Century Forge',
    seed: 'eras',
    color: '#223344',
    difficulty: 1,
  });
describe('historical evolution', () => {
  it('activates actual competition milestones and lineages', () => {
    expect(europeanEras(1954)).toEqual([]);
    expect(europeanEras(1955)[0].field).toBe(16);
    expect(europeanEras(1992)[0].name).toBe('Champions League');
    expect(europeanEras(1999).some((e) => e.key === 'cwc')).toBe(false);
    expect(europeanEras(2009).find((e) => e.key === 'uel')?.field).toBe(48);
    expect(europeanEras(2021)).toHaveLength(3);
    expect(europeanEras(2024).map((e) => [e.field, e.games])).toEqual([
      [36, 8],
      [36, 8],
      [36, 6],
    ]);
  });
  it('gives each league-phase club unique opponents and balanced home/away counts', () => {
    const ids = Array.from({ length: 36 }, (_, i) => String(i));
    for (const count of [6, 8]) {
      const pairs = leaguePhasePairs(ids, count);
      for (const id of ids) {
        const games = pairs.filter((p) => p[0] === id || p[1] === id);
        expect(games).toHaveLength(count);
        expect(new Set(games.map((p) => (p[0] === id ? p[1] : p[0]))).size).toBe(count);
        expect(games.filter((p) => p[0] === id)).toHaveLength(count / 2);
      }
    }
  });
  it('settles unique memberships, 36-team standings, playoffs and historical winners', () => {
    const w = world();
    w.year = 2024;
    w.currency = currency('FRA', 2024).code;
    prepareSeason(w);
    const ids = w.europe.flatMap((t) => t.clubs);
    expect(new Set(ids).size).toBe(ids.length);
    w.round = 46;
    w.calendar = { day: 322 };
    // This fixture skips domestic play; keep its empty scorer snapshot on the same round.
    snapshotScorers(w);
    advanceEurope(w);
    for (const t of w.europe)
      expect(Object.values(t.standings).every((row) => row.played === t.games)).toBe(true);
    finishEurope(w);
    expect(w.europe.every((t) => !!t.winner)).toBe(true);
    expect(
      w.europe
        .find((t) => t.key === 'ucl')
        ?.fixtures.filter((f) => f.id.includes('리그 페이즈 플레이오프')),
    ).toHaveLength(8);
    validateWorld(w);
  });
  it('qualifies domestic cup winners and archives owned European football', () => {
    const w = world();
    w.year = 1975;
    w.lastChampions = [
      {
        country: 'FRA',
        club: w.clubs.find((c) => c.country === 'FRA' && c.tier === 0)!.id,
        cup: w.playerClub,
      },
    ];
    prepareEurope(w);
    const t = w.europe.find((t) => t.key === 'cwc')!;
    expect(t.clubs).toContain(w.playerClub);
    finishEurope(w);
    expect(w.ownMatches.some((m) => m.kind === 'europe')).toBe(true);
    expect(clubOf(w).reputation).toBeGreaterThanOrEqual(12);
  });
  it('converts balances and fixed contracts once and preserves original historical units', () => {
    const w = world();
    w.year = 1998;
    w.currency = 'FRF';
    w.cash = '655957';
    w.players[0].wage = '655957';
    w.events.push({
      year: 1998,
      round: 0,
      kind: 'old',
      title: 'Old ledger',
      detail: '',
      amount: '655957',
      currency: 'FRF',
    });
    w.year = 1999;
    advanceEconomy(w, 1998);
    expect(w.cash).toBe('100000');
    expect(w.players[0].wage).toBe('100000');
    const after = canonical(w);
    advanceEconomy(w, 1998);
    expect(canonical(w)).toBe(after);
    expect(w.events.at(-2)?.currency).toBe('FRF');
    const cash = w.cash;
    w.year = 2000;
    advanceEconomy(w, 1999);
    expect(w.cash).toBe(cash);
    expect(quote('FRA', 2000, 100)).not.toBe(quote('FRA', 1901, 100));
  });
});
