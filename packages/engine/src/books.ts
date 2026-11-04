/**
 * Season books of every club nobody owns (→ECON-36): at each close its season's income (league
 * distribution, gate, commercial income), wage bill and operating expenses, summed over the season
 * from the scales the owner's club uses, settle into its cash; cash below zero is debt. A club
 * nobody owns never goes bankrupt, and a takeover or project of LEAGUE-10 clears its debt. The
 * current and the last closed season are kept (→SAVE-27).
 */
import type { Club, ClubBooks, ClubSeasonBook, Fixture, World } from '../../contracts/src/types';
import { COUNTRIES, currency, SPONSOR_SLOTS } from '../../catalogs/src/index';
import {
  DISTRIBUTION_CONFIG,
  EXPENSE_CONFIG,
  gateProjection,
  leagueMerit,
  leagueShare,
  operatingExpensesAt,
  resultBonus,
  type MatchResult,
} from './finance';
import { cupRoundsLeft, cupTiePrize, cupTitlePrize } from './cups';
import {
  europeMatchPrize,
  europeTiePrize,
  europeTitlePrize,
  isKnockout,
  paysTitle,
} from './europe';
import { footballQuote } from './quotes';
import { sponsorOffers, sponsorSlotOpen } from './sponsors';
import { marketWageAt } from './market-prices';
import { ranked } from './season';
import { groupKey } from './league-fixtures';
import { squad } from './world';
import { clubFollowing, facilityStage } from './club-value';
import { DEFAULT_TICKET } from './presets';
import { ratio, scaleBy } from './primitives';
import { seasonAfter } from './wartime';
import { hasOwner } from './owner';
import { CLUB_BOOKS } from './owner-config';

/**
 * ECON-36's competition money: a book counts its club's domestic cup and continental matches as
 * the owner's club is paid for them (`bookCompetitionMoney`). In force only together with
 * CLUB-48's table (`STAR_SPREAD_CONFIG`) and LEAGUE-10's means level (`MEANS_LEVEL`), set with
 * them through CLUB-48's gate, never alone; until then a book's income is its league distribution,
 * league gate and commercial income. `observe` is a measurement hook, never a setting: at each
 * close it is given every book's competition money and its income without it.
 */
export const BOOK_COMPETITIONS: {
  inForce: boolean;
  observe?: (club: Club, money: CompetitionMoney, released: bigint) => void;
} = { inForce: false };

/** A book's competition money in the season's money: prizes, result bonuses and home gates. */
export interface CompetitionMoney {
  /** Cup tie and title prizes, continental match, tie and title prizes (→LEAGUE-5, EURO-7). */
  prizes: bigint;
  /** Each cup and continental match's result bonus (→ECON-19). */
  bonuses: bigint;
  /** Each cup and continental home match's gate, without the league-match scaling (→ECON-9). */
  gates: bigint;
  total: bigint;
}

/** Whether a club keeps books: a league club of a playable country that is not the owner's. */
export function keepsBooks(w: World, club: Club) {
  return (
    club.id !== w.playerClub &&
    !club.representative &&
    COUNTRIES.some((country) => country.code === club.country)
  );
}

/** The world's first day: half a season's income in cash, with no closed season invented. */
export function booksOpen(w: World) {
  const season = seasonIndex(w);
  for (const club of w.clubs) {
    if (!keepsBooks(w, club) || club.books) continue;
    club.books = {
      seasons: [],
      cash: scaleBy(seasonIncome(w, club, undefined, season).toString(), CLUB_BOOKS.opening, 1000n),
      debt: '0',
    };
  }
}

/**
 * Every club nobody owns closes the season's books (→ECON-36), at the close once its matches
 * are played and before anyone moves division. A founded career keeps none: only a world before
 * the takeover and a taken-over career (an owner) keep books, never for the owner's club.
 */
export function booksClose(w: World) {
  if (hasOwner(w) && !w.owner) return;
  const season = seasonIndex(w);
  for (const club of w.clubs) if (keepsBooks(w, club)) settleNpcBooks(w, club, season);
}

/**
 * The season as every book reads it, indexed once a close (T669): each club's fixtures and each
 * league's clubs in their final order, so no book scans every fixture or club of the world.
 */
interface SeasonIndex {
  fixtures: Map<string, Fixture[]>;
  leagues: Map<string, Club[]>;
  /** Each club's cup and continental matches, built only while competition money is read. */
  competitions?: Map<string, CompetitionRecord>;
}

/**
 * One club's cup and continental season as the owner's club is paid for it: each cup tie won with
 * the rounds left after it, its cup titles, each continental phase match's result, each knockout
 * tie played (qualifiers and the Super Cup's included), each continental title that pays, and every
 * paid match's result and whether it was at home. The Super Cup, a single match at the close, pays
 * its tie and no result bonus or gate, as the owner's is paid (→EURO-10).
 */
