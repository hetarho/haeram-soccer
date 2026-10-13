import type { World } from '../../contracts/src/types';
import { ratio } from './primitives';
import { clubOf } from './world';
import {
  gateProjection,
  leagueMerit,
  leagueShare,
  operatingCosts,
  parachutePayment,
} from './finance';
import { sponsorAnnual } from './sponsors';
import { ownLeagueClubs, ranked } from './season';
import { SEASON_ROUNDS } from './calendar';

export type ProjectionKey =
  'operating' | 'expenses' | 'gate' | 'share' | 'parachute' | 'sponsor' | 'performance' | 'merit';
export interface ProjectionLine {
  key: ProjectionKey;
  label: string;
  /** Signed minor units over the horizon: the middle of `low`..`high`. */
  amount: string;
  /** Signed minor units over the horizon, cautious end. */
  low: string;
  /** Signed minor units over the horizon, hopeful end. */
  high: string;
}
export interface FinanceProjection {
  now: string;
  /** Cash range at the end of the current season. */
  seasonEnd: { low: string; high: string };
  /** Cash range 365 days from today if nothing changes. */
  nextYear: { low: string; high: string };
  /** Lines over the next 365 days; the parachute only in the season after a relegation. */
  lines: ProjectionLine[];
  /** The same lines up to the end of the current season. */
  seasonLines: ProjectionLine[];
}
const LABELS: Record<ProjectionKey, string> = {
  operating: '급여·시설 유지',
  expenses: '운영 경비',
  gate: '홈 경기 수입(개최비 제외)',
  share: '리그 분배금',
  parachute: '강등 보전금',
  sponsor: '후원 계약',
  performance: '후원 성과 보너스',
  merit: '리그 순위 배분금',
};

/** Our current league position, among the same members the season close ranks. */
export function currentLeagueRank(w: World) {
  const own = clubOf(w);
  const members = ownLeagueClubs(w);
  return { rank: ranked(w, members).findIndex((c) => c.id === own.id) + 1, clubs: members.length };
}

const big = (value: string | bigint) => BigInt(value);
const sum = (values: (string | bigint)[]) => values.reduce<bigint>((s, v) => s + big(v), 0n);
function line(key: ProjectionKey, low: bigint, high: bigint): ProjectionLine {
  const [a, b] = low <= high ? [low, high] : [high, low];
  return {
    key,
    label: LABELS[key],
    amount: ratio((a + b).toString(), 1n, 2n),
    low: a.toString(),
    high: b.toString(),
  };
}

/** Read model only: current contracts, policy and demand carried forward, no new decisions. */
export function financeProjection(w: World): FinanceProjection {
  const costs = operatingCosts(w),
    played = Math.min(w.round, SEASON_ROUNDS);
  // settleRound pays roundShare(annual, k) for rounds k = played+1..46, which telescopes.
  const unpaid = (annual: string) =>
    big(annual) - big(ratio(annual, BigInt(played), BigInt(SEASON_ROUNDS)));
  const remainingCosts = sum(
    [
      costs.playerWages,
      costs.managerWage,
      costs.maintenance,
      costs.marketing,
      costs.academy,
      costs.staffWages,
    ].map(unpaid),
  );
  // Operating expenses of the division played this season, a fixed cost of their own (→ECON-30).
  const remainingExpenses = unpaid(costs.expenses);

  const league = w.fixtures.filter(
    (f) =>
      f.year === w.year &&
      (f.kind === 'league' || f.kind === 'lower') &&
      (f.home === w.playerClub || f.away === w.playerClub),
  );
  const games = league.length,
    remainingGames = league.filter((f) => !f.score).length,
    homeGames = league.filter((f) => f.home === w.playerClub).length,
    remainingHome = league.filter((f) => f.home === w.playerClub && !f.score).length;

  const gate = gateProjection(w),
    gateLow = big(gate.incomeLow) - big(gate.costLow),
    gateHigh = big(gate.incomeHigh) - big(gate.costHigh);

  const leaguePlayed = w.tables[w.playerClub]?.played ?? 0,
    table = w.tables[w.playerClub],
    winRate = table?.played ? table.won / table.played : 1 / 3,
    drawRate = table?.played ? table.drawn / table.played : 1 / 3;
  // League results earn no match bonus (→ECON-19); only the main sponsor pays per result.
  const resultBonus = (bonus: string, count: number) =>
    games && count
      ? big(
          ratio(
            bonus,
            BigInt(Math.round((winRate * 3 + drawRate) * 1000) * count),
            BigInt(games * 3 * 1000),
          ),
        )
      : 0n;
  // Every running contract at its fixed amount (→ECON-8); a kit bonus waits on an uncertain
  // promotion or title and is left out.
  let sponsorSeason = 0n,
    sponsorYear = 0n,
    performanceSeason = 0n,
    performanceYear = 0n;
  for (const contract of w.sponsors ?? []) {
    const annual = big(sponsorAnnual(w, contract)),
      paid = big(ratio(annual.toString(), BigInt(leaguePlayed), BigInt(Math.max(1, games)))),
      continues = contract.until > w.year + 1;
    const season =
      contract.lastPaid < w.year && contract.until > w.year && games ? annual - paid : 0n;
    sponsorSeason += season;
    sponsorYear += season + (continues && games ? paid : 0n);
    if (contract.slot !== 'shirt') continue;
    performanceSeason += resultBonus(contract.bonus, remainingGames);
    performanceYear += resultBonus(contract.bonus, continues ? games : remainingGames);
  }

  // The division's share keeps paying a round at a time, next season as this one (→ECON-28);
  // a parachute ends with the season it pays in.
  const share = leagueShare(w),
    shareSeason = unpaid(share),
    parachute = unpaid(parachutePayment(w));
  const settled = w.events.some((e) => e.year === w.year && e.kind === 'league-merit');
  const { rank, clubs } = currentLeagueRank(w);
  const merit = settled || !rank ? 0n : big(leagueMerit(w, rank, clubs));

  // The parachute line shows only in the season after a relegation.
  const shown = (row: ProjectionLine) => row.key !== 'parachute' || row.high !== '0';
  const seasonLines = [
    line('operating', -remainingCosts, -remainingCosts),
    line('expenses', -remainingExpenses, -remainingExpenses),
    line('gate', gateLow * BigInt(remainingHome), gateHigh * BigInt(remainingHome)),
    line('share', shareSeason, shareSeason),
    line('parachute', parachute, parachute),
    line('sponsor', sponsorSeason, sponsorSeason),
    line('performance', 0n, performanceSeason),
    line('merit', 0n, merit),
  ].filter(shown);
  const yearExpenses = big(costs.expenses),
    yearCost = big(costs.annual) - yearExpenses;
  const lines = [
    line('operating', -yearCost, -yearCost),
    line('expenses', -yearExpenses, -yearExpenses),
    line('gate', gateLow * BigInt(homeGames), gateHigh * BigInt(homeGames)),
    line('share', big(share), big(share)),
    line('parachute', parachute, parachute),
    line('sponsor', sponsorYear, sponsorYear),
    line('performance', 0n, performanceYear),
    line('merit', 0n, merit),
  ].filter(shown);
  const range = (items: ProjectionLine[]) => ({
    low: (big(w.cash) + sum(items.map((l) => l.low))).toString(),
    high: (big(w.cash) + sum(items.map((l) => l.high))).toString(),
  });
  return {
    now: w.cash,
    seasonEnd: range(seasonLines),
    nextYear: range(lines),
    lines,
    seasonLines,
  };
}
