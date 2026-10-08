import { expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { explorePlayers, per90 } from './playerAnalysis';
it('uses minutes, scopes and role filters before sorting, without deleting inactive records', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Rates',
    color: '#24664f',
    seed: 'rates',
    difficulty: 2,
  });
  const [a, b, c] = w.players.filter((p) => p.role === 'FWD');
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
    role: 'FWD' as const,
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
