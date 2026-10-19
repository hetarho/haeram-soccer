import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import {
  advanceDays,
  advanceRound,
  broadcastQuote,
  CASH_WARNING_ROUNDS,
  clubOf,
  createWorld,
  FINANCE_CONFIG,
  financialBreakdown,
  footballQuote,
  gateProjection,
  isLeagueMatch,
  leagueMatchFactor,
  matchBonus,
  operate,
  operatingCosts,
  ownLeagueGames,
  simulateSeason,
} from './index';
import { legacySettings } from './responsibilities';
import { professionalStart } from './testing';

function world(country: 'ENG' | 'BEL' = 'ENG', seed = 'business') {
  const w = createWorld({
    country,
    name: 'Ledger Town',
    color: '#335544',
    seed,
    level: 'easy' as const,
  });
  w.settings = legacySettings(2);
  return w;
}
const finance = (w: World) => (w.inbox || []).filter((item) => item.kind === 'finance');

describe('league income sized for a 46-game season', () => {
  it('keeps the 46-game English pyramid unchanged and scales shorter leagues per match', () => {
    const eng = professionalStart(world('ENG'));
    expect(ownLeagueGames(eng)).toBe(46);
    expect(leagueMatchFactor(eng)).toBe(1);
    const bel = professionalStart(world('BEL'));
    expect(ownLeagueGames(bel)).toBe(28);
    expect(leagueMatchFactor(bel)).toBeCloseTo(46 / 28, 10);
    const gate = gateProjection(bel);
    expect(gate.leagueFactor).toBe(leagueMatchFactor(bel));
    const club = clubOf(bel);
    // Tickets are priced on the football index (→ECON-26), hosting costs on prices.
    expect(gate.incomeHigh).toBe(
      footballQuote(club.country, bel.year, gate.attendanceHigh * gate.perFan * (46 / 28)),
    );
    // Hosting costs follow the actual match, not the season size.
    expect(gate.costHigh).toBe(gateProjection(professionalStart(world('BEL'))).costHigh);
    // A new club's 16-club amateur league plays 30 games, each paying 46/30.
    expect(ownLeagueGames(world('ENG'))).toBe(30);
  });

  it('pays no league result bonus and an unscaled cup one on the broadcasting index', () => {
    const w = professionalStart(world('BEL'));
    const fixture = w.fixtures.find((f) => f.home === w.playerClub)!;
    const won = { ...fixture, score: { home: 2, away: 0 } } as unknown as Parameters<
      typeof matchBonus
    >[1];
    const prestige = 1 + Math.max(0, 3 - clubOf(w).tier) * 0.35;
    expect(matchBonus(w, won).amount).toBe('0');
    expect(matchBonus(w, { ...won, kind: 'cup' }).amount).toBe(
      broadcastQuote(clubOf(w).country, w.year, FINANCE_CONFIG.winBonus * prestige),
    );
  });
});

describe('no income from the following alone', () => {
  it('books no fan income and no league result bonus, and names every season line', () => {
    const w = world();
    clubOf(w).fans = 2_000_000;
    while (w.round < 46) advanceRound(w, undefined, false);
    const season = w.events.filter((e) => e.year === w.year);
    expect(season.some((e) => e.kind === 'fan-income')).toBe(false);
    expect(season.some((e) => e.kind === 'league-share')).toBe(true);
    // Result bonuses are left only for cup and continental matches.
    const kindOf = new Map(w.ownMatches.map((m) => [m.id, m.kind]));
    expect(w.ownMatches.some((m) => isLeagueMatch(m.kind))).toBe(true);
    for (const bonus of season.filter((e) => e.kind === 'match-bonus'))
      expect(isLeagueMatch(kindOf.get(bonus.detail.split(' · ')[0])!)).toBe(false);
    const books = financialBreakdown(w);
    expect(books.income.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(books.income.some((row) => row.key === 'fan-income')).toBe(false);
  });
});

describe('business delegation and cash warnings', () => {
  it('lets the commercial staff fill every empty open sponsor slot with its stable offer', () => {
    const owner = world();
    advanceDays(owner, 1);
    expect(owner.sponsors).toBeUndefined();
    const delegated = world();
    delegated.intervention = 4;
    delegated.settings = legacySettings(4);
    advanceDays(delegated, 1);
    // A 1950 club in England has only the local slot open (→ECON-8).
    expect(delegated.sponsors).toEqual([
      expect.objectContaining({ slot: 'local', kind: 'stable', until: delegated.year + 3 }),
    ]);
    expect(finance(delegated)).toEqual([expect.objectContaining({ attention: false })]);
    advanceDays(delegated, 1);
    expect(delegated.events.filter((e) => e.kind === 'sponsor-sign')).toHaveLength(1);
    expect(() => operate(delegated, { type: 'sign-sponsor', slot: 'local', offer: 0 })).toThrow(
      '남아',
    );
    // Signed contracts are what a load keeps.
    expect(canonical(validateWorld(structuredClone(delegated), LOAD_CATALOG))).toBe(
      canonical(delegated),
    );
  });

  it('signs again once a contract has run its term, valued anew', () => {
    const w = world();
    w.intervention = 4;
    w.settings = legacySettings(4);
    advanceDays(w, 1);
    const first = w.sponsors![0];
    for (let season = 0; season < 3; season++) simulateSeason(w);
    expect(w.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
    expect(w.sponsors).toEqual([
      expect.objectContaining({ slot: 'local', from: w.year, until: w.year + 3 }),
    ]);
    expect(w.sponsors![0].annual).not.toBe(first.annual);
  });

  it('reminds an owner of empty open slots when a season starts, but not a delegating one', () => {
    const owner = world();
    simulateSeason(owner);
    // Other season-start notices (a promotion clause's wage change) never ask for attention.
    const reminders = finance(owner).filter((item) => item.year === owner.year && item.attention);
    expect(reminders).toEqual([expect.objectContaining({ title: '후원 계약이 비어 있어요' })]);
    expect(reminders[0]!.detail).toMatch(/^지역 후원 자리가 비어 있어요/);
    const delegated = world();
    delegated.intervention = 4;
    delegated.settings = legacySettings(4);
    simulateSeason(delegated);
    expect(finance(delegated).every((item) => !item.attention)).toBe(true);
  });

  it('warns once a season, as a status that never stops the clock, when cash covers under 13 rounds', () => {
    const w = world();
    const perRound = BigInt(operatingCosts(w).annual) / 46n;
    w.cash = (perRound * BigInt(CASH_WARNING_ROUNDS - 4)).toString();
    advanceRound(w, undefined, false);
    const [warning] = finance(w);
    expect(warning).toMatchObject({ attention: false });
    expect(warning.title).toMatch(/^운영자금이 약 \d+주분 남았어요$/);
    advanceRound(w, undefined, false);
    expect(finance(w)).toHaveLength(1);
    // A healthy club is never warned.
    const rich = world();
    rich.cash = (perRound * 1000n).toString();
    advanceRound(rich, undefined, false);
    expect(finance(rich)).toHaveLength(0);
  });
});
