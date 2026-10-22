/**
 * Side-level coordination of the candidate model's intentions (→MATCH-16, MATCH-17;
 * docs/MATCH-ENGINE-DESIGN.md §4.6). After every action each side reads one snapshot and plans
 * its jobs at once. The defending side presses the carrier, covers the presser, marks runners
 * (handing a runner over to the teammate whose zone he enters) and recovers. The side with the
 * ball shows for a pressured carrier, clears the lane he is shown in, and runs, while its rest
 * defence stays home. Each job goes to one player. Candidates are ranked by cost with the player's
 * ID breaking ties, never by the order the roster is visited, and a player claimed for one job
 * cannot take another. Planning reads the state and changes nothing; `updateIntentions` applies
 * the plan.
 */
import { INTENTION_PRIORITIES } from '../../../contracts/src/match-model';
import type { Attribute, Position, RoleId } from '../../../contracts/src/player';
import type { Tactic } from '../../../contracts/src/types';
import { actionWeight } from '../match';
import { lineOf } from '../player';
import { hypot } from '../portable-math';
import { random } from '../primitives';
import { CHANGES_CONFIG } from './changes';
import { attackFrame, clamp, PITCH, toEngine } from './pitch';
import {
  coverPoint,
  offsideLine,
  runContext,
  runPlan,
  SHAPE_CONFIG,
  shapePlace,
  tacticShape,
  type ShapeCache,
} from './shape';
import { minutesOn, onPitch, other, skill, slotOf, type GridPlayer, type GridState } from './state';
import { TAG_CONFIG } from './tags';
import type { Intention, IntentionKind, IntentionPriority, IntentionReason } from './intentions';

/** Initial values for the candidate model; T278 calibrates them against the unchanged targets. */
export const COORDINATION_CONFIG = {
  /**
   * How many players press the carrier from within the press reach, by the defending side's tactic
   * (→MATCH-8). T321: one for press too, which still regains the ball highest, since two pressers
   * won it too easily (T324 dropped the second presser's shorter reach, which nothing read).
   */
  pressers: { possession: 1, press: 1, counter: 1, balanced: 1 } satisfies Record<Tactic, number>,
  /**
   * A carrier under pressure (an opponent within `TAG_CONFIG.pressureRadius`): the teammate within
   * `near` m whose role and traits look most for the pass shows `distance` m from him with odds
   * `show` + `composure` × his 침착성; his 판단력 picks the side away from the presser.
   */
  support: { near: 22, distance: 9, show: 0.45, composure: 0.45 },
  /** A teammate within `lane` m of the line the ball would travel to the shower clears it by `distance` m. */
  open: { lane: 3, distance: 8 },
  /** A defender or holding midfielder covers a presser only when his shape place is within this many metres of the cover point. */
  coverNear: 10,
  /**
   * A runner is picked up within `pick` m. A tactical marker hands him over to a free teammate
   * within `pick` m of the runner whose shape place is within `zone` m of him and at least
   * `handover` m nearer than the marker's own.
   */
  mark: { pick: 20, zone: 12, handover: 6 },
  /** After a loss, a player further than `distance` × (1 − `read` × 판단력) from his shape recovers to it within `window` s. */
  recover: { distance: 14, read: 0.4, window: 6 },
  /** Run and press odds fall by up to this share as minutes and missing 체력 tire a player (T321: 0.5 before). */
  tired: 1,
  /** 판단력 times a run: the run odds scale from `min` to `max` across the attribute. */
  timing: { min: 0.8, max: 1.2 },
  /**
   * T368 (→MATCH-18): the side in possession holds an onside line until the pass is played
   * (`movement.ts` `advance`). Each outfielder off the ball waits `far` m behind the second-last
   * opponent at 판단력 1 and `near` m at 99, and reads `early` × his 판단력 share seconds of the
   * defenders' movement ahead, so a better reader starts closer to the line without being caught
   * by it stepping up. A run in behind waits on that line and the through ball sends him.
   */
  hold: { far: 2, near: 0.5, early: 0.5 },
  /**
   * A combination closes when an opponent stands within `closed` m of the space a shower or an
   * overlapper goes to; he does not take that kind of job again for `retry` s.
   */
  combination: { closed: 2.5, retry: 3 },
  /** Positions that hold the rest defence while the ball is in the opponent's half: no show, no run. */
  rest: ['CB', 'DM'] as readonly Position[],
  /**
   * Straight after a regain (→MATCH-8): for `seconds` a side whose tactic is listed starts its runs
   * `odds` times as often and from any band, so a counter side's runners go in behind at once.
   */
  transition: { seconds: 8, odds: { counter: 2.5 } as Partial<Record<Tactic, number>> },
  /**
   * Outside a break, with the ball from band `from` on (past halfway), a listed side's outfielders
   * start their runs `odds` times as often (T356, T357, T365, →MATCH-8): possession's patient
   * build-up still sends runners in behind and into the box once it is in the other half, while
   * its own half keeps the short options that hold press's high regains back.
   */
  settledRuns: { odds: { possession: 2.5 } as Partial<Record<Tactic, number>>, from: 4 },
} as const;

