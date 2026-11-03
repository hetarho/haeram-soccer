import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  advanceDays,
  clubOf,
  facilityInvestmentPreview,
  fixedCostRunway,
  gateProjection,
  operatingCosts,
  recordMatch,
  simulateMatch,
} from './index';
import { holdRows, startWork } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/** The club on the pre-feature path: investment plans, not the match model, are the subject. */
function world() {
  const w = simulatedWorld({ country: 'ENG', seed: 'investment-plans' }, {}, DISABLED_RELEASE);
  w.cash = '999999999999';
  // The first ground, so the ladder's first step is the work under test (→ECON-32).
  w.stadium = 0;
  return w;
}

describe('shared club investment forecasts', () => {
  // No career starts a work (→ECON-32); ECON-29's reference club builds by these forecasts.
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
    startWork(w, 'stadium');
    expect(w.cash).toBe(preview.cashAfter);
    expect(w.expense).toBe(preview.cost);
    // A stand is being added: the ground holds 10% fewer and upkeep waits for the opening.
    expect(w.stadium).toBe(0);
    expect(gateProjection(w).capacity).toBe(2250);
    expect(operatingCosts(w).maintenance).toBe(costs.maintenance);
    expect(() => startWork(w, 'stadium')).toThrow('진행 중');
    expect(facilityInvestmentPreview(w, 'stadium').eligible).toBe(false);
    // The same work 179 days on; its last day passes here.
    const building = cachedWorld('stadium-work-day-179', () => {
      const w = world();
      startWork(w, 'stadium');
      advanceDays(w, 179, undefined, false);
      return w;
    });
    expect(building.stadium).toBe(0);
    advanceDays(building, 1, undefined, false);
    expect(building.stadium).toBe(1);
    expect(building.facilityWorks).toBeUndefined();
    expect(gateProjection(building).capacity).toBe(5000);
    expect(operatingCosts(building).maintenance).toBe(preview.maintenanceAfter);
    expect(BigInt(preview.maintenanceAfter) - BigInt(costs.maintenance)).toBe(
      BigInt(preview.maintenanceIncrease),
    );
    expect(building.events.some((event) => event.kind === 'facility-open')).toBe(true);
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
    expect(() => startWork(w, 'training')).toThrow('부족');
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
    expect(() => startWork(w, 'stadium')).toThrow('최고');
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
    startWork(w, 'stadium');
    expect(w.cash).toBe(preview.cashAfter);
    expect(preview.runwayRounds).toBe(999);
  });

  it.each([0.01, 0.05, 0.12, 0.5])(
    'settles a home gate within the projected range at a %s ticket price',
    (price) => {
      // The price is held as founded or saved (→ECON-17); the projection and the settlement
      // share one gate model (→ECON-19).
      const w = holdRows(world(), { ticket: price }),
        projection = gateProjection(w);
      const fixture = w.fixtures.find((match) => match.home === w.playerClub)!,
        match = simulateMatch(w, fixture, false, true);
      recordMatch(w, match);
      const income = w.events.find((event) => event.kind === 'gate')!,
        cost = w.events.find((event) => event.kind === 'match-cost')!,
        net = BigInt(income.amount!) - BigInt(cost.amount!);
      expect(net).toBeGreaterThanOrEqual(BigInt(projection.incomeLow) - BigInt(projection.costLow));
      expect(net).toBeLessThanOrEqual(BigInt(projection.incomeHigh) - BigInt(projection.costHigh));
    },
  );

  it('projects lower demand and possible gate losses at a dear ticket price', () => {
    // A small following, the founding's 800 supporters: a taken-over club's crowd can pay its way
    // even at a dear ticket, while a small crowd shows the loss the projection warns of.
    const w = world();
    clubOf(w).fans = 800;
    const cheap = gateProjection(holdRows(structuredClone(w), { ticket: 0.01 })),
      dear = gateProjection(holdRows(structuredClone(w), { ticket: 0.5 }));
    expect(dear.attendanceHigh).toBeLessThan(cheap.attendanceLow);
    expect(BigInt(dear.incomeHigh) - BigInt(dear.costHigh)).toBeLessThan(0n);
  });
});
