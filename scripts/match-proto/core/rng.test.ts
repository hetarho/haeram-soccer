import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng.ts';

const draws = (seed: string, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next().toFixed(12)).join(' ');
};

describe('match-proto rng', () => {
  it('matches the reference vectors', () => {
    expect(hashSeed('match-proto')).toBe(240256717);
    expect(draws('match-proto', 3)).toBe('0.706957159098 0.862115827156 0.862389033660');
    expect(hashSeed('demo')).toBe(1128472497);
    expect(draws('demo', 3)).toBe('0.252236970002 0.628709833603 0.902273188345');
    expect(hashSeed('demo#fork')).toBe(183822517);
    expect(draws('demo#fork', 3)).toBe('0.081929178443 0.073637237540 0.261845047818');
  });

  it('pick follows the weights', () => {
    const rng = createRng('demo');
    const picks = Array.from({ length: 12 }, () => rng.pick([0, 1, 2], [1, 2, 7])).join('');
    expect(picks).toBe('122201222220');
    expect(() => rng.pick([])).toThrow();
    expect(() => rng.pick([0, 1], [0, 0])).toThrow();
  });

  it('int is inclusive', () => {
    const rng = createRng('demo');
    expect(Array.from({ length: 6 }, () => rng.int(1, 6)).join('')).toBe('246312');
    const wide = createRng('match-proto');
    const seen = new Set(Array.from({ length: 200 }, () => wide.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('fork is independent of draw order', () => {
    const named = createRng('demo#fork').next();
    expect(createRng('demo').fork('fork').next()).toBe(named);
    const used = createRng('demo');
    used.next();
    used.int(1, 6);
    expect(used.fork('fork').next()).toBe(named);
    const parent = createRng('demo');
    parent.fork('fork').next();
    expect(parent.next()).toBe(createRng('demo').next());
  });
});
