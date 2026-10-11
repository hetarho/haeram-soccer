import type { Club, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clamp, random } from './primitives';
import { stature, tierLevel } from './world';

/**
 * Between seasons every club nobody owns rises or falls (→LEAGUE-10): it drifts toward the level
 * of its division plus its own stature, promotion money lifts it at once and relegation drops it,
 * success pays, a normal spread of luck moves everyone and a rare takeover or crisis jumps a club.
 * Fixed strengths let one well-run club pull away forever; real leagues see clubs rise and fall
 * while a few stay on top.
 */
export const EVOLUTION = {
  /** Share of the gap to its level a club closes each summer. */
  reversion: 0.2,
  /** Extra share closed at once after promotion (new money) or relegation (lost income). */
  promoted: 0.35,
  relegated: 0.15,
  /** Spread of an ordinary summer, in strength points (sum of three uniforms, sd ≈ 1.5). */
  luck: 3,
  /** Chance and size of a takeover or a financial crisis each summer. */
  takeover: { chance: 0.015, min: 4, max: 8 },
  crisis: { chance: 0.015, min: 4, max: 8 },
} as const;

/**
 * Success pays: last season's champion settles 3 points higher, the rest of the top four 1.5, a
 * continental winner 2 more, so dynasties can form while every club keeps drifting home.
 */
export function successBonus(w: World, c: Club) {
  const last = w.history.at(-1);
  if (!last) return 0;
  let bonus = last.europe.some((e) => e.winner === c.id && e.kind !== 'super') ? 2 : 0;
  if (c.id.startsWith('euro:')) return bonus;
  const top = last.standings
    .filter((row) => w.clubs[row[0]].country === c.country && row[1] === 0)
    .sort((a, b) => b[3] - a[3] || b[4] - b[5] - (a[4] - a[5]) || b[4] - a[4]);
  const rank = top.findIndex((row) => w.clubs[row[0]].id === c.id);
  if (rank === 0) bonus += 3;
  else if (rank > 0 && rank < 4) bonus += 1.5;
  return bonus;
}
/** The strength a club settles toward in its current division. */
export function levelOf(w: World, c: Club) {
  if (c.id.startsWith('euro:')) return 68 + stature(w.seed, c.id) + successBonus(w, c);
  const depth = country(c.country).groups.length;
  return (
    tierLevel(Math.min(c.tier, depth), c.tier >= depth) + stature(w.seed, c.id) + successBonus(w, c)
  );
}

/** Season close, after promotion and relegation; `tiers` holds each club's division before it. */
export function evolveClubs(w: World, tiers: ReadonlyMap<string, number>) {
  const e = EVOLUTION;
  for (const c of w.clubs) {
    if (c.id === w.playerClub) continue;
    const r = random(`${w.seed}:evolve:${w.year}:${c.id}`);
    const target = levelOf(w, c),
      gap = target - c.strength,
      before = tiers.get(c.id) ?? c.tier;
    let next = c.strength + gap * e.reversion + (r() + r() + r() - 1.5) * e.luck;
    if (c.tier < before) next += Math.max(0, gap) * e.promoted;
    else if (c.tier > before) next += Math.min(0, gap) * e.relegated;
    const event = r();
    if (event < e.takeover.chance) next += e.takeover.min + r() * (e.takeover.max - e.takeover.min);
    else if (event < e.takeover.chance + e.crisis.chance)
      next -= e.crisis.min + r() * (e.crisis.max - e.crisis.min);
    c.strength = Math.round(clamp(next, 15, 92));
    if (!c.id.startsWith('euro:')) {
      const depth = country(c.country).groups.length;
      const reputation = c.tier >= depth ? 8 : Math.max(8, 75 - c.tier * 15);
      c.reputation = Math.round(clamp(c.reputation + (reputation - c.reputation) * 0.3));
    }
  }
}
