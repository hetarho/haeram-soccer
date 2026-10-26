/** Substitutions by the manager and injuries in play (→MATCH-20, MATCH-21, STAFF-45, CLUB-23; design §8.1). */
import type { Manager } from '../../../contracts/src/types';
import { injuryChance } from '../injury-rules';
import { FORMATIONS, lineOf } from '../player';
import { slotOvr } from '../player-state';
import { attackFrame } from './pitch';
import { DEFAULT_SUB_POLICY, type SubPolicy } from './rules';
import { enterSlot, onPitch, other, regMinute, type GridPlayer, type GridState } from './state';

/** Thresholds of the managers' substitutions (STAFF-45) and the injury hazard (CLUB-23). */
export const CHANGES_CONFIG = {
  /** Fatigue up to this is match fitness; a player past it by `tired` is tired. */
  fitness: 20,
  tired: 15,
  /** In-match fatigue per missing stamina point over 90 minutes, and under press. */
  drain: 0.35,
  pressDrain: 1.3,
  earlyPressFrom: 55,
  protectFrom: 75,
  chaseFrom: 60,
  youthFrom: 80,
  youthAge: 21,
  /** Bench players within this many OVR points count as equal options. */
  youthMargin: 3,
  dataAt: [60, 70, 80],
  /** The hazard rises through the match: 0.7 at kick-off to 1.3 at 90′, averaging 1. */
  hazardFrom: 0.7,
  hazardRise: 0.6,
} as const;

export type ChangeReason = 'injury' | 'rebalance' | 'protect' | 'chase' | 'youth' | 'policy';

/** One substitution: `in` comes on for `out` and plays `slot`. */
export interface Change {
  out: number;
  in: number;
  slot: number;
  reason: ChangeReason;
}

/** How a manager substitutes, from his school and selection trait (STAFF-45); interims and the founding manager follow the default. */
export function subPolicyFor(manager: Manager | undefined): SubPolicy {
  if (!manager || manager.interim) return { ...DEFAULT_SUB_POLICY };
  const { style, trait } = manager;
  const earlyPress = style === 'gegenpress' || trait === 'rotation';
  return {
    ...DEFAULT_SUB_POLICY,
    fatigueFrom: earlyPress ? CHANGES_CONFIG.earlyPressFrom : DEFAULT_SUB_POLICY.fatigueFrom,
    earlyPress,
    protectLead: style === 'counter' || style === 'organizer',
    chaseWhenBehind: style === 'firefighter' || style === 'motivator',
    youth: style === 'developer' || trait === 'youth',
    data: style === 'headcoach',
    delay: trait === 'stable' ? 10 : 0,
  };
}

/** How much of a match's injury chance an action of `dt` seconds carries now. */
const hazardShare = (s: GridState, dt: number) =>
  (dt / 5400) * (CHANGES_CONFIG.hazardFrom + (CHANGES_CONFIG.hazardRise * regMinute(s)) / 90);

/** The chance that `gp` is hurt during an action of `dt` seconds now; over a full match it sums to →CLUB-23's. */
export function injuryHazard(s: GridState, gp: GridPlayer, dt: number): number {
  return injuryChance(gp.player, s.setup.pressing[gp.side]) * hazardShare(s, dt);
}

/** Each player's match injury chance; it depends only on pre-match values. */
const chances = new WeakMap<GridPlayer, number>();

/** At most one player hurt in an action of `dt` seconds, with one draw from the match stream. */
export function drawInjury(s: GridState, dt: number, r: () => number): GridPlayer | undefined {
  let u = r() / hazardShare(s, dt);
  for (const side of s.players)
    for (const gp of side) {
      if (!onPitch(gp)) continue;
      let chance = chances.get(gp);
      if (chance === undefined) {
        chance = injuryChance(gp.player, s.setup.pressing[gp.side]);
        chances.set(gp, chance);
      }
      u -= chance;
      if (u < 0) return gp;
    }
  return undefined;
}

/**
 * In-match fatigue after `minutes` on the pitch (design §8.1): the pre-match fatigue plus the drain
 * of missing 체력, faster under press and by the side's drain. The aggregate planner applies the
 * same rule (aggregate/participation.ts).
 */
export function inMatchFatigue(
  fatigue: number,
  stamina: number,
  minutes: number,
  pressing: boolean,
  drain: number,
): number {
  return (
    fatigue +
    (((100 - stamina) * minutes) / 90) *
      CHANGES_CONFIG.drain *
      (pressing ? CHANGES_CONFIG.pressDrain : 1) *
      drain
  );
}

/** A player's fatigue now: his pre-match fatigue plus what his minutes have drained (design §8.1). */
export function matchFatigue(s: GridState, gp: GridPlayer): number {
  const { setup } = s;
  return inMatchFatigue(
    gp.player.fatigue,
    gp.player.attrs.stamina,
    regMinute(s) - gp.onMin,
    setup.pressing[gp.side],
    setup.drain[gp.side],
  );
}

