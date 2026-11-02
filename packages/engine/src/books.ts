/**
 * Season books of every club nobody owns (→ECON-36): at each close its season's income (league
 * distribution, gate, commercial income), wage bill and operating expenses, summed over the season
 * from the scales the owner's club uses, settle into its cash; cash below zero is debt. A club
 * nobody owns never goes bankrupt, and a takeover or project of LEAGUE-10 clears its debt. The
 * current and the last closed season are kept (→SAVE-27).
 */
import type { Club, ClubBooks, ClubSeasonBook, World } from '../../contracts/src/types';
import { COUNTRIES, currency, SPONSOR_SLOTS } from '../../catalogs/src/index';
import {
  DISTRIBUTION_CONFIG,
  EXPENSE_CONFIG,
  gateProjection,
  leagueMerit,
  leagueShare,
  operatingExpensesAt,
} from './finance';
import { sponsorOffers, sponsorSlotOpen } from './sponsors';
import { marketWageAt } from './market-prices';
import { ranked } from './season';
import { groupKey } from './league-fixtures';
import { squad } from './world';
import { facilityStage } from './club-value';
import { DEFAULT_TICKET } from './presets';
import { ratio, scaleBy } from './primitives';
import { seasonAfter } from './wartime';
import { hasOwner } from './owner';

/** Whether a club keeps books: a league club of a playable country that is not the owner's. */
export function keepsBooks(w: World, club: Club) {
  return (
    club.id !== w.playerClub &&
    !club.representative &&
    COUNTRIES.some((country) => country.code === club.country)
  );
}

/**
 * Every club nobody owns closes the season's books (→ECON-36), at the close once its matches
 * are played and before anyone moves division. A founded career keeps none: only a world before
 * the takeover and a taken-over career (an owner) keep books, never for the owner's club.
 */
export function booksClose(w: World) {
  if (hasOwner(w) && !w.owner) return;
  for (const club of w.clubs) if (keepsBooks(w, club)) settleNpcBooks(w, club);
}

/**
 * One club's season book, settled into its cash and debt, then carried into the money of the
 * season that follows (→ECON-6). The season's amounts are in the money it was played in.
 */
export function settleNpcBooks(w: World, club: Club) {
  const books = club.books ?? { seasons: [], cash: '0', debt: '0' };
  const book = seasonBook(w, club, books);
  const balance = BigInt(books.cash) - BigInt(books.debt) + BigInt(book.result);
  const next = currencyChange(club.country, w.year, seasonAfter(w.year));
  const carried = next ? next(balance.toString()) : balance.toString();
  club.books = {
    seasons: [book, ...books.seasons].slice(0, 2),
    cash: BigInt(carried) > 0n ? carried : '0',
    debt: BigInt(carried) < 0n ? (-BigInt(carried)).toString() : '0',
  };
  return club.books;
}

/** A takeover or project of LEAGUE-10 clears a club's debt (→ECON-36). */
export function clearDebt(club: Club) {
  if (club.books && club.books.debt !== '0') club.books = { ...club.books, debt: '0' };
}

/** The season's income, wages and operating expenses of `club`, in this season's money. */
function seasonBook(w: World, club: Club, books: ClubBooks): ClubSeasonBook {
  const view = clubView(w, club);
  const last = books.seasons[0];
  const tierBefore = last && lastTier(w, club, last.year);
  const income =
    distribution(w, view, club, tierBefore) + gateIncome(w, view, club) + commercial(view);
  const wages = squad(w, club).reduce(
    (sum, p) => sum + BigInt(marketWageAt(club.country, w.year, club.tier, p)),
    0n,
  );
  const costs = BigInt(operatingExpenses(w, club, last, tierBefore));
  return {
    year: w.year,
    income: income.toString(),
    wages: wages.toString(),
    costs: costs.toString(),
    result: (income - wages - costs).toString(),
  };
}

/**
 * The world as one club nobody owns would read it through the owner's scales: that club in the
 * owner's place, at the default ticket price, at its facility stage (→ECON-38, CLUB-1), with no
 * squad, history, campaign, sponsor, policy or build of its own, so every own-club setting is at
 * its neutral default and every number comes from the owner's functions.
 */
function clubView(w: World, club: Club): World {
  const { stadium } = facilityStage(w, club);
  return {
    ...w,
    playerClub: club.id,
    lower: false,
    ticket: DEFAULT_TICKET,
    stadium,
    facilityWorks: undefined,
    ownMatches: [],
    history: [],
    players: [],
    campaigns: [],
    sponsors: [],
    policy: undefined,
    build: undefined,
    direction: undefined,
    localBase: undefined,
    globalReach: undefined,
  };
}

/** The division a club played in during the season `year`, from that season's archive. */
function lastTier(w: World, club: Club, year: number) {
  const index = w.clubs.indexOf(club);
  return w.history.find((h) => h.year === year)?.standings.find((row) => row[0] === index)?.[1];
}

/**
 * The league distribution (→ECON-28): the division's equal share, the merit by the final rank
 * in its league and, the season after a relegation, half the share it lost.
 */
function distribution(w: World, view: World, club: Club, tierBefore: number | undefined) {
  const league = w.clubs.filter((c) => !c.representative && groupKey(c) === groupKey(club));
  const rank = ranked(w, league).indexOf(club) + 1;
  const parachute =
    tierBefore !== undefined && tierBefore < club.tier
      ? scaleBy(
          (BigInt(leagueShare(view, tierBefore)) - BigInt(leagueShare(view))).toString(),
          DISTRIBUTION_CONFIG.parachute,
          1000n,
        )
      : '0';
  return (
    BigInt(leagueShare(view)) + BigInt(leagueMerit(view, rank, league.length)) + BigInt(parachute)
  );
}

/** Every home league gate of the season at its division and reputation (→ECON-9). */
function gateIncome(w: World, view: World, club: Club) {
  const games = w.fixtures.filter((f) => f.kind === 'league' && f.home === club.id).length;
  const gate = gateProjection(view);
  return ((BigInt(gate.incomeLow) + BigInt(gate.incomeHigh)) * BigInt(games)) / 2n;
}

/** A year of commercial income: each open slot's stable (guaranteed) offer on its following (→ECON-8). */
function commercial(view: World) {
  let total = 0n;
  for (const slot of SPONSOR_SLOTS) {
    if (!sponsorSlotOpen(view, slot)) continue;
    const offer = sponsorOffers(view, slot).find((one) => one.kind === 'stable');
    if (offer) total += BigInt(offer.annual);
  }
  return total;
}

/**
 * Operating expenses (→ECON-30): the division's amount, or a share of last season's turnover
 * when larger; a club's first season and the season after a relegation pay the division amount.
 */
function operatingExpenses(
  w: World,
  club: Club,
  last: ClubSeasonBook | undefined,
  tierBefore: number | undefined,
) {
  const floor = operatingExpensesAt(club.country, w.year, club.tier);
  if (!last || tierBefore === undefined || tierBefore < club.tier) return floor;
  const change = currencyChange(club.country, last.year, w.year);
  const turnover = change ? change(last.income) : last.income;
  const share = scaleBy(turnover, EXPENSE_CONFIG.share, 10000n);
  return BigInt(share) > BigInt(floor) ? share : floor;
}

/** The conversion of an amount from `from`'s money into `to`'s, when the club's currency changes. */
function currencyChange(code: string, from: number, to: number) {
  const before = currency(code, from),
    after = currency(code, to);
  if (before.code === after.code) return undefined;
  return (amount: string) =>
    ratio(
      amount,
      after.num * before.den * BigInt(after.units),
      after.den * before.num * BigInt(before.units),
    );
}
