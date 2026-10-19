import { baseEffects } from './bases';
import type { Event, MatchRecord, SponsorSlot, World } from '../../contracts/src/types';
import { country, currency } from '../../catalogs/src/index';
import { activePlayers, broadcastQuote, clubOf, footballQuote, quote } from './world';
import { clamp, ratio, scaleBy } from './primitives';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { staffWageTotal } from './staff';
import { SEASON_ROUNDS } from './calendar';
import { facilityUpkeep, stadiumCapacity } from './facilities';
import { catchment, localSupporters } from './fans';

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
 * League distributions (→ECON-28), measured against ECON-29 (docs/FINANCES.md): each
 * country's equal share a season by division, from the top flight down, the last entry being its
 * amateur league, in 1901 price units before the broadcasting index (→ECON-31); the champion's
 * total against the bottom club's; the share of the lost equal share a relegated club keeps for a
 * season.
 */
export const DISTRIBUTION_CONFIG = {
  share: {
    ENG: [12700, 900, 400, 220, 40],
    ESP: [10500, 600, 30],
    GER: [10500, 750, 330, 30],
    ITA: [10500, 750, 330, 30],
    FRA: [9100, 700, 300, 28],
    POR: [7000, 400, 22],
    NED: [7000, 400, 22],
    BEL: [6400, 370, 22],
  } as Record<string, readonly number[]>,
  champion: { top: 1.6, below: 1.3 },
  parachute: 0.5,
};

/**
 * Operating expenses (운영 경비, →ECON-30), measured against ECON-29 (docs/FINANCES.md):
 * matchday operations, travel, administration, medical care, kit and the club's staff. A season's
 * amount is the larger of `share` of the club's turnover over its last completed season and
 * `floor`, the division amount: each country's by division, from the top flight down, the last
 * entry being its amateur league, in 1901 price units before the football index. A club's first
 * season and a season after a relegation pay the division amount. The amount is set when the
 * season starts and paid in league-round installments with the wages.
 */
export const EXPENSE_CONFIG = {
  share: 0.35,
  floor: {
    ENG: [8000, 900, 450, 300, 80],
    ESP: [6600, 500, 60],
    GER: [6600, 700, 350, 60],
    ITA: [6600, 700, 350, 60],
    FRA: [5700, 650, 330, 60],
    POR: [4400, 340, 50],
    NED: [4400, 340, 50],
    BEL: [4000, 310, 50],
  } as Record<string, readonly number[]>,
};

/** A division's floor of season operating expenses, in `code` and `year` money (→ECON-30). */
export function operatingExpensesAt(code: string, year: number, tier: number) {
  const table = EXPENSE_CONFIG.floor[code] ?? EXPENSE_CONFIG.floor.ENG;
  return footballQuote(code, year, table[Math.min(tier, table.length - 1)]);
}
/**
 * Income lines that are not turnover (→ECON-30): player sales, compensation for players who left
 * and owner capital.
 */
const NOT_TURNOVER = new Set(['transfer-out', 'free-transfer-compensation', 'support']);
/**
 * The club's turnover over its last completed season, in this season's money (→ECON-30): that
 * season's ledger income (→ECON-10) without player sales, compensation for players who left or
 * owner capital. Undefined when no completed season's ledger is kept, as in a club's first season.
 */
