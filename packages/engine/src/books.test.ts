import { describe, expect, it } from 'vitest';
import {
  booksClose,
  booksOpen,
  currencyChange,
  npcCanPay,
  npcWageBill,
  npcWageLimit,
  NPC_WAGE_DECISIONS,
  recordNpcTransferFee,
  settleNpcBooks,
} from './books';
import { npcBooksFixture } from './npc-books.testkit';
import { CLUB_LEVELS } from './persisted-squads';
import { CLUB_BOOKS } from './owner-config';
import { scaleBy } from './primitives';
import { marketWageAt } from './market-prices';
import { stature } from './world';
import { operatingExpensesAt } from './finance';

describe('NPC contract books on an isolated squad', () => {
  it('observes salary without the fee while enforcing their shared headroom', () => {
    const { w, c } = npcBooksFixture();
    const observations: [bigint, bigint, boolean][] = [];
    NPC_WAGE_DECISIONS.observe = (_club, bill, _limit, allowed, fee) =>
      observations.push([bill, fee, allowed]);
    try {
      expect(npcCanPay(w, c, '20', undefined, w.year, { bill: 80n, limit: 110n }, '10')).toBe(true);
      expect(npcCanPay(w, c, '20', undefined, w.year, { bill: 80n, limit: 110n }, '11')).toBe(
        false,
      );
      expect(observations).toEqual([
        [100n, 10n, true],
        [100n, 11n, false],
      ]);
    } finally {
      delete NPC_WAGE_DECISIONS.observe;
    }
  });
  it('pays all stored contracts, including players outside the eighteen, without repricing', () => {
    const { w, c, players } = npcBooksFixture();
    for (const [i, p] of players.entries()) p.wage = String(i + 1);
    const wages = players.reduce((sum, p) => sum + BigInt(p.wage), 0n);
    const book = settleNpcBooks(w, c).seasons[0]!;
    expect(book.wages).toBe(wages.toString());
    expect(npcWageBill(w, c)).toBe(wages);
    expect(book.wages).not.toBe(
      players
        .reduce((sum, p) => sum + BigInt(marketWageAt(c.country, w.year, c.tier, p)), 0n)
        .toString(),
    );
    expect(BigInt(book.result)).toBe(BigInt(book.income) - wages - BigInt(book.costs));
  });

  it('uses opening income and cash before the first close, then the previous operating book', () => {
    const { w, c } = npcBooksFixture();
    booksOpen(w);
    const opening = c.books!;
    const initial = npcWageLimit(w, c)!;
    expect(initial).toBeGreaterThanOrEqual(
      BigInt(opening.openingIncome!) +
        BigInt(opening.cash) -
        BigInt(operatingExpensesAt(c.country, w.year, c.tier)),
    );
    expect(opening.cash).toBe(scaleBy(opening.openingIncome!, CLUB_BOOKS.opening, 1000n));
    settleNpcBooks(w, c);
    const last = c.books!.seasons[0]!;
    expect(npcWageLimit(w, c)).toBeGreaterThanOrEqual(
      BigInt(last.income) -
        BigInt(operatingExpensesAt(c.country, w.year, c.tier)) +
        BigInt(c.books!.cash) -
        BigInt(c.books!.debt),
    );
  });

  it('counts the proposed wage once for a renewal, refuses one unit over, and permits equality', () => {
    const { w, c, players } = npcBooksFixture();
    for (const p of players) p.wage = '10';
    const costs = BigInt(operatingExpensesAt(c.country, w.year, c.tier));
    c.books = { seasons: [], cash: (220n + costs).toString(), debt: '0', openingIncome: '0' };
    expect(npcCanPay(w, c, '0')).toBe(true);
    expect(npcCanPay(w, c, '1')).toBe(false);
    expect(npcCanPay(w, c, '10', players[0]!.id)).toBe(true);
    expect(npcCanPay(w, c, '11', players[0]!.id)).toBe(false);
    c.books.cash = (100n + costs).toString();
    expect(npcCanPay(w, c, '0')).toBe(false);
  });

  it('does not impose a wage limit or change levels without applicable books', () => {
    const { w, c } = npcBooksFixture();
    const levels = structuredClone(c.levels);
    expect(npcWageLimit(w, c)).toBeUndefined();
    expect(npcCanPay(w, c, '9999999999999999999')).toBe(true);
    settleNpcBooks(w, c);
    expect(c.levels).toEqual(levels);
    c.representative = true;
    expect(npcWageLimit(w, c)).toBeUndefined();
    booksClose(w);
    expect(c.levels).toEqual(levels);
  });

  it('settles fees into the season result and consumes them only in that season', () => {
    const { w, c } = npcBooksFixture();
    booksOpen(w);
    recordNpcTransferFee(w, c, '70', true);
    recordNpcTransferFee(w, c, '20', false);
    recordNpcTransferFee(w, c, '3', false);
    const book = settleNpcBooks(w, c).seasons[0]!;
    expect(book).toMatchObject({ transfersPaid: '23', transfersReceived: '70' });
    expect(BigInt(book.result)).toBe(
      BigInt(book.income) - BigInt(book.wages) - BigInt(book.costs) + 47n,
    );
    expect(c.books!.transfersPaid).toBeUndefined();
    expect(c.books!.transfersReceived).toBeUndefined();
    w.year++;
    expect(settleNpcBooks(w, c).seasons[0]!.transfersPaid).toBe('0');
  });

  it('caps invested levels and leaves cash at the seasonal ceiling', () => {
    const { w, c } = npcBooksFixture();
    c.levels = { academy: 1, ground: 2, coaching: 3 };
    c.books = { seasons: [], cash: '999999999999999999999', debt: '0' };
    const book = settleNpcBooks(w, c).seasons[0]!;
    expect(c.levels.academy).toBeGreaterThan(1);
    expect(c.levels.ground).toBeGreaterThan(2);
    expect(c.levels.coaching).toBeGreaterThan(3);
    expect(Object.values(c.levels).every((n) => n <= 5)).toBe(true);
    expect(c.books!.cash).toBe(scaleBy(book.income, CLUB_BOOKS.cashSeasons, 1000n));
  });

  it('carries half-level investments until a whole level has been funded', () => {
    const { w, c } = npcBooksFixture();
    c.levels = { academy: 1, ground: 2, coaching: 3 };
    for (let year = 1950; year <= 1951; year++) {
      w.year = year;
      c.books = { seasons: [], cash: '0', debt: '0' };
      const probe = structuredClone(w);
      const book = settleNpcBooks(probe, probe.clubs[1]!).seasons[0]!;
      const income = BigInt(book.income);
      c.books.cash = (
        BigInt(scaleBy(book.income, CLUB_BOOKS.cashSeasons, 1000n)) +
        income -
        BigInt(book.result)
      ).toString();
      settleNpcBooks(w, c);
      if (year === 1950)
        expect(c.levels).toEqual({ academy: 1, ground: 2, coaching: 3, progress: 0.5 });
    }
    expect(c.levels).toEqual({ academy: 2, ground: 3, coaching: 4, progress: 0 });
  });

  it('decays by the named setting, crossing a whole level after accumulated seasons', () => {
    const { w, c } = npcBooksFixture();
    c.levels = { academy: 2, ground: 2, coaching: 2, progress: -1 + CLUB_LEVELS.decay };
    c.books = { seasons: [], cash: '0', debt: '999999999999999999999' };
    settleNpcBooks(w, c);
    expect(c.levels).toEqual({ academy: 1, ground: 1, coaching: 1, progress: 0 });
    w.year++;
    settleNpcBooks(w, c);
    expect(c.levels.progress).toBe(-CLUB_LEVELS.decay);
  });

  it('converts every stored squad wage with carried cash, leaving the historical book unchanged', () => {
    const { w, c, players } = npcBooksFixture(1998);
    c.country = 'FRA';
    booksOpen(w);
    players.forEach((p, i) => {
      p.wage = String(10000 + i);
    });
    const old = players.map((p) => p.wage);
    const bill = npcWageBill(w, c);
    const book = settleNpcBooks(w, c).seasons[0]!;
    const change = currencyChange('FRA', 1998, 1999)!;
    expect(book.wages).toBe(bill.toString());
    expect(players.map((p) => p.wage)).toEqual(old.map(change));
    const limit = npcWageLimit(w, c, 1999)!;
    const income = BigInt(change(book.income));
    expect(limit).toBe(
      income +
        (income * 150n) / 1000n -
        BigInt(operatingExpensesAt(c.country, 1999, c.tier)) +
        BigInt(c.books!.cash) -
        BigInt(c.books!.debt),
    );
    w.year = 1999;
    expect(npcWageLimit(w, c)).toBe(limit);
    const converted = players.map((p) => p.wage);
    settleNpcBooks(w, c);
    expect(players.map((p) => p.wage)).toEqual(converted);
  });

  it.each([
    [9, 1000n],
    [4, 500n],
    [-1, 150n],
    [-5, 0n],
  ] as const)('funds stature %i by its bounded share', (minimum, share) => {
    const { w, c } = npcBooksFixture();
    const id = Array.from({ length: 92 }, (_, n) => `ENG:0:0:${n}`).find((candidate) => {
      const value = stature(w.seed, candidate);
      return minimum === -5
        ? value < -1
        : value >= minimum && (minimum === 9 || value < (minimum === 4 ? 9 : 4));
    })!;
    c.id = id;
    c.country = 'ENG';
    c.books = {
      seasons: [],
      cash: '20',
      debt: '10',
      openingIncome: '1000',
      transfersPaid: '40',
      transfersReceived: '30',
    };
    const limit = npcWageLimit(w, c)!;
    expect(limit).toBe(1000n + share - BigInt(operatingExpensesAt(c.country, w.year, c.tier)));
    expect(npcWageLimit(w, c)).toBe(limit);
    expect(c.books.cash).toBe('20');
  });

  it('draws only the closing shortfall once, keeps income components separate, and expires unused support', () => {
    const { w, c } = npcBooksFixture();
    const id = Array.from({ length: 20 }, (_, n) => `ENG:0:0:${n}`).find(
      (candidate) => stature(w.seed, candidate) >= 9,
    )!;
    c.id = id;
    c.country = 'ENG';
    c.books = { seasons: [], cash: '0', debt: '0', openingIncome: '1000' };
    const probe = structuredClone(w);
    const estimate = settleNpcBooks(probe, probe.clubs[1]!).seasons[0]!;
    const desiredShortfall = 400n;
    const start = -desiredShortfall - BigInt(estimate.result);
    c.books.cash = start > 0n ? start.toString() : '0';
    c.books.debt = start < 0n ? (-start).toString() : '0';
    const result = settleNpcBooks(w, c);
    const book = result.seasons[0]!;
    expect(book.ownerCapital).toBe('400');
    expect(BigInt(book.income)).toBe(
      Object.values(book.incomeComponents!).reduce((a, v) => a + BigInt(v), 0n),
    );
    expect([result.cash, result.debt]).toEqual(['0', '0']);
    const snapshot = structuredClone(result);
    expect(settleNpcBooks(w, c)).toEqual(snapshot);
    expect(c.books).toEqual(snapshot);
    w.playerClub = c.id;
    w.year++;
    expect(settleNpcBooks(w, c).seasons[0]!.ownerCapital).toBe('0');
  });

  it('permits wages above turnover only within the funded envelope and caps a large deficit', () => {
    const { w, c, players } = npcBooksFixture();
    const id = Array.from({ length: 20 }, (_, n) => `ENG:0:0:${n}`).find(
      (candidate) => stature(w.seed, candidate) >= 9,
    )!;
    w.squads![id] = players;
    c.id = id;
    c.country = 'ENG';
    players.forEach((p) => {
      p.wage = '0';
    });
    const costs = BigInt(operatingExpensesAt(c.country, w.year, c.tier));
    c.books = { seasons: [], cash: costs.toString(), debt: '0', openingIncome: '1000' };
    expect(npcCanPay(w, c, '2000')).toBe(true);
    expect(npcCanPay(w, c, '2001')).toBe(false);
    c.books.debt = '999999999999999';
    const book = settleNpcBooks(w, c).seasons[0]!;
    expect(book.ownerCapital).toBe('1000');
    expect(BigInt(c.books!.debt)).toBeGreaterThan(0n);
  });
});