/**
 * A side's freshness now (→MATCH-29): 100 minus the mean in-match fatigue of its players on the
 * pitch. Read at the final whistle for measurement only; nothing in play reads it.
 */
export function sideFreshness(s: GridState, side: 0 | 1): number {
  const on = s.players[side].filter(onPitch);
  return 100 - on.reduce((a, gp) => a + matchFatigue(s, gp), 0) / on.length;
}

const isTired = (s: GridState, gp: GridPlayer) =>
  matchFatigue(s, gp) - CHANGES_CONFIG.fitness > CHANGES_CONFIG.tired;

const lineAt = (s: GridState, side: 0 | 1, slot: number) =>
  lineOf(FORMATIONS[s.setup.tactics[side]].slots[slot]!.position);

/** Whether this stoppage is an interval: half-time, or before or within extra time. */
const halfTime = (s: GridState) => s.period > 1 && s.t === 0;

/**
 * The substitutions a side makes at this stoppage, in the order of design §8.1: injured players
 * replaced, a red card answered, then the manager's policy, within the era's limits. The plan does
 * not change the state; `applyChanges` does.
 */
export function planChanges(s: GridState, side: 0 | 1, r: () => number): Change[] {
  const C = CHANGES_CONFIG;
  const { era, f } = s.setup;
  const policy = s.setup.managers[side];
  const c = s.changes[side];
  const roster = s.players[side];
  const slots = FORMATIONS[s.setup.tactics[side]].slots;
  const half = halfTime(s);
  const windowsLeft = era.windows === undefined ? Infinity : era.windows - c.windows;
  let left = half || windowsLeft > 0 ? era.maxSubs - c.used : 0;
  const plan: Change[] = [];
  const taken = new Set(c.entered);
  const leaving = new Set<number>();

  /** The bench player best at `slot`, ties by bench order; a youth-minded manager prefers a young one among equal options. */
  const bench = (slot: number, lines?: readonly string[], young = false) => {
    const age = (gp: GridPlayer) => f.year - gp.player.born;
    let best: GridPlayer | undefined,
      value = -Infinity;
    const options: [GridPlayer, number][] = [];
    for (const gp of roster) {
      if (gp.idx < 11 || taken.has(gp.idx)) continue;
      if (lines && !lines.includes(lineOf(gp.player.position))) continue;
      if (young && age(gp) > C.youthAge) continue;
      const v = slotOvr(gp.player, slots[slot]!, s.setup.multiplier[side](gp.player));
      options.push([gp, v]);
      if (v > value) [best, value] = [gp, v];
    }
    if (best && policy.youth && age(best) > C.youthAge)
      for (const [gp, v] of options)
        if (age(gp) <= C.youthAge && v >= value - C.youthMargin) return gp.idx;
    return best?.idx;
  };
  const sub = (
    out: number,
    slot: number,
    reason: ChangeReason,
    lines?: string[],
    young = false,
  ) => {
    if (left <= 0) return false;
    const inn = bench(slot, lines, young);
    if (inn === undefined) return false;
    plan.push({ out, in: inn, slot, reason });
    taken.add(inn);
    leaving.add(out);
    left--;
    return true;
  };

  for (const idx of c.injured) sub(idx, roster[idx]!.slot, 'injury');
  if (era.injuryOnly) return plan;

  const score = s.score[side] - s.score[other(side)];
  const minute = regMinute(s);
  const at = (from: number) => minute >= from + policy.delay;
  // Before the earliest policy minute only a red card or half-time can call for a change.
  if (c.reds <= c.rebalanced && !half && !at(C.earlyPressFrom)) return plan;
  const starters = roster.filter(
    (gp) => gp.idx < 11 && onPitch(gp) && gp.slot > 0 && !leaving.has(gp.idx),
  );
  const fatigue = new Map(starters.map((gp) => [gp.idx, matchFatigue(s, gp)]));
  // Most tired first; an exact tie is settled by the match stream.
  const byFatigue = (list: GridPlayer[]) =>
    list
      .map((gp) => ({ gp, f: fatigue.get(gp.idx)!, tie: 0 }))
      .map((x, _i, all) => (all.some((y) => y !== x && y.f === x.f) ? { ...x, tie: r() } : x))
      .sort((a, b) => b.f - a.f || a.tie - b.tie || a.gp.idx - b.gp.idx)
      .map((x) => x.gp);
  const free = (gp: GridPlayer) => !leaving.has(gp.idx);

  if (c.reds > c.rebalanced && score >= 0) {
    const men = roster.filter(onPitch).length + plan.length;
    const filled = new Set(roster.filter(onPitch).map((gp) => gp.slot));
    for (const ch of plan) filled.add(ch.slot);
    const vacant = slots.findIndex(
      (_slot, i) => i > 0 && !filled.has(i) && lineAt(s, side, i) !== 'FW',
    );
    const forward = starters
      .concat(roster.filter((gp) => gp.idx >= 11 && onPitch(gp) && !leaving.has(gp.idx)))
      .filter((gp) => lineAt(s, side, gp.slot) === 'FW')
      .sort((a, b) => attackFrame(side, b.pos)[0] - attackFrame(side, a.pos)[0])[0];
    if (men < 11 && vacant >= 0 && forward) sub(forward.idx, vacant, 'rebalance', ['DF', 'MF']);
  }

  if (left <= 0) return plan;
  // With limited windows the remaining changes are spread over them; otherwise one a stoppage.
  let cap = era.windows === undefined ? 1 : Math.ceil(left / Math.max(1, windowsLeft));
  const change = (
    gp: GridPlayer | undefined,
    reason: ChangeReason,
    lines?: string[],
    young = false,
  ) => gp !== undefined && cap > 0 && sub(gp.idx, gp.slot, reason, lines, young) && cap--;

  if (policy.protectLead && !c.protectedLead && score > 0 && at(C.protectFrom)) {
    const forward = starters
      .filter((gp) => free(gp) && lineAt(s, side, gp.slot) === 'FW')
      .sort((a, b) => attackFrame(side, b.pos)[0] - attackFrame(side, a.pos)[0])[0];
    change(forward, 'protect', ['DF', 'MF']);
  }
  if (policy.chaseWhenBehind && !c.chased && score < 0 && (half || at(C.chaseFrom))) {
    const back = byFatigue(
      starters.filter((gp) => free(gp) && ['DF', 'MF'].includes(lineAt(s, side, gp.slot))),
    )[0];
    change(back, 'chase', ['FW']);
  }
  if (policy.youth && !c.youthGiven && score >= 0 && at(C.youthFrom))
    change(byFatigue(starters.filter(free))[0], 'youth', undefined, true);
  if (half && !policy.earlyPress) return plan;

  const tired = () => byFatigue(starters.filter((gp) => free(gp) && isTired(s, gp)));
  const anyone = () => byFatigue(starters.filter(free));
  if (policy.data) {
    const due = C.dataAt.filter((m) => at(m)).length;
    if (due <= c.checkpoints) return plan;
    // 60′: the tired; 70′: half of what is left; 80′: the rest — by fatigue numbers alone.
    const list = due === 1 ? tired() : anyone();
    cap = due === 1 ? left : due === 2 ? Math.ceil(left / 2) : left;
    for (const gp of list) if (!change(gp, 'policy')) break;
    return plan;
  }
  if (half || at(policy.fatigueFrom)) for (const gp of tired()) if (!change(gp, 'policy')) break;
  if (!half && at(policy.laterFrom)) for (const gp of anyone()) if (!change(gp, 'policy')) break;
  return plan;
}

