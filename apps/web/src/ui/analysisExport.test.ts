import { expect, it } from 'vitest';
import { createWorld, nextOwnFixture, simulateMatch } from '../../../../packages/engine/src/index';
import { analysisDataset } from './analysisExport';
it('exports only explicit owned periods and keeps original source identity and inactive scopes', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'CSV',
    color: '#24664f',
    seed: 'csv',
    difficulty: 2,
  });
  const record = simulateMatch(w, nextOwnFixture(w)!, false, true).record;
  const dataset = analysisDataset(
    w,
    'matches',
    [record, { ...record, year: 1902, id: 'future' }],
    1901,
    'season',
  );
  expect(dataset.rows).toHaveLength(1);
  expect(dataset.rows[0][dataset.headers.indexOf('fixture_id')]).toBe(record.id);
  expect(dataset.rows[0][dataset.headers.indexOf('home_goals')]).toBe(record.score.home);
  expect(dataset.rows[0].length).toBe(dataset.headers.length);
  w.players[0].status = 'retired';
  expect(analysisDataset(w, 'players', [], 1901, 'season').rows).toHaveLength(w.players.length - 1);
  const players = analysisDataset(w, 'players', [], 1901, 'career');
  expect(players.rows).toHaveLength(w.players.length);
  expect(players.rows[0].length).toBe(players.headers.length);
  expect(analysisDataset(w, 'seasons', [], 1901, 'season').rows).toEqual([]);
});
