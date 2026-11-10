// The prototype's only source of randomness (-> ARCH-5): a seeded generator whose stream is fixed by
// its seed string. The hash and the generator are written out exactly; rng.test.ts pins their
// reference vectors.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
  /** Uniform integer in [lo, hi], both inclusive. */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  /** One item by weight (equal weights when omitted). Throws on an empty list or a non-positive total. */
  pick<T>(items: readonly T[], weights?: readonly number[]): T;
  /** An independent generator named by this generator's seed and `label`; draws nothing from this one. */
  fork(label: string): Rng;
}

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: string): Rng {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick<T>(items: readonly T[], weights?: readonly number[]): T {
      if (items.length === 0) throw new Error('pick: empty list');
      if (weights !== undefined && weights.length !== items.length) {
        throw new Error('pick: weights and items differ in length');
      }
      const w = weights ?? items.map(() => 1);
      const total = w.reduce((sum, x) => sum + x, 0);
      if (!(total > 0)) throw new Error('pick: non-positive total weight');
      let u = next() * total;
      for (let i = 0; i < items.length; i++) {
        u -= w[i];
        if (u < 0) return items[i];
      }
      return items[items.length - 1];
    },
    fork: (label) => createRng(`${seed}#${label}`),
  };
}
