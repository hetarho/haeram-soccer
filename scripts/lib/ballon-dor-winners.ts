/**
 * Who keeps winning the Ballon d'Or (→PLAYER-27, T803): pure counts over the winners a podium read
 * records (`ballon-dor-podiums.ts`), one per world season, for one share variant.
 */
import type { Line } from '../../packages/contracts/src/player';
import { longestRuns, median } from './title-runs';

/** A season's winner as the podium read records him. */
export interface Winner {
  /** The world he won in: a player's id is his world's own, so one id in two worlds is two people. */
  seed: string;
  year: number;
  id: string;
  /** His age in the season (its starting year less his birth year); absent when he is found nowhere. */
  age?: number;
  line: Line;
  /** His club had the season's highest strength among the playable countries' clubs, ties included. */
  strongest: boolean;
  /** His club is the owner's. */
  own: boolean;
}

const LINES: readonly Line[] = ['GK', 'DF', 'MF', 'FW'];

/**
 * Over every winner read: how many different players won, the most wins of one, the longest run of
 * consecutive wins (within a world: a run never crosses from one world to another), the winners'
 * ages (NaN when none is known), their lines, how many played for the season's strongest club and,
 * counted apart, how many for the owner's club.
 */
export function winnerSummary(winners: readonly Winner[]) {
  const wins = new Map<string, number>();
  for (const winner of winners) {
    const key = `${winner.seed}|${winner.id}`;
    wins.set(key, (wins.get(key) ?? 0) + 1);
  }
  const seeds = [...new Set(winners.map((winner) => winner.seed))];
  const longestRun = Math.max(
    0,
    ...seeds.map(
      (seed) =>
        longestRuns(
          winners
            .filter((winner) => winner.seed === seed)
            .map((winner) => ({ year: winner.year, who: winner.id })),
        ).titles,
    ),
  );
  const ages = winners.flatMap((winner) => (winner.age === undefined ? [] : [winner.age]));
  const lines = Object.fromEntries(
    LINES.map((line) => [line, winners.filter((winner) => winner.line === line).length]),
  ) as Record<Line, number>;
  return {
    distinctWinners: wins.size,
    mostWins: Math.max(0, ...wins.values()),
    longestRun,
    ageMin: ages.length ? Math.min(...ages) : NaN,
    ageMedian: median(ages),
    ageMax: ages.length ? Math.max(...ages) : NaN,
    ageUnknown: winners.length - ages.length,
    ...lines,
    strongestClub: winners.filter((winner) => winner.strongest).length,
    ownClub: winners.filter((winner) => winner.own).length,
  };
}