interface CompetitionRecord {
  cupTies: number[];
  cupTitles: number;
  phaseMatches: MatchResult[];
  knockoutTies: number;
  titles: number;
  results: MatchResult[];
  homeMatches: number;
}
const resultOf = (own: number, other: number): MatchResult =>
  own > other ? 'win' : own === other ? 'draw' : 'loss';

/** Every club's cup and continental record of the closing season, from `w.cups` and `w.europe`. */
function competitionIndex(w: World) {
  const records = new Map<string, CompetitionRecord>();
  const of = (id: string) => {
    let record = records.get(id);
    if (!record)
      records.set(
        id,
        (record = {
          cupTies: [],
          cupTitles: 0,
          phaseMatches: [],
          knockoutTies: 0,
          titles: 0,
          results: [],
          homeMatches: 0,
        }),
      );
    return record;
  };
  const paid = (f: Fixture, phase: boolean) => {
    if (!f.score) return;
    for (const [id, own, other] of [
      [f.home, f.score.home, f.score.away],
      [f.away, f.score.away, f.score.home],
    ] as const) {
      const record = of(id),
        result = resultOf(own, other);
      record.results.push(result);
      if (phase) record.phaseMatches.push(result);
    }
    of(f.home).homeMatches++;
  };
  for (const cup of w.cups ?? []) {
    cup.rounds.forEach((round, index) => {
      const left = cupRoundsLeft(cup.clubs.length, index);
      for (const tie of round.ties) if (tie.winner && left > 0) of(tie.winner).cupTies.push(left);
    });
    if (cup.winner) of(cup.winner).cupTitles++;
    for (const f of cup.fixtures) paid(f, false);
  }
  for (const t of w.europe ?? []) {
    for (const round of t.rounds ?? [])
      for (const tie of round.ties)
        if (tie.winner) {
          of(tie.home).knockoutTies++;
          of(tie.away).knockoutTies++;
        }
    if (t.winner && paysTitle(t)) of(t.winner).titles++;
    // The Super Cup is played out at the close without a match settlement (`finishEurope`).
    if (t.key === 'super') continue;
    for (const f of t.fixtures) paid(f, !isKnockout(f.id));
  }
  return records;
}