export function lastSeasonTurnover(w: World): string | undefined {
  const season = w.history.at(-1);
  if (!season || season.year !== w.year - 1) return undefined;
  const lines = ledgerLines(
    seasonEntries(w, season.year, season.currency),
    incomeKinds,
    season.income,
  );
  const turnover = lines
    .filter((line) => !NOT_TURNOVER.has(line.key))
    .reduce((sum, line) => sum + BigInt(line.amount), 0n);
  const amount = turnover > 0n ? turnover.toString() : '0';
  if (season.currency === w.currency) return amount;
  // A currency change between the seasons converts it like every live amount (→ECON-6).
  const code = clubOf(w).country,
    before = currency(code, season.year),
    after = currency(code, w.year);
  if (before.code !== season.currency || after.code !== w.currency) return undefined;
  return ratio(
    amount,
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  );
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
    closed = w.history.at(-1);
  if (closed !== undefined && closed.year === w.year - 1 && closed.tier < club.tier) return floor;
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
 * This season's turnover so far (→ECON-30): its income without player sales, compensation for
 * players who left or owner capital. Events are only appended, so the scan stops at the first
 * older one.
 */
export function seasonTurnover(w: World) {
  let notTurnover = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = w.events[i];
    if (e.year < w.year) break;
    if (e.year === w.year && e.currency === w.currency && e.amount && NOT_TURNOVER.has(e.kind))
      notTurnover += BigInt(e.amount);
  }
  return BigInt(w.income) - notTurnover;
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
  if (round <= 0 || count <= 0) return '0';
  return (
    BigInt(ratio(annual, BigInt(round), BigInt(count))) -
    BigInt(ratio(annual, BigInt(round - 1), BigInt(count)))
  ).toString();
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
  const seasonExpenses = seasonOperatingExpenses(w),
    expenses = scaleOperatingExpenses(seasonExpenses, effects.operatingFactor);
  const annual = (
    BigInt(playerWages) +
    BigInt(managerWage) +
    BigInt(maintenance) +
    BigInt(investment) +
    BigInt(academy) +
    BigInt(staffWages) +
    BigInt(expenses)
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
  } = {
    playerWages: roundShare(playerWages, round),
    managerWage: roundShare(managerWage, round),
    maintenance: roundShare(maintenance, round),
    ...(investment !== '0' ? { investment: roundShare(investment, round) } : {}),
    ...(academy !== '0' ? { academy: roundShare(academy, round) } : {}),
    ...(staffWages !== '0' ? { staffWages: roundShare(staffWages, round) } : {}),
    expenses: roundShare(expenses, round),
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
    annual,
    nextRound,
    payments,
  };
}

function recentForm(w: World, excluding?: string) {
  const matches = w.ownMatches.filter((m) => m.year === w.year && m.id !== excluding).slice(-5);
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
      ? clamp(Math.exp((0.05 - w.ticket) / FINANCE_CONFIG.ticketDemandScale), 0.25, 1.25)
      : kind === 'merchandise'
        ? 0.65 + club.reputation / 125
        : kind === 'player'
          ? 0.65 + Math.max(...activePlayers(w).map((p) => p.reputation)) / 125
          : 1;
  return focus * (0.65 + recentForm(w) * 0.45 + club.reputation / 500);
}

