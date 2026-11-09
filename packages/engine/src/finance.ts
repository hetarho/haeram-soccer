import { message as sourceMessage } from '../../contracts/src/messages';
import {
  lastSeasonTurnover,
  roundShare as readRoundShare,
  seasonResult as readSeasonResult,
  seasonTurnover,
} from './finance-read';
export { lastSeasonTurnover, seasonTurnover } from './finance-read';
import { eventsInSeason, matchesInSeason } from './season-index';
import { baseEffects } from './bases';
import type { Event, MatchRecord, SponsorSlot, World } from '../../contracts/src/types';
import { currency } from '../../catalogs/src/index';
import { activePlayers, clubOf, isOwnSeason } from './player-state';
import { broadcastQuote, footballQuote, quote } from './quotes';
import { clamp, ratio, scaleBy } from './primitives';
import { exp } from './portable-math';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { staffWageTotal } from './staff';
import { SEASON_ROUNDS } from './calendar';
import { facilityUpkeep, stadiumCapacity } from './facilities';
import { catchment, localSupporters } from './fans';
import { OWNER_TRAITS } from './owner-config';
import { hasTrait } from './owner-traits';

export const FINANCE_CONFIG = {
  ticketDemandScale: 0.12,
  homeMatchBaseCost: 6,
  homeMatchCostPerFan: 0.002,
  /**
   * Result bonuses of cup and continental matches, units on the broadcasting index (→ECON-31);
   * league games pay the merit instead.
   */
  winBonus: 1.5,
  drawBonus: 0.5,
  /** How much a far bigger or smaller opponent moves the gate, either way. */
  opponentDraw: 0.12,
};

/**
 * League distributions (→ECON-28), measured against ECON-29 (spec/ssot/ECON.md): each
 * country's equal share a season by division, from the top flight down, in 1901 price units before
 * the broadcasting index (→ECON-31); the champion's total against the bottom club's; the share of
 * the lost equal share a relegated club keeps for a season.
 */
export const DISTRIBUTION_CONFIG = {
  share: {
    ENG: [12700, 900, 400, 220],
    ESP: [10500, 600],
    GER: [10500, 750, 330],
    ITA: [10500, 750, 330],
    FRA: [9100, 700, 300],
    POR: [7000, 400],
    NED: [7000, 400],
    BEL: [6400, 370],
  } as Record<string, readonly number[]>,
  champion: { top: 1.6, below: 1.3 },
  parachute: 0.5,
};

/**
 * Operating expenses (운영 경비, →ECON-30), measured against ECON-29 (spec/ssot/ECON.md):
 * matchday operations, travel, administration, medical care, kit and the club's staff. A season's
 * amount is the larger of `share` of the club's turnover over its last completed season and
 * `floor`, the division amount: each country's by division, from the top flight down, the last
 * division's the lowest, in 1901 price units before the football index. A club's first season and
 * a season after a relegation pay the division amount. The amount is set when the season starts
 * and paid in league-round installments with the wages.
 */
export const EXPENSE_CONFIG = {
  share: 0.35,
  floor: {
    ENG: [8000, 900, 450, 300],
    ESP: [6600, 500],
    GER: [6600, 700, 350],
    ITA: [6600, 700, 350],
    FRA: [5700, 650, 330],
    POR: [4400, 340],
    NED: [4400, 340],
    BEL: [4000, 310],
  } as Record<string, readonly number[]>,
};

/** A division's floor of season operating expenses, in `code` and `year` money (→ECON-30). */
export function operatingExpensesAt(code: string, year: number, tier: number) {
  const table = EXPENSE_CONFIG.floor[code] ?? EXPENSE_CONFIG.floor.ENG;
  return footballQuote(code, year, table[Math.min(tier, table.length - 1)]);
}
/**
 * This season's operating expenses as the season starts (→ECON-30): `share` of the last completed
 * season's turnover, never below the division amount (floor) of the division played this season,
 * so a promotion or relegation at the close sets the floor first. A club's first season and a
 * season after a relegation pay the floor: a relegated club runs at its new division's size, and
 * last season's books were a bigger club's.
 */
export function assessOperatingExpenses(w: World): string {
  const club = clubOf(w),
    floor = operatingExpensesAt(club.country, w.year, club.tier),
    before = lastSeasonTier(w);
  if (before !== undefined && before < club.tier) return floor;
  const turnover = lastSeasonTurnover(w);
  if (turnover === undefined) return floor;
  const share = scaleBy(turnover, EXPENSE_CONFIG.share, 10000n);
  return BigInt(share) > BigInt(floor) ? share : floor;
}
/**
 * The operating expenses recorded when this season started. A world saved without them (rules
 * before 1.16) reads the floor of the division played now until its next season starts (→SAVE-10).
 */
