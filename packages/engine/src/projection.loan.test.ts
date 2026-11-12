import { describe, expect, it } from 'vitest';
import type { Player, World } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
import { financeProjection, type ProjectionLine } from './projection';
import { operatingCosts, moneyLabel } from './finance';
import { roundShare } from './finance-read';
import { signingVerdict } from './signings';
import { SEASON_ROUNDS } from './calendar';

/** Synthetic read inputs only: two clubs and one fixture, with no generation or progression. */
function world(round: number, seasonsLeft?: number, installment = '230975'): World {
  return {
    seed: 'synthetic-loan-projection',
    year: 1950,
    round,
    playerClub: 'a-synthetic',
    clubs: [
      { id: 'a-synthetic', country: 'ENG', tier: 3, group: 0, reputation: 40, fans: 1000 },
      { id: 'b-synthetic', country: 'ENG', tier: 3, group: 0, reputation: 40, fans: 1000 },
    ],
    currency: 'GBP-LSD',
    cash: '100000000',
    income: '1000000',
    expense: '0',
    operatingExpenses: '4603',
    manager: { wage: '4601' },
    players: [{ id: 'synthetic-player', status: 'active', wage: '4607' }],
    staff: [],
    fixtures: [
      {
        id: 'synthetic-fixture',
        year: 1950,
        kind: 'league',
        home: 'a-synthetic',
        away: 'b-synthetic',
      },
    ],
    tables: {},
    ownMatches: [],
    history: [],
    events: [],
    sponsors: [],
    campaigns: [],
    ticket: 0.03,
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    ...(seasonsLeft === undefined
      ? {}
      : { loan: { balance: '1000000', installment, seasonsLeft } }),
  } as unknown as World;
}
const remainingPayments = (installment: string, played: number) => {
  let amount = 0n;
  for (let round = played + 1; round <= SEASON_ROUNDS; round++)
    amount += BigInt(roundShare(installment, round));
  return amount;
};
const loanLine = (lines: ProjectionLine[]) => lines.find((line) => line.key === 'loan');
const operatingLine = (lines: ProjectionLine[]) => lines.find((line) => line.key === 'operating')!;
const sum = (lines: ProjectionLine[], bound: 'low' | 'high') =>
  lines.reduce((total, line) => total + BigInt(line[bound]), 0n);

describe('takeover loan cash projections', () => {
  it.each([0, 10, SEASON_ROUNDS])('keeps no-loan cash and rows unchanged at round %i', (round) => {
    const w = world(round);
    const before = structuredClone(w);
    const projection = financeProjection(w);
    expect(loanLine(projection.seasonLines)).toBeUndefined();
    expect(loanLine(projection.lines)).toBeUndefined();
    expect(w).toEqual(before);
  });

  it.each(
    [0, 10, SEASON_ROUNDS].flatMap((round) =>
      [0, 1, 2].flatMap((seasonsLeft) =>
        ['1', '47', '230975'].map((installment) => ({ round, seasonsLeft, installment })),
      ),
    ),
  )(
    'counts exact round payments at $round, term $seasonsLeft and installment $installment',
    ({ round, seasonsLeft, installment }) => {
      const w = world(round, seasonsLeft, installment);
      const before = structuredClone(w);
      const projection = financeProjection(w);
      const without = financeProjection(world(round));
      const remaining = seasonsLeft > 0 ? remainingPayments(installment, round) : 0n;
      const year = seasonsLeft > 1 ? BigInt(installment) : remaining;
      for (const bound of ['low', 'high'] as const) {
        expect(BigInt(without.seasonEnd[bound]) - BigInt(projection.seasonEnd[bound])).toBe(
          remaining,
        );
        expect(BigInt(without.nextYear[bound]) - BigInt(projection.nextYear[bound])).toBe(year);
        expect(BigInt(projection.seasonEnd[bound])).toBe(
          BigInt(w.cash) + sum(projection.seasonLines, bound),
        );
        expect(BigInt(projection.nextYear[bound])).toBe(
          BigInt(w.cash) + sum(projection.lines, bound),
        );
      }
      if (seasonsLeft > 0) {
        expect(loanLine(projection.seasonLines)).toEqual({
          key: 'loan',
          label: message('copy.FinancialBreakdown.ddebd211b6'),
          amount: String(-remaining),
          low: String(-remaining),
          high: String(-remaining),
        });
        expect(loanLine(projection.lines)).toEqual({
          key: 'loan',
          label: message('copy.FinancialBreakdown.ddebd211b6'),
          amount: String(-year),
          low: String(-year),
          high: String(-year),
        });
      } else {
        expect(loanLine(projection.seasonLines)).toBeUndefined();
        expect(loanLine(projection.lines)).toBeUndefined();
      }
      // Itemization must not also retain the loan inside operating costs.
      expect(operatingLine(projection.lines)).toEqual(operatingLine(without.lines));
      expect(operatingLine(projection.seasonLines)).toEqual(operatingLine(without.seasonLines));
      expect(w).toEqual(before);
    },
  );

  it('makes the plain insolvency stop refuse a signing whose unpaid loan takes the season below zero', () => {
    const w = world(10, 2);
    w.operatingExpenses = '460000000000';
    w.income = '4600000000000';
    // A plan with room for anything, so only the stop speaks.
    w.budgetPlan = { year: w.year, revenue: '999999999999999', sales: '0' };
    const plain = structuredClone(w);
    delete plain.loan;
    const floor = (BigInt(operatingCosts(w).annual) / BigInt(SEASON_ROUNDS)) * 4n;
    const netWithoutLoan = BigInt(financeProjection(plain).seasonEnd.low) - BigInt(plain.cash);
    const remaining = remainingPayments(w.loan!.installment, w.round);
    // Cash that ends the season above zero without the loan's rounds left, below zero with them.
    w.cash = (-netWithoutLoan + remaining / 2n).toString();
    plain.cash = w.cash;
    const player = { id: 'synthetic-signing', status: 'active', wage: '0' } as Player;
    const before = structuredClone(w);
    const projected = financeProjection(w).seasonEnd.low;
    // Current cash clears the stop's month of costs; the corrected future cash does not.
    expect(BigInt(w.cash)).toBeGreaterThan(floor);
    expect(BigInt(projected)).toBeLessThan(0n);
    expect(BigInt(projected) + remaining).toBeGreaterThanOrEqual(0n);
    expect(signingVerdict(plain, player, '0').ok).toBe(true);
    const verdict = signingVerdict(w, player, '0');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(
      message('delegation.stop.seasonEnd', { projected: moneyLabel(w, projected) }),
    );
    expect(w).toEqual(before);
  });
});