/** Roles that cover a pressing teammate first: their distance counts divided by this. */
const COVER_ROLES: Partial<Record<RoleId, number>> = {
  anchor: 1.5,
  coverDefender: 1.5,
  ballWinner: 1.2,
  defensiveFullBack: 1.2,
};

const CC = COORDINATION_CONFIG;
const CENTRE = PITCH.width / 2;

export const rank = (p: IntentionPriority) => INTENTION_PRIORITIES.indexOf(p);
/** The distance between two points; candidate-only, so always the portable hypot (→ARCH-9, T358). */
export const gap = (a: readonly number[], b: readonly number[]) =>
  hypot(a[0]! - b[0]!, a[1]! - b[1]!);
export const inside = (p: readonly number[]): [number, number] => [
  clamp(p[0]!, 0, PITCH.length),
  clamp(p[1]!, 0, PITCH.width),
];
export const isOwner = (s: GridState, gp: GridPlayer) =>
  s.owner !== undefined && s.owner[0] === gp.side && s.owner[1] === gp.idx;
/** An outfielder on the pitch (slot 0 is the goalkeeper's). */
const outfield = (gp: GridPlayer) => onPitch(gp) && gp.slot > 0;
/** Whether a new intention of priority `p` may take his place: he is free or holds a lower one. */
const free = (gp: GridPlayer, p: IntentionPriority) =>
  !gp.intention || rank(gp.intention.priority) > rank(p);
/** Stable order of equal costs: the player's ID, never his roster index or the visiting order. */
const byId = (a: GridPlayer, b: GridPlayer) =>
  a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0;

/**
 * A roster in ID order. A match never reorders or replaces its rosters (a substitute is already on
 * the bench), so the order is sorted once per roster and kept.
 */
const BY_ID = new WeakMap<readonly GridPlayer[], readonly GridPlayer[]>();
function sortedById(roster: readonly GridPlayer[]): readonly GridPlayer[] {
  let sorted = BY_ID.get(roster);
  if (!sorted) BY_ID.set(roster, (sorted = [...roster].sort(byId)));
  return sorted;
}

/** An attribute now (his slot, the day, his drain; →MATCH-11) as a 0–1 share, for odds. */
const share = (s: GridState, gp: GridPlayer, a: Attribute) =>
  clamp(skill(s, gp.side, gp.idx, a), 1, 99) / 99;
/**
 * 1 for a fresh player, less as his minutes and missing 체력 tire him, faster on a pressing side
 * by the in-match drain's press factor (→MATCH-9, T321).
 */
const fresh = (s: GridState, gp: GridPlayer) =>
  1 -
  CC.tired *
    Math.min(
      1,
      (minutesOn(s, gp) / 90) * (s.setup.pressing[gp.side] ? CHANGES_CONFIG.pressDrain : 1),
    ) *
    ((100 - gp.player.attrs.stamina) / 100);
const weight = (s: GridState, gp: GridPlayer, action: 'run' | 'press' | 'key') =>
  actionWeight(slotOf(s, gp).role, gp.player.traits, action);

/** A draw stream named by the fixture, the player, the decision and its moment (→ARCH-5). */
function stream(s: GridState, gp: GridPlayer, decision: string, moment: number) {
  const { w, f } = s.setup;
  return random(
    `${w.seed}:${f.id}:intention:${decision}:${gp.side}:${gp.player.id}:${Math.round(moment * 1000)}`,
  );
}

