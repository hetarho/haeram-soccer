import { describe, expect, it } from 'vitest';
import type { GoalScorer, GoalScorerSeason } from '../../../../packages/contracts/src/types';
import {
  advanceRound,
  createWorld,
  rankedScorers as engineRanking,
} from '../../../../packages/engine/src/index';
import { rankedScorers, scorerTrend } from './scorers';

const player = (id: string, goals: number, appearances: number): GoalScorer => ({
  id,
  name: `선수 ${id}`,
  club: `클럽 ${id}`,
  role: 'FWD',
  goals,
  appearances,
});

describe('scoring race facts', () => {
  it('orders actual scorers by goals, fewer appearances, then stable IDs without changing storage', () => {
    const players = [
      player('z', 3, 2),
      player('a', 3, 3),
      player('b', 3, 2),
      player('leader', 4, 4),
      player('zero', 0, 1),
    ];
    expect(rankedScorers(players).map((scorer) => scorer.id)).toEqual(['leader', 'b', 'z', 'a']);
    expect(players.map((scorer) => scorer.id)).toEqual(['z', 'a', 'b', 'leader', 'zero']);
  });

  it('reads historical goals and ranks instead of applying today’s totals to older rounds', () => {
    const season: GoalScorerSeason = {
      year: 1888,
      groupKey: 'ENG:0:0',
      trackedSinceRound: 3,
      players: [player('a', 3, 2), player('b', 4, 2), player('zero', 0, 2)],
      history: [
        { round: 2, day: 14, rows: [] },
        {
          round: 4,
          day: 28,
          rows: [
            [1, 4, 2],
            [0, 3, 2],
          ],
        },
        { round: 3, day: 21, rows: [[0, 2, 1]] },
      ],
    };
    const timeline = scorerTrend(season, ['a', 'b', 'zero']);
    expect(timeline.map((round) => round.round)).toEqual([2, 3, 4]);
    expect(timeline[1].players).toEqual([
      { id: 'a', goals: 2, rank: 1 },
      { id: 'b', goals: 0 },
      { id: 'zero', goals: 0 },
    ]);
    expect(timeline[2].players).toEqual([
      { id: 'a', goals: 3, rank: 2 },
      { id: 'b', goals: 4, rank: 1 },
      { id: 'zero', goals: 0 },
    ]);
    expect(timeline.every((round) => round.round >= season.trackedSinceRound - 1)).toBe(true);
  });

  it('keeps the latest settled snapshot when a round is replaced', () => {
    const season: GoalScorerSeason = {
      year: 1888,
      groupKey: 'ENG:0:0',
      trackedSinceRound: 1,
      players: [player('a', 2, 1)],
      history: [
        { round: 1, day: 7, rows: [[0, 1, 1]] },
        { round: 1, day: 7, rows: [[0, 2, 1]] },
      ],
    };
    expect(scorerTrend(season, ['a'])).toEqual([
      { round: 1, day: 7, players: [{ id: 'a', goals: 2, rank: 1 }] },
    ]);
  });

  it('agrees with live engine ranking for the complete league after a round', () => {
    const w = createWorld({
      country: 'ENG',
      name: '득점 경쟁',
      color: '#28654b',
      seed: 'scoring-race-ui',
      difficulty: 1,
    });
    advanceRound(w);
    const season = w.scorerSeason!;
    const ranked = rankedScorers(season.players);
    expect(ranked.map((scorer) => scorer.id)).toEqual(
      engineRanking(season).map(({ player }) => player.id),
    );
    expect(new Set(season.players.map((scorer) => scorer.club)).size).toBeGreaterThan(1);
    const latest = scorerTrend(
      season,
      ranked.map((scorer) => scorer.id),
    ).at(-1)!;
    expect(latest.round).toBe(1);
    expect(latest.players.map((scorer) => scorer.goals)).toEqual(
      ranked.map((scorer) => scorer.goals),
    );
    expect(latest.players.map((scorer) => scorer.rank)).toEqual(ranked.map((_, i) => i + 1));
  });
});