export function seasonOperatingExpenses(w: World): string {
  if (w.operatingExpenses !== undefined) return w.operatingExpenses;
  const club = clubOf(w);
  return operatingExpensesAt(club.country, w.year, club.tier);
}

/** The yearly wage bill: players, the manager and the coaching staff (→CLUB-26, →ECON-29). */
export function wageBill(w: World) {
  const costs = operatingCosts(w);
  return (
    BigInt(costs.playerWages) +
    BigInt(costs.managerWage) +
    BigInt(costs.staffWages)
  ).toString();
}
/**
 * This season's net result so far (→OWNER-11): its income less its expense without the owner's
 * money, the injections he put in (→OWNER-9) and any dividend he took. The dividend is a share of
 * it at the close.
 */
export function seasonResult(w: World): string {
  return readSeasonResult(w);
}
/**
 * The club's revenue over the last 12 months, the income a wage bill can rest on (→CLUB-26): this
 * season's turnover so far and last season's share for the league rounds not yet played, in
 * today's money. A club without a completed season counts its season so far at its pace over a
 * whole season; before its first round it has earned nothing yet.
 */
export function recentRevenue(w: World): string {
  const rounds = BigInt(SEASON_ROUNDS),
    played = BigInt(Math.min(w.round, SEASON_ROUNDS)),
    season = seasonTurnover(w),
    earlier = lastSeasonTurnover(w);
  if (earlier === undefined) return played === 0n ? '0' : ((season * rounds) / played).toString();
  return (season + (BigInt(earlier) * (rounds - played)) / rounds).toString();
}

/**
 * A season's operating expenses at a squad-investment factor (→ECON-16): ×0.9–1.2 by level, in
 * hundredths, so the default level's ×1 is the amount itself.
 */
export function scaleOperatingExpenses(amount: string, factor: number) {
  return scaleBy(amount, factor, 100n);
}

export function roundShare(annual: string, round: number, count = 46) {
  return readRoundShare(annual, round, count);
}

/**
 * Money in the app's one notation (→WEB-67): whole currency units below 100,000, then K/M/B at
 * three significant figures, rounded toward zero. Engine texts write every amount through it.
 */
export function moneyLabel(w: World, amount: string) {
  const c = currency(clubOf(w).country, w.year),
    n = BigInt(amount),
    sign = n < 0n ? '−' : '',
    major = (n < 0n ? -n : n) / BigInt(c.units);
  const group = (v: bigint) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (major < 100_000n) return `${sign}${c.symbol}${group(major)}`;
  const [unit, size]: [string, bigint] =
    major >= 1_000_000_000n
      ? ['B', 1_000_000_000n]
      : major >= 1_000_000n
        ? ['M', 1_000_000n]
        : ['K', 1_000n];
  const whole = major / size,
    places = whole >= 100n ? 0 : whole >= 10n ? 1 : 2,
    scale = 10n ** BigInt(places),
    fraction = ((major * scale) / size) % scale;
  return `${sign}${c.symbol}${group(whole)}${places ? '.' + String(fraction).padStart(places, '0') : ''}${unit}`;
}