function seasonIndex(w: World): SeasonIndex {
  const fixtures = new Map<string, Fixture[]>();
  for (const f of w.fixtures)
    for (const id of [f.home, f.away]) {
      const list = fixtures.get(id);
      if (list) list.push(f);
      else fixtures.set(id, [f]);
    }
  const groups = new Map<string, Club[]>();
  for (const c of w.clubs) {
    if (c.representative) continue;
    const key = groupKey(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  const leagues = new Map([...groups].map(([key, clubs]) => [key, ranked(w, clubs)]));
  const reads = BOOK_COMPETITIONS.inForce || BOOK_COMPETITIONS.observe;
  return { fixtures, leagues, ...(reads ? { competitions: competitionIndex(w) } : {}) };
}

/**
 * One club's season book, settled into its cash and debt, then carried into the money of the
 * season that follows (→ECON-6). The season's amounts are in the money it was played in.
 */
export function settleNpcBooks(w: World, club: Club, season: SeasonIndex = seasonIndex(w)) {
  const books = club.books ?? { seasons: [], cash: '0', debt: '0' };
  const book = seasonBook(w, club, books, season);
  const result = BigInt(books.cash) - BigInt(books.debt) + BigInt(book.result);
  const ceiling = BigInt(scaleBy(book.income, CLUB_BOOKS.cashSeasons, 1000n)),
    floor = -BigInt(scaleBy(book.income, CLUB_BOOKS.debtSeasons, 1000n));
  const balance = result > ceiling ? ceiling : result < floor ? floor : result;
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
function seasonBook(w: World, club: Club, books: ClubBooks, season: SeasonIndex): ClubSeasonBook {
  const last = books.seasons[0];
  const tierBefore = last && lastTier(w, club, last.year);
  const income = seasonIncome(w, club, tierBefore, season, true);
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
 * Opening cash and closing books use exactly the same season-income scales; at a close
 * (`observe`) the competition money is handed to `BOOK_COMPETITIONS.observe`.
 */
function seasonIncome(
  w: World,
  club: Club,
  tierBefore: number | undefined,
  season: SeasonIndex,
  observe = false,
) {
  const { lines, money } = incomeLines(w, club, tierBefore, season);
  const released = lines.distribution + lines.gate + lines.commercial;
  if (observe && money) BOOK_COMPETITIONS.observe?.(club, money, released);
  return released + lines.competitions;
}
function incomeLines(w: World, club: Club, tierBefore: number | undefined, season: SeasonIndex) {
  const view = clubView(w, club, season.fixtures.get(club.id) ?? []);
  const money =
    season.competitions && competitionMoney(view, club, season.competitions.get(club.id));
  return {
    lines: {
      distribution: distribution(view, club, tierBefore, season.leagues.get(groupKey(club))!),
      gate: gateIncome(view, club),
      commercial: commercial(view),
      /** Cup and continental money, in the income only while competition money is in force. */
      competitions: BOOK_COMPETITIONS.inForce && money ? money.total : 0n,
    },
    money,
  };
}
/**
 * The income lines a book would settle for `club` this season (→ECON-36), read for measuring the
 * books against an owned club's own season; nothing is written.
 */
export function bookIncomeLines(w: World, club: Club, tierBefore?: number) {
  return incomeLines(w, club, tierBefore, seasonIndex(w)).lines;
}

/**
 * The closing season's domestic cup and continental money of `club` (→ECON-36) as the owner's
 * club is paid for it, every prize and bonus on its country's broadcasting index (→ECON-31):
 * each cup tie won by the rounds left after it and the cup title (`CUP_PRIZE_CONFIG`); each
 * continental phase match with its draw or win, each knockout tie played (qualifiers and the Super
 * Cup's included) and each continental title (`EUROPE_PRIZE_CONFIG`); each match's result bonus
 * at its division's prestige; each home match's gate at its division and reputation without the
 * league-match scaling. League matches add nothing. Read whether or not it is in force.
 */
export function bookCompetitionMoney(w: World, club: Club): CompetitionMoney {
  const view = clubView(
    w,
    club,
    w.fixtures.filter((f) => f.home === club.id || f.away === club.id),
  );
  return competitionMoney(view, club, competitionIndex(w).get(club.id));
}
function competitionMoney(
  view: World,
  club: Club,
  record: CompetitionRecord | undefined,
): CompetitionMoney {
  if (!record) return { prizes: 0n, bonuses: 0n, gates: 0n, total: 0n };
  const code = club.country,
    year = view.year;
  const sum = (amounts: string[]) => amounts.reduce((total, a) => total + BigInt(a), 0n);
  const prizes =
    sum(record.cupTies.map((left) => cupTiePrize(code, year, left))) +
    BigInt(cupTitlePrize(code, year)) * BigInt(record.cupTitles) +
    sum(record.phaseMatches.map((result) => europeMatchPrize(code, year, result))) +
    BigInt(europeTiePrize(code, year)) * BigInt(record.knockoutTies) +
    BigInt(europeTitlePrize(code, year)) * BigInt(record.titles);
  const bonuses = sum(record.results.map((result) => resultBonus(code, year, club.tier, result)));
  const gates = record.homeMatches ? unscaledGate(view) * BigInt(record.homeMatches) : 0n;
  return { prizes, bonuses, gates, total: prizes + bonuses + gates };
}

/**
 * A cup or continental home match's gate (→ECON-9, ECON-19): the book's league gate (the
 * midpoint of `gateProjection`) at scale 1, the gate the owner's `gate()` books for a match that
 * is not a league match. Hosting costs stay outside the books (→ECON-36).
 */
function unscaledGate(view: World) {
  const gate = gateProjection(view),
    club = view.clubs.find((c) => c.id === view.playerClub)!;
  const at = (attendance: number) =>
    BigInt(footballQuote(club.country, view.year, attendance * gate.perFan));
  return (at(gate.attendanceLow) + at(gate.attendanceHigh)) / 2n;
}

/**
 * The world as one club nobody owns would read it through the owner's scales: that club in the
 * owner's place, at the default ticket price, at its facility stage (→ECON-38, CLUB-1), with no
 * squad, history, campaign, sponsor, policy or build of its own, so every own-club setting is at
 * its neutral default and every number comes from the owner's functions. Its fixtures are the
 * club's own, all the owner's functions read of them. Its supporters are the following its
 * reputation commands, as a buyer takes them over (→CLUB-1, ECON-37): the stored following of a
 * club nobody owns is its founding figure, never moved, and left a top club's book 22–42% of the
 * gate and about half the commercial income it earns once bought (T686).
 */
function clubView(w: World, club: Club, fixtures: Fixture[]): World {
  const { stadium } = facilityStage(w, club);
  const fans = clubFollowing(w, club);
  return {
    ...w,
    clubs: fans === club.fans ? w.clubs : w.clubs.map((c) => (c === club ? { ...c, fans } : c)),
    fixtures,
    playerClub: club.id,
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
 * in its `league` (its clubs in their final order) and, the season after a relegation, half the
 * share it lost.
 */
function distribution(
  view: World,
  club: Club,
  tierBefore: number | undefined,
  league: readonly Club[],
) {
  const rank = league.indexOf(club) + 1;
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
function gateIncome(view: World, club: Club) {
  const games = view.fixtures.filter((f) => f.kind === 'league' && f.home === club.id).length;
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
export function currencyChange(code: string, from: number, to: number) {
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
