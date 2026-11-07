import { afterEach, describe, expect, it } from 'vitest';
import type {
  Club,
  DomesticCup,
  EuropeTournament,
  Fixture,
  MatchRecord,
  World,
} from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { fanFollowing } from './fans';
import {
  BOOK_COMPETITIONS,
  bookCompetitionMoney,
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
import { evolveClubs, MEANS_LEVEL } from './dynamics';
import { STAR_SPREAD_CONFIG } from './market-prices';
import {
  EXPENSE_CONFIG,
  FINANCE_CONFIG,
  leagueMatchFactor,
  matchBonus,
  operatingExpensesAt,
  resultBonus,
} from './finance';
import { CUP_PRIZE_CONFIG, cupTiePrize, cupTitlePrize } from './cups';
import { EUROPE_PRIZE_CONFIG, europeMatchPrize, europeTiePrize, europeTitlePrize } from './europe';
import { broadcastQuote } from './quotes';
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

/**
 * A small competition season for one English top-flight club (`top`): an eight-club cup it wins
 * (a home quarter-final 2–1, an away semi-final 1–1 won on penalties, a home final 1–0) and a
 * continental competition with two group matches (a home win, an away defeat) and a two-legged
 * knockout tie it loses (a home draw, an away defeat). Synthetic, on the ownerless 1930 world.
 */
function competitionSeason(seed = 'npc-books-cups') {
  const w = world(seed);
  const eng = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0 && !c.representative);
  const [top, a, b, c, d, e] = eng as [Club, Club, Club, Club, Club, Club];
  const fixture = (id: string, kind: Fixture['kind'], home: Club, away: Club, score: number[]) =>
    ({
      id,
      year: w.year,
      round: 5,
      kind,
      home: home.id,
      away: away.id,
      country: kind === 'cup' ? 'ENG' : 'UEFA',
      groupKey: kind === 'cup' ? 'cup:ENG' : 'ucl',
      score: { home: score[0]!, away: score[1]! },
    }) as Fixture;
  const cup: DomesticCup = {
    country: 'ENG',
    name: 'FA Cup',
    clubs: eng.slice(0, 8).map((one) => one.id),
    rounds: [
      { label: '8강', round: 28, legs: 1, ties: [{ home: top.id, away: a.id, winner: top.id }] },
      {
        label: '4강',
        round: 35,
        legs: 1,
        ties: [{ home: b.id, away: top.id, winner: top.id, decided: 'pens' }],
      },
      { label: '결승', round: 42, legs: 1, ties: [{ home: top.id, away: c.id, winner: top.id }] },
    ],
    fixtures: [
      fixture('1930:cup:ENG:k0:0', 'cup', top, a, [2, 1]),
      fixture('1930:cup:ENG:k1:0', 'cup', b, top, [1, 1]),
      fixture('1930:cup:ENG:k2:0', 'cup', top, c, [1, 0]),
    ],
    winner: top.id,
  };
  const europe = {
    key: 'ucl',
    name: 'European Cup',
    field: 16,
    format: 'groups',
    games: 6,
    stage: '우승 확정',
    clubs: [top.id, d.id, e.id],
    fixtures: [
      fixture('1930:ucl:phase:0:0', 'europe', top, d, [3, 0]),
      fixture('1930:ucl:phase:1:0', 'europe', e, top, [2, 0]),
      fixture('1930:ucl:k0:0', 'europe', top, e, [1, 1]),
      fixture('1930:ucl:k0:0:2', 'europe', e, top, [1, 0]),
    ],
    standings: {},
    rounds: [
      { label: '8강', round: 31, legs: 2, ties: [{ home: top.id, away: e.id, winner: e.id }] },
    ],
    winner: e.id,
  } as EuropeTournament;
  w.cups = [cup];
  w.europe = [europe];
  return { w, top, a, cup };
}

