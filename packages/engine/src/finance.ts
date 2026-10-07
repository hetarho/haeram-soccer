import type { Event, MatchRecord, World } from '../../contracts/src/types';
import { activePlayers, clubOf, quote } from './world';
import { clamp, ratio } from './primitives';

export const FINANCE_CONFIG = {
  ticketDemandScale: 0.12,
  homeMatchBaseCost: 6,
  homeMatchCostPerFan: 0.002,
  winBonus: 8,
  drawBonus: 3,
  rankAwards: [140, 90, 50, 20] as const,
};

export function roundShare(annual: string, round: number, count = 46) {
  if (round <= 0 || count <= 0) return '0';
  return (
    BigInt(ratio(annual, BigInt(round), BigInt(count))) -
    BigInt(ratio(annual, BigInt(round - 1), BigInt(count)))
  ).toString();
}

export function operatingCosts(w: World, round = w.round >= 46 ? 0 : w.round + 1) {
  const playerWages = activePlayers(w)
    .reduce((sum, p) => sum + BigInt(p.wage), 0n)
    .toString();
  const managerWage = w.manager.wage;
  const maintenance = quote(clubOf(w).country, w.year, 180 + w.facilities * 40);
  const annual = (BigInt(playerWages) + BigInt(managerWage) + BigInt(maintenance)).toString();
  const payments = {
    playerWages: roundShare(playerWages, round),
    managerWage: roundShare(managerWage, round),
    maintenance: roundShare(maintenance, round),
  };
  const nextRound = Object.values(payments)
    .reduce((sum, value) => sum + BigInt(value), 0n)
    .toString();
  return { playerWages, managerWage, maintenance, annual, nextRound, payments };
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

/** A range for the next home gate at today's prices, form, fans and facilities. */
export function gateProjection(w: World, excluding?: string) {
  const club = clubOf(w);
  const capacity = 2500 + w.facilities * 5000;
  const demand = Math.exp(-w.ticket / FINANCE_CONFIG.ticketDemandScale);
  const form = recentForm(w, excluding);
  const marketing = Math.min(
    1.25,
    1 +
      w.campaigns.reduce(
        (boost, campaign) => boost + (campaign.kind === 'tickets' ? 0.12 : 0.05),
        0,
      ),
  );
  const reputation = 0.8 + club.reputation / 250;
  const facilities = 1 + Math.min(0.12, w.facilities * 0.02);
  const expected = Math.min(
    capacity,
    club.fans * demand * (0.6 + form * 0.55) * reputation * marketing * facilities,
  );
  const low = Math.round(expected * 0.8);
  const high = Math.round(expected);
  const perFan = w.ticket + 0.006 + club.reputation * 0.00006;
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
    attendanceLow: low,
    attendanceHigh: high,
    incomeLow: quote(club.country, w.year, low * perFan),
    incomeHigh: quote(club.country, w.year, high * perFan),
    costLow: gateCost(low),
    costHigh: gateCost(high),
    perFan,
  };
}

export function matchBonus(w: World, match: MatchRecord) {
  const own = match.home === w.playerClub ? match.score.home : match.score.away;
  const other = match.home === w.playerClub ? match.score.away : match.score.home;
  const result = own > other ? '승리' : own === other ? '무승부' : '패배';
  const prestige = 1 + Math.max(0, 3 - clubOf(w).tier) * 0.35;
  const amount = quote(
    clubOf(w).country,
    w.year,
    (own > other ? FINANCE_CONFIG.winBonus : own === other ? FINANCE_CONFIG.drawBonus : 0) *
      prestige,
  );
  const games = Math.max(
    1,
    w.fixtures.filter(
      (f) =>
        ['league', 'lower'].includes(f.kind) &&
        (f.home === w.playerClub || f.away === w.playerClub),
    ).length,
  );
  const sponsored =
    w.sponsor?.kind === 'performance' && ['league', 'lower'].includes(match.kind)
      ? ratio(w.sponsor.bonus, own > other ? 3n : own === other ? 1n : 0n, BigInt(games * 3))
      : '0';
  return { result, amount, sponsored };
}

const incomeKinds: Record<string, string> = {
  gate: '홈 경기 입장·상품',
  'sponsor-payment': '후원 노출 대금',
  'match-bonus': '경기 성과 보너스',
  'sponsor-bonus': '후원 성과 보너스',
  'season-prize': '최종 순위 상금',
  'campaign-result': '마케팅 회수금',
  'transfer-out': '선수 매각',
  support: '구단주 추가 출자',
};
const expenseKinds: Record<string, string> = {
  'operating-cost': '급여·시설 유지',
  'match-cost': '홈 경기 개최비',
  campaign: '마케팅 집행',
  'transfer-in': '선수 영입·임대',
  'manager-hire': '감독 선임·보상',
  training: '훈련 지원',
  facility: '시설 확장',
};

export function financialBreakdown(w: World) {
  const period = w.events.filter(
    (event) => event.year === w.year && event.currency === w.currency && event.amount !== undefined,
  );
  const summarize = (kinds: Record<string, string>, total: string) => {
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
    income,
    expense,
    operatingIncome,
    operatingNet,
    ownerInvestment,
    recent,
  };
}

export type FinancialReceipt = Event & { amount: string; direction: string };
