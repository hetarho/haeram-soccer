/** Scripted summers belong only to representative clubs (→LEAGUE-10). */
import type { Club, World } from '../../contracts/src/types';
import { cohesionAfterSummer } from './adaptation';
import { clamp, random } from './primitives';
import { stature } from './world';

export const EVOLUTION = {
  /** Share of the gap to its level a club closes each summer. */
  reversion: 0.2,
  /** Spread of an ordinary summer, in strength points (sum of three uniforms, sd ≈ 1.5). */
  luck: 3,
  /** Chance and size of a takeover or a financial crisis each summer. */
  takeover: { chance: 0.015, min: 4, max: 8 },
  crisis: { chance: 0.015, min: 4, max: 8 },
  /**
   * A rare project that remakes a club (a rich owner, a golden generation): its level rises for
   * years, fading 15% a summer, so any club can build a side as strong as the owner's.
   */
  project: { chance: 0.004, min: 8, max: 18, fade: 0.85 },
  /** No club nobody owns is capped below the very best an owner can build. */
  ceiling: 99,
  /** Nor falls below the weakest strength a club plays at (→LEAGUE-10: 15–99). */
  floor: 15,
} as const;


/** Only continental success changes a representative club's target. */
export function successBonus(w: World, c: Club) {
  if (!c.representative) return 0;
  return w.history.at(-1)?.europe.some((e) => e.winner === c.id && e.kind !== 'super') ? 2 : 0;
}
export function levelOf(w: World, c: Club) {
  return c.representative
    ? 68 + stature(w.seed, c.id) + successBonus(w, c) + (c.project ?? 0)
    : c.strength;
}

/** Playable clubs only pay the promotion/relegation cohesion cost; their players set strength. */
export function evolveClubs(w: World, tiers: ReadonlyMap<string, number>) {
  const e = EVOLUTION;
  for (const c of w.clubs) {
    if (c.id === w.playerClub) continue;
    cohesionAfterSummer(c, { move: c.tier !== (tiers.get(c.id) ?? c.tier) });
    if (!c.representative) continue;
    if (c.project !== undefined) {
      c.project = Math.round(c.project * e.project.fade * 10) / 10;
      if (c.project < 1) delete c.project;
    }
    const p = random(`${w.seed}:project:${w.year}:${c.id}`);
    if (p() < e.project.chance)
      c.project = Math.round((c.project ?? 0) + e.project.min + p() * (e.project.max - e.project.min));
    const r = random(`${w.seed}:evolve:${w.year}:${c.id}`);
    let next = c.strength + (levelOf(w, c) - c.strength) * e.reversion +
      (r() + r() + r() - 1.5) * e.luck;
    const event = r();
    if (event < e.takeover.chance) next += e.takeover.min + r() * (e.takeover.max - e.takeover.min);
    else if (event < e.takeover.chance + e.crisis.chance)
      next -= e.crisis.min + r() * (e.crisis.max - e.crisis.min);
    c.strength = Math.round(clamp(next, e.floor, e.ceiling));
  }
}
