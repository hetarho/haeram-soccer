import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import {
  advanceRound,
  financialBreakdown,
  leagueShare,
  operatingCost,
  operatingCosts,
  POLICY_DEFAULTS,
  policyOf,
  ratio,
  roundShare,
  scaleOperatingExpenses,
} from './index';
import { professionalStart } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { world } from './finance.testkit';

/**
 * A professional start after its 46 league rounds, played unobserved, with the round and the
 * season's operating-expenses entry after each one.
 */
function playedProfessional() {
  return cachedWorld('professional-season', () => {
    const w = professionalStart(world());
    const rounds: { round: number; expenses: string | undefined }[] = [];
    for (let round = 1; round <= 46; round++) {
      advanceRound(w, undefined, false);
      const entry = w.events.find((e) => e.year === w.year && e.kind === 'operating-expenses');
      rounds.push({ round: w.round, expenses: entry?.amount });
    }
    while (w.round < 46) advanceRound(w, undefined, false);
    return { w, rounds };
  });
}

describe('the league distribution', () => {
  it('pays the division’s equal share in league-round installments that sum to the season’s share', () => {
    const share = leagueShare(professionalStart(world()));
    expect(BigInt(share)).toBeGreaterThan(0n);
    const { w } = playedProfessional();
    // One ledger entry a season, grown by every round's installment.
    const entries = w.events.filter((e) => e.year === w.year && e.kind === 'league-share');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(share);
    expect(financialBreakdown(w).income.find((row) => row.key === 'league-share')).toMatchObject({
      label: '리그 분배금',
      amount: share,
    });
  });
});

describe('operating expenses (→ECON-30)', () => {
  const entries = (w: World) =>
    w.events.filter((e) => e.year === w.year && e.kind === 'operating-expenses');

  it('pays them each league round as a fixed cost on their own ledger line', () => {
    const start = professionalStart(world()),
      costs = operatingCosts(start);
    expect(BigInt(costs.annual)).toBe(
      [
        costs.playerWages,
        costs.managerWage,
        costs.maintenance,
        costs.investment,
        costs.academy,
        costs.staffWages,
        costs.expenses,
      ].reduce((sum, part) => sum + BigInt(part), 0n),
    );
    // Fixed costs and the runway read the annual total.
    expect(operatingCost(start)).toBe(costs.annual);
    expect(costs.payments.expenses).toBe(roundShare(costs.expenses, 1));
    const { w } = playedProfessional();
    // One ledger entry a season, grown by every round's installment.
    expect(entries(w)).toHaveLength(1);
    expect(entries(w)[0].amount).toBe(costs.expenses);
    expect(entries(w)[0].detail).toContain('4부 최저 수준');
    const budget = financialBreakdown(w);
    expect(budget.expense.find((row) => row.key === 'operating-expenses')).toMatchObject({
      label: '운영 경비',
      amount: costs.expenses,
    });
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
  });

  it('the default level books exactly the season amount per round', () => {
    const w = professionalStart(world()),
      season = w.operatingExpenses!,
      explicit = { ...w, policy: { ...POLICY_DEFAULTS } };
    expect(policyOf(w).support).toBe(3);
    expect(operatingCosts(explicit)).toEqual(operatingCosts(w));
    expect(operatingCosts(w)).toMatchObject({
      expenses: season,
      seasonExpenses: season,
      operatingFactor: 1,
    });
    for (const amount of ['0', '1', '45', season, '123456789012345678901'])
      expect(scaleOperatingExpenses(amount, 1)).toBe(amount);
    // The same start's 46 rounds, each as it was played.
    const played = playedProfessional();
    for (let round = 1; round <= 46; round++) {
      const after = played.rounds[round - 1];
      expect(after.round).toBe(round);
      // The installments so far are the season amount's share of the rounds played, to the unit.
      expect(after.expenses).toBe(ratio(season, BigInt(round), 46n));
    }
    expect(entries(played.w)[0].amount).toBe(season);
    expect(entries(played.w)[0].detail).not.toContain('선수단 투자');
  });
});
