import { expect, it } from 'vitest';
import { recordOf, detailIssues } from './build';
import { detailSample } from './sample.testkit';

/** Full aggregate fixtures, two real world setups and a seeded rare-incident search: integration. */
it('every row counts back to the record', () => {
  const { selected, covered, needed } = detailSample();
  expect(selected).toHaveLength(60);
  expect(needed.filter((k) => !covered.has(k))).toEqual([]);
  for (const world of [0, 1]) {
    expect(
      new Set(selected.filter((s) => s.world === world).map((s) => s.tactics.join('/'))).size,
    ).toBe(16);
  }
  for (const { record, detail } of selected) {
    expect(detailIssues(detail), detail.id).toEqual([]);
    const rebuilt = recordOf(detail);
    for (const key of [
      'score',
      'metrics',
      'detail',
      'players',
      'xg',
      'incidents',
      'regulation',
      'shootout',
    ] as const)
      expect(rebuilt[key], `${detail.id}/${key}`).toEqual(record[key]);
  }
  console.info(
    'T825 record recount',
    JSON.stringify({
      fixtures: selected.length,
      years: [2024, 1975],
      covered: [...covered].sort(),
    }),
  );
});
