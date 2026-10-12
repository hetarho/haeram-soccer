import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import {
  advanceDays,
  advanceRound,
  CASH_WARNING_ROUNDS,
  clubOf,
  createWorld,
  gateProjection,
  leagueMatchFactor,
  matchBonus,
  operate,
  operatingCosts,
  ownLeagueGames,
  quote,
  simulateSeason,
} from './index';
import { professionalStart } from './testing';

function world(country: 'ENG' | 'BEL' = 'ENG', seed = 'business') {
  return createWorld({ country, name: 'Ledger Town', color: '#335544', seed, difficulty: 2 });
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
    expect(gate.incomeHigh).toBe(
      quote(club.country, bel.year, gate.attendanceHigh * gate.perFan * (46 / 28)),
    );
    // Hosting costs follow the actual match, not the season size.
    expect(gate.costHigh).toBe(gateProjection(professionalStart(world('BEL'))).costHigh);
    // A new club's 16-club amateur league plays 30 games, each paying 46/30.
    expect(ownLeagueGames(world('ENG'))).toBe(30);
  });

  it('scales league result bonuses but never cup or European ones', () => {
    const w = professionalStart(world('BEL'));
    const fixture = w.fixtures.find((f) => f.home === w.playerClub)!;
    const won = { ...fixture, score: { home: 2, away: 0 } } as unknown as Parameters<
      typeof matchBonus
    >[1];
    const prestige = 1 + Math.max(0, 3 - clubOf(w).tier) * 0.35;
    expect(matchBonus(w, won).amount).toBe(
      quote(clubOf(w).country, w.year, 8 * prestige * (46 / 28)),
    );
    expect(matchBonus(w, { ...won, kind: 'cup' }).amount).toBe(
      quote(clubOf(w).country, w.year, 8 * prestige),
    );
  });
});

describe('business delegation and cash warnings', () => {
  it('lets the commercial staff fill an empty sponsor slot with the stable offer', () => {
    const owner = world();
    advanceDays(owner, 1);
    expect(owner.sponsor).toBeUndefined();
    const delegated = world();
    delegated.delegation = { ...delegated.delegation, business: true };
    advanceDays(delegated, 1);
    expect(delegated.sponsor).toMatchObject({ kind: 'stable', until: delegated.year + 2 });
    expect(finance(delegated)).toEqual([expect.objectContaining({ attention: false })]);
    advanceDays(delegated, 1);
    expect(delegated.events.filter((e) => e.kind === 'sponsor-sign')).toHaveLength(1);
    // The engine still signs the single sponsor of rules 1.15, which a load moves into its slot.
    validateWorld(delegated, LOAD_CATALOG);
  });

  it('runs a sponsor a load moved into its slot exactly as the one it signed, never signing twice', () => {
    const w = world();
    w.delegation = { ...w.delegation, business: true };
    advanceDays(w, 1);
    const loaded = validateWorld(structuredClone(w), LOAD_CATALOG);
    expect(loaded.sponsor).toBeUndefined();
    expect(() => operate(loaded, { type: 'sponsor', kind: 'stable' })).toThrow(
      '기존 주 후원 계약이 남아 있습니다.',
    );
    // It pays through two seasons, ends at the close and the staff sign again, as if never loaded.
    for (const career of [w, loaded]) {
      simulateSeason(career);
      simulateSeason(career);
    }
    expect(loaded.events.filter((e) => e.kind === 'sponsor-payment').length).toBeGreaterThan(0);
    expect(loaded.events.filter((e) => e.kind === 'sponsor-end')).toHaveLength(1);
    expect(loaded.sponsors).toBeUndefined();
    expect(canonical(validateWorld(loaded, LOAD_CATALOG))).toBe(
      canonical(validateWorld(w, LOAD_CATALOG)),
    );
  });

  it('reminds an owner without a sponsor when a season starts, but not a delegating one', () => {
    const owner = world();
    simulateSeason(owner);
    expect(finance(owner).filter((item) => item.year === owner.year)).toEqual([
      expect.objectContaining({ title: '후원 계약이 비어 있어요', attention: true }),
    ]);
    const delegated = world();
    delegated.delegation = { ...delegated.delegation, business: true };
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
