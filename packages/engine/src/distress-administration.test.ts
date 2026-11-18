import { afterEach, describe, expect, it } from 'vitest';
import type { DistressState } from '../../contracts/src/owner';
import { DISTRESS_FLOW, applyPendingDeductions, reportDistress, stepDistress } from './distress';
import {
  archiveLeagueDeductions,
  emptyTable,
  groupKey,
  leaguePoints,
  ranked,
} from './league-fixtures';
import { worldMarketFixture } from './world-market.testkit';
import { npcBooksFixture } from './npc-books.testkit';
import { npcDebt, npcFixedCosts, settleNpcBooks, settleNpcDistress } from './books';
import { financialBreakdown, isIncomeKind, operatingCosts } from './finance';
import { prepareSeason } from './season';
import { settleRound } from './settlement';
import { seasonAfter } from './wartime';

const fixture = () => {
  const w = worldMarketFixture();
  const own = w.clubs[0]!;
  w.tables = Object.fromEntries(w.clubs.map((c) => [c.id, emptyTable()]));
  w.fixtures = [1, 2].map((round) => ({
    id: `league:${round}`,
    year: w.year,
    round,
    kind: 'league' as const,
    home: own.id,
    away: 'other',
    country: own.country,
    groupKey: groupKey(own),
    ...(round === 1 ? { score: { home: 0, away: 0 } } : {}),
  }));
  return w;
};
afterEach(() => {
  delete DISTRESS_FLOW.observe;
});
describe('administration accounting and seasons', () => {
  it('ranks net points while retaining settled match totals and positive deduction data', () => {
    const w = fixture();
    const [a, b] = w.clubs;
    w.tables[a!.id] = {
      ...emptyTable(),
      points: 15,
      deducted: 10,
      deductionReason: 'administration',
    };
    w.tables[b!.id] = { ...emptyTable(), points: 6 };
    expect(ranked(w, [a!, b!]).map((c) => c.id)).toEqual([b!.id, a!.id]);
    expect(w.tables[a!.id]!.points).toBe(15);
    expect(leaguePoints(w.tables[a!.id]!)).toBe(5);
    expect(archiveLeagueDeductions(w)).toEqual({
      leagueDeductions: { [a!.id]: { deducted: 10, deductionReason: 'administration' } },
    });
  });
  it('writes off half on each entry, deducts only once in the entry season, and leaves income alone', () => {
    const w = fixture();
    w.cash = '-201';
    w.income = '17';
    w.expense = '9';
    const first: DistressState = { stage: 3 };
    w.distress = first;
    reportDistress(w, w.playerClub, { stage: 2 }, first);
    expect(w.cash).toBe('-101');
    expect([w.income, w.expense]).toEqual(['17', '9']);
    expect(w.tables[w.playerClub]).toMatchObject({
      points: 0,
      deducted: 10,
      deductionReason: 'administration',
    });
    expect(isIncomeKind('debt-write-off')).toBe(false);
    expect(financialBreakdown(w).adjustments).toEqual([
      { key: 'debt-write-off', label: '채무 탕감', amount: '100' },
    ]);
    reportDistress(w, w.playerClub, first, first);
    expect(w.events.filter((e) => e.kind === 'debt-write-off')).toHaveLength(1);
    // A second entry late in this same league season must not queue a second deduction either.
    w.fixtures.forEach((f) => {
      f.score = { home: 0, away: 0 };
    });
    const second = { ...first, stage: 3 as const };
    w.distress = second;
    reportDistress(w, w.playerClub, { ...first, stage: 2 }, second);
    expect(w.cash).toBe('-51');
    expect(w.tables[w.playerClub]!.deducted).toBe(10);
    expect(second.pendingDeduction).toBeUndefined();
    expect(w.events.filter((e) => e.kind === 'debt-write-off').map((e) => e.amount)).toEqual([
      '100',
      '50',
    ]);
  });
  it('uses the whole league season, queues after its final round and emits only actual deductions', () => {
    const w = fixture();
    w.round = 20;
    w.fixtures.forEach((f) => {
      f.score = { home: 0, away: 0 };
    });
    w.fixtures.push({
      ...w.fixtures[0]!,
      id: 'other-league',
      groupKey: 'other-league',
      home: 'elsewhere',
      score: undefined,
    });
    const state: DistressState = { stage: 3 };
    w.distress = state;
    w.cash = '-200';
    const facts: unknown[] = [];
    DISTRESS_FLOW.observe = (f) => {
      expect(Object.isFrozen(f)).toBe(true);
      facts.push(f);
    };
    reportDistress(w, w.playerClub, undefined, state);
    expect(w.tables[w.playerClub]).not.toHaveProperty('deducted');
    expect(state.pendingDeduction).toEqual({ season: seasonAfter(w.year), points: 10 });
    expect(facts).toEqual([{ club: w.playerClub, stage: 3 }]);
    w.year = seasonAfter(w.year);
    w.clubs[2]!.representative = true;
    w.tables[w.playerClub] = emptyTable();
    prepareSeason(w, false);
    applyPendingDeductions(w);
    expect(w.tables[w.playerClub]).toMatchObject({
      deducted: 10,
      deductionReason: 'administration',
    });
    expect(state.pendingDeduction).toBeUndefined();
    prepareSeason(w, false, false);
    expect(w.tables[w.playerClub]!.deducted).toBe(10);
    expect(facts).toEqual([
      { club: w.playerClub, stage: 3 },
      { club: w.playerClub, pointsDeducted: 10 },
    ]);
    // A later entry in the deducted season writes off debt but cannot deduct again.
    w.fixtures = [];
    const after = { ...state, stage: 3 as const };
    w.distress = after;
    reportDistress(w, w.playerClub, { ...state, stage: 2 }, after);
    expect(w.tables[w.playerClub]!.deducted).toBe(10);
    expect(facts).toHaveLength(3);
    expect(facts[2]).toEqual({ club: w.playerClub, stage: 3 });
  });
  it('runs through the owned round settlement without repeated write-offs on the next round', () => {
    const w = fixture();
    w.round = 1;
    w.cash = (-BigInt(operatingCosts(w).annual) * 3n).toString();
    settleRound(w);
    expect(w.distress?.stage).toBe(3);
    expect(w.tables[w.playerClub]!.deducted).toBe(10);
    expect(w.events.filter((e) => e.kind === 'debt-write-off')).toHaveLength(1);
    w.round++;
    settleRound(w);
    expect(w.events.filter((e) => e.kind === 'debt-write-off')).toHaveLength(1);
    expect(w.tables[w.playerClub]!.deducted).toBe(10);
  });
  it('books actual NPC debt relief once per entry, outside result and income, and retains the line at close', () => {
    const { w, c } = npcBooksFixture();
    const annual = npcFixedCosts(w, c);
    c.books = {
      seasons: [],
      cash: '20',
      debt: (annual * 3n).toString(),
      transfersPaid: '7',
      transfersReceived: '3',
    };
    const debt = npcDebt(w, c);
    const amount = debt / 2n;
    const f = {
      id: 'npc-r1',
      year: w.year,
      round: 1,
      kind: 'league' as const,
      home: c.id,
      away: 'other',
      country: c.country,
      groupKey: groupKey(c),
      score: { home: 0, away: 0 },
    };
    w.round = 1;
    w.fixtures = [f, { ...f, id: 'later', round: 2, score: undefined }];
    settleNpcDistress(w, [f]);
    expect(npcDebt(w, c)).toBe(debt - amount);
    expect(c.books.debtWriteOff).toBe(amount.toString());
    expect(w.tables[c.id]).toMatchObject({ deducted: 10, deductionReason: 'administration' });
    settleNpcDistress(w, [f]);
    expect(c.books.debtWriteOff).toBe(amount.toString());
    const book = settleNpcBooks(w, c).seasons[0]!;
    expect(book.debtWriteOff).toBe(amount.toString());
    expect(BigInt(book.result)).toBe(
      BigInt(book.income) + 3n - BigInt(book.wages) - BigInt(book.costs) - 7n,
    );
    // A close releases administration only strictly under half, without counting a new round.
    expect(stepDistress({ stage: 3 }, 50n, 100n, w, true)?.stage).toBe(3);
    expect(stepDistress({ stage: 3 }, 49n, 100n, w, true)?.stage).toBe(2);
  });
});
