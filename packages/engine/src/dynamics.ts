import { cohesionAfterSummer } from './adaptation';
import type { Club, World } from '../../contracts/src/types';
import { country } from '../../catalogs/src/index';
import { clamp, random } from './primitives';
import { stature, tierLevel } from './world';
import { pushInbox } from './inbox';

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
  /**
   * A rare project that remakes a club (a rich owner, a golden generation): its level rises for
   * years, fading 15% a summer, so any club can build a side as strong as the owner's.
   */
  project: { chance: 0.004, min: 8, max: 18, fade: 0.85 },
  /** No club nobody owns is capped below the very best an owner can build. */
  ceiling: 99,
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
  if (c.id.startsWith('euro:'))
    return 68 + stature(w.seed, c.id) + successBonus(w, c) + (c.project ?? 0);
  const depth = country(c.country).groups.length;
  return (
    tierLevel(Math.min(c.tier, depth), c.tier >= depth) +
    stature(w.seed, c.id) +
    successBonus(w, c) +
    (c.project ?? 0)
  );
}

/** Season close, after promotion and relegation; `tiers` holds each club's division before it. */
export function evolveClubs(w: World, tiers: ReadonlyMap<string, number>) {
  const e = EVOLUTION;
  for (const c of w.clubs) {
    if (c.id === w.playerClub) continue;
    // A project fades each summer; a new one starts from its own stream so the rest stays put.
    if (c.project !== undefined) {
      c.project = Math.round(c.project * e.project.fade * 10) / 10;
      if (c.project < 1) delete c.project;
    }
    const p = random(`${w.seed}:project:${w.year}:${c.id}`);
    const project = p() < e.project.chance;
    if (project) {
      c.project = Math.round(
        (c.project ?? 0) + e.project.min + p() * (e.project.max - e.project.min),
      );
      announceProject(w, c);
    }
    const r = random(`${w.seed}:evolve:${w.year}:${c.id}`);
    const target = levelOf(w, c),
      gap = target - c.strength,
      before = tiers.get(c.id) ?? c.tier;
    let next = c.strength + gap * e.reversion + (r() + r() + r() - 1.5) * e.luck;
    if (c.tier < before) next += Math.max(0, gap) * e.promoted;
    else if (c.tier > before) next += Math.min(0, gap) * e.relegated;
    const event = r();
    const takeover = event < e.takeover.chance;
    if (takeover) next += e.takeover.min + r() * (e.takeover.max - e.takeover.min);
    else if (event < e.takeover.chance + e.crisis.chance)
      next -= e.crisis.min + r() * (e.crisis.max - e.crisis.min);
    c.strength = Math.round(clamp(next, 15, e.ceiling));
    // New money buys players, not a team: the squad's 조직력 starts again (→LEAGUE-12).
    cohesionAfterSummer(c, { investment: project || takeover, move: c.tier !== before });
  }
}
/** A rival project in the owner's country and within a division of us makes the club news. */
function announceProject(w: World, c: Club) {
  const own = w.clubs.find((club) => club.id === w.playerClub);
  if (!own || c.country !== own.country || Math.abs(c.tier - own.tier) > 1) return;
  pushInbox(w, {
    kind: 'staff-report',
    title: `${c.name}, 대형 투자 유치`,
    detail: `새 구단주와 대규모 투자로 앞으로 몇 시즌 동안 전력이 크게 오를 전망이에요. 지금 전력 ${c.strength}.`,
    attention: false,
  });
}
