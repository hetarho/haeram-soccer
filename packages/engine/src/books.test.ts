import { describe, expect, it } from 'vitest';
import type { Club, World } from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { booksClose, clearDebt, keepsBooks, settleNpcBooks } from './books';
import { facilityStage } from './club-value';
import { historyWorld } from './history';
import { createWorld } from './founding';
import { evolveClubs } from './dynamics';
import { operatingExpensesAt } from './finance';
import { withOwner } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** An ownerless world on its first season's first day, its tables as they stand (all level). */
const world = (seed = 'npc-books') => historyWorld(seed, DISABLED_RELEASE);
const club = (w: World, country: string, tier: number) =>
  w.clubs.find((c) => c.country === country && c.tier === tier && !c.representative)!;
const amount = (value: string) => BigInt(value);

describe('season books of clubs nobody owns (→ECON-36)', () => {
  it('settle a season from the owner scales: income, wages, operating expenses and result', () => {
    const w = world();
    const top = club(w, 'ENG', 0),
      third = club(w, 'ENG', 2);
    const [a, b] = [settleNpcBooks(w, top), settleNpcBooks(w, third)];
    for (const books of [a, b]) {
      const [book] = books.seasons;
      expect(book!.year).toBe(w.year);
      expect(amount(book!.income)).toBeGreaterThan(0n);
      expect(amount(book!.wages)).toBeGreaterThan(0n);
      expect(amount(book!.result)).toBe(
        amount(book!.income) - amount(book!.wages) - amount(book!.costs),
      );
      // Nothing before the first season: the result is the whole balance.
      expect(amount(books.cash) - amount(books.debt)).toBe(amount(book!.result));
    }
    // A first season pays its division's operating expenses (→ECON-30).
    expect(a.seasons[0]!.costs).toBe(operatingExpensesAt('ENG', w.year, 0));
    expect(b.seasons[0]!.costs).toBe(operatingExpensesAt('ENG', w.year, 2));
    // The top flight earns and pays more than the third division.
    expect(amount(a.seasons[0]!.income)).toBeGreaterThan(amount(b.seasons[0]!.income));
    expect(amount(a.seasons[0]!.wages)).toBeGreaterThan(amount(b.seasons[0]!.wages));
  });

  it('keeps cash below zero as debt, and never ends a club for it', () => {
    const w = world();
    const target = club(w, 'ESP', 1);
    // The season's result on its own, then the same season over a balance.
    const result = amount(settleNpcBooks(w, target).seasons[0]!.result);
    const huge = 10n ** 15n;
    target.books = { seasons: [], cash: '0', debt: huge.toString() };
    const indebted = settleNpcBooks(w, target);
    expect(indebted.cash).toBe('0');
    expect(amount(indebted.debt)).toBe(huge - result);
    target.books = { seasons: [], cash: huge.toString(), debt: '0' };
    const rich = settleNpcBooks(w, target);
    expect([amount(rich.cash), rich.debt]).toEqual([huge + result, '0']);
    expect(w.bankrupt).toBeUndefined();
    expect(w.clubs).toContain(target);
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
    expect(amount(books.debt)).toBeGreaterThan(0n);
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

  it('closes for every league club nobody owns, and never in a founded career', () => {
    const w = world();
    booksClose(w);
    const kept = w.clubs.filter((c: Club) => c.books);
    expect(kept.length).toBe(w.clubs.filter((c) => !c.representative).length);
    expect(kept.every((c) => !c.id.startsWith('euro:'))).toBe(true);
    const founded = createWorld(
      { country: 'ENG', name: 'Book Town', color: '#334455', seed: 'npc-books', level: 'normal' },
      DISABLED_RELEASE,
    );
    booksClose(founded);
    expect(founded.clubs.some((c) => c.books)).toBe(false);
    // A taken-over career keeps books for every club but the owner's.
    withOwner(founded);
    booksClose(founded);
    expect(founded.clubs.find((c) => c.id === founded.playerClub)!.books).toBeUndefined();
    expect(founded.clubs.filter((c) => c.books).length).toBeGreaterThan(0);
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
