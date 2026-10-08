import type { World } from '../../contracts/src/types';
import { ratio } from './primitives';
import { clubOf, quote } from './world';
import { FINANCE_CONFIG, gateProjection, operatingCosts, seasonPrize } from './finance';
import { sponsorAnnual } from './operations';
import { groupKey, ranked } from './season';
import { SEASON_ROUNDS } from './calendar';

export type ProjectionKey = 'operating' | 'gate' | 'sponsor' | 'performance' | 'prize';
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
  /** Lines over the next 365 days. */
  lines: ProjectionLine[];
  /** The same lines up to the end of the current season. */
  seasonLines: ProjectionLine[];
}
const LABELS: Record<ProjectionKey, string> = {
  operating: '급여·운영비',
  gate: '홈 경기 수입(개최비 제외)',
  sponsor: '후원 계약',
  performance: '경기 성과 수입',
  prize: '순위 상금',
};

/** Pure form of the season-end league prize; zero outside the paid bands. */
export { seasonPrize } from './finance';
/** Our current league position, among the same members the season close ranks. */
export function currentLeagueRank(w: World) {
  const own = clubOf(w);
  const members = w.lower
    ? w.clubs.filter((c) =>
        w.fixtures.some((f) => f.kind === 'lower' && (f.home === c.id || f.away === c.id)),
      )
    : w.clubs.filter((c) => groupKey(c) === groupKey(own) && !c.representative);
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
  const club = clubOf(w),
    costs = operatingCosts(w),
    played = Math.min(w.round, SEASON_ROUNDS);
  const components = [
    costs.playerWages,
    costs.managerWage,
    costs.maintenance,
    costs.marketing,
    costs.staffWages,
  ];
  // settleRound pays roundShare(component, k) for rounds k = played+1..46, which telescopes.
  const remainingCosts = sum(
    components.map((c) => big(c) - big(ratio(c, BigInt(played), BigInt(SEASON_ROUNDS)))),
  );

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

  const sponsor = w.sponsor,
    annual = big(sponsorAnnual(w)),
    leaguePlayed = w.tables[w.playerClub]?.played ?? 0,
    paying = !!sponsor && sponsor.lastPaid < w.year && sponsor.until > w.year,
    continues = !!sponsor && sponsor.until > w.year + 1;
  const sponsorSeason =
    paying && games
      ? annual - big(ratio(annual.toString(), BigInt(leaguePlayed), BigInt(games)))
      : 0n;
  const sponsorYear =
    sponsorSeason +
    (continues && games ? big(ratio(annual.toString(), BigInt(leaguePlayed), BigInt(games))) : 0n);

  const table = w.tables[w.playerClub],
    winRate = table?.played ? table.won / table.played : 1 / 3,
    drawRate = table?.played ? table.drawn / table.played : 1 / 3,
    prestige = 1 + Math.max(0, 3 - club.tier) * 0.35,
    perGame = (winRate * FINANCE_CONFIG.winBonus + drawRate * FINANCE_CONFIG.drawBonus) * prestige;
  const sponsorBonus = (count: number) =>
    sponsor?.kind === 'performance' && games && count
      ? big(
          ratio(
            sponsor.bonus,
            BigInt(Math.round((winRate * 3 + drawRate) * 1000) * count),
            BigInt(games * 3 * 1000),
          ),
        )
      : 0n;
  const performanceSeason =
    big(quote(club.country, w.year, perGame * remainingGames)) + sponsorBonus(remainingGames);
  const performanceYear =
    big(quote(club.country, w.year, perGame * games)) +
    sponsorBonus(continues ? games : remainingGames);

  const settled = w.events.some((e) => e.year === w.year && e.kind === 'season-prize');
  const { rank, clubs } = currentLeagueRank(w);
  const prize = settled || !rank ? 0n : big(seasonPrize(w, rank, clubs));

  const seasonLines = [
    line('operating', -remainingCosts, -remainingCosts),
    line('gate', gateLow * BigInt(remainingHome), gateHigh * BigInt(remainingHome)),
    line('sponsor', sponsorSeason, sponsorSeason),
    line('performance', 0n, performanceSeason),
    line('prize', 0n, prize),
  ];
  const yearCost = big(costs.annual);
  const lines = [
    line('operating', -yearCost, -yearCost),
    line('gate', gateLow * BigInt(homeGames), gateHigh * BigInt(homeGames)),
    line('sponsor', sponsorYear, sponsorYear),
    line('performance', 0n, performanceYear),
    line('prize', 0n, prize),
  ];
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