describe('competition money in the books (→ECON-36, LEAGUE-5, EURO-7)', () => {
  // Production's value, restored after every case that switches it.
  const inForce = BOOK_COMPETITIONS.inForce;
  afterEach(() => {
    BOOK_COMPETITIONS.inForce = inForce;
    delete BOOK_COMPETITIONS.observe;
  });

  it('enters production only with CLUB-48’s table and LEAGUE-10’s means level, never alone', () => {
    const table =
      Object.keys(STAR_SPREAD_CONFIG.own).length > 0 ||
      STAR_SPREAD_CONFIG.shared.some(([, s]) => s < 1);
    expect(BOOK_COMPETITIONS.inForce).toBe(table);
    expect(MEANS_LEVEL.inForce).toBe(table);
  });

  it('prices every prize and bonus by the helpers the owner is paid by', () => {
    const { w } = competitionSeason();
    const y = w.year;
    // The helpers are the configs' rules on the broadcasting index (→ECON-31).
    expect(cupTiePrize('ENG', y, 1)).toBe(broadcastQuote('ENG', y, CUP_PRIZE_CONFIG.ties[0]!));
    expect(cupTiePrize('ENG', y, 9)).toBe(broadcastQuote('ENG', y, CUP_PRIZE_CONFIG.ties.at(-1)!));
    expect(cupTiePrize('ENG', y, 0)).toBe('0');
    expect(cupTitlePrize('ENG', y)).toBe(broadcastQuote('ENG', y, CUP_PRIZE_CONFIG.honor));
    const pay = EUROPE_PRIZE_CONFIG;
    expect(europeMatchPrize('ENG', y, 'win')).toBe(broadcastQuote('ENG', y, pay.match + pay.win));
    expect(europeMatchPrize('ENG', y, 'draw')).toBe(broadcastQuote('ENG', y, pay.match + pay.draw));
    expect(europeMatchPrize('ENG', y, 'loss')).toBe(broadcastQuote('ENG', y, pay.match));
    expect(europeTiePrize('ENG', y)).toBe(broadcastQuote('ENG', y, pay.knockout));
    expect(europeTitlePrize('ENG', y)).toBe(broadcastQuote('ENG', y, pay.honor));
    expect(resultBonus('ENG', y, 0, 'win')).toBe(
      broadcastQuote('ENG', y, FINANCE_CONFIG.winBonus * 2.05),
    );
    expect(resultBonus('ENG', y, 5, 'draw')).toBe(
      broadcastQuote('ENG', y, FINANCE_CONFIG.drawBonus),
    );
    expect(resultBonus('ENG', y, 0, 'loss')).toBe('0');
    // The owner's cup or continental result money is the same rule for the same match.
    const second = w.clubs.find((one) => one.tier === 1 && one.country === 'ENG')!;
    const owned = { ...w, playerClub: second.id };
    for (const [score, result] of [
      [{ home: 2, away: 1 }, 'win'],
      [{ home: 1, away: 1 }, 'draw'],
    ] as const) {
      const match = { home: second.id, away: 'x', score, kind: 'cup' } as MatchRecord;
      expect(matchBonus(owned, match).amount).toBe(resultBonus('ENG', y, 1, result));
    }
  });

  it('sums each prize kind, each result bonus and one unscaled gate a home match', () => {
    const { w, top } = competitionSeason();
    const y = w.year,
      n = (value: string) => BigInt(value);
    const money = bookCompetitionMoney(w, top);
    expect(money.prizes).toBe(
      n(cupTiePrize('ENG', y, 2)) +
        n(cupTiePrize('ENG', y, 1)) +
        n(cupTitlePrize('ENG', y)) +
        n(europeMatchPrize('ENG', y, 'win')) +
        n(europeMatchPrize('ENG', y, 'loss')) +
        n(europeTiePrize('ENG', y)),
    );
    const results = ['win', 'draw', 'win', 'win', 'loss', 'draw', 'loss'] as const;
    expect(money.bonuses).toBe(
      results.reduce((sum, r) => sum + n(resultBonus('ENG', y, top.tier, r)), 0n),
    );
    // Four home matches: the cup's quarter-final and final, a group match, the tie's first leg.
    expect(money.gates % 4n).toBe(0n);
    const one = money.gates / 4n;
    expect(one).toBeGreaterThan(0n);
    expect(money.total).toBe(money.prizes + money.bonuses + money.gates);
    // One gate is the book's league gate a match at scale 1 (→ECON-19), rounding apart.
    const own = w.fixtures.filter((f) => f.home === top.id || f.away === top.id);
    const homeGames = own.filter((f) => f.kind === 'league' && f.home === top.id).length;
    const league = bookIncomeLines(w, top).gate / BigInt(homeGames);
    const factor = leagueMatchFactor({ ...w, fixtures: own, playerClub: top.id });
    expect(factor).toBeGreaterThan(1);
    expect(Math.abs(Number(league) - Number(one) * factor)).toBeLessThanOrEqual(3);
  });

  it('adds a gate only at home, nothing for a club without them or for league matches', () => {
    const { w, top, a, cup } = competitionSeason();
    const before = bookCompetitionMoney(w, top);
    // The first cup tie away instead of at home: one gate fewer, prizes and bonuses as before.
    const first = cup.fixtures[0]!;
    [first.home, first.away] = [first.away, first.home];
    first.score = { home: first.score!.away, away: first.score!.home };
    const away = bookCompetitionMoney(w, top);
    expect([away.prizes, away.bonuses]).toEqual([before.prizes, before.bonuses]);
    expect(away.gates).toBe((before.gates / 4n) * 3n);
    // The opponent beaten in that tie, now at home, earns its gate and no prize.
    const loser = bookCompetitionMoney(w, a);
    expect(loser.prizes).toBe(0n);
    expect(loser.bonuses).toBe(0n);
    expect(loser.gates).toBeGreaterThan(0n);
    // A club without cup or continental matches adds nothing; league results change nothing.
    const idle = w.clubs.find(
      (one) => one.country === 'GER' && !one.representative && !cup.clubs.includes(one.id),
    )!;
    const none = { prizes: 0n, bonuses: 0n, gates: 0n, total: 0n };
    expect(bookCompetitionMoney(w, idle)).toEqual(none);
    for (const f of w.fixtures) f.score = { home: 3, away: 0 };
    expect(bookCompetitionMoney(w, top)).toEqual(away);
    // Without its cups and continental competitions the same club adds nothing.
    w.cups = [];
    w.europe = [];
    expect(bookCompetitionMoney(w, top)).toEqual(none);
  });

  it('leaves every book released with the switch off, observed or not', () => {
    BOOK_COMPETITIONS.inForce = false;
    const released = competitionSeason();
    released.w.cups = [];
    released.w.europe = [];
    const off = competitionSeason(),
      observed = competitionSeason();
    const seen = new Map<string, bigint>();
    BOOK_COMPETITIONS.observe = (one, money) => seen.set(one.id, money.total);
    booksClose(observed.w);
    delete BOOK_COMPETITIONS.observe;
    booksClose(off.w);
    booksClose(released.w);
    const books = (w: World) => w.clubs.map((one) => one.books);
    expect(books(off.w)).toEqual(books(released.w));
    expect(books(observed.w)).toEqual(books(released.w));
    expect(seen.get(observed.top.id)).toBe(bookCompetitionMoney(off.w, off.top).total);
    expect(seen.get(observed.top.id)).toBeGreaterThan(0n);
  });

  it('counts it in the income while in force, and next season’s operating share reads it (→ECON-30)', () => {
    const released = competitionSeason(),
      counted = competitionSeason();
    for (const { top } of [released, counted]) top.books = { seasons: [], cash: '0', debt: '0' };
    const money = bookCompetitionMoney(counted.w, counted.top).total;
    BOOK_COMPETITIONS.inForce = false;
    const plain = settleNpcBooks(released.w, released.top).seasons[0]!;
    BOOK_COMPETITIONS.inForce = true;
    const book = settleNpcBooks(counted.w, counted.top).seasons[0]!;
    expect(BigInt(book.income)).toBe(BigInt(plain.income) + money);
    expect([book.wages, book.costs]).toEqual([plain.wages, plain.costs]);
    expect(bookIncomeLines(counted.w, counted.top).competitions).toBe(money);
    // The next season in the same division pays the larger of its amount and that income's share.
    const { w, top } = counted;
    w.history = [
      { year: w.year, standings: [[w.clubs.indexOf(top), top.tier]] },
    ] as unknown as World['history'];
    w.year += 1;
    w.cups = [];
    w.europe = [];
    const next = settleNpcBooks(w, top).seasons[0]!;
    const floor = operatingExpensesAt('ENG', w.year, top.tier);
    const share = scaleBy(book.income, EXPENSE_CONFIG.share, 10000n);
    expect(BigInt(share)).toBeGreaterThan(BigInt(floor));
    expect(next.costs).toBe(share);
    expect(BigInt(next.costs)).toBeGreaterThan(
      BigInt(scaleBy(plain.income, EXPENSE_CONFIG.share, 10000n)),
    );
  });
});
