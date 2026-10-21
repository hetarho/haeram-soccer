import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { currency } from '../../catalogs/src/index';
import {
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
  DOMESTIC_CUP_ROUNDS,
  legsOf,
} from './index';
import { simulatedWorld, withCandidateModel } from '../../../tests/fixtures/worlds';
import { npcCompetition } from './npc-stats';
import { KIT_ROLES } from '../../contracts/src/identity';
import { nextOwnFixture } from './calendar';
import { identityOf } from './club-identity';
import { selectMatchKits } from './kit-selection';
import { appearanceForFixture } from './match-appearance';
import { operate } from './operations';
const world = () =>
  simulatedWorld({
    country: 'FRA',
    name: 'Century Forge',
    seed: 'eras',
    color: '#223344',
    level: 'normal' as const,
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
    // Ranks 1–8 wait in the round of 16; 9–24 meet over two legs, 9th against 24th.
    const ucl = w.europe.find((t) => t.key === 'ucl')!;
    expect(ucl.rounds![0]).toMatchObject({ label: '플레이오프', legs: 2, round: 29 });
    expect(ucl.rounds![0].ties).toHaveLength(8);
    expect(ucl.rounds![0].byes).toHaveLength(8);
    expect(ucl.rounds!.map((r) => r.label)).toEqual(['플레이오프', '16강', '8강', '4강', '결승']);
    expect(ucl.rounds!.at(-1)!.legs).toBe(1);
    validateWorld(w);
  });
  it("plays two-legged ties on each era's gap and never on a domestic cup midweek", () => {
    const gaps: Record<string, Set<number>> = {};
    for (const year of [1985, 1993, 1996, 2000, 2010, 2022, 2024]) {
      const w = world();
      w.year = year;
      w.currency = currency('FRA', year).code;
      prepareSeason(w);
      finishEurope(w);
      for (const t of w.europe) {
        let last = 0;
        t.rounds!.forEach((round, index) => {
          const legs = legsOf(w, t.fixtures, t.key, index, 0);
          expect(legs).toHaveLength(round.legs);
          // Each round starts after the last one ended.
          expect(legs[0].round, `${year} ${t.key} ${round.label}`).toBeGreaterThan(last);
          last = legs.at(-1)!.round;
          for (const f of legs)
            expect((DOMESTIC_CUP_ROUNDS as readonly number[]).includes(f.round)).toBe(false);
          if (round.legs === 2) {
            const era =
              year < 2003
                ? 'before 2003'
                : t.key === 'ucl' && year < 2024 && round.label === '16강'
                  ? 'champions last 16'
                  : 'since 2003';
            (gaps[era] ||= new Set()).add(legs[1].round - legs[0].round);
          }
        });
      }
    }
    // Two weeks before 2003, then one; the Champions League's last 16 three until 2024.
    expect(gaps).toEqual({
      'before 2003': new Set([2]),
      'champions last 16': new Set([3]),
      'since 2003': new Set([1]),
    });
  });

  it('moves a round drawn after its first leg day past today, keeping the gap', () => {
    const w = world();
    w.year = 1985;
    w.currency = currency('FRA', 1985).code;
    prepareSeason(w);
    // An older save reaching its first knockout round late: the next round's planned first leg
    // (round 12) has already passed.
    w.round = 33;
    w.calendar = { day: 33 * 7 };
    snapshotScorers(w);
    advanceEurope(w);
    const ucl = w.europe.find((t) => t.key === 'ucl')!;
    const legs = legsOf(w, ucl.fixtures, 'ucl', 1, 0);
    expect(legs.map((f) => f.round)).toEqual([34, 36]);
    expect(legs.every((f) => !f.score)).toBe(true);
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
  it('records our continental ties through the shared appearance capture', () => {
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
    const first = nextOwnFixture(w)!;
    expect(first.kind).toBe('europe');
    const side = first.home === w.playerClub ? 0 : 1;
    const auto = selectMatchKits(identityOf(w, first.home), identityOf(w, first.away));
    const role = KIT_ROLES.find((r) => r !== auto.roles[side])!;
    operate(w, { type: 'match-kit', fixtureId: first.id, role });
    const expected = appearanceForFixture(w, first);
    finishEurope(w);
    const own = w.ownMatches.filter((m) => m.kind === 'europe');
    expect(own.find((m) => m.id === first.id)!.appearance).toEqual(expected);
    expect(expected.sides[side].role).toBe(role);
    for (const m of own) expect(m.appearance!.sides.map((s) => s.club)).toEqual([m.home, m.away]);
    expect('kitChoice' in w).toBe(false);
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

describe('continental play on the candidate model (→MATCH-6, MATCH-22)', () => {
  it('settles every knockout on the aggregate path under its tie rules', () => {
    const w = world();
    w.year = 1990;
    w.currency = currency('FRA', 1990).code;
    prepareSeason(w);
    withCandidateModel(w);
    w.round = 46;
    w.calendar = { day: 322 };
    snapshotScorers(w);
    advanceEurope(w);
    finishEurope(w);
    expect(w.europe.every((t) => !!t.winner)).toBe(true);
    // Two-legged ties of 1990 still count away goals; level ones go to extra time and penalties.
    const ties = w.europe.flatMap((t) => (t.rounds ?? []).flatMap((r) => r.ties));
    expect(ties.some((t) => t.decided === 'away')).toBe(true);
    expect(ties.some((t) => t.decided === 'pens')).toBe(true);
    for (const f of w.europe.flatMap((t) => t.fixtures))
      if (f.shootout) expect(f.shootout.home).not.toBe(f.shootout.away);
    for (const t of w.europe) {
      // Every fixture of the competition reached its aggregates once.
      const c = npcCompetition(w.npcSeason, { kind: 'europe', groupKey: t.key })!;
      for (const row of c.clubs)
        expect(row.matches).toBe(
          t.fixtures.filter((f) => f.home === row.club || f.away === row.club).length,
        );
      expect(c.clubs).toHaveLength(new Set(t.fixtures.flatMap((f) => [f.home, f.away])).size);
    }
  });
});
