import { describe, expect, it } from 'vitest';
import {
  facilityInvestmentPreview,
  financeProjection,
  fixedCostRunway,
  operate,
  operatingCost,
  operatingCosts,
  ratio,
  sponsorAnnual,
} from './index';
import { eventsTotal, lineOf, played, setups, sum, world } from './projection.testkit';

describe('finance projection', () => {
  it('never changes the world and keeps every range ordered', () => {
    const w = played('sponsored', 6);
    const before = structuredClone(w);
    const projection = financeProjection(w);
    expect(w).toEqual(before);
    expect(projection.now).toBe(w.cash);
    for (const range of [projection.seasonEnd, projection.nextYear])
      expect(BigInt(range.low)).toBeLessThanOrEqual(BigInt(range.high));
    for (const line of [...projection.lines, ...projection.seasonLines]) {
      expect(BigInt(line.low)).toBeLessThanOrEqual(BigInt(line.high));
      expect(BigInt(line.amount)).toBeGreaterThanOrEqual(BigInt(line.low));
      expect(BigInt(line.amount)).toBeLessThanOrEqual(BigInt(line.high));
    }
    expect(projection.lines.map((line) => line.label)).toEqual([
      '급여·시설 유지',
      '운영 경비',
      '홈 경기 수입(개최비 제외)',
      '리그 분배금',
      '후원 계약',
      '후원 성과 보너스',
      '리그 순위 배분금',
    ]);
    expect(lineOf(projection.lines, 'performance').low).toBe('0');
    expect(lineOf(projection.lines, 'merit').low).toBe('0');
    expect(BigInt(projection.nextYear.low)).toBe(
      BigInt(w.cash) + sum(projection.lines.map((line) => line.low)),
    );
    expect(BigInt(projection.seasonEnd.high)).toBe(
      BigInt(w.cash) + sum(projection.seasonLines.map((line) => line.high)),
    );
  });

  it('charges the annual operating bill over a year and the remaining rounds by season end', () => {
    let w = setups.academy();
    const start = financeProjection(w),
      first = operatingCosts(w),
      bill = BigInt(first.annual) - BigInt(first.expenses);
    expect(BigInt(first.academy)).toBeGreaterThan(0n);
    expect(lineOf(start.lines, 'operating').amount).toBe(`${-bill}`);
    expect(lineOf(start.seasonLines, 'operating').amount).toBe(`${-bill}`);
    expect(lineOf(start.lines, 'expenses').amount).toBe(`-${first.expenses}`);
    expect(lineOf(start.seasonLines, 'expenses').amount).toBe(`-${first.expenses}`);
    w = played('academy', 10);
    const costs = operatingCosts(w),
      unpaid = (part: string) => (BigInt(part) - BigInt(ratio(part, 10n, 46n))).toString(),
      remaining = sum(
        [
          costs.playerWages,
          costs.managerWage,
          costs.maintenance,
          costs.investment,
          costs.academy,
          costs.staffWages,
        ].map(unpaid),
      ),
      remainingExpenses = BigInt(unpaid(costs.expenses));
    const mid = financeProjection(w);
    expect(BigInt(lineOf(mid.seasonLines, 'operating').amount)).toBe(-remaining);
    expect(BigInt(lineOf(mid.lines, 'operating').amount)).toBe(
      BigInt(costs.expenses) - BigInt(costs.annual),
    );
    expect(BigInt(lineOf(mid.seasonLines, 'expenses').amount)).toBe(-remainingExpenses);
    // The remaining bills are exactly what the rounds then charge.
    const paidBefore = eventsTotal(w, 'operating-cost'),
      expensesBefore = eventsTotal(w, 'operating-expenses');
    w = played('academy', 10, 46);
    expect(eventsTotal(w, 'operating-cost') - paidBefore).toBe(remaining);
    expect(eventsTotal(w, 'operating-expenses') - expensesBefore).toBe(remainingExpenses);
  });

  it('reads the operating expenses recorded for the season, in the projection and the runway', () => {
    let w = world();
    // An amount recorded at the season's start, three times the division's floor (→ECON-30).
    const floor = operatingCosts(w).expenses,
      recorded = (BigInt(floor) * 3n).toString();
    w.operatingExpenses = recorded;
    expect(w).toEqual(setups.recorded());
    const costs = operatingCosts(w);
    expect(costs.expenses).toBe(recorded);
    const projection = financeProjection(w);
    expect(lineOf(projection.lines, 'expenses').amount).toBe(`-${recorded}`);
    expect(lineOf(projection.seasonLines, 'expenses').amount).toBe(`-${recorded}`);
    // The runway and every fixed-cost preview count the same annual bill.
    expect(
      BigInt(costs.annual) - BigInt(operatingCosts({ ...w, operatingExpenses: floor }).annual),
    ).toBe(BigInt(recorded) - BigInt(floor));
    expect(operatingCost(w)).toBe(costs.annual);
    expect(facilityInvestmentPreview(w, 'stadium').annualBefore).toBe(costs.annual);
    expect(fixedCostRunway(w.cash, operatingCost(w))).toBe(
      Math.min(999, Number((BigInt(w.cash) * 46n) / BigInt(costs.annual))),
    );
    // The rounds then charge exactly what the projection carried.
    w = played('recorded', 5);
    expect(eventsTotal(w, 'operating-expenses')).toBe(BigInt(ratio(recorded, 5n, 46n)));
  });

  it('lowers the outlook by exactly a higher cost and counts the remaining sponsor installments', () => {
    let w = world();
    const base = financeProjection(w);
    w.manager.wage = (BigInt(w.manager.wage) + 46000n).toString();
    const dearer = financeProjection(w);
    expect(BigInt(base.nextYear.low) - BigInt(dearer.nextYear.low)).toBe(46000n);
    expect(BigInt(base.seasonEnd.high) - BigInt(dearer.seasonEnd.high)).toBe(46000n);
    expect(BigInt(dearer.nextYear.high)).toBeLessThan(BigInt(base.nextYear.high));
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    const signed = financeProjection(w),
      annual = sponsorAnnual(w, w.sponsors![0]);
    expect(lineOf(signed.seasonLines, 'sponsor').amount).toBe(annual);
    // A three-season contract keeps paying at the same point of next season.
    expect(lineOf(signed.lines, 'sponsor').amount).toBe(annual);
    expect(w).toEqual(setups.dearer());
    w = played('dearer', 12);
    const projected = BigInt(lineOf(financeProjection(w).seasonLines, 'sponsor').amount);
    const paid = eventsTotal(w, 'sponsor:local');
    w = played('dearer', 12, 46);
    expect(eventsTotal(w, 'sponsor:local') - paid).toBe(projected);
    expect(lineOf(financeProjection(w).seasonLines, 'sponsor').amount).toBe('0');
  });
});
