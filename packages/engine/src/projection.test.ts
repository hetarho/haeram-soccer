import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import {
  advanceRound,
  createWorld,
  currentLeagueRank,
  facilityInvestmentPreview,
  financeProjection,
  fixedCostRunway,
  leagueMerit,
  leagueShare,
  operate,
  operatingCost,
  operatingCosts,
  policyOf,
  policyPreview,
  ratio,
  settleLeagueMerit,
  sponsorAnnual,
} from './index';
import { cachedWorld } from '../../../tests/fixtures/worlds';

function world(seed = 'projection') {
  const w = createWorld({
    country: 'ENG',
    name: 'Forecast Rovers',
    color: '#335544',
    seed,
    level: 'easy' as const,
  });
  // The squad stays fixed, so every realised bill can be compared exactly.
  return w;
}
/** The starting worlds the tests play rounds from. */
const setups = {
  plain: () => world(),
  sponsored: () => {
    const w = world();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    return w;
  },
  academy: () => {
    const w = world();
    operate(w, { type: 'policy', key: 'academy', level: 3 });
    return w;
  },
  recorded: () => {
    const w = world();
    // An amount recorded at the season's start, three times the division's floor (→ECON-30).
    w.operatingExpenses = (BigInt(operatingCosts(w).expenses) * 3n).toString();
    return w;
  },
  dearer: () => {
    const w = world();
    w.manager.wage = (BigInt(w.manager.wage) + 46000n).toString();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    return w;
  },
  support: () => {
    const w = played('plain', 10);
    operate(w, { type: 'policy', key: 'support', level: 5 });
    return w;
  },
};
/**
 * A setup's world once the season has reached each round in `spans` in turn (unobserved), built
 * once on the one before it. The rounds only produce the bills and payments the projection is
 * compared with.
 */
function played(setup: keyof typeof setups, ...spans: number[]): World {
  return cachedWorld(`${setup}:${spans.join('>')}`, () => {
    const w = spans.length > 1 ? played(setup, ...spans.slice(0, -1)) : setups[setup]();
    for (let n = w.round; n < spans.at(-1)!; n++) advanceRound(w, undefined, false);
    return w;
  });
}
const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
const lineOf = (lines: { key: string; low: string; high: string; amount: string }[], key: string) =>
  lines.find((line) => line.key === key)!;
const eventsTotal = (w: World, kind: string) =>
  sum(w.events.filter((e) => e.year === w.year && e.kind === kind).map((e) => e.amount!));

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

  it('the projection and a support preview carry the operating-expense factor', () => {
    let w = played('plain', 10);
    const standard = operatingCosts(w),
      base = financeProjection(w),
      preview = policyPreview(w, 'support', 5),
      previewed = financeProjection({ ...w, policy: { ...policyOf(w), support: 5 } });
    operate(w, { type: 'policy', key: 'support', level: 5 });
    const costs = operatingCosts(w),
      projection = financeProjection(w),
      unpaid = (part: string) => BigInt(part) - BigInt(ratio(part, 10n, 46n));
    expect(costs.seasonExpenses).toBe(standard.seasonExpenses);
    expect(costs.expenses).toBe(ratio(costs.seasonExpenses, 120n, 100n));
    // The preview is the level's change to fixed costs and the next round's bill (→ECON-12)…
    expect(preview.operatingFactor).toBe(1.2);
    expect(BigInt(preview.annualCostChange)).toBe(BigInt(costs.annual) - BigInt(standard.annual));
    expect(BigInt(preview.annualCostChange)).toBe(
      BigInt(costs.expenses) - BigInt(standard.expenses),
    );
    expect(BigInt(preview.nextRoundChange)).toBe(
      BigInt(costs.nextRound) - BigInt(standard.nextRound),
    );
    // …and the projection at that level is the one the club then has (→ECON-18).
    expect(projection).toEqual(previewed);
    expect(lineOf(projection.lines, 'expenses').amount).toBe(`-${costs.expenses}`);
    expect(BigInt(lineOf(projection.seasonLines, 'expenses').amount)).toBe(-unpaid(costs.expenses));
    expect(lineOf(projection.seasonLines, 'operating')).toEqual(
      lineOf(base.seasonLines, 'operating'),
    );
    const extra = unpaid(costs.expenses) - unpaid(standard.expenses);
    expect(extra).toBeGreaterThan(0n);
    expect(BigInt(base.seasonEnd.low) - BigInt(projection.seasonEnd.low)).toBe(extra);
    expect(BigInt(base.nextYear.high) - BigInt(projection.nextYear.high)).toBe(
      BigInt(preview.annualCostChange),
    );
    // The rounds then charge exactly what the projection carried.
    const before = eventsTotal(w, 'operating-expenses');
    expect(w).toEqual(setups.support());
    w = played('support', 46);
    expect(eventsTotal(w, 'operating-expenses') - before).toBe(unpaid(costs.expenses));
  });

  it('carries the league share a year ahead and the rest of it to season end', () => {
    let w = world();
    const share = leagueShare(w);
    expect(lineOf(financeProjection(w).lines, 'share').amount).toBe(share);
    w = played('plain', 10);
    const mid = financeProjection(w);
    expect(lineOf(mid.lines, 'share').amount).toBe(share);
    const projected = BigInt(lineOf(mid.seasonLines, 'share').amount);
    expect(projected).toBe(BigInt(share) - BigInt(ratio(share, 10n, 46n)));
    // The remaining installments are exactly what the rounds then pay.
    const paid = eventsTotal(w, 'league-share');
    w = played('plain', 10, 46);
    expect(eventsTotal(w, 'league-share') - paid).toBe(projected);
    expect(lineOf(financeProjection(w).seasonLines, 'share').amount).toBe('0');
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

  it('expects home gates net of hosting costs and leaves uncertain income at zero on the low side', () => {
    let w = world();
    const home = w.fixtures.filter((f) => f.home === w.playerClub && f.year === w.year).length;
    const gate = lineOf(financeProjection(w).lines, 'gate');
    expect(home).toBeGreaterThan(0);
    expect(BigInt(gate.low)).toBeGreaterThan(0n);
    expect(BigInt(gate.high) % BigInt(home)).toBe(0n);
    w = played('plain', 10, 46);
    const done = financeProjection(w);
    expect(lineOf(done.seasonLines, 'gate').amount).toBe('0');
    expect(lineOf(done.seasonLines, 'performance').high).toBe('0');
    expect(BigInt(lineOf(done.lines, 'gate').high)).toBeGreaterThan(0n);
  });

  it('prices the merit like the season close does, by the current rank', () => {
    const w = played('plain', 10, 20);
    const { rank, clubs } = currentLeagueRank(w);
    expect(rank).toBeGreaterThan(0);
    expect(lineOf(financeProjection(w).lines, 'merit').high).toBe(leagueMerit(w, rank, clubs));
    for (const position of [1, 2, 5, 10, 24]) {
      const paid = structuredClone(w);
      settleLeagueMerit(paid, position, 24);
      const event = paid.events.find((e) => e.year === w.year && e.kind === 'league-merit');
      expect(event?.amount || '0').toBe(leagueMerit(w, position, 24));
    }
    const settled = structuredClone(w);
    settleLeagueMerit(settled, 1, 24);
    expect(lineOf(financeProjection(settled).lines, 'merit').high).toBe('0');
  });
});
