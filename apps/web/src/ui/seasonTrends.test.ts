import { expect, it } from 'vitest';
import { createWorld, nextOwnFixture, simulateMatch } from '../../../../packages/engine/src/index';
import { matchSplit, recentGoalDifferences } from './seasonTrends';
it('uses the own perspective, weighted denominators and a bounded chronological form sample', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Season',
    color: '#24664f',
    seed: 'season-analysis',
    difficulty: 2,
  });
  const record = simulateMatch(w, nextOwnFixture(w)!, false, true).record;
  const home = {
    ...record,
    home: w.playerClub,
    away: 'rival',
    score: { home: 3, away: 1 },
    metrics: [
      [3, 0, 10, 8, 5, 3, 0, 0, 0, 0, 90, 50],
      [1, 0, 20, 10, 4, 2, 0, 0, 0, 0, 90, 40],
    ] as typeof record.metrics,
  };
  const away = {
    ...home,
    id: 'away',
    home: 'rival',
    away: w.playerClub,
    score: { home: 0, away: 0 },
  };
  const stats = matchSplit([home, away], w.playerClub);
  expect(stats).toMatchObject({
    played: 2,
    won: 1,
    drawn: 1,
    lost: 0,
    gf: 3,
    ga: 1,
    pass: { numerator: 18, denominator: 30 },
  });
  expect(matchSplit([home, away], w.playerClub, 'away').played).toBe(1);
  expect(matchSplit([], w.playerClub).goalsPerMatch).toBeUndefined();
  const many = Array.from({ length: 15 }, (_, i) => ({ ...home, id: `game-${i}`, round: 15 - i }));
  const recent = recentGoalDifferences(many, w.playerClub);
  expect(recent).toHaveLength(10);
  expect(recent[0].record.round).toBe(6);
  expect(recent.at(-1)!.record.round).toBe(15);
});
