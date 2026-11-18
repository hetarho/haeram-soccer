import { describe, expect, it, vi } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { ageingCurve, mainOvr } from './player';
import { makePlayer } from './world';
import { expectedOvr } from './training';
import * as primitives from './primitives';

const seed = 'expected-growth';
function player(id = 'prospect', age = 20, ability = 65, potential = 90) {
  const p = makePlayer('ENG', seed, id, 1950, ability, 'CM', age);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  p.potential = potential;
  return p;
}
const levels = (id: string) => ({
  year: 1950,
  youth: 60,
  ground: 1.2,
  coaching: 1.1,
  ageing: ageingCurve(seed, id),
});

describe('mean-path development projection', () => {
  it('evolves current ability with club development and caps it at potential', () => {
    const p = player();
    const at = levels(p.id);
    const one = expectedOvr(p, 1, at),
      two = expectedOvr(p, 2, at);
    expect(one).toBeGreaterThan(mainOvr(p));
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(p.potential);
    expect(expectedOvr(p, 2, { ...at, ground: 1.75, coaching: 1.25 })).toBeGreaterThan(two);
    const capped = player('near-ceiling', 20, 65, 65.1);
    expect(expectedOvr(capped, 2, levels(capped.id))).toBeLessThanOrEqual(capped.potential);
  });

  it('reads the actual individual ageing curve in each projected season', () => {
    const ids = Array.from({ length: 1000 }, (_, n) => `curve-${n}`);
    const early = ids.find((id) => ageingCurve(seed, id).shift <= -3)!;
    const late = ids.find((id) => ageingCurve(seed, id).shift >= 3)!;
    const youngOnset = player(early, 28, 65, 65),
      lateOnset = player(late, 28, 65, 65);
    expect(expectedOvr(youngOnset, 2, levels(early))).toBeLessThan(65);
    expect(expectedOvr(lateOnset, 2, levels(late))).toBe(65);
  });

  it('leaves player facts untouched and makes no random draw', () => {
    const p = player();
    const before = structuredClone(p),
      at = levels(p.id);
    const draw = vi.spyOn(primitives, 'random').mockImplementation(() => {
      throw new Error('A projection must not draw randomness');
    });
    try {
      expect(expectedOvr(p, 2, at)).toBeGreaterThan(mainOvr(p));
      expect(draw).not.toHaveBeenCalled();
      expect(p).toEqual(before);
    } finally {
      draw.mockRestore();
    }
  });
});
