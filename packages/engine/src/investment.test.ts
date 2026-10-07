import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  advanceRound,
  createWorld,
  facilityInvestmentPreview,
  fixedCostRunway,
  gateProjection,
  operate,
  operatingCosts,
  recordMatch,
  simulateMatch,
  ticketInvestmentPreview,
} from './index';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Investment United',
    color: '#224433',
    seed: 'investment-plans',
    difficulty: 2,
  });
  w.cash = '999999999999';
  return w;
}

describe('shared club investment forecasts', () => {
  it('matches a real facility debit, capacity, maintenance and the next settled fixed-cost bill', () => {
    const w = world(),
      before = canonical(w),
      costs = operatingCosts(w),
      preview = facilityInvestmentPreview(w);
    expect(canonical(w)).toBe(before);
    expect(preview.eligible).toBe(true);
    expect(preview.affordable).toBe(true);
    expect(preview.facilitiesBefore).toBe(0);
    expect(preview.facilitiesAfter).toBe(1);
    expect(preview.capacityBefore).toBe(2500);
    expect(preview.capacityAfter).toBe(7500);
    expect(preview.annualBefore).toBe(costs.annual);
    operate(w, { type: 'facility' });
    const actual = operatingCosts(w);
    expect(w.cash).toBe(preview.cashAfter);
    expect(w.expense).toBe(preview.cost);
    expect(w.facilities).toBe(preview.facilitiesAfter);
    expect(gateProjection(w).capacity).toBe(preview.capacityAfter);
    expect(actual.maintenance).toBe(preview.maintenanceAfter);
    expect(actual.annual).toBe(preview.annualAfter);
    expect(actual.nextRound).toBe(preview.nextRoundAfter);
    expect(BigInt(actual.maintenance) - BigInt(costs.maintenance)).toBe(
      BigInt(preview.maintenanceIncrease),
    );
    advanceRound(w, undefined, false);
    expect(w.events.find((event) => event.kind === 'operating-cost')?.amount).toBe(
      preview.nextRoundAfter,
    );
  });

  it('shows the true cash shortfall and cannot make an unaffordable investment', () => {
    const w = world(),
      cost = facilityInvestmentPreview(w).cost;
    w.cash = (BigInt(cost) - 1n).toString();
    const before = canonical(w),
      preview = facilityInvestmentPreview(w);
    expect(preview.cashAfter).toBe('-1');
    expect(preview.affordable).toBe(false);
    expect(preview.eligible).toBe(true);
    expect(preview.runwayRounds).toBe(0);
    expect(preview.reason).toContain('부족');
    expect(() => operate(w, { type: 'facility' })).toThrow('부족');
    expect(canonical(w)).toBe(before);
  });

  it('has no imaginary level, bill or spend beyond the maximum facility level', () => {
    const w = world();
    w.facilities = 30;
    const before = canonical(w),
      preview = facilityInvestmentPreview(w);
    expect(preview.eligible).toBe(false);
    expect(preview.cost).toBe('0');
    expect(preview.cashAfter).toBe(w.cash);
    expect(preview.facilitiesAfter).toBe(30);
    expect(preview.capacityAfter).toBe(preview.capacityBefore);
    expect(preview.annualAfter).toBe(preview.annualBefore);
    expect(preview.maintenanceIncrease).toBe('0');
    expect(preview.reason).toContain('30');
    expect(() => operate(w, { type: 'facility' })).toThrow('한도');
    expect(canonical(w)).toBe(before);
  });

  it('keeps runway exact and bounded for debt, missing costs and balances above float precision', () => {
    expect(fixedCostRunway('-100', '100')).toBe(0);
    expect(fixedCostRunway('0', '100')).toBe(0);
    expect(fixedCostRunway('100', '0')).toBe(0);
    expect(fixedCostRunway('100', '-1')).toBe(0);
    expect(fixedCostRunway('1000', '1000')).toBe(46);
    expect(fixedCostRunway('3000', '1000')).toBe(138);
    expect(fixedCostRunway('2999', '1000')).toBe(137);
    expect(fixedCostRunway('10000000000000000000000000000000000000', '1')).toBe(999);
    const w = world();
    w.cash = '90071992547409931';
    const preview = facilityInvestmentPreview(w);
    operate(w, { type: 'facility' });
    expect(w.cash).toBe(preview.cashAfter);
    expect(preview.runwayRounds).toBe(999);
  });

  it.each([0.01, 0.05, 0.12, 0.5])(
    'uses the same real applied gate and hosting-cost range for a %s ticket draft',
    (price) => {
      const w = world(),
        before = canonical(w),
        preview = ticketInvestmentPreview(w, price);
      expect(canonical(w)).toBe(before);
      expect(preview.before).toEqual(gateProjection(w));
      const applied = structuredClone(w);
      operate(applied, { type: 'ticket', price });
      expect(gateProjection(applied)).toEqual(preview.after);
      const fixture = applied.fixtures.find((match) => match.home === applied.playerClub)!,
        match = simulateMatch(applied, fixture, false, true);
      recordMatch(applied, match);
      const income = applied.events.find((event) => event.kind === 'gate')!,
        cost = applied.events.find((event) => event.kind === 'match-cost')!,
        net = BigInt(income.amount!) - BigInt(cost.amount!);
      expect(net).toBeGreaterThanOrEqual(BigInt(preview.netLow));
      expect(net).toBeLessThanOrEqual(BigInt(preview.netHigh));
      expect(BigInt(preview.after.incomeLow) - BigInt(preview.after.costLow)).toBe(
        BigInt(preview.netLow),
      );
      expect(BigInt(preview.after.incomeHigh) - BigInt(preview.after.costHigh)).toBe(
        BigInt(preview.netHigh),
      );
    },
  );

  it('reveals lower demand and possible gate losses without applying a draft', () => {
    const w = world(),
      before = canonical(w),
      cheap = ticketInvestmentPreview(w, 0.01),
      expensive = ticketInvestmentPreview(w, 0.5);
    expect(expensive.after.attendanceHigh).toBeLessThan(cheap.after.attendanceLow);
    expect(BigInt(expensive.netHigh)).toBeLessThan(0n);
    expect(ticketInvestmentPreview(w, 0.5)).toEqual(expensive);
    expect(canonical(w)).toBe(before);
    for (const price of [0, -1, 0.5001, Infinity, NaN])
      expect(() => ticketInvestmentPreview(w, price)).toThrow('티켓');
    expect(canonical(w)).toBe(before);
  });
});
