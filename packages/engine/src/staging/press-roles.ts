/** Pure role choice over the world's unchanged eligible defender set. */
import type { Vec } from './types';
import { add, dist, norm, scale, sub } from './vec';

export interface PressCandidate {
  index: number;
  /** Existing distance to the shape's ball reference. */
  d: number;
}
export interface PressRoles {
  presser: number;
  cover: number;
}

export const pressCoverPoint = (ref: Vec, goal: Vec, gap: number): Vec =>
  add(ref, scale(norm(sub(goal, ref)), gap));

/** The nearest eligible presser stays; the remaining defender best placed for cover covers. */
export function selectPressRoles(
  candidates: readonly PressCandidate[],
  positions: readonly Vec[],
  coverPoint: Vec,
): PressRoles {
  const ranked = [...candidates].sort((a, b) => a.d - b.d || a.index - b.index);
  const presser = ranked[0]?.index ?? -1;
  const cover =
    ranked
      .slice(1)
      .sort(
        (a, b) =>
          dist(positions[a.index], coverPoint) - dist(positions[b.index], coverPoint) ||
          a.d - b.d ||
          a.index - b.index,
      )[0]?.index ?? -1;
  return { presser, cover };
}
