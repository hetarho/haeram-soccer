import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  advanceDays,
  advanceRound,
  clubOf,
  createWorld,
  financialBreakdown,
  gateProjection,
  matchBonus,
  operate,
  operatingCost,
  operatingCosts,
  prepareSeason,
  settleRound,
  settleSeasonPrize,
  simulateMatch,
  simulateSeason,
} from './index';
import { advanceEconomy } from './economy';

function world() {
  return createWorld({
    country: 'ENG',
    name: 'Budget Athletic',
    color: '#335544',
    seed: 'finance',
    difficulty: 2,
  });
}

describe('earned, auditable club finances', () => {
  it('requires viable commercial choices for surplus in a season with identical sporting results', () => {
    const unmanaged = world();
    const managed = world();
    operate(managed, { type: 'sponsor', kind: 'stable' });
    operate(managed, { type: 'ticket', price: 0.12 });
    operate(managed, { type: 'campaign', kind: 'outreach' });
    simulateSeason(unmanaged);
    simulateSeason(managed);
    const before = unmanaged.history[0];
    const after = managed.history[0];
    expect([after.won, after.drawn, after.lost, after.rank]).toEqual([
      before.won,
      before.drawn,
      before.lost,
      before.rank,
    ]);
    expect(BigInt(before.income) - BigInt(before.expense)).toBeLessThan(0n);
    expect(BigInt(after.income) - BigInt(after.expense)).toBeGreaterThan(0n);
    expect(managed.events.filter((event) => event.kind === 'support')).toEqual([]);
  });
  it('keeps a real deficit after expenses and currency/calendar progression without creating help', () => {
    const w = world();
    w.cash = '0';
    w.round = 1;
    const cost = operatingCosts(w, 1).nextRound;
    settleRound(w);
    expect(w.cash).toBe((-BigInt(cost)).toString());
    expect(w.income).toBe('0');
    expect(w.critical).toContain('운영자금');
    expect(w.events.filter((event) => event.kind === 'support')).toEqual([]);
    delete w.critical;
    w.round = 2;
    settleRound(w);
    expect(BigInt(w.cash)).toBeLessThan(-BigInt(cost));
    expect(w.critical).toContain('운영자금');
    const cash = w.cash;
    w.year++;
    advanceEconomy(w, w.year - 1);
    expect(w.cash).toBe(cash);
    delete w.critical;
    prepareSeason(w);
    advanceDays(w, 6, undefined, false);
    expect(w.cash).toBe(cash);
  });

  it('pays more for wins than draws and zero performance money for losses, home and away', () => {
    const w = world();
    const fixture = w.fixtures.find((f) => f.home === w.playerClub)!;
    const record = simulateMatch(w, fixture, false, true).record;
    operate(w, { type: 'sponsor', kind: 'performance' });
    const win = matchBonus(w, { ...record, score: { home: 2, away: 0 } });
    const draw = matchBonus(w, { ...record, score: { home: 1, away: 1 } });
    const loss = matchBonus(w, { ...record, score: { home: 0, away: 2 } });
    expect(BigInt(win.amount)).toBeGreaterThan(BigInt(draw.amount));
    expect(BigInt(draw.amount)).toBeGreaterThan(0n);
    expect(BigInt(win.sponsored)).toBeGreaterThan(BigInt(draw.sponsored));
    expect(loss.amount).toBe('0');
    expect(loss.sponsored).toBe('0');
    expect(
      matchBonus(w, {
        ...record,
        home: fixture.away,
        away: w.playerClub,
        score: { home: 0, away: 2 },
      }).amount,
    ).toBe(win.amount);
  });

  it('earns sponsor money once per played league match instead of receiving a full annual grant', () => {
    const w = world();
    operate(w, { type: 'sponsor', kind: 'stable' });
    const annual = w.sponsor!.annual;
    expect(w.income).toBe('0');
    advanceDays(w, 6, undefined, false);
    expect(w.events.filter((event) => event.kind === 'sponsor-payment')).toEqual([]);
    advanceRound(w, undefined, false);
    const first = w.events.filter((event) => event.kind === 'sponsor-payment');
    expect(first).toHaveLength(1);
    expect(BigInt(first[0].amount!)).toBeLessThan(BigInt(annual) / 40n);
    while (w.round < 46) advanceRound(w, undefined, false);
    const payments = w.events.filter((event) => event.kind === 'sponsor-payment');
    expect(payments.reduce((sum, event) => sum + BigInt(event.amount!), 0n)).toBe(BigInt(annual));
    expect(w.sponsor!.lastPaid).toBe(w.year);
    const oldSave = world();
    operate(oldSave, { type: 'sponsor', kind: 'stable' });
    oldSave.sponsor!.lastPaid = oldSave.year;
    advanceRound(oldSave, undefined, false);
    expect(oldSave.events.filter((event) => event.kind === 'sponsor-payment')).toEqual([]);
  });

  it('changes ticket demand, attendance and costs through actual operating decisions', () => {
    const w = world();
    const initial = gateProjection(w);
    const expensive = structuredClone(w);
    expensive.ticket = 0.5;
    expect(gateProjection(expensive).attendanceHigh).toBeLessThan(initial.attendanceLow);
    expect(BigInt(gateProjection(expensive).incomeHigh)).toBeLessThan(BigInt(initial.incomeLow));
    operate(w, { type: 'campaign', kind: 'tickets' });
    expect(gateProjection(w).attendanceLow).toBeGreaterThan(initial.attendanceLow);
    expect(BigInt(w.expense)).toBeGreaterThan(0n);
    const highReputation = structuredClone(w);
    clubOf(highReputation).reputation = 80;
    expect(gateProjection(highReputation).attendanceLow).toBeGreaterThan(
      gateProjection(w).attendanceLow,
    );
    const homeFixture = w.fixtures.find((fixture) => fixture.home === w.playerClub)!;
    const record = simulateMatch(w, homeFixture, false, true).record;
    const winning = structuredClone(w);
    const losing = structuredClone(w);
    winning.ownMatches = [{ ...record, score: { home: 2, away: 0 } }];
    losing.ownMatches = [{ ...record, score: { home: 0, away: 2 } }];
    expect(gateProjection(winning).attendanceLow).toBeGreaterThan(
      gateProjection(losing).attendanceHigh,
    );
    const annual = operatingCost(w);
    operate(w, { type: 'facility' });
    expect(BigInt(operatingCost(w))).toBeGreaterThan(BigInt(annual));
    const player = w.players.find((p) => p.status === 'active' && p.role !== 'GK')!;
    const beforeSale = operatingCost(w);
    operate(w, { type: 'sell', id: player.id });
    expect(BigInt(operatingCost(w))).toBe(BigInt(beforeSale) - BigInt(player.wage));
  });

  it('shows explicit owner capital separately and does not clear an unresolved deficit', () => {
    const w = world();
    w.cash = '-999999999';
    w.critical = '운영자금이 부족합니다.';
    const before = BigInt(w.cash);
    operate(w, { type: 'support' });
    expect(BigInt(w.cash)).toBeGreaterThan(before);
    expect(BigInt(w.cash)).toBeLessThan(0n);
    expect(w.critical).toContain('운영자금');
    const budget = financialBreakdown(w);
    expect(budget.ownerInvestment).toBe(w.income);
    expect(budget.operatingIncome).toBe('0');
    expect(budget.operatingNet).toBe('0');
    expect(clubOf(w).reputation).toBe(10);
  });

  it('logs every receipt and expense, sums to the season books, and awards final rank once', () => {
    const w = world();
    operate(w, { type: 'sponsor', kind: 'performance' });
    operate(w, { type: 'campaign', kind: 'outreach' });
    for (let round = 0; round < 8; round++) advanceRound(w, undefined, false);
    settleSeasonPrize(w, 1, 24);
    const snapshot = canonical(w);
    settleSeasonPrize(w, 1, 24);
    expect(canonical(w)).toBe(snapshot);
    const budget = financialBreakdown(w);
    expect(budget.income.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(BigInt(w.income));
    expect(budget.expense.reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(
      BigInt(w.expense),
    );
    expect(budget.income.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(budget.expense.some((row) => row.key === 'older-ledger')).toBe(false);
    expect(w.events.filter((event) => event.kind === 'operating-cost')).toHaveLength(8);
    expect(w.events.filter((event) => event.kind === 'match-cost').length).toBe(
      w.ownMatches.filter((match) => match.home === w.playerClub).length,
    );
    const bottom = world();
    settleSeasonPrize(bottom, 24, 24);
    expect(bottom.income).toBe('0');
  });
});