/** Puts the outfield player with the best reflexes in goal when nobody keeps it. */
export function coverGoal(s: GridState, side: 0 | 1): void {
  if (s.players[side].some((gp) => onPitch(gp) && gp.slot === 0)) return;
  const keeper = s.players[side]
    .filter((gp) => onPitch(gp) && gp.slot > 0)
    .sort((a, b) => b.player.attrs.reflexes - a.player.attrs.reflexes)[0];
  if (keeper) enterSlot(s, keeper, 0);
}

/** Takes a player off the pitch now (a substitution, an injury or a red card). */
export function leave(s: GridState, gp: GridPlayer): void {
  gp.onPitch = false;
  s.lineups++;
  gp.offAt = s.elapsed;
  gp.offMin = regMinute(s);
}

/** Makes the planned substitutions and settles what this stoppage owed. */
export function applyChanges(s: GridState, side: 0 | 1, plan: readonly Change[]): void {
  const c = s.changes[side];
  const roster = s.players[side];
  for (const ch of plan) {
    const out = roster[ch.out]!;
    const inn = roster[ch.in]!;
    if (out.onPitch) leave(s, out);
    inn.onPitch = true;
    inn.onAt = s.elapsed;
    inn.onMin = regMinute(s);
    inn.pos = [out.pos[0], out.pos[1]];
    enterSlot(s, inn, ch.slot);
    c.entered.push(ch.in);
    c.used++;
    if (ch.reason === 'protect') c.protectedLead = true;
    if (ch.reason === 'chase') c.chased = true;
    if (ch.reason === 'youth') c.youthGiven = true;
  }
  if (plan.length && !halfTime(s)) c.windows++;
  c.injured = [];
  c.rebalanced = c.reds;
  const policy = s.setup.managers[side];
  if (policy.data)
    c.checkpoints = CHANGES_CONFIG.dataAt.filter((m) => regMinute(s) >= m + policy.delay).length;
  coverGoal(s, side);
}
