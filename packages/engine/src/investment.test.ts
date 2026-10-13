import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  advanceDays,
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
import { professionalStart } from './testing';

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
  it('starts a work at its real cost; seats and upkeep change when it opens (→ECON-32)', () => {
    const w = world(),
      before = canonical(w),
      costs = operatingCosts(w),
      preview = facilityInvestmentPreview(w, 'stadium');
    expect(canonical(w)).toBe(before);
    expect(preview).toMatchObject({
      eligible: true,
      affordable: true,
      capacityBefore: 2500,
      capacityDuring: 2250,
      capacityAfter: 5000,
      annualBefore: costs.annual,
    });
    expect(preview.next).toMatchObject({ to: 1, kind: 'expansion', capacity: 5000, days: 180 });
    operate(w, { type: 'facility', part: 'stadium' });
    expect(w.cash).toBe(preview.cashAfter);
    expect(w.expense).toBe(preview.cost);
    // A stand is being added: the ground holds 10% fewer and upkeep waits for the opening.
    expect(w.stadium).toBe(0);
    expect(gateProjection(w).capacity).toBe(2250);
    expect(operatingCosts(w).maintenance).toBe(costs.maintenance);
    expect(() => operate(w, { type: 'facility', part: 'stadium' })).toThrow('진행 중');
    expect(facilityInvestmentPreview(w, 'stadium').eligible).toBe(false);
    advanceDays(w, 180, undefined, false);
    expect(w.stadium).toBe(1);
    expect(w.facilityWorks).toBeUndefined();
    expect(gateProjection(w).capacity).toBe(5000);
    expect(operatingCosts(w).maintenance).toBe(preview.maintenanceAfter);
    expect(BigInt(preview.maintenanceAfter) - BigInt(costs.maintenance)).toBe(
      BigInt(preview.maintenanceIncrease),
    );
    expect(w.events.some((event) => event.kind === 'facility-open')).toBe(true);
  });

  it('shows the true cash shortfall and cannot make an unaffordable investment', () => {
    const w = world(),
      cost = facilityInvestmentPreview(w, 'training').cost;
    w.cash = (BigInt(cost) - 1n).toString();
    const before = canonical(w),
      preview = facilityInvestmentPreview(w, 'training');
    expect(preview.cashAfter).toBe('-1');
    expect(preview.affordable).toBe(false);
    expect(preview.eligible).toBe(true);
    expect(preview.runwayRounds).toBe(0);
    expect(preview.reason).toContain('부족');
    expect(() => operate(w, { type: 'facility', part: 'training' })).toThrow('부족');
    expect(canonical(w)).toBe(before);
  });

  it("has no imaginary step, bill or spend beyond a part's top", () => {
    const w = world();
    w.stadium = 8;
    const before = canonical(w),
      preview = facilityInvestmentPreview(w, 'stadium');
    expect(preview.eligible).toBe(false);
    expect(preview.next).toBeUndefined();
    expect(preview.cost).toBe('0');
    expect(preview.cashAfter).toBe(w.cash);
    expect(preview.capacityAfter).toBe(90000);
    expect(preview.annualAfter).toBe(preview.annualBefore);
    expect(preview.maintenanceIncrease).toBe('0');
    expect(preview.reason).toContain('최고');
    expect(() => operate(w, { type: 'facility', part: 'stadium' })).toThrow('최고');
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
    const preview = facilityInvestmentPreview(w, 'stadium');
    operate(w, { type: 'facility', part: 'stadium' });
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
    const w = professionalStart(world()),
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
