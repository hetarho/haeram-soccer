import { clearDebt } from './books';
import { cohesionAfterSummer } from './adaptation';
import type { Club, World } from '../../contracts/src/types';
import { clamp, random } from './primitives';
import { npcSquad, stature, tierLevel } from './world';
import { pushInbox } from './inbox';
import { marketWageAt } from './market-prices';

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
  /** Nor falls below the weakest strength a club plays at (→LEAGUE-10: 15–99). */
  floor: 15,
} as const;

/**
 * LEAGUE-10's means level (→ECON-36, CLUB-25, CLUB-48): a club nobody owns that keeps books plays
 * at most at the highest strength whose generated squad its last closed season's book pays — that
 * squad's market wage bill, priced in the division and season the book was earned, at most the
 * book's income less its operating expenses — and a club above it after its summer change sells
 * down to it at once. A club with a project, or in the summer of its takeover, is not held; a club
 * without books has none. In force together with CLUB-48's table (`STAR_SPREAD_CONFIG`) and the
 * books' competition money (`BOOK_COMPETITIONS`), never alone: the three passed CLUB-48 r58's gate
 * (artifacts/benchmarks/T697, T698, T699); `observe` is a measurement hook, never a setting.
 */
export const MEANS_LEVEL: {
  inForce: boolean;
  observe?: (club: Club, from: number, to: number) => void;
} = { inForce: true };

/** What a club's last closed book leaves for its squad's wages: its income less its operating expenses. */
export function meansOf(c: Club) {
  const book = c.books?.seasons[0];
  return book && { year: book.year, budget: BigInt(book.income) - BigInt(book.costs) };
}

/**
 * The market wage bill of `c`'s generated squad at `strength` (→WORLD-6), priced as the books
 * price a squad (→ECON-36): each player's market wage in `tier` and `year` (→CLUB-25, CLUB-48).
 */
export function squadCostAt(w: World, c: Club, strength: number, tier: number, year: number) {
  return npcSquad(w.seed, year, { ...c, strength, tier }).reduce(
    (sum, p) => sum + BigInt(marketWageAt(c.country, year, tier, p)),
    0n,
  );
}

/**
 * The highest strength from the floor to `upTo` whose generated squad, in `tier` and the book's
 * season, costs at most `c`'s means (`meansOf`); the floor when none does, undefined without a
 * closed book. Each strength is generated once (`cost`); a squad's cost rises with its strength,
 * so a binary search finds the strength that fits with the next one up costing more. `extra`
 * adds to the means, in the book's money: a measurement's counterfactual (T697), 0 in play.
 */
export function meansLevel(
  w: World,
  c: Club,
  tier: number,
  upTo: number = EVOLUTION.ceiling,
  cost = memoCost(w, c, tier),
  extra = 0n,
) {
  const means = meansOf(c);
  if (!means) return undefined;
  const budget = means.budget + extra;
  const fits = (strength: number) => cost(strength, means.year) <= budget;
  if (fits(upTo)) return upTo;
  let low: number = EVOLUTION.floor,
    high = upTo;
  if (!fits(low)) return low;
  // fits(low) and not fits(high): narrow to neighbours.
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}
function memoCost(w: World, c: Club, tier: number) {
  const costs = new Map<number, bigint>();
  return (strength: number, year: number) => {
    let cost = costs.get(strength);
    if (cost === undefined) costs.set(strength, (cost = squadCostAt(w, c, strength, tier, year)));
    return cost;
  };
}

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
  return tierLevel(c.tier) + stature(w.seed, c.id) + successBonus(w, c) + (c.project ?? 0);
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
    c.strength = Math.round(clamp(next, e.floor, e.ceiling));
    // A club nobody owns keeps only the stars its last closed book pays (→LEAGUE-10, ECON-36).
    if (MEANS_LEVEL.inForce && !project && !takeover && c.project === undefined) {
      const held = meansLevel(w, c, before, c.strength);
      if (held !== undefined && held < c.strength) {
        MEANS_LEVEL.observe?.(c, c.strength, held);
        c.strength = held;
      }
    }
    // New money buys players, not a team: the squad's 조직력 starts again (→LEAGUE-12).
    cohesionAfterSummer(c, { investment: project || takeover, move: c.tier !== before });
    // ...and pays what the club owes (→ECON-36).
    if (project || takeover) clearDebt(c);
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
