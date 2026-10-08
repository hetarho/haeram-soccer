import { expect, it } from 'vitest';
import { clubOf, createWorld, startingSquad } from '../../../../packages/engine/src/index';
import { compareTactics, signedPoint } from './tacticComparison';

it('keeps previews pure, uses the applied baseline and exposes pressing fatigue cost', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Lab',
    color: '#24664f',
    seed: 'lab',
    difficulty: 2,
  });
  const players = startingSquad(w, clubOf(w));
  const before = JSON.stringify(w);
  const rows = compareTactics(players, 'counter', 'press');
  expect(rows).toHaveLength(4);
  expect(rows.find((row) => row.tactic === 'counter')).toMatchObject({
    possession: 0,
    pass: 0,
    shot: 0,
    defense: 0,
  });
  expect(
    rows.find((row) => row.tactic === 'press')!.fatigue -
      rows.find((row) => row.tactic === 'balanced')!.fatigue,
  ).toBeCloseTo(6);
  expect(
    compareTactics(players, 'balanced', 'press').find((row) => row.tactic === 'counter')!.shot,
  ).toBeGreaterThan(
    compareTactics(players, 'balanced', 'balanced').find((row) => row.tactic === 'counter')!.shot,
  );
  expect(JSON.stringify(w)).toBe(before);
  expect(signedPoint(-0.01)).toBe('0.0');
});
