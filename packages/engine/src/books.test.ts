import { describe, expect, it } from 'vitest';
import type { Club, World } from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { fanFollowing } from './fans';
import {
  bookIncomeLines,
  booksClose,
  booksOpen,
  clearDebt,
  currencyChange,
  keepsBooks,
  settleNpcBooks,
} from './books';
import { CLUB_BOOKS } from './owner-config';
import { scaleBy } from './primitives';
import { facilityStage } from './club-value';
import { historyWorld } from './history';
import { evolveClubs } from './dynamics';
import { operatingExpensesAt } from './finance';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

/** An ownerless world on its first season's first day, its tables as they stand (all level). */
const world = (seed = 'npc-books') => historyWorld(seed, DISABLED_RELEASE);
const club = (w: World, country: string, tier: number) =>
  w.clubs.find((c) => c.country === country && c.tier === tier && !c.representative)!;
const amount = (value: string) => BigInt(value);

describe('season books of clubs nobody owns (→ECON-36)', () => {
  it('opens with half a season’s income and no invented closed season', () => {
    const w = world();
    const top = club(w, 'ENG', 0),
      third = club(w, 'ENG', 2);
    // Restrict the accounting fixture to the two clubs and their real league gates.
    w.clubs = [top, third];
    w.fixtures = w.fixtures.filter((f) => f.home === top.id || f.home === third.id);
    for (const c of w.clubs) delete c.books;
    booksOpen(w);
    for (const c of w.clubs) {
      const opening = structuredClone(c.books!);
      expect(opening.seasons).toEqual([]);
      expect(opening.debt).toBe('0');
      const income = settleNpcBooks(w, c).seasons[0]!.income;
      expect(opening.cash).toBe(scaleBy(income, CLUB_BOOKS.opening, 1000n));
      expect(amount(opening.cash)).toBeGreaterThan(0n);
    }
    const before = structuredClone(w.clubs.map((c) => c.books));
    booksOpen(w);
    expect(w.clubs.map((c) => c.books)).toEqual(before);
  });
  it('settle a season from the owner scales: income, wages, operating expenses and result', () => {
    const w = world();
    const top = club(w, 'ENG', 0),
      third = club(w, 'ENG', 2);
    // Isolate income and expenses from the opening balance.
    for (const c of [top, third]) c.books = { seasons: [], cash: '0', debt: '0' };
    const [a, b] = [settleNpcBooks(w, top), settleNpcBooks(w, third)];
    for (const books of [a, b]) {
      const [book] = books.seasons;
      expect(book!.year).toBe(w.year);
      expect(amount(book!.income)).toBeGreaterThan(0n);
      expect(amount(book!.wages)).toBeGreaterThan(0n);
      expect(amount(book!.result)).toBe(
        amount(book!.income) - amount(book!.wages) - amount(book!.costs),
      );
      const result = amount(book!.result),
        ceiling = amount(scaleBy(book!.income, CLUB_BOOKS.cashSeasons, 1000n)),
        floor = -amount(scaleBy(book!.income, CLUB_BOOKS.debtSeasons, 1000n));
      expect(amount(books.cash) - amount(books.debt)).toBe(
        result > ceiling ? ceiling : result < floor ? floor : result,
      );
    }
    // A first season pays its division's operating expenses (→ECON-30).
    expect(a.seasons[0]!.costs).toBe(operatingExpensesAt('ENG', w.year, 0));
    expect(b.seasons[0]!.costs).toBe(operatingExpensesAt('ENG', w.year, 2));
    // The top flight earns and pays more than the third division.
    expect(amount(a.seasons[0]!.income)).toBeGreaterThan(amount(b.seasons[0]!.income));
    expect(amount(a.seasons[0]!.wages)).toBeGreaterThan(amount(b.seasons[0]!.wages));
  });

  it('caps cash and writes off debt beyond the income bounds, without ending the club', () => {
    const w = world();
    const target = club(w, 'ESP', 1);
    // The season's result on its own, then the same season over a balance.
    const income = settleNpcBooks(w, target).seasons[0]!.income;
    const huge = 10n ** 15n;
    target.books = { seasons: [], cash: '0', debt: huge.toString() };
    const indebted = settleNpcBooks(w, target);
    expect(indebted.cash).toBe('0');
    expect(indebted.debt).toBe(scaleBy(income, CLUB_BOOKS.debtSeasons, 1000n));
    target.books = { seasons: [], cash: huge.toString(), debt: '0' };
    const rich = settleNpcBooks(w, target);
    expect([rich.cash, rich.debt]).toEqual([scaleBy(income, CLUB_BOOKS.cashSeasons, 1000n), '0']);
    expect(w.bankrupt).toBeUndefined();
    expect(w.clubs).toContain(target);
  });

  it.each([0.25, -0.5])('leaves a closing balance of %s seasons of income untouched', (share) => {
    const w = world();
    const target = club(w, 'ENG', 1);
    w.clubs = [target];
    const book = settleNpcBooks(w, target).seasons[0]!;
    const end = amount(scaleBy(book.income, share, 1000n));
    const start = end - amount(book.result);
    target.books = {
      seasons: [],
      cash: start > 0n ? start.toString() : '0',
      debt: start < 0n ? (-start).toString() : '0',
    };
    const books = settleNpcBooks(w, target);
    expect(amount(books.cash) - amount(books.debt)).toBe(end);
  });

  it('keeps only the current and the last closed season', () => {
    const w = world();
    const target = club(w, 'GER', 0);
    for (const year of [1930, 1931, 1932]) {
      w.year = year;
      settleNpcBooks(w, target);
    }
    expect(target.books!.seasons.map((s) => s.year)).toEqual([1932, 1931]);
  });

  it('carries cash and debt into the money of the season that follows (→ECON-6)', () => {
    const w = world();
    const target = club(w, 'FRA', 0);
    w.year = 1998;
    target.books = { seasons: [], cash: '0', debt: (10n ** 12n).toString() };
    const books = settleNpcBooks(w, target);
    const [book] = books.seasons;
    expect(currency('FRA', 1998).code).not.toBe(currency('FRA', 1999).code);
    // The season's own amounts stay in francs; the balance is in euros, far fewer units.
    expect(amount(books.debt)).toBeLessThan(10n ** 12n - amount(book!.result));
    expect(books.debt).toBe(
      currencyChange('FRA', 1998, 1999)!(scaleBy(book!.income, CLUB_BOOKS.debtSeasons, 1000n)),
    );
  });

  it('is cleared by a takeover or a project between seasons (→LEAGUE-10)', () => {
    const w = world();
    const league = w.clubs.filter((c) => keepsBooks(w, c));
    for (const c of league) c.books = { seasons: [], cash: '0', debt: '1000' };
    const before = new Map(league.map((c) => [c.id, c.project]));
    evolveClubs(w, new Map(w.clubs.map((c) => [c.id, c.tier])));
    const cleared = league.filter((c) => c.books!.debt === '0');
    // About 1.9% of clubs a summer: some cleared, most still owing.
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared.length).toBeLessThan(league.length / 4);
    for (const c of league)
      if (c.project !== undefined && before.get(c.id) === undefined)
        expect(c.books!.debt).toBe('0');
    const one = league.find((c) => c.books!.debt !== '0')!;
    clearDebt(one);
    expect(one.books!.debt).toBe('0');
  });

  it('closes for every league club nobody owns, and never in a career without owner state', () => {
    const w = world();
    booksClose(w);
    const kept = w.clubs.filter((c: Club) => c.books);
    expect(kept.length).toBe(w.clubs.filter((c) => !c.representative).length);
    expect(kept.every((c) => !c.id.startsWith('euro:'))).toBe(true);
    const career = careerWorld({ seed: 'npc-books' }, DISABLED_RELEASE);
    const unowned = structuredClone(career);
    delete unowned.owner;
    for (const c of unowned.clubs) delete c.books;
    booksClose(unowned);
    expect(unowned.clubs.some((c) => c.books)).toBe(false);
    // A taken-over career keeps books for every club but the owner's.
    booksClose(career);
    expect(career.clubs.find((c) => c.id === career.playerClub)!.books).toBeUndefined();
    expect(career.clubs.filter((c) => c.books).length).toBeGreaterThan(0);
  });

  it('reads the following its reputation commands, never the stored founding figure (→CLUB-1)', () => {
    const w = world();
    const top = club(w, 'ENG', 0);
    w.clubs = [top];
    w.fixtures = w.fixtures.filter((f) => f.home === top.id || f.away === top.id);
    const lines = (fans: number) => {
      top.fans = fans;
      return bookIncomeLines(w, top);
    };
    const stale = lines(800),
      followed = lines(fanFollowing(top.reputation));
    expect(lines(5_000_000)).toEqual(followed);
    expect(stale).toEqual(followed);
    // A top club's following fills more seats and draws better sponsors than its founding figure.
    expect(followed.gate).toBeGreaterThan(0n);
    expect(fanFollowing(top.reputation)).toBeGreaterThan(18_000);
  });

  it('reads a club nobody owns at its division and stature facility stage (→CLUB-1)', () => {
    const w = world();
    const giant = w.clubs
      .filter((c) => !c.representative && c.tier === 0)
      .sort((a, b) => b.strength - a.strength)[0]!;
    const stage = facilityStage(w, giant);
    expect(stage.stadium).toBeGreaterThanOrEqual(5);
    expect(facilityStage(w, club(w, 'ENG', 3)).stadium).toBeLessThan(stage.stadium);
  });
});