export function operatingCosts(w: World, round = w.round >= 46 ? 0 : w.round + 1) {
  const effects = policyEffects(policyOf(w));
  // Agreed wages are paid as signed: squad investment and the build's player-wage effects act in
  // contract talks, not on the wage bill (→ECON-16, →CLUB-26).
  const playerWages = activePlayers(w)
    .reduce((sum, p) => sum + BigInt(p.wage), 0n)
    .toString();
  const managerWage = w.manager.wage;
  const maintenance = facilityUpkeep(w);
  // The 지역 and 글로벌 rows' spend, billed with operating costs as the marketing dial was.
  const investment = effects.investUnits
    ? quote(clubOf(w).country, w.year, effects.investUnits * 46)
    : '0';
  const academy = effects.academyUnits
    ? quote(clubOf(w).country, w.year, effects.academyUnits * 46)
    : '0';
  const staffWages = staffWageTotal(w).toString();
  // The amount recorded when the season started (→ECON-30), scaled by the squad investment in
  // force (→ECON-16): a change of level acts from the next settlement, the recorded amount stays.
  // An owner with 정치력 pays less of it (→OWNER-5).
  const seasonExpenses = seasonOperatingExpenses(w),
    politicianFactor = hasTrait(w, 'politician') ? OWNER_TRAITS.politician.operating : 1,
    invested = scaleOperatingExpenses(seasonExpenses, effects.operatingFactor),
    expenses =
      politicianFactor === 1 ? invested : scaleOperatingExpenses(invested, politicianFactor);
  // The takeover loan's installment for this season, paid over its league rounds (→ECON-38).
  const loan = w.loan && w.loan.seasonsLeft > 0 ? w.loan.installment : '0';
  const annual = (
    BigInt(playerWages) +
    BigInt(managerWage) +
    BigInt(maintenance) +
    BigInt(investment) +
    BigInt(academy) +
    BigInt(staffWages) +
    BigInt(expenses) +
    BigInt(loan)
  ).toString();
  /** The investment share appears only while the rows actually spend. */
  const payments: {
    playerWages: string;
    managerWage: string;
    maintenance: string;
    investment?: string;
    academy?: string;
    staffWages?: string;
    expenses: string;
    loan?: string;
  } = {
    playerWages: roundShare(playerWages, round),
    managerWage: roundShare(managerWage, round),
    maintenance: roundShare(maintenance, round),
    ...(investment !== '0' ? { investment: roundShare(investment, round) } : {}),
    ...(academy !== '0' ? { academy: roundShare(academy, round) } : {}),
    ...(staffWages !== '0' ? { staffWages: roundShare(staffWages, round) } : {}),
    expenses: roundShare(expenses, round),
    ...(loan !== '0' ? { loan: roundShare(loan, round) } : {}),
  };
  const nextRound = Object.values(payments)
    .reduce((sum, value) => sum + BigInt(value), 0n)
    .toString();
  return {
    playerWages,
    managerWage,
    maintenance,
    investment,
    academy,
    staffWages,
    /**
     * This season's operating expenses (운영 경비, →ECON-30) a year at today's squad investment:
     * the recorded amount × `operatingFactor`. Fixed costs, the runway and the projection count it.
     */
    expenses,
    /** This season's operating expenses as recorded when it started, before the factor. */
    seasonExpenses,
    /** The squad investment's factor on operating expenses (→ECON-16). */
    operatingFactor: effects.operatingFactor,
    /** 정치력's factor on operating expenses, 1 without the trait (→OWNER-5). */
    politicianFactor,
    /**
     * This season's takeover-loan installment, a fixed cost of its league rounds (→ECON-38); '0'
     * without a loan.
     */
    loan,
    annual,
    nextRound,
    payments,
  };
}

function recentForm(w: World, excluding?: string) {
  const matches = matchesInSeason(w, w.year)
    .filter((m) => m.id !== excluding)
    .slice(-5);
  if (!matches.length) return 0.5;
  const points = matches.reduce((sum, m) => {
    const own = m.home === w.playerClub ? m.score.home : m.score.away;
    const other = m.home === w.playerClub ? m.score.away : m.score.home;
    return sum + (own > other ? 3 : own === other ? 1 : 0);
  }, 0);
  return points / (matches.length * 3);
}

export function campaignEffectiveness(w: World, kind: string) {
  const club = clubOf(w);
  const focus =
    kind === 'tickets'
      ? clamp(exp((0.05 - w.ticket) / FINANCE_CONFIG.ticketDemandScale), 0.25, 1.25)
      : kind === 'merchandise'
        ? 0.65 + club.reputation / 125
        : kind === 'player'
          ? 0.65 + Math.max(...activePlayers(w).map((p) => p.reputation)) / 125
          : 1;
  return focus * (0.65 + recentForm(w) * 0.45 + club.reputation / 500);
}

/** Own league games this season: 46 in a 24-club division, 38 in a 20-club one (→ECON-19). */
export function ownLeagueGames(w: World) {
  return Math.max(
    1,
    w.fixtures.filter(
      (f) => f.kind === 'league' && (f.home === w.playerClub || f.away === w.playerClub),
    ).length,
  );
}
/**
 * League match income is sized for a 46-game season, so a shorter league pays more per match
 * and a club's season income does not depend on how many clubs share its division.
 */
export function leagueMatchFactor(w: World) {
  return SEASON_ROUNDS / ownLeagueGames(w);
}
export function isLeagueMatch(kind: string) {
  return kind === 'league';
}