/** How far a side's presser goes for the ball: its tactic's press, or counter-press just after a loss. */
export function pressReach(s: GridState, side: 0 | 1): number {
  const cfg = tacticShape(s, side);
  const lost =
    s.lastLoss !== undefined &&
    s.lastLoss.side === side &&
    s.elapsed - s.lastLoss.at < SHAPE_CONFIG.counterPressSeconds;
  return lost ? Math.max(cfg.press, cfg.counterPress) : cfg.press;
}

/** Whether an opponent of `side` stands within `combination.closed` m of `p`: the space is taken. */
export function closedAt(s: GridState, side: 0 | 1, p: readonly number[]): boolean {
  return s.players[other(side)].some((o) => onPitch(o) && gap(o.pos, p) <= CC.combination.closed);
}

/** A job the plan gives one player: the intention he takes and why what he held ends. */
export interface Job {
  side: 0 | 1;
  idx: number;
  intention: Omit<Intention, 'since' | 'until'>;
  /** Seconds it holds; absent for the kind's `INTENTION_CONFIG.seconds`. */
  seconds?: number;
  reason: Extract<IntentionReason, 'replaced' | 'danger'>;
}

/** A marker hands his runner to a teammate whose zone the runner entered. */
export interface Handover {
  side: 0 | 1;
  from: number;
  to: number;
}

/** Everything both sides decide from one snapshot. */
export interface CoordinationPlan {
  /** The presser whose press an urgent danger makes urgent. */
  escalate?: [0 | 1, number];
  handovers: Handover[];
  jobs: Job[];
}

/**
 * Both sides' jobs from the state as it is now (→MATCH-17), given whether the defending side faces
 * an urgent danger. Reads the state and changes nothing, so every player decides on the same
 * snapshot and an inspection changes no outcome.
 */
export function planCoordination(s: GridState, danger: boolean): CoordinationPlan {
  const plan: CoordinationPlan = { handovers: [], jobs: [] };
  const att = s.possession;
  const carrier = s.owner && s.owner[0] === att ? s.players[att][s.owner[1]]! : undefined;
  if (!carrier || !onPitch(carrier)) return plan;
  const claimed = new Set<GridPlayer>();
  const cache: ShapeCache = { offside: [], pressers: [], defence: [] };
  defend(s, other(att), carrier, danger, plan, claimed, cache);
  attack(s, att, carrier, plan, claimed);
  return plan;
}

