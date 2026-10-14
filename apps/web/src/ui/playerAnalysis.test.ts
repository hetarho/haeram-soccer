import { lineOf } from '../../../../packages/engine/src/player';
import { expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { explorePlayers, per90, playsUnder } from './playerAnalysis';
it('uses minutes, scopes and role filters before sorting, without deleting inactive records', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Rates',
    color: '#24664f',
    seed: 'rates',
    level: 'easy' as const,
  });
  const [a, b, c] = w.players.filter((p) => lineOf(p.position) === 'FW');
  a.season[0] = 2;
  a.season[10] = 180;
  b.season[0] = 3;
  b.season[10] = 90;
  b.status = 'sold';
  b.career = [...b.season];
  c.season[10] = 0;
  expect(per90(a.season, 0)).toBe(1);
  expect(per90(c.season, 0)).toBeUndefined();
  const options = {
    scope: 'season' as const,
    role: 'FW' as const,
    query: '',
    minutes: 90,
    order: 'goals90' as const,
  };
  expect(explorePlayers([a, b, c], options).map((p) => p.id)).toEqual([a.id]);
  expect(explorePlayers([a, b, c], { ...options, scope: 'career' }).map((p) => p.id)).toEqual([
    b.id,
  ]);
  expect(explorePlayers([a, b, c], { ...options, minutes: 0 }).at(-1)!.id).toBe(c.id);
  expect(w.players).toContain(b);
});

it('position filter counts 준수+', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Positions',
    color: '#24664f',
    seed: 'positions',
    level: 'easy' as const,
  });
  const p = w.players.find((one) => one.position === 'CB')!;
  p.positions = { CB: 3, LB: 2, DM: 1 };
  // Under each position he plays at 준수 or better, and under the line of each.
  expect(playsUnder(p, 'CB')).toBe(true);
  expect(playsUnder(p, 'LB')).toBe(true);
  expect(playsUnder(p, 'DM')).toBe(false);
  expect(playsUnder(p, 'DF')).toBe(true);
  expect(playsUnder(p, 'MF')).toBe(false);
  expect(playsUnder(p, 'all')).toBe(true);
  // A centre back who plays defensive midfield at 준수 counts under midfield too.
  p.positions = { CB: 3, DM: 2 };
  expect(playsUnder(p, 'MF')).toBe(true);
  const options = { scope: 'season' as const, query: '', minutes: 0, order: 'roster' as const };
  expect(explorePlayers(w.players, { ...options, role: 'DM' }).map((one) => one.id)).toContain(
    p.id,
  );
  expect(
    explorePlayers(w.players, { ...options, role: 'RW' }).every(
      (one) => (one.positions.RW ?? 0) >= 2,
    ),
  ).toBe(true);
});