/** A bigger name than ours draws more of our supporters, a smaller one fewer (→ECON-9). */
function opponentDraw(w: World, opponent?: string) {
  const other = opponent && w.clubs.find((c) => c.id === opponent);
  if (!other) return 1;
  const reach = FINANCE_CONFIG.opponentDraw;
  return 1 + clamp((other.reputation - clubOf(w).reputation) / 250, -reach, reach);
}

/**
 * A range for a league home gate at today's prices, form and supporters (→ECON-9): the local
 * supporters within the catchment come by price, form and opponent, up to the stadium's capacity.
 * Without an opponent it reads an evenly matched one, the gate the cash projection carries forward.
 */
export function gateProjection(w: World, excluding?: string, opponent?: string) {
  const club = clubOf(w);
  const capacity = stadiumCapacity(w);
  const demand = exp(-w.ticket / FINANCE_CONFIG.ticketDemandScale);
  const form = recentForm(w, excluding);
  // Recent form scales home demand from 0.6 to 1.15.
  const formDemand = 0.6 + form * 0.55;
  const supporters = localSupporters(w);
  const draw = opponentDraw(w, opponent);
  // 주변 투자 while paid and 지역 기반 lift home demand (→ECON-9, →ECON-34).
  const gateBoost = policyEffects(policyOf(w)).gateBoost + baseEffects(w).gate;
  const marketing = Math.min(
    gateBoost > 0 ? 1.35 : 1.25,
    1 +
      gateBoost +
      w.campaigns.reduce(
        (boost, campaign) => boost + (campaign.kind === 'tickets' ? 0.12 : 0.05),
        0,
      ),
  );
  // The club build moves home demand on its own: community clubs fill seats, commercial ones lose some.
  const build = 1 + buildEffects(w).gateDemand;
  // No campaign brings more than every local supporter.
  const wanted = Math.min(supporters, supporters * demand * formDemand * draw * marketing * build);
  const expected = Math.min(capacity, wanted);
  const low = Math.round(expected * 0.8);
  const high = Math.round(expected);
  // Ticket presets and matchday spend are 1901 prices grown with the football index (→ECON-26).
  const perFan = w.ticket + 0.006 + club.reputation * 0.00006;
  const leagueFactor = leagueMatchFactor(w);
  const gateCost = (attendance: number) =>
    quote(
      club.country,
      w.year,
      FINANCE_CONFIG.homeMatchBaseCost + attendance * FINANCE_CONFIG.homeMatchCostPerFan,
    );
  return {
    capacity,
    demand,
    form,
    formDemand,
    marketing,
    /** Local supporters within the catchment, the most who could come. */
    supporters,
    opponent: draw,
    attendanceLow: low,
    attendanceHigh: high,
    /** The crowd that would come with seats enough: what a bigger ground could hold (→ECON-12). */
    wanted: Math.round(wanted),
    incomeLow: footballQuote(club.country, w.year, low * perFan * leagueFactor),
    incomeHigh: footballQuote(club.country, w.year, high * perFan * leagueFactor),
    costLow: gateCost(low),
    costHigh: gateCost(high),
    perFan,
    /** Multiplier on league gate income; cup and European gates are not scaled. */
    leagueFactor,
  };
}

/** Sponsor slots as the ledger and the 후원 tab name them (→ECON-8). */
export const SPONSOR_SLOT_LABELS: Record<SponsorSlot, string> = {
  local: sourceMessage('copy.finance.7d6fb1c75a'),
  kit: sourceMessage('copy.finance.371e9fcdaf'),
  shirt: sourceMessage('copy.finance.1c7a9b2492'),
  stadium: sourceMessage('copy.finance.a3702e991f'),
  sleeve: sourceMessage('copy.finance.9ff7306ef3'),
};

/**
 * A match's result money: league games pay none, their results earning the merit payment at the
 * close (→ECON-19); cup and continental wins and draws keep their bonus; the main sponsor pays
 * its bonus for league wins and draws, home or away (→ECON-8, ECON-14).
 */
