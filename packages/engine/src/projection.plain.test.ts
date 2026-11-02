import { describe, expect, it } from 'vitest';
import {
  currentLeagueRank,
  financeProjection,
  leagueMerit,
  leagueShare,
  operatingCosts,
  policyOf,
  ratio,
  settleLeagueMerit,
} from './index';
import { holdRows } from './testing';
import { eventsTotal, lineOf, played, setups, world } from './projection.testkit';

describe('finance projection', () => {
  it('the projection carries the operating-expense factor of the squad investment in force', () => {
    let w = played('plain', 10);
    const standard = operatingCosts(w),
      base = financeProjection(w),
      held = financeProjection({ ...w, policy: { ...policyOf(w), support: 5 } });
    holdRows(w, { policy: { support: 5 } });
    const costs = operatingCosts(w),
      projection = financeProjection(w),
      unpaid = (part: string) => BigInt(part) - BigInt(ratio(part, 10n, 46n));
    expect(costs.seasonExpenses).toBe(standard.seasonExpenses);
    expect(costs.expenses).toBe(ratio(costs.seasonExpenses, 120n, 100n));
    // The level changes the fixed costs only through the operating expenses it scales…
    expect(BigInt(costs.annual) - BigInt(standard.annual)).toBe(
      BigInt(costs.expenses) - BigInt(standard.expenses),
    );
    // …and the projection reads the level the club holds (→ECON-18).
    expect(projection).toEqual(held);
    expect(lineOf(projection.lines, 'expenses').amount).toBe(`-${costs.expenses}`);
    expect(BigInt(lineOf(projection.seasonLines, 'expenses').amount)).toBe(-unpaid(costs.expenses));
    expect(lineOf(projection.seasonLines, 'operating')).toEqual(
      lineOf(base.seasonLines, 'operating'),
    );
    const extra = unpaid(costs.expenses) - unpaid(standard.expenses);
    expect(extra).toBeGreaterThan(0n);
    expect(BigInt(base.seasonEnd.low) - BigInt(projection.seasonEnd.low)).toBe(extra);
    expect(BigInt(base.nextYear.high) - BigInt(projection.nextYear.high)).toBe(
      BigInt(costs.annual) - BigInt(standard.annual),
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
