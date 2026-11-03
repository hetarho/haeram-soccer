import { describe, expect, it } from 'vitest';
import {
  financialBreakdown,
  isIncomeKind,
  operatingCosts,
  roundShare,
  scaleOperatingExpenses,
} from './finance';
import { settleRound } from './settlement';
import { ownerClose } from './owner';
import { OWNER_TRAITS, TAKEOVER_DEBT } from './owner-config';
import { SEASON_END_DAY, SEASON_ROUNDS } from './calendar';
import { scaleBy } from './primitives';
import { withOwner } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

/**
 * A club taken over with plenty of cash: `owned` gives it the test owner, otherwise it holds no
 * owner state, as a hand-built world does.
 */
const world = (owned = true) => {
  const w = careerWorld({ seed: 'owner-finance' }, DISABLED_RELEASE);
  if (owned) withOwner(w);
  else delete w.owner;
  w.cash = '100000000000';
  return w;
};
const LOAN = { balance: '1000000', installment: '230975', seasonsLeft: 2 };

describe('the takeover loan (→ECON-38)', () => {
  it('is a fixed cost of the league rounds, counted in the annual costs and the next round', () => {
    const plain = world(),
      w = world();
    w.loan = { ...LOAN };
    const without = operatingCosts(plain, 1),
      costs = operatingCosts(w, 1);
    expect(costs.loan).toBe(LOAN.installment);
    expect(BigInt(costs.annual) - BigInt(without.annual)).toBe(BigInt(LOAN.installment));
    expect(costs.payments.loan).toBe(roundShare(LOAN.installment, 1));
    expect(BigInt(costs.nextRound) - BigInt(without.nextRound)).toBe(
      BigInt(roundShare(LOAN.installment, 1)),
    );
    expect(without.loan).toBe('0');
    expect(without.payments).not.toHaveProperty('loan');
  });
  it('is repaid on its own ledger line over the season, and the close carries the balance', () => {
    const w = world();
    w.loan = { ...LOAN };
    for (let round = 1; round <= SEASON_ROUNDS; round++) {
      w.round = round;
      const cost = operatingCosts(w, round);
      settleRound(w);
      const paid = w.events.findLast((e) => e.kind === 'operating-cost')!;
      expect(paid.amount).toBe(
        (
          BigInt(cost.nextRound) -
          BigInt(cost.payments.expenses) -
          BigInt(cost.payments.loan!)
        ).toString(),
      );
    }
    const line = financialBreakdown(w).expense.find((row) => row.key === 'loan-repayment')!;
    expect(line).toEqual({ key: 'loan-repayment', label: '인수 부채 상환', amount: '230975' });
    expect(w.events.filter((e) => e.kind === 'loan-repayment')).toHaveLength(1);
    expect(financialBreakdown(w).expense.some((row) => row.key === 'older-ledger')).toBe(false);
    w.calendar = { day: SEASON_END_DAY + 1 };
    ownerClose(w);
    expect(w.loan).toEqual({
      balance: (
        BigInt(scaleBy(LOAN.balance, 1 + TAKEOVER_DEBT.rate, 10000n)) - BigInt(LOAN.installment)
      ).toString(),
      installment: LOAN.installment,
      seasonsLeft: 1,
    });
    // The last season's installments end the loan.
    ownerClose(w);
    expect(w.loan).toBeUndefined();
    expect(operatingCosts(w).loan).toBe('0');
  });
});

describe('정치력 (→OWNER-5, ECON-30)', () => {
  it('pays 90% of operating expenses and says so on their ledger line', () => {
    const plain = world(),
      w = world();
    w.owner!.traits = ['politician'];
    const base = operatingCosts(plain),
      costs = operatingCosts(w);
    expect(base.politicianFactor).toBe(1);
    expect(costs.politicianFactor).toBe(OWNER_TRAITS.politician.operating);
    expect(costs.expenses).toBe(
      scaleOperatingExpenses(base.expenses, OWNER_TRAITS.politician.operating),
    );
    expect(BigInt(costs.annual)).toBeLessThan(BigInt(base.annual));
    w.round = 1;
    settleRound(w);
    expect(w.events.find((e) => e.kind === 'operating-expenses')!.detail).toContain('정치력 ×0.9');
    // Without an owner nothing changes.
    expect(operatingCosts(world(false)).politicianFactor).toBe(1);
  });
});

describe('owner money in the ledger (→ECON-10)', () => {
  it('names injections as income and dividends and repayments as expenses', () => {
    expect(isIncomeKind('owner-injection')).toBe(true);
    expect(isIncomeKind('owner-dividend')).toBe(false);
    expect(isIncomeKind('loan-repayment')).toBe(false);
    const expense = financialBreakdown(world()).expense.map((row) => row.key);
    expect(expense).toEqual(expect.arrayContaining(['owner-dividend', 'loan-repayment']));
  });
});

describe('the club’s bankruptcy (→ECON-24, OWNER-16)', () => {
  it('ends a taken-over career by its cause and leaves one without owner state as it was', () => {
    for (const owned of [true, false]) {
      const w = world(owned);
      w.round = 1;
      w.cash = (-BigInt(operatingCosts(w).annual)).toString();
      settleRound(w);
      expect(w.bankrupt).toBeDefined();
      expect(w.ended).toBe(owned ? 'club' : undefined);
    }
  });
});