export function matchBonus(w: World, match: MatchRecord) {
  const own = match.home === w.playerClub ? match.score.home : match.score.away;
  const other = match.home === w.playerClub ? match.score.away : match.score.home;
  const result =
    own > other
      ? sourceMessage('result.win.label')
      : own === other
        ? sourceMessage('result.draw.label')
        : sourceMessage('result.loss.label');
  const games = ownLeagueGames(w);
  const amount = isLeagueMatch(match.kind)
    ? '0'
    : resultBonus(
        clubOf(w).country,
        w.year,
        clubOf(w).tier,
        own > other ? 'win' : own === other ? 'draw' : 'loss',
      );
  const main = w.sponsors?.find((contract) => contract.slot === 'shirt');
  const sponsored =
    main && isLeagueMatch(match.kind)
      ? ratio(main.bonus, own > other ? 3n : own === other ? 1n : 0n, BigInt(games * 3))
      : '0';
  return { result, amount, sponsored };
}
/** A match's result as the result money reads it. */
export type MatchResult = 'win' | 'draw' | 'loss';
/**
 * A cup or continental match's result bonus (→ECON-19, ECON-31): a win or a draw at the club's
 * division's prestige (the top flight ×2.05, then ×1.7, ×1.35, ×1 from the fourth), on the
 * broadcasting index of its country and season. The owner's club and a club nobody owns' book
 * (→ECON-36) are paid by this one rule.
 */
export function resultBonus(code: string, year: number, tier: number, result: MatchResult) {
  const prestige = 1 + Math.max(0, 3 - tier) * 0.35;
  return broadcastQuote(
    code,
    year,
    (result === 'win'
      ? FINANCE_CONFIG.winBonus
      : result === 'draw'
        ? FINANCE_CONFIG.drawBonus
        : 0) * prestige,
  );
}

const incomeKinds: Record<string, string> = {
  'league-share': sourceMessage('copy.finance.2d1ae295d1'),
  'league-merit': sourceMessage('copy.finance.8873d9546b'),
  parachute: sourceMessage('copy.finance.28f00ca15d'),
  gate: sourceMessage('copy.finance.21979537d2'),
  // Each slot's contract, its base installments and bonus together (→ECON-8).
  ...Object.fromEntries(
    Object.entries(SPONSOR_SLOT_LABELS).map(([slot, label]) => [`sponsor:${slot}`, label]),
  ),
  'match-bonus': sourceMessage('copy.finance.470820a9d4'),
  tour: sourceMessage('copy.influences.f39e48758d'),
  'campaign-result': sourceMessage('copy.finance.d182304a02'),
  'transfer-out': sourceMessage('copy.intervention.5ea61dab56'),
  'free-transfer-compensation': sourceMessage('copy.finance.f8551691f2'),
  // Owner capital, outside turnover (→OWNER-9, ECON-30).
  'owner-injection': sourceMessage('copy.fan_mood.3881f2a2d6'),
  'cup-prize': sourceMessage('copy.finance.3412a0b56f'),
  'cup-honor': sourceMessage('copy.finance.1481d52ee9'),
  'europe-prize': sourceMessage('copy.finance.346658f3e6'),
  'europe-honor': sourceMessage('copy.finance.f21388fce6'),
};
/** Every income ledger kind (→ECON-10), each sponsor slot's among them. */
export const INCOME_KINDS: readonly string[] = Object.keys(incomeKinds);
/** Whether an entry of this kind is income: a named income kind or any sponsor slot's. */
export const isIncomeKind = (kind: string) =>
  Object.hasOwn(incomeKinds, kind) || kind.startsWith('sponsor:');
const expenseKinds: Record<string, string> = {
  'operating-cost': sourceMessage('copy.finance.9df2ce4df3'),
  'operating-expenses': sourceMessage('copy.FinancialBreakdown.2d914c9be2'),
  'match-cost': sourceMessage('copy.finance.aeee208c2a'),
  campaign: sourceMessage('copy.finance.ce68299a4f'),
  'transfer-in': sourceMessage('copy.finance.9c050684a4'),
  'manager-hire': sourceMessage('copy.finance.268761201b'),
  'manager-renew': sourceMessage('copy.finance.ddb2236cce'),
  'staff-hire': sourceMessage('copy.finance.8a43583acd'),
  'staff-release': sourceMessage('copy.finance.350fb92d3a'),
  'staff-renew': sourceMessage('copy.finance.0ec0b65c66'),
  training: sourceMessage('copy.finance.4d6a1bd07c'),
  facility: sourceMessage('copy.finance.da397a5520'),
  // A won award's contract bonus (→CLUB-29).
  'ballon-dor-bonus': sourceMessage('copy.finance.c2dc60fe60'),
  // The debt taken over, repaid as a fixed cost of the league rounds (→ECON-38).
  'loan-repayment': sourceMessage('copy.FinancialBreakdown.ddebd211b6'),
  // The owner's share of the season's profit, taken at the close (→OWNER-11).
  'owner-dividend': sourceMessage('copy.fan_mood.eb9f33a674'),
};
/** A season's money entries in the currency its books were kept in. */
function seasonEntries(w: World, year: number, money: string) {
  return eventsInSeason(w, year).filter(
    (event) => event.currency === money && event.amount !== undefined,
  );
}
/**
 * A season's ledger lines of one direction (→ECON-10): every named kind, and a catch-all line for
 * the part of the season's total no current rule's entries explain.
 */
