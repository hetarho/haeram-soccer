import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import {
  advanceRound,
  createWorld,
  currentLeagueRank,
  financeProjection,
  leagueMerit,
  leagueShare,
  operate,
  operatingCosts,
  ratio,
  settleLeagueMerit,
  sponsorAnnual,
} from './index';

function world(seed = 'projection') {
  const w = createWorld({
    country: 'ENG',
    name: 'Forecast Rovers',
    color: '#335544',
    seed,
    difficulty: 2,
  });
  // The squad stays fixed, so every realised bill can be compared exactly.
  w.delegation = { ...w.delegation, transfers: false };
  return w;
}
const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
const lineOf = (lines: { key: string; low: string; high: string; amount: string }[], key: string) =>
  lines.find((line) => line.key === key)!;
const eventsTotal = (w: World, kind: string) =>
  sum(w.events.filter((e) => e.year === w.year && e.kind === kind).map((e) => e.amount!));

describe('finance projection', () => {
  it('never changes the world and keeps every range ordered', () => {
    const w = world();
    operate(w, { type: 'sign-sponsor', slot: 'local', offer: 0 });
    for (let i = 0; i < 6; i++) advanceRound(w, undefined, false);
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
      '급여·운영비',
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
    const w = world();
    const start = financeProjection(w);
    expect(lineOf(start.lines, 'operating').amount).toBe(`-${operatingCosts(w).annual}`);
    expect(lineOf(start.seasonLines, 'operating').amount).toBe(`-${operatingCosts(w).annual}`);
    for (let i = 0; i < 10; i++) advanceRound(w, undefined, false);
    const costs = operatingCosts(w),
      remaining = sum(
        [
          costs.playerWages,
          costs.managerWage,
          costs.maintenance,
          costs.marketing,
          costs.staffWages,
        ].map((part) => (BigInt(part) - BigInt(ratio(part, 10n, 46n))).toString()),
      );
    const mid = financeProjection(w);
    expect(BigInt(lineOf(mid.seasonLines, 'operating').amount)).toBe(-remaining);
    expect(lineOf(mid.lines, 'operating').amount).toBe(`-${costs.annual}`);
    // The remaining bills are exactly what the rounds then charge.
    const paidBefore = eventsTotal(w, 'operating-cost');
    while (w.round < 46) advanceRound(w, undefined, false);
    expect(eventsTotal(w, 'operating-cost') - paidBefore).toBe(remaining);
  });

  it('carries the league share a year ahead and the rest of it to season end', () => {
    const w = world();
    const share = leagueShare(w);
    expect(lineOf(financeProjection(w).lines, 'share').amount).toBe(share);
    for (let i = 0; i < 10; i++) advanceRound(w, undefined, false);
    const mid = financeProjection(w);
    expect(lineOf(mid.lines, 'share').amount).toBe(share);
    const projected = BigInt(lineOf(mid.seasonLines, 'share').amount);
    expect(projected).toBe(BigInt(share) - BigInt(ratio(share, 10n, 46n)));
    // The remaining installments are exactly what the rounds then pay.
    const paid = eventsTotal(w, 'league-share');
    while (w.round < 46) advanceRound(w, undefined, false);
    expect(eventsTotal(w, 'league-share') - paid).toBe(projected);
    expect(lineOf(financeProjection(w).seasonLines, 'share').amount).toBe('0');
  });

  it('lowers the outlook by exactly a higher cost and counts the remaining sponsor installments', () => {
    const w = world();
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
    for (let i = 0; i < 12; i++) advanceRound(w, undefined, false);
    const projected = BigInt(lineOf(financeProjection(w).seasonLines, 'sponsor').amount);
    const paid = eventsTotal(w, 'sponsor:local');
    while (w.round < 46) advanceRound(w, undefined, false);
    expect(eventsTotal(w, 'sponsor:local') - paid).toBe(projected);
    expect(lineOf(financeProjection(w).seasonLines, 'sponsor').amount).toBe('0');
  });

  it('expects home gates net of hosting costs and leaves uncertain income at zero on the low side', () => {
    const w = world();
    const home = w.fixtures.filter((f) => f.home === w.playerClub && f.year === w.year).length;
    const gate = lineOf(financeProjection(w).lines, 'gate');
    expect(home).toBeGreaterThan(0);
    expect(BigInt(gate.low)).toBeGreaterThan(0n);
    expect(BigInt(gate.high) % BigInt(home)).toBe(0n);
    for (let i = 0; i < 46; i++) advanceRound(w, undefined, false);
    const done = financeProjection(w);
    expect(lineOf(done.seasonLines, 'gate').amount).toBe('0');
    expect(lineOf(done.seasonLines, 'performance').high).toBe('0');
    expect(BigInt(lineOf(done.lines, 'gate').high)).toBeGreaterThan(0n);
  });

  it('prices the merit like the season close does, by the current rank', () => {
    const w = world();
    for (let i = 0; i < 20; i++) advanceRound(w, undefined, false);
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
