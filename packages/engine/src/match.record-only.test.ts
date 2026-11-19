import { describe, expect, it } from 'vitest';
import { generateLabSide } from './lab/sides';
import { playLabMatch, watchLabMatch } from './lab/match';
import { tinyLabWorld } from './lab/match.testkit';

describe('aggregate record without attribution', () => {
  it('keeps every recorded value with and without the watched trace for two seeds', () => {
    const lab = tinyLabWorld();
    const sides = ([0, 1] as const).map((side) =>
      generateLabSide({ side, seed: 'record-only', tactic: 'balanced', average: 70, spread: 6 }),
    ) as [ReturnType<typeof generateLabSide>, ReturnType<typeof generateLabSide>];
    for (const seed of ['record-only-a', 'record-only-b']) {
      const fast = playLabMatch(lab, sides, seed, 0);
      const watched = watchLabMatch(lab, sides, seed);
      expect(watched.problems).toBeUndefined();
      expect(watched.script?.beats.length).toBeGreaterThan(0);
      expect(watched.staging).toBeDefined();
      expect(watched.record.material).toBeDefined();
      const { material: _material, appearance: _appearance, ...record } = watched.record;
      void [_material, _appearance];
      expect(record).toEqual(fast.record);
    }
  });
});