/** The defending side's jobs against `carrier`. */
function defend(
  s: GridState,
  side: 0 | 1,
  carrier: GridPlayer,
  danger: boolean,
  plan: CoordinationPlan,
  claimed: Set<GridPlayer>,
  cache: ShapeCache,
): void {
  const players = s.players[side].filter(outfield);
  const place = (gp: GridPlayer) => shapePlace(s, side, gp.idx, cache);
  const job = (gp: GridPlayer, intention: Job['intention'], reason: Job['reason'] = 'replaced') => {
    plan.jobs.push({ side, idx: gp.idx, intention, reason });
    claimed.add(gp);
  };
  const near = (a: GridPlayer, b: GridPlayer) =>
    gap(a.pos, carrier.pos) - gap(b.pos, carrier.pos) || byId(a, b);
  // Press: the carrier's nearest men, their distance shortened by a pressing role, traits and fresh legs.
  const reach = pressReach(s, side);
  const pressing = players.filter(
    (gp) => gp.intention?.kind === 'press' && gp.intention.opponent === carrier.idx,
  );
  // A danger that starts while they already press makes the nearest presser's job urgent.
  if (danger && pressing.length && !pressing.some((gp) => gp.intention!.priority === 'danger'))
    plan.escalate = [side, [...pressing].sort(near)[0]!.idx];
  const candidates = players
    .filter((gp) => !pressing.includes(gp))
    .map((gp) => {
      const d = gap(gp.pos, carrier.pos);
      return { gp, d, cost: d / (weight(s, gp, 'press') * fresh(s, gp)) };
    })
    .sort((a, b) => a.cost - b.cost || byId(a.gp, b.gp));
  const wanted = CC.pressers[s.setup.tactics[side]];
  const all = [...pressing];
  for (const c of candidates) {
    if (all.length >= wanted) break;
    const urgent = danger && all.length === 0;
    const priority = urgent ? 'danger' : 'tactical';
    if (!free(c.gp, priority)) continue;
    if (!urgent && c.d > reach) continue;
    job(
      c.gp,
      { kind: 'press', priority, target: [carrier.pos[0], carrier.pos[1]], opponent: carrier.idx },
      urgent ? 'danger' : 'replaced',
    );
    all.push(c.gp);
  }
  // Cover: one defender or holding midfielder steps behind the nearest presser, a covering role first.
  const presser = [...all].sort(near)[0];
  const covered = players.some(
    (gp) => gp.intention?.kind === 'cover' && all.some((p) => p.idx === gp.intention!.teammate),
  );
  if (presser && !covered) {
    const point = coverPoint(side, presser, s.math);
    // Only a man whose own place in the shape is near the cover point leaves it to cover.
    const cover = players
      .filter((gp) => {
        if (gp.intention || claimed.has(gp)) return false;
        const position = slotOf(s, gp).position;
        if (lineOf(position) !== 'DF' && position !== 'DM') return false;
        return gap(place(gp), point) <= CC.coverNear;
      })
      .map((gp) => ({ gp, cost: gap(gp.pos, point) / (COVER_ROLES[slotOf(s, gp).role] ?? 1) }))
      .sort((a, b) => a.cost - b.cost || byId(a.gp, b.gp))[0];
    if (cover)
      job(cover.gp, { kind: 'cover', priority: 'tactical', target: point, teammate: presser.idx });
  }
  // Mark: each runner has one marker; a runner who enters a teammate's zone is handed over to him.
  const priority = danger ? 'danger' : 'tactical';
  const runners = s.players[other(side)]
    .filter((gp) => onPitch(gp) && gp.intention?.kind === 'run')
    .sort(byId);
  const marked = new Set<number>();
  for (const runner of runners) {
    const marker = players.find(
      (gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === runner.idx,
    );
    if (!marker) continue;
    marked.add(runner.idx);
    if (marker.intention!.priority !== 'tactical' || claimed.has(marker)) continue;
    const own = gap(place(marker), runner.pos);
    const next = players
      .filter(
        (gp) =>
          gp !== marker &&
          !gp.intention &&
          !claimed.has(gp) &&
          gap(gp.pos, runner.pos) <= CC.mark.pick,
      )
      .map((gp) => ({ gp, zone: gap(place(gp), runner.pos) }))
      .filter((c) => c.zone <= CC.mark.zone && c.zone + CC.mark.handover < own)
      .sort((a, b) => a.zone - b.zone || byId(a.gp, b.gp))[0];
    if (!next) continue;
    plan.handovers.push({ side, from: marker.idx, to: next.gp.idx });
    claimed.add(marker);
    job(next.gp, {
      kind: 'mark',
      priority: 'tactical',
      target: [runner.pos[0], runner.pos[1]],
      opponent: runner.idx,
    });
  }
  // The nearest pairs first, so no runner or marker depends on who was looked at first.
  const pairs: { runner: GridPlayer; gp: GridPlayer; d: number }[] = [];
  for (const runner of runners) {
    if (marked.has(runner.idx)) continue;
    for (const gp of players) {
      if (claimed.has(gp) || pressing.includes(gp) || !free(gp, priority)) continue;
      const d = gap(gp.pos, runner.pos);
      if (d <= CC.mark.pick) pairs.push({ runner, gp, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d || byId(a.runner, b.runner) || byId(a.gp, b.gp));
  for (const { runner, gp } of pairs) {
    if (marked.has(runner.idx) || claimed.has(gp)) continue;
    marked.add(runner.idx);
    job(
      gp,
      { kind: 'mark', priority, target: [runner.pos[0], runner.pos[1]], opponent: runner.idx },
      danger ? 'danger' : 'replaced',
    );
  }
  // Recover: just after losing the ball, a free player far from his shape goes back to it; a better reader reacts sooner.
  if (s.lastLoss?.side !== side || s.elapsed - s.lastLoss.at >= CC.recover.window) return;
  for (const gp of players) {
    if (gp.intention || claimed.has(gp)) continue;
    const shape = place(gp);
    const limit = CC.recover.distance * (1 - CC.recover.read * share(s, gp, 'decisions'));
    if (gap(gp.pos, shape) > limit)
      job(gp, { kind: 'recover', priority: 'tactical', target: shape });
  }
}

/** Whether `gp` gave up a `kind` of job as closed within the last `combination.retry` s. */
const retrying = (s: GridState, gp: GridPlayer, kind: IntentionKind) =>
  gp.ended?.reason === 'closed' &&
  gp.ended.kind === kind &&
  s.elapsed - gp.ended.at < CC.combination.retry;

/**
 * `p` (engine frame) moved back onside for `side`: no further upfield than the opponent's
 * second-last player, the ball or halfway, whichever is furthest (→MATCH-18).
 */
function onside(s: GridState, side: 0 | 1, p: readonly number[]): [number, number] {
  const q = attackFrame(side, inside(p));
  const limit = Math.max(
    offsideLine(s, other(side)) - 0.5,
    attackFrame(side, s.ball)[0],
    PITCH.length / 2,
  );
  return toEngine(side, [Math.min(q[0], limit), q[1]]);
}

/** How far `p` stands from the segment `a`→`b`, or Infinity beyond its ends. */
function fromLane(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const dx = b[0]! - a[0]!,
    dy = b[1]! - a[1]!;
  const len = dx * dx + dy * dy;
  if (len === 0) return Infinity;
  const t = ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / len;
  if (t <= 0 || t >= 1) return Infinity;
  return hypot(p[0]! - (a[0]! + t * dx), p[1]! - (a[1]! + t * dy));
}

/** The side with the ball: one teammate shows for a pressured carrier, another clears his lane, runners go. */
function attack(
  s: GridState,
  side: 0 | 1,
  carrier: GridPlayer,
  plan: CoordinationPlan,
  claimed: Set<GridPlayer>,
): void {
  const mates = s.players[side].filter((gp) => outfield(gp) && gp !== carrier);
  // The rest defence stays home while the ball is in the opponent's half.
  const home = attackFrame(side, s.ball)[0] >= PITCH.length / 2;
  const available = (gp: GridPlayer) =>
    !gp.intention && !claimed.has(gp) && !(home && CC.rest.includes(slotOf(s, gp).position));
  const job = (gp: GridPlayer, intention: Job['intention'], seconds?: number) => {
    plan.jobs.push({
      side,
      idx: gp.idx,
      intention,
      ...(seconds === undefined ? {} : { seconds }),
      reason: 'replaced',
    });
    claimed.add(gp);
  };
  // Support: the nearest presser makes the carrier look for a teammate to show (→MATCH-16).
  let presser: GridPlayer | undefined,
    closest: number = TAG_CONFIG.pressureRadius;
  for (const o of sortedById(s.players[other(side)])) {
    if (!onPitch(o)) continue;
    const d = gap(o.pos, carrier.pos);
    if (d < closest || (d === closest && !presser)) [presser, closest] = [o, d];
  }
  const showing = mates.some(
    (gp) =>
      gp.intention?.kind === 'support' &&
      gp.intention.teammate === carrier.idx &&
      gp.intention.support !== 'open',
  );
  if (presser && !showing) {
    const best = mates
      .filter(
        (gp) =>
          available(gp) &&
          !retrying(s, gp, 'support') &&
          gap(gp.pos, carrier.pos) <= CC.support.near,
      )
      .map((gp) => ({ gp, cost: gap(gp.pos, carrier.pos) / weight(s, gp, 'key') }))
      .sort((a, b) => a.cost - b.cost || byId(a.gp, b.gp))[0];
    // One draw per carrier and spell of possession, so the option does not reroll at every touch.
    const r = best && stream(s, best.gp, `support:${carrier.idx}`, s.possessionSince);
    if (best && r!() < CC.support.show + CC.support.composure * share(s, best.gp, 'composure')) {
      const away = r!() < share(s, best.gp, 'decisions');
      const [from, to] = away ? [presser.pos, carrier.pos] : [carrier.pos, best.gp.pos];
      const d = gap(from, to) || 1;
      const target = onside(s, side, [
        carrier.pos[0] + ((to[0] - from[0]) / d) * CC.support.distance,
        carrier.pos[1] + ((to[1] - from[1]) / d) * CC.support.distance,
      ]);
      job(best.gp, {
        kind: 'support',
        support: 'show',
        priority: 'tactical',
        target,
        teammate: carrier.idx,
      });
      // A teammate standing in the lane the ball would take to him steps out of it, taking his marker along.
      const lane = mates
        .filter(available)
        .map((gp) => ({ gp, d: fromLane(gp.pos, carrier.pos, target) }))
        .filter((c) => c.d <= CC.open.lane)
        .sort((a, b) => a.d - b.d || byId(a.gp, b.gp))[0];
      if (lane) {
        const dx = target[0] - carrier.pos[0],
          dy = target[1] - carrier.pos[1];
        const len = hypot(dx, dy);
        // The lane's normal, toward the side he already stands on (toward the centre when on it).
        const cross =
          dx * (lane.gp.pos[1] - carrier.pos[1]) - dy * (lane.gp.pos[0] - carrier.pos[0]);
        const sign = cross !== 0 ? Math.sign(cross) : lane.gp.pos[1] < CENTRE ? 1 : -1;
        job(lane.gp, {
          kind: 'support',
          support: 'open',
          priority: 'tactical',
          target: onside(s, side, [
            lane.gp.pos[0] + ((-dy * sign) / len) * CC.open.distance,
            lane.gp.pos[1] + ((dx * sign) / len) * CC.open.distance,
          ]),
          teammate: carrier.idx,
        });
      }
    }
  }
  // Runs: his role's run, more often for a better reader of the moment and fresher legs, and at
  // once after a regain for a side that breaks (→MATCH-8).
  const T = CC.transition;
  const breaking =
    s.lastRegain?.side === side && s.elapsed - s.lastRegain.at <= T.seconds
      ? (T.odds[s.setup.tactics[side]] ?? 1)
      : 1;
  const ctx = runContext(s, side);
  if (ctx.band < 3 && breaking === 1) return;
  // Settled play past halfway: the side's listed odds for its outfielders' runs (T365).
  const SR = CC.settledRuns;
  const settled = breaking === 1 && ctx.band >= SR.from ? (SR.odds[s.setup.tactics[side]] ?? 1) : 1;
  const plans = mates.flatMap((gp) => {
    if (!available(gp) || retrying(s, gp, 'run')) return [];
    const timing =
      (CC.timing.min + (CC.timing.max - CC.timing.min) * share(s, gp, 'decisions')) *
      (settled !== 1 && lineOf(slotOf(s, gp).position) !== 'GK' ? settled : 1);
    // The stream is named on its first draw: a role that makes no run here draws nothing.
    let r: (() => number) | undefined;
    const p = runPlan(
      s,
      gp,
      ctx,
      () => (r ??= stream(s, gp, 'run', s.elapsed))(),
      timing * fresh(s, gp) * breaking,
      breaking > 1,
    );
    return p ? [{ gp, p }] : [];
  });
  // One overlap per flank: one under way keeps it, else the overlapper nearest his space takes it.
  const flank = (p: readonly number[]) => (p[1]! < CENTRE ? 0 : 1);
  const overlapped = new Set(
    mates.filter((gp) => gp.intention?.run === 'overlap').map((gp) => flank(gp.intention!.target)),
  );
  plans.sort(
    (a, b) =>
      (a.p.kind === 'overlap' ? gap(a.gp.pos, a.p.target) : 0) -
        (b.p.kind === 'overlap' ? gap(b.gp.pos, b.p.target) : 0) || byId(a.gp, b.gp),
  );
  for (const { gp, p } of plans) {
    if (p.kind === 'overlap') {
      if (overlapped.has(flank(p.target))) continue;
      overlapped.add(flank(p.target));
    }
    job(
      gp,
      {
        kind: 'run',
        run: p.kind,
        priority: 'tactical',
        target: p.target,
        // An overlap combines with the carrier, who may wait for it and release him (→MATCH-16).
        ...(p.kind === 'overlap' ? { teammate: carrier.idx } : {}),
      },
      p.seconds,
    );
  }
}
