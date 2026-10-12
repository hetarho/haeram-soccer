import type { Event, MatchRecord, SponsorSlot, World } from '../../contracts/src/types';
import { country, currency } from '../../catalogs/src/index';
import { activePlayers, clubOf, footballQuote, quote } from './world';
import { clamp, ratio } from './primitives';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { staffWageTotal } from './staff';
import { SEASON_ROUNDS } from './calendar';
import { facilityUpkeepUnits } from './facilities';
import { catchment, localSupporters } from './fans';

export const FINANCE_CONFIG = {
  ticketDemandScale: 0.12,
  homeMatchBaseCost: 6,
  homeMatchCostPerFan: 0.002,
  /** Result bonuses of cup and continental matches; league games pay the merit instead. */
  winBonus: 8,
  drawBonus: 3,
  /** How much a far bigger or smaller opponent moves the gate, either way. */
  opponentDraw: 0.12,
};

/**
 * League distributions (→ECON-28), first estimates for T062 to calibrate against ECON-29: each
 * country's equal share a season by division, from the top flight down, the last entry being its
 * amateur league, in 1901 price units before the football index; the champion's total against
 * the bottom club's; the share of the lost equal share a relegated club keeps for a season.
 */
export const DISTRIBUTION_CONFIG = {
  share: {
    ENG: [9000, 3000, 1200, 700, 150],
    ESP: [7500, 2400, 130],
    GER: [7500, 2400, 1000, 130],
    ITA: [7500, 2400, 1000, 130],
    FRA: [6500, 2100, 900, 120],
    POR: [5000, 1600, 100],
    NED: [5000, 1600, 100],
    BEL: [4500, 1500, 100],
  } as Record<string, readonly number[]>,
  champion: { top: 1.6, below: 1.3 },
  parachute: 0.5,
};

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
  const maintenance = quote(clubOf(w).country, w.year, facilityUpkeepUnits(w.facilities));
  const marketing = effects.marketingUnits
    ? quote(clubOf(w).country, w.year, effects.marketingUnits * 46)
    : '0';
  const academy = effects.academyUnits
    ? quote(clubOf(w).country, w.year, effects.academyUnits * 46)
    : '0';
  const staffWages = staffWageTotal(w).toString();
  const annual = (
    BigInt(playerWages) +
    BigInt(managerWage) +
    BigInt(maintenance) +
    BigInt(marketing) +
    BigInt(academy) +
    BigInt(staffWages)
  ).toString();
  /** The marketing share appears only while the policy actually spends. */
  const payments: {
    playerWages: string;
    managerWage: string;
    maintenance: string;
    marketing?: string;
    academy?: string;
    staffWages?: string;
  } = {
    playerWages: roundShare(playerWages, round),
    managerWage: roundShare(managerWage, round),
    maintenance: roundShare(maintenance, round),
    ...(marketing !== '0' ? { marketing: roundShare(marketing, round) } : {}),
    ...(academy !== '0' ? { academy: roundShare(academy, round) } : {}),
    ...(staffWages !== '0' ? { staffWages: roundShare(staffWages, round) } : {}),
  };
  const nextRound = Object.values(payments)
    .reduce((sum, value) => sum + BigInt(value), 0n)
    .toString();
  return {
    playerWages,
    managerWage,
    maintenance,
    marketing,
    academy,
    staffWages,
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
  const capacity = 2500 + w.facilities * 5000;
  const demand = Math.exp(-w.ticket / FINANCE_CONFIG.ticketDemandScale);
  const form = recentForm(w, excluding);
  const supporters = localSupporters(w);
  const draw = opponentDraw(w, opponent);
  const { gateBoost } = policyEffects(policyOf(w));
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
  const expected = Math.min(
    capacity,
    supporters,
    supporters * demand * (0.6 + form * 0.55) * draw * marketing * build,
  );
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
    : footballQuote(
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
const expenseKinds: Record<string, string> = {
  'operating-cost': '급여·시설 유지',
  'match-cost': '홈 경기 개최비',
  campaign: '마케팅 집행',
  'transfer-in': '선수 영입·임대',
  'manager-hire': '감독 선임·보상',
  'manager-renew': '감독 재계약',
  'staff-hire': '스태프 선임·보상',
  'staff-release': '스태프 계약 해지',
  'staff-renew': '코치 재계약',
  training: '훈련 지원',
  facility: '시설 확장',
  /** Every paid owner request (`care:<kind>`, →CLUB-20); the friendly earns instead. */
  care: '구단주 요청',
  'win-bonus': '승리 수당',
};
/** The ledger line an entry belongs to: paid owner requests share one line. */
const ledgerKey = (kind: string) =>
  kind.startsWith('care:') && !incomeKinds[kind] ? 'care' : kind;

export function financialBreakdown(w: World) {
  const period = w.events.filter(
    (event) => event.year === w.year && event.currency === w.currency && event.amount !== undefined,
  );
  const summarize = (kinds: Record<string, string>, total: string) => {
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
  };
  const income = summarize(incomeKinds, w.income);
  const expense = summarize(expenseKinds, w.expense);
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
 * The equal share every club of a division earns in a season (→ECON-28), in this season's money;
 * the settlement pays it in league-round installments through `roundShare`.
 */
export function leagueShare(w: World, tier = clubOf(w).tier) {
  const code = clubOf(w).country,
    table = DISTRIBUTION_CONFIG.share[code] ?? DISTRIBUTION_CONFIG.share.ENG;
  return footballQuote(code, w.year, table[Math.min(tier, table.length - 1)]);
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
  return ratio(lost.toString(), BigInt(Math.round(DISTRIBUTION_CONFIG.parachute * 1000)), 1000n);
}
