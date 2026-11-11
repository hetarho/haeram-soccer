// Pure helpers on 2D vectors for the staging (→MATCH-39), ported from the match prototype's
// core/vec.ts (T823); every function returns a new tuple and never mutates its inputs. The
// staging's positions are presentation (→ARCH-9), so plain double arithmetic is enough here.

/** `[x, y]` in pitch metres. */
export type Vec = readonly [number, number];

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];

export const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];

export const len = (a: Vec): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);

export const dist = (a: Vec, b: Vec): number => len(sub(a, b));

/** Unit vector along `a`; the zero vector gives `[0, 0]`. */
export const norm = (a: Vec): Vec => {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
};

export const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1];

/** `a` turned a quarter turn: `[-a[1], a[0]]`. */
export const perp = (a: Vec): Vec => [-a[1], a[0]];

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The point of segment `a`-`b` nearest `p`, with `t` in 0-1 along it (0 for a zero-length segment). */
export const closestOnSegment = (a: Vec, b: Vec, p: Vec): { point: Vec; t: number } => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return { point: lerp(a, b, t), t };
};

/** Moves from `from` toward `to` by at most `maxStep`, never past `to`. */
export const approach = (from: Vec, to: Vec, maxStep: number): Vec => {
  const d = dist(from, to);
  if (d <= maxStep) return [to[0], to[1]];
  return add(from, scale(norm(sub(to, from)), Math.max(0, maxStep)));
};
