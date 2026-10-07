import type { GoalScorer, GoalScorerSeason } from '../../../../packages/contracts/src/types';

/** The same stable tiebreaks used when the engine records a scoring race. */
export function rankedScorers(players: readonly GoalScorer[]): GoalScorer[] {
  return players
    .filter((player) => player.goals > 0)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        a.appearances - b.appearances ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export interface ScorerTrendRound {
  round: number;
  day: number;
  players: { id: string; goals: number; rank?: number }[];
}

/** Read actual round snapshots; players without goals have no scoring rank yet. */
export function scorerTrend(
  season: GoalScorerSeason,
  playerIds: readonly string[],
): ScorerTrendRound[] {
  return [...new Map(season.history.map((snapshot) => [snapshot.round, snapshot])).values()]
    .sort((a, b) => a.round - b.round)
    .map((snapshot) => {
      const rows = new Map(
        snapshot.rows.flatMap(([index, goals], i) => {
          const player = season.players[index];
          return player ? [[player.id, { goals, rank: i + 1 }] as const] : [];
        }),
      );
      return {
        round: snapshot.round,
        day: snapshot.day,
        players: playerIds.map((id) => ({
          id,
          ...(rows.get(id) || { goals: 0 }),
        })),
      };
    });
}
