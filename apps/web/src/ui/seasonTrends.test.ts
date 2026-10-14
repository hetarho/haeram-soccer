import { expect, it } from 'vitest';
import { createWorld, nextOwnFixture, simulateMatch } from '../../../../packages/engine/src/index';
import { fixtureDay } from '../../../../packages/engine/src/calendar';
import { matchSplit, seasonProgress } from './seasonTrends';
it('uses the own perspective, weighted denominators and the season built up in playing order', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Season',
    color: '#24664f',
    seed: 'season-analysis',
    level: 'easy' as const,
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
  const cup = { ...home, id: 'cup', kind: 'cup' as const, score: { home: 0, away: 2 } };
  const progress = seasonProgress([away, cup, home], w.playerClub);
  expect(progress.map((step) => step.record.id)).toEqual(
    [away, cup, home]
      .slice()
      .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id))
      .map((m) => m.id),
  );
  // The cup defeat moves the goal difference only; the league win and draw bring four points.
  expect(progress.at(-1)).toMatchObject({ points: 4, difference: 0 });
  expect(progress.filter((step) => step.league)).toHaveLength(2);
});
