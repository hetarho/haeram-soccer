import { expect, it } from 'vitest';
import { nextOwnFixture, simulateMatch } from '../../../../../../packages/engine/src/index';
import { careerWorld, CAREER_YEAR } from '../../../../../../packages/engine/src/career.testkit';
import { analysisDataset } from './analysisDataset';
it('exports only explicit owned periods and keeps original source identity and inactive scopes', () => {
  const w = careerWorld({ country: 'ENG', seed: 'csv' });
  const record = simulateMatch(w, nextOwnFixture(w)!, false, true).record;
  const dataset = analysisDataset(
    w,
    'matches',
    [record, { ...record, year: CAREER_YEAR + 1, id: 'future' }],
    CAREER_YEAR,
    'season',
  );
  expect(dataset.rows).toHaveLength(1);
  expect(dataset.rows[0][dataset.headers.indexOf('fixture_id')]).toBe(record.id);
  expect(dataset.rows[0][dataset.headers.indexOf('home_goals')]).toBe(record.score.home);
  expect(dataset.rows[0].length).toBe(dataset.headers.length);
  w.players[0].status = 'retired';
  expect(analysisDataset(w, 'players', [], CAREER_YEAR, 'season').rows).toHaveLength(
    w.players.length - 1,
  );
  const players = analysisDataset(w, 'players', [], CAREER_YEAR, 'career');
  expect(players.rows).toHaveLength(w.players.length);
  expect(players.rows[0].length).toBe(players.headers.length);
  expect(analysisDataset(w, 'seasons', [], CAREER_YEAR, 'season').rows).toEqual([]);
});