function ledgerLines(period: Event[], kinds: Record<string, string>, total: string) {
  const rows = Object.entries(kinds).map(([key, label]) => ({
    key,
    label,
    amount: period
      .filter((event) => event.kind === key)
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n)
      .toString(),
  }));
  const remainder = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (remainder !== 0n)
    rows.push({
      key: 'older-ledger',
      label: sourceMessage('copy.finance.746c39bf26'),
      amount: remainder.toString(),
    });
  return rows;
}

export function financialBreakdown(w: World) {
  const period = seasonEntries(w, w.year, w.currency);
  const income = ledgerLines(period, incomeKinds, w.income);
  const expense = ledgerLines(period, expenseKinds, w.expense);
  const recent = period
    .flatMap((event) => {
      const direction = incomeKinds[event.kind]
        ? 'income'
        : expenseKinds[event.kind]
          ? 'expense'
          : undefined;
      return direction ? [{ ...event, amount: event.amount!, direction }] : [];
    })
    .slice(-10)
    .reverse();
  return {
    costs: operatingCosts(w),
    gate: gateProjection(w),
    /** The most local supporters the club's town, division and stature hold (→ECON-9). */
    catchment: catchment(w),
    income,
    expense,
    /**
     * This season's income less its expense, the owner's injections and dividends included; the
     * club's own result without them is `seasonResult` (→OWNER-11).
     */
    net: (BigInt(w.income) - BigInt(w.expense)).toString(),
    recent,
  };
}

/** A division as the ledger names it: 1부, 2부 … */
export function divisionLabel(tier: number) {
  return sourceMessage('copy.cupRoute.3d1e4a6467', { p0: tier + 1 });
}
/**
 * The equal share every club of a division earns in a season (→ECON-28), in this season's money on
 * the broadcasting index (→ECON-31); the settlement pays it in league-round installments through
 * `roundShare`, and the merit payment and the parachute are reckoned from it.
 */
export function leagueShare(w: World, tier = clubOf(w).tier) {
  const code = clubOf(w).country,
    table = DISTRIBUTION_CONFIG.share[code] ?? DISTRIBUTION_CONFIG.share.ENG;
  return broadcastQuote(code, w.year, table[Math.min(tier, table.length - 1)]);
}
/**
 * The merit payment for a final rank, paid at the close: nothing for the bottom club, rising evenly
 * to the champion's, whose share and merit together are 1.6× the bottom club's in the top flight
 * and 1.3× below. The settlement and the projection share this rule.
 */
export function leagueMerit(w: World, rank: number, clubs: number): string {
  if (clubs < 2 || rank < 1 || rank >= clubs) return '0';
  const { top, below } = DISTRIBUTION_CONFIG.champion,
    champion = clubOf(w).tier === 0 ? top : below;
  return ratio(
    leagueShare(w),
    BigInt(Math.round((champion - 1) * 1000)) * BigInt(clubs - rank),
    1000n * BigInt(clubs - 1),
  );
}
/**
 * The division the club played last season (→ECON-28): its own archive's, or, for the season the
 * world archived before the takeover, the club's row in that season's standings (the archive's
 * own-club fields are empty then). Undefined when last season is not archived, as in a founded
 * club's first season.
 */
export function lastSeasonTier(w: World): number | undefined {
  const last = w.history.at(-1);
  if (!last || last.year !== w.year - 1) return undefined;
  if (isOwnSeason(w, last)) return last.tier;
  const index = w.clubs.indexOf(clubOf(w));
  return last.standings.find((row) => row[0] === index)?.[1];
}
/**
 * The season after a relegation a club keeps half the equal share it lost (→ECON-28), paid
 * alongside its new share; any other season pays none.
 */
export function parachutePayment(w: World): string {
  const before = lastSeasonTier(w),
    tier = clubOf(w).tier;
  if (before === undefined || before >= tier) return '0';
  const lost = BigInt(leagueShare(w, before)) - BigInt(leagueShare(w, tier));
  if (lost <= 0n) return '0';
  return scaleBy(lost.toString(), DISTRIBUTION_CONFIG.parachute, 1000n);
}
