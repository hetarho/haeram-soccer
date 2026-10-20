import { expect, it } from 'vitest';
import { clubOf, createWorld, startingSquad } from '../../../../packages/engine/src/index';
import { compareTactics, signedPoint } from './tacticComparison';

it('keeps previews pure, uses the applied baseline and exposes pressing fatigue cost', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Lab',
    color: '#24664f',
    seed: 'lab',
    level: 'easy' as const,
  });
  const players = startingSquad(w, clubOf(w));
  const before = JSON.stringify(w);
  const rows = compareTactics(w, players, 'counter', 'press');
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
    compareTactics(w, players, 'balanced', 'press').find((row) => row.tactic === 'counter')!.shot,
  ).toBeGreaterThan(
    compareTactics(w, players, 'balanced', 'balanced').find((row) => row.tactic === 'counter')!
      .shot,
  );
  expect(JSON.stringify(w)).toBe(before);
  expect(signedPoint(-0.01)).toBe('0.0');
});

it('includes the manager style in the lab', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Lab',
    color: '#24664f',
    seed: 'lab',
    level: 'easy' as const,
  });
  const players = startingSquad(w, clubOf(w));
  w.manager = { ...w.manager, interim: false, style: undefined };
  const plain = compareTactics(w, players, 'balanced', 'press');
  // 포지셔널 플레이: pass +2 (→STAFF-14), the same bend the match plays.
  w.manager = { ...w.manager, style: 'positional' };
  const styled = compareTactics(w, players, 'balanced', 'press');
  styled.forEach((row, i) => {
    expect(row.modifiers.pass - plain[i]!.modifiers.pass).toBeCloseTo(2);
    expect(row.pass).toBeCloseTo(plain[i]!.pass);
    expect(row.fit).toBe(plain[i]!.fit);
  });
});
