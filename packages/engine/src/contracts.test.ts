import { describe, expect, it } from 'vitest';
import { currency, footballIndex, priceIndex } from '../../catalogs/src/index';
import type { Player, World } from '../../contracts/src/types';
import {
  activePlayers,
  clubOf,
  createWorld,
  divisionFor,
  makePlayer,
  MARKET_CONFIG,
  marketValue,
  marketValueAt,
  marketWage,
  npcSquad,
  operate,
  overall,
  playerValue,
  transferOffers,
} from './index';

// The first constants (MARKET_CONFIG); T062 recalibrates them against whole careers (→ECON-29),
// so these tests hold the CLUB-25 targets, not the constants.
function world(country: 'ENG' | 'ESP' = 'ENG') {
  return createWorld({
    country,
    name: 'Market Wages',
    color: '#224433',
    seed: 'market-wages',
    difficulty: 1,
  });
}
/** A midfielder rated `ability` everywhere, aged `age` in the world's year. */
function rated(w: World, ability: number, age = 26, potential = ability): Player {
  return {
    ...structuredClone(activePlayers(w)[0]),
    role: 'MID',
    attack: ability,
    passing: ability,
    defense: ability,
    stamina: ability,
    born: w.year - age,
    potential,
  };
}
const amount = (value: string) => Number(BigInt(value));
/** Money in whole currency units, comparable across the 1971 decimalisation. */
const major = (w: World, value: string) =>
  amount(value) / currency(clubOf(w).country, w.year).units;

describe('market wages (→CLUB-25)', () => {
  it('pays a top-flight player rated 80 six to ten times one rated 60', () => {
    for (const country of ['ENG', 'ESP'] as const) {
      const w = world(country);
      const star = amount(marketWage(w, rated(w, 80), 0)),
        squad = amount(marketWage(w, rated(w, 60), 0));
      expect(star / squad).toBeGreaterThanOrEqual(6);
      expect(star / squad).toBeLessThanOrEqual(10);
    }
  });

  it('pays a second-tier squad 35–50% of a top-flight squad of the same ability', () => {
    const w = world();
    const top = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    const players = npcSquad(w.seed, w.year, top);
    const bill = (division: number) =>
      players.reduce((sum, p) => sum + amount(marketWage(w, p, division)), 0);
    const share = bill(1) / bill(0);
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.5);
    // Every division below pays less again for the same squad.
    for (let division = 1; division <= 4; division++)
      expect(bill(division)).toBeLessThanOrEqual(bill(division - 1));
  });

  it('raises the wage for one ability with the football index across eras', () => {
    const w = world();
    const wages = [1950, 1979, 1992, 2005, 2020].map((year) => {
      w.year = year;
      return { year, pounds: major(w, marketWage(w, rated(w, 70), 0)) };
    });
    for (let i = 1; i < wages.length; i++)
      expect(wages[i].pounds).toBeGreaterThan(wages[i - 1].pounds);
    const [, from, , , to] = wages;
    // Beyond prices, the wage grows exactly as the football index's real multiple.
    const real =
      to.pounds /
      from.pounds /
      (priceIndex('ENG', to.year).value / priceIndex('ENG', from.year).value);
    expect(real).toBeCloseTo(
      footballIndex('ENG', to.year).real / footballIndex('ENG', from.year).real,
      2,
    );
  });

  it('pays for promise when young and less before 21 and after 30', () => {
    const w = world();
    const wage = (p: Player) => amount(marketWage(w, p, 0));
    expect(wage(rated(w, 60, 19, 85))).toBeGreaterThan(wage(rated(w, 60, 19)));
    expect(wage(rated(w, 60, 26, 85))).toBe(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 18))).toBeLessThan(wage(rated(w, 60, 26)));
    expect(wage(rated(w, 60, 34))).toBeLessThan(wage(rated(w, 60, 26)));
  });

  it('starts generated players at their market wage', () => {
    const w = world();
    for (const p of activePlayers(w)) expect(p.wage).toBe(marketWage(w, p));
    for (const offer of transferOffers(w))
      expect(offer.player.wage).toBe(marketWage(w, offer.player));
    const top = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
    for (const p of npcSquad(w.seed, w.year, top)) expect(p.wage).toBe(marketWage(w, p, 0));
    const prospect = makePlayer('ENG', w.seed, 'academy:test', w.year, 45, 'MID', 17);
    prospect.wage = '0';
    w.academy = { players: [prospect] };
    operate(w, { type: 'promote-youth', id: prospect.id });
    const promoted = w.players.find((p) => p.id === prospect.id)!;
    expect(promoted.wage).toBe(marketWage(w, promoted));
    expect(amount(promoted.wage)).toBeGreaterThan(0);
  });
});

describe('market values (→CLUB-25)', () => {
  it('values players on the wage scale: by ability, promise, age, division and index', () => {
    const w = world();
    const value = (p: Player, division = 0) => amount(playerValue(w, p, division));
    for (const p of activePlayers(w)) expect(playerValue(w, p)).toBe(marketValue(w, p));
    const ratio = value(rated(w, 80)) / value(rated(w, 60));
    expect(ratio).toBeGreaterThanOrEqual(6);
    expect(ratio).toBeLessThanOrEqual(10);
    expect(value(rated(w, 60, 19, 85))).toBeGreaterThan(value(rated(w, 60, 24, 85)));
    expect(value(rated(w, 60, 31))).toBeLessThan(value(rated(w, 60, 27)));
    expect(value(rated(w, 60, 27), 1)).toBeLessThan(value(rated(w, 60, 27)));
    const eras = [1950, 2005].map((year) => {
      w.year = year;
      return major(w, playerValue(w, rated(w, 70), 0));
    });
    expect(eras[1]).toBeGreaterThan(eras[0]);
  });

  it('asks the value of the division a candidate’s ability suits, times the fee settings', () => {
    const w = world();
    const code = clubOf(w).country;
    const offers = transferOffers(w);
    expect(offers[0]).toMatchObject({ fee: '0', loanFee: '0', freeAgent: true });
    for (const { player, fee, loanFee } of offers.slice(1)) {
      const value = marketValueAt(code, w.year, divisionFor(code, overall(player)), player);
      expect(fee).toBe(value);
      expect(amount(loanFee)).toBeCloseTo(amount(value) * MARKET_CONFIG.loan, -1);
    }
    // A stronger player suits a higher division, so his club asks more than ours would value him.
    expect(divisionFor(code, 80)).toBeLessThan(divisionFor(code, 50));
    expect(divisionFor(code, 99)).toBe(0);
    expect(divisionFor(code, 10)).toBe(clubOf(w).tier);
    operate(w, { type: 'policy', key: 'recruitment', level: 5 });
    for (const { player, fee } of transferOffers(w).slice(1)) {
      const value = marketValueAt(code, w.year, divisionFor(code, overall(player)), player);
      expect(amount(fee)).toBeCloseTo(amount(value) * 1.3, -1);
    }
  });
});