const LEAGUE_KINDS = ['league', 'lower'];
/** Own league games this season: 46 in the English pyramid, 14 in the lower section. */
export function ownLeagueGames(w: World) {
  return Math.max(
    1,
    w.fixtures.filter(
      (f) => LEAGUE_KINDS.includes(f.kind) && (f.home === w.playerClub || f.away === w.playerClub),
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
  return LEAGUE_KINDS.includes(kind);
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
  const demand = Math.exp(-w.ticket / FINANCE_CONFIG.ticketDemandScale);
  const form = recentForm(w, excluding);
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
  const wanted = Math.min(
    supporters,
    supporters * demand * (0.6 + form * 0.55) * draw * marketing * build,
  );
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
  local: '지역 후원',
  kit: '용품 후원',
  shirt: '메인 스폰서',
  stadium: '경기장 명명권',
  sleeve: '소매 스폰서',
};

/**
 * A match's result money: league games pay none, their results earning the merit payment at the
 * close (→ECON-19); cup and continental wins and draws keep their bonus; the main sponsor pays
 * its bonus for league wins and draws, home or away (→ECON-8, ECON-14).
 */
export function matchBonus(w: World, match: MatchRecord) {
  const own = match.home === w.playerClub ? match.score.home : match.score.away;
  const other = match.home === w.playerClub ? match.score.away : match.score.home;
  const result = own > other ? '승리' : own === other ? '무승부' : '패배';
  const prestige = 1 + Math.max(0, 3 - clubOf(w).tier) * 0.35;
  const games = ownLeagueGames(w);
  const amount = isLeagueMatch(match.kind)
    ? '0'
    : broadcastQuote(
        clubOf(w).country,
        w.year,
        (own > other ? FINANCE_CONFIG.winBonus : own === other ? FINANCE_CONFIG.drawBonus : 0) *
          prestige,
      );
  const main = w.sponsors?.find((contract) => contract.slot === 'shirt');
  const sponsored =
    main && isLeagueMatch(match.kind)
      ? ratio(main.bonus, own > other ? 3n : own === other ? 1n : 0n, BigInt(games * 3))
      : '0';
  return { result, amount, sponsored };
}

const incomeKinds: Record<string, string> = {
  'league-share': '리그 분배금',
  'league-merit': '리그 순위 배분금',
  parachute: '강등 보전금',
  gate: '홈 경기 입장·상품',
  // Each slot's contract, its base installments and bonus together (→ECON-8).
  ...Object.fromEntries(
    Object.entries(SPONSOR_SLOT_LABELS).map(([slot, label]) => [`sponsor:${slot}`, label]),
  ),
  'match-bonus': '컵·대륙 경기 성과 보너스',
  tour: '해외 투어',
  'campaign-result': '마케팅 회수금',
  'transfer-out': '선수 매각',
  'free-transfer-compensation': '계약 만료 보상금',
  'cup-prize': '국내 컵 상금',
  'cup-honor': '국내 컵 우승 상금',
  'europe-prize': '클럽대항전 수당',
  'europe-honor': '클럽대항전 우승 상금',
  support: '구단주 추가 출자',
  'care:friendly': '친선 경기',
};
/** Every income ledger kind (→ECON-10), each sponsor slot's among them. */
export const INCOME_KINDS: readonly string[] = Object.keys(incomeKinds);
/** Whether an entry of this kind is income: a named income kind or any sponsor slot's. */
export const isIncomeKind = (kind: string) =>
  Object.hasOwn(incomeKinds, kind) || kind.startsWith('sponsor:');
const expenseKinds: Record<string, string> = {
  'operating-cost': '급여·시설 유지',
  'operating-expenses': '운영 경비',
  'match-cost': '홈 경기 개최비',
  campaign: '마케팅 집행',
  'transfer-in': '선수 영입·임대',
  'manager-hire': '감독 선임·보상',
  'manager-renew': '감독 재계약',
  'staff-hire': '스태프 선임·보상',
  'staff-release': '스태프 계약 해지',
  'staff-renew': '코치 재계약',
  training: '훈련 지원',
  facility: '시설 공사',
  /** Every paid owner request (`care:<kind>`, →CLUB-20); the friendly earns instead. */
  care: '구단주 요청',
  'win-bonus': '승리 수당',
};
/** The ledger line an entry belongs to: paid owner requests share one line. */
const ledgerKey = (kind: string) =>
  kind.startsWith('care:') && !incomeKinds[kind] ? 'care' : kind;

/** A season's money entries in the currency its books were kept in. */
function seasonEntries(w: World, year: number, money: string) {
  return w.events.filter(
    (event) => event.year === year && event.currency === money && event.amount !== undefined,
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
      .filter((event) => ledgerKey(event.kind) === key)
      .reduce((sum, event) => sum + BigInt(event.amount!), 0n)
      .toString(),
  }));
  const remainder = BigInt(total) - rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  if (remainder !== 0n)
    rows.push({ key: 'older-ledger', label: '이전·기타 장부', amount: remainder.toString() });
  return rows;
}

export function financialBreakdown(w: World) {
  const period = seasonEntries(w, w.year, w.currency);
  const income = ledgerLines(period, incomeKinds, w.income);
  const expense = ledgerLines(period, expenseKinds, w.expense);
  const ownerInvestment = income.find((row) => row.key === 'support')!.amount;
  const operatingIncome = (BigInt(w.income) - BigInt(ownerInvestment)).toString();
  const operatingNet = (BigInt(operatingIncome) - BigInt(w.expense)).toString();
  const recent = period
    .flatMap((event) => {
      const key = ledgerKey(event.kind);
      const direction = incomeKinds[key] ? 'income' : expenseKinds[key] ? 'expense' : undefined;
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
    operatingIncome,
    operatingNet,
    ownerInvestment,
    recent,
  };
}

export type FinancialReceipt = Event & { amount: string; direction: string };

/** A division as the ledger names it: 1부, 2부 … or the amateur league. */
export function divisionLabel(code: string, tier: number) {
  return tier >= country(code).groups.length ? '아마추어 리그' : `${tier + 1}부`;
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
 * The season after a relegation a club keeps half the equal share it lost (→ECON-28), paid
 * alongside its new share; any other season pays none.
 */
export function parachutePayment(w: World): string {
  const last = w.history.at(-1),
    tier = clubOf(w).tier;
  if (!last || last.year !== w.year - 1 || last.tier >= tier) return '0';
  const lost = BigInt(leagueShare(w, last.tier)) - BigInt(leagueShare(w, tier));
  if (lost <= 0n) return '0';
  return scaleBy(lost.toString(), DISTRIBUTION_CONFIG.parachute, 1000n);
}
