/**
 * Individual football intentions on the candidate match model (→MATCH-16, MATCH-17;
 * docs/MATCH-MODEL-CONTRACT.md "Intentions and team reactions"). One lifecycle for every kind: an
 * intention keeps its target and its teammate/opponent while it is feasible, ends when achieved,
 * expired or no longer feasible, and yields only to a higher priority or a reasoned event — a
 * turnover, an urgent danger, a restart, a substitution, an injury or a sending-off — whose reason it
 * records. Runs are intentions; `GridPlayer.run` stays their view for the readers that predate them.
 * Match-local state only. Draws are named by fixture, player, decision and its moment, never by an
 * update order, a rendering frame or an observer (→ARCH-5, MATCH-7).
 */
import {
  INTENTION_PRIORITIES,
  type INTENTION_ENDS,
  type INTENTION_KINDS,
} from '../../../contracts/src/match-model';
import type { Attribute, RoleId } from '../../../contracts/src/player';
import { actionWeight } from '../match';
import { lineOf } from '../player';
import { random } from '../primitives';
import { attackFrame, clamp, PITCH } from './pitch';
import {
  coverPoint,
  intentionTarget,
  offsideLine,
  runContext,
  runPlan,
  SHAPE_CONFIG,
  speedOf,
  targetOf,
} from './shape';
import { minutesOn, onPitch, other, skill, slotOf, type GridPlayer, type GridState } from './state';
import { TAG_CONFIG } from './tags';

export type IntentionKind = (typeof INTENTION_KINDS)[number];
export type IntentionPriority = (typeof INTENTION_PRIORITIES)[number];
export type IntentionEnd = (typeof INTENTION_ENDS)[number];

/** Why an intention ended, and which of the contract's endings that is. */
export const INTENTION_REASONS = {
  /** He stands on its target (a reception, a run's end, a restart place). */
  arrival: 'achieved',
  /** What it answered is over: the danger passed, the runner stopped, the presser stopped. */
  cleared: 'achieved',
  expiry: 'expired',
  /** He cannot reach its target before it expires, or lost the man he tracked. */
  unreachable: 'infeasible',
  /** The pass to him or the ball he was taking went elsewhere. */
  lost: 'infeasible',
  /** The carrier it served or pressed no longer has the ball. */
  moved: 'infeasible',
  /** Its teammate or opponent left the pitch. */
  departed: 'infeasible',
  turnover: 'displaced',
  danger: 'displaced',
  restart: 'displaced',
  substitution: 'displaced',
  injury: 'displaced',
  dismissal: 'displaced',
  /** A new intention of at least its priority took its place. */
  replaced: 'displaced',
} as const satisfies Record<string, IntentionEnd>;
export type IntentionReason = keyof typeof INTENTION_REASONS;

export interface Intention {
  kind: IntentionKind;
  priority: IntentionPriority;
  /** Engine frame; a press, mark or cover follows its reference and is refreshed at each update. */
  target: [number, number];
  /** Roster index of the teammate it serves: the carrier he shows for, the presser he covers, the passer. */
  teammate?: number;
  /** Roster index of the opponent it tracks: the carrier he presses, the runner he marks. */
  opponent?: number;
  /** A run's kind. */
  run?: 'behind' | 'overlap' | 'box';
  /** Elapsed match seconds it started and expires at. */
  since: number;
  until: number;
}
export interface EndedIntention extends Intention {
  end: IntentionEnd;
  reason: IntentionReason;
  /** Elapsed match seconds it ended. */
  at: number;
}

/** Initial values for the candidate model; T278 calibrates them against the unchanged targets. */
export const INTENTION_CONFIG = {
  /** Match seconds each kind holds at most (a run's length is `SHAPE_CONFIG.run.seconds`). */
  seconds: {
    support: 5,
    receive: 10,
    carry: 10,
    press: 6,
    mark: 8,
    cover: 6,
    recover: 6,
    restart: 300,
  },
  /** Metres within which a fixed target is reached. */
  arrive: 1,
  /** Seconds past its expiry a target may still need and count as reachable. */
  slack: 1,
  /** The carrier within this many metres of the goal he attacks is an urgent danger (→MATCH-17). */
  danger: 30,
  /**
   * A carrier under pressure (an opponent within `TAG_CONFIG.pressureRadius`): the teammate within
   * `near` m whose role and traits look most for the pass shows `distance` m from him with odds
   * `show` + `composure` × his 침착성; his 판단력 picks the side away from the presser.
   */
  support: { near: 22, distance: 9, show: 0.45, composure: 0.45 },
  /** A tactical press ends when the carrier gets this many times its reach away. */
  pressLose: 1.6,
  /** A defender or holding midfielder covers a presser only when his shape place is within this many metres of the cover point. */
  coverNear: 10,
  /** A runner is picked up within `pick` m and given up past `lose`. */
  mark: { pick: 20, lose: 28 },
  /** After a loss, a player further than `distance` × (1 − `read` × 판단력) from his shape recovers to it within `window` s. */
  recover: { distance: 14, read: 0.4, window: 6 },
  /** Run and press odds fall by up to this share as minutes and missing 체력 tire a player. */
  tired: 0.5,
  /** 판단력 times a run: the run odds scale from `min` to `max` across the attribute. */
  timing: { min: 0.8, max: 1.2 },
} as const;

/** Roles that cover a pressing teammate first: their distance counts divided by this. */
const COVER_ROLES: Partial<Record<RoleId, number>> = {
  anchor: 1.5,
  coverDefender: 1.5,
  ballWinner: 1.2,
  defensiveFullBack: 1.2,
};
/** Kinds whose target follows a reference rather than staying where it was set. */
const TRACKING: ReadonlySet<IntentionKind> = new Set(['press', 'mark', 'cover']);

const C = INTENTION_CONFIG;
const rank = (p: IntentionPriority) => INTENTION_PRIORITIES.indexOf(p);
const gap = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
const inside = (p: readonly number[]): [number, number] => [
  clamp(p[0]!, 0, PITCH.length),
  clamp(p[1]!, 0, PITCH.width),
];
const isOwner = (s: GridState, gp: GridPlayer) =>
  s.owner !== undefined && s.owner[0] === gp.side && s.owner[1] === gp.idx;
/** An outfielder on the pitch (slot 0 is the goalkeeper's). */
const outfield = (gp: GridPlayer) => onPitch(gp) && gp.slot > 0;
/** Whether a new intention of priority `p` may take his place: he is free or holds a lower one. */
const free = (gp: GridPlayer, p: IntentionPriority) =>
  !gp.intention || rank(gp.intention.priority) > rank(p);

/** An attribute now (his slot, the day, his drain; →MATCH-11) as a 0–1 share, for odds. */
const share = (s: GridState, gp: GridPlayer, a: Attribute) =>
  clamp(skill(s, gp.side, gp.idx, a), 1, 99) / 99;
/** 1 for a fresh player, less as his minutes and missing 체력 tire him. */
const fresh = (s: GridState, gp: GridPlayer) =>
  1 - C.tired * Math.min(1, minutesOn(s, gp) / 90) * ((100 - gp.player.attrs.stamina) / 100);
const weight = (s: GridState, gp: GridPlayer, action: 'run' | 'press' | 'key') =>
  actionWeight(slotOf(s, gp).role, gp.player.traits, action);

/** A draw stream named by the fixture, the player, the decision and its moment (→ARCH-5). */
function stream(s: GridState, gp: GridPlayer, decision: string, moment: number) {
  const { w, f } = s.setup;
  return random(
    `${w.seed}:${f.id}:intention:${decision}:${gp.side}:${gp.player.id}:${Math.round(moment * 1000)}`,
  );
}

/** Ends `gp`'s intention for `reason`, remembering it as his last. */
export function endIntention(s: GridState, gp: GridPlayer, reason: IntentionReason): void {
  const i = gp.intention;
  if (!i) return;
  gp.ended = { ...i, end: INTENTION_REASONS[reason], reason, at: s.elapsed };
  gp.intention = undefined;
  gp.run = undefined;
}

/**
 * Gives `gp` an intention unless he holds a higher one; the one it replaces ends for `reason`.
 * A run also sets its `GridPlayer.run` view. Returns whether it was taken.
 */
export function setIntention(
  s: GridState,
  gp: GridPlayer,
  spec: Omit<Intention, 'since'>,
  reason: IntentionReason = 'replaced',
): boolean {
  if (gp.intention && rank(gp.intention.priority) < rank(spec.priority)) return false;
  endIntention(s, gp, reason);
  const target = inside(spec.target);
  gp.intention = { ...spec, target, since: s.elapsed };
  if (spec.kind === 'run' && spec.run)
    gp.run = { kind: spec.run, until: spec.until, target: [target[0], target[1]] };
  return true;
}

/**
 * A turnover or a restart ends every intention below the restart's priority on both sides (a
 * restart also ends the previous restart's places); leaving the pitch is never interrupted.
 */
export function interruptAll(s: GridState, reason: 'turnover' | 'restart'): void {
  const keep = rank(reason === 'restart' ? 'exit' : 'restart');
  for (const side of [0, 1] as const)
    for (const gp of s.players[side])
      if (gp.intention && rank(gp.intention.priority) > keep) endIntention(s, gp, reason);
}

/**
 * `gp` leaves the pitch: whatever he intended ends with that reason, and no teammate or opponent
 * keeps him as a reference, so a stale roster index never survives the change.
 */
export function depart(
  s: GridState,
  gp: GridPlayer,
  reason: 'substitution' | 'injury' | 'dismissal',
): void {
  if (gp.intention) endIntention(s, gp, reason);
  else
    gp.ended = {
      kind: 'exit',
      priority: 'exit',
      target: [gp.pos[0], gp.pos[1]],
      since: s.elapsed,
      until: s.elapsed,
      end: INTENTION_REASONS[reason],
      reason,
      at: s.elapsed,
    };
  for (const side of [0, 1] as const)
    for (const p of s.players[side]) {
      const i = p.intention;
      if (i && (side === gp.side ? i.teammate : i.opponent) === gp.idx)
        endIntention(s, p, 'departed');
    }
}

/** `gp` gets the ball at `at` (a reception, an interception, a tackle, a loose ball): he commits to reaching it. */
export function takeBall(
  s: GridState,
  gp: GridPlayer,
  at: readonly [number, number],
  passer?: number,
): void {
  setIntention(s, gp, {
    kind: 'receive',
    priority: 'committed',
    target: [at[0], at[1]],
    ...(passer === undefined ? {} : { teammate: passer }),
    until: s.elapsed + C.seconds.receive,
  });
}

/** The carrier runs with the ball to `to`. */
export function carryTo(s: GridState, gp: GridPlayer, to: readonly [number, number]): void {
  setIntention(s, gp, {
    kind: 'carry',
    priority: 'committed',
    target: [to[0], to[1]],
    until: s.elapsed + C.seconds.carry,
  });
}

/**
 * A pass `passer` played to `receiver` did not reach him (intercepted, out, offside, won by the
 * other side): the receiving opportunity he committed to is cancelled as lost.
 */
export function losePass(s: GridState, side: 0 | 1, passer: number, receiver: number): void {
  const gp = s.players[side][receiver]!;
  const taken = setIntention(s, gp, {
    kind: 'receive',
    priority: 'committed',
    target: [gp.pos[0], gp.pos[1]],
    teammate: passer,
    until: s.elapsed + C.seconds.receive,
  });
  if (taken) endIntention(s, gp, 'lost');
}

/** A restart is prepared: its taker and its scene commit to their places above everything but leaving. */
export function restartPlaces(
  s: GridState,
  places: readonly { gp: GridPlayer; to: readonly [number, number] }[],
): void {
  for (const { gp, to } of places)
    setIntention(
      s,
      gp,
      {
        kind: 'restart',
        priority: 'restart',
        target: [to[0], to[1]],
        until: s.elapsed + C.seconds.restart,
      },
      'restart',
    );
}

/**
 * The restart is taken: its places are reached, and the players who went up for a delivery stay on
 * their box spots for the second ball until `until`.
 */
export function restartTaken(
  s: GridState,
  up: readonly { gp: GridPlayer; to: readonly [number, number] }[],
  until: number,
): void {
  for (const side of [0, 1] as const)
    for (const gp of s.players[side])
      if (gp.intention?.priority === 'restart') endIntention(s, gp, 'arrival');
  for (const { gp, to } of up)
    setIntention(s, gp, {
      kind: 'run',
      run: 'box',
      priority: 'committed',
      target: [to[0], to[1]],
      until,
    });
}

/** How far a side's presser goes for the ball: its tactic's press, or counter-press just after a loss. */
function pressReach(s: GridState, side: 0 | 1): number {
  const cfg = SHAPE_CONFIG.tactic[s.setup.tactics[side]];
  const lost =
    s.lastLoss !== undefined &&
    s.lastLoss.side === side &&
    s.elapsed - s.lastLoss.at < SHAPE_CONFIG.counterPressSeconds;
  return lost ? Math.max(cfg.press, cfg.counterPress) : cfg.press;
}

/**
 * Whether `side`, out of possession, faces an urgent danger: the carrier within `danger` m of its
 * goal, or a runner already beyond its second-last player.
 */
export function inDanger(s: GridState, side: 0 | 1): boolean {
  const att = other(side);
  if (s.possession !== att || !s.owner || s.owner[0] !== att) return false;
  if (attackFrame(att, s.players[att][s.owner[1]]!.pos)[0] >= PITCH.length - C.danger) return true;
  const line = offsideLine(s, side);
  return s.players[att].some(
    (gp) =>
      onPitch(gp) &&
      gp.intention?.run === 'behind' &&
      attackFrame(att, gp.pos)[0] > line &&
      !isOwner(s, gp),
  );
}

/** Why `gp`'s intention ends now, or undefined while it is still feasible. */
function verdict(
  s: GridState,
  gp: GridPlayer,
  i: Intention,
  danger: boolean,
): IntentionReason | undefined {
  const mate = i.teammate === undefined ? undefined : s.players[gp.side][i.teammate];
  const foe = i.opponent === undefined ? undefined : s.players[other(gp.side)][i.opponent];
  if ((mate && !onPitch(mate)) || (foe && !onPitch(foe))) return 'departed';
  if (s.elapsed >= i.until) return 'expiry';
  switch (i.kind) {
    case 'receive':
    case 'carry':
      // He may have reached the ball and played it on since the last update.
      if (gap(gp.pos, i.target) <= C.arrive) return 'arrival';
      if (!isOwner(s, gp)) return 'lost';
      break;
    case 'support':
      if (!mate || !isOwner(s, mate)) return 'moved';
      break;
    case 'run':
      if (s.possession !== gp.side) return 'turnover';
      break;
    case 'press':
      if (!foe || !isOwner(s, foe)) return 'moved';
      if (i.priority === 'danger') return danger ? undefined : 'cleared';
      return gap(gp.pos, foe.pos) > C.pressLose * pressReach(s, gp.side)
        ? 'unreachable'
        : undefined;
    case 'mark':
      if (!foe || (i.priority === 'danger' ? !danger : foe.intention?.kind !== 'run'))
        return 'cleared';
      return gap(gp.pos, foe.pos) > C.mark.lose ? 'unreachable' : undefined;
    case 'cover':
      return mate?.intention?.kind === 'press' ? undefined : 'cleared';
  }
  const d = gap(gp.pos, i.target);
  if (d <= C.arrive) return 'arrival';
  return d / speedOf(s, gp) > i.until - s.elapsed + C.slack ? 'unreachable' : undefined;
}

/**
 * Once per action, after it is applied and before anyone moves, so everyone reacts to the pass,
 * carry or turnover as it happens: ends the intentions that are achieved, expired or no longer
 * feasible, follows the references of the ones that hold, then lets the free players choose — the
 * defending side presses, covers, marks runners and recovers (an urgent danger displaces lower
 * jobs), the side with the ball shows for a pressured carrier and runs. An ordinary update keeps
 * every feasible intention.
 */
export function updateIntentions(s: GridState): void {
  const att = s.possession;
  const def = other(att);
  const danger = inDanger(s, def);
  for (const side of [0, 1] as const)
    for (const gp of s.players[side]) {
      const i = gp.intention;
      if (!i || rank(i.priority) <= rank('restart')) continue;
      const why = onPitch(gp) ? verdict(s, gp, i, side === def && danger) : 'departed';
      if (why) endIntention(s, gp, why);
      else if (TRACKING.has(i.kind)) i.target = inside(intentionTarget(s, gp));
    }
  const carrier = s.owner && s.owner[0] === att ? s.players[att][s.owner[1]]! : undefined;
  if (!carrier || !onPitch(carrier)) return;
  defend(s, def, carrier, danger);
  attack(s, att, carrier);
}

/** The defending side's choices against `carrier`. */
function defend(s: GridState, side: 0 | 1, carrier: GridPlayer, danger: boolean): void {
  const players = s.players[side].filter(outfield);
  const now = s.elapsed;
  // Press: the carrier's nearest man, his distance shortened by a pressing role, traits and fresh legs.
  const reach = pressReach(s, side);
  const pressing = players.filter(
    (gp) => gp.intention?.kind === 'press' && gp.intention.opponent === carrier.idx,
  );
  const wanted = s.setup.tactics[side] === 'press' ? 2 : 1;
  const candidates = players
    .filter((gp) => !pressing.includes(gp))
    .map((gp) => {
      const d = gap(gp.pos, carrier.pos);
      return { gp, d, cost: d / (weight(s, gp, 'press') * fresh(s, gp)) };
    })
    .sort((a, b) => a.cost - b.cost || a.gp.idx - b.gp.idx);
  for (const c of candidates) {
    if (pressing.length >= wanted) break;
    const urgent = danger && pressing.length === 0;
    const priority = urgent ? 'danger' : 'tactical';
    if (!free(c.gp, priority)) continue;
    if (!urgent && c.d > (pressing.length === 0 ? reach : 0.6 * reach)) continue;
    setIntention(
      s,
      c.gp,
      {
        kind: 'press',
        priority,
        target: [carrier.pos[0], carrier.pos[1]],
        opponent: carrier.idx,
        until: now + C.seconds.press,
      },
      urgent ? 'danger' : 'replaced',
    );
    c.gp.intention!.target = inside(intentionTarget(s, c.gp));
    pressing.push(c.gp);
  }
  // Cover: one defender or holding midfielder steps behind the first presser, a covering role first.
  const presser = pressing[0];
  if (
    presser &&
    !players.some((gp) => gp.intention?.kind === 'cover' && gp.intention.teammate === presser.idx)
  ) {
    const point = coverPoint(side, presser);
    // Only a man whose own place in the shape is near the cover point leaves it to cover.
    const cover = players
      .filter((gp) => {
        if (gp.intention || pressing.includes(gp)) return false;
        const position = slotOf(s, gp).position;
        if (lineOf(position) !== 'DF' && position !== 'DM') return false;
        return gap(targetOf(s, side, gp.idx), point) <= C.coverNear;
      })
      .map((gp) => ({ gp, cost: gap(gp.pos, point) / (COVER_ROLES[slotOf(s, gp).role] ?? 1) }))
      .sort((a, b) => a.cost - b.cost || a.gp.idx - b.gp.idx)[0];
    if (cover)
      setIntention(s, cover.gp, {
        kind: 'cover',
        priority: 'tactical',
        target: point,
        teammate: presser.idx,
        until: now + C.seconds.cover,
      });
  }
  // Mark: the nearest free man picks up each runner, urgently when the danger is on.
  const priority = danger ? 'danger' : 'tactical';
  for (const runner of s.players[other(side)]) {
    if (!onPitch(runner) || runner.intention?.kind !== 'run') continue;
    if (players.some((gp) => gp.intention?.kind === 'mark' && gp.intention.opponent === runner.idx))
      continue;
    const marker = players
      .filter((gp) => !pressing.includes(gp) && free(gp, priority))
      .map((gp) => ({ gp, d: gap(gp.pos, runner.pos) }))
      .filter((c) => c.d <= C.mark.pick)
      .sort((a, b) => a.d - b.d || a.gp.idx - b.gp.idx)[0];
    if (!marker) continue;
    setIntention(
      s,
      marker.gp,
      {
        kind: 'mark',
        priority,
        target: [runner.pos[0], runner.pos[1]],
        opponent: runner.idx,
        until: now + C.seconds.mark,
      },
      danger ? 'danger' : 'replaced',
    );
    marker.gp.intention!.target = inside(intentionTarget(s, marker.gp));
  }
  // Recover: just after losing the ball, a free player far from his shape goes back to it; a better reader reacts sooner.
  if (s.lastLoss?.side !== side || now - s.lastLoss.at >= C.recover.window) return;
  for (const gp of players) {
    if (gp.intention) continue;
    const shape = targetOf(s, side, gp.idx);
    const limit = C.recover.distance * (1 - C.recover.read * share(s, gp, 'decisions'));
    if (gap(gp.pos, shape) > limit)
      setIntention(s, gp, {
        kind: 'recover',
        priority: 'tactical',
        target: shape,
        until: now + C.seconds.recover,
      });
  }
}

/** The side with the ball: a teammate shows for a pressured carrier, runners go. */
function attack(s: GridState, side: 0 | 1, carrier: GridPlayer): void {
  const mates = s.players[side].filter((gp) => outfield(gp) && gp !== carrier);
  // Support: the nearest presser makes the carrier look for a teammate to show (→MATCH-16).
  let presser: GridPlayer | undefined,
    closest: number = TAG_CONFIG.pressureRadius;
  for (const o of s.players[other(side)]) {
    if (!onPitch(o)) continue;
    const d = gap(o.pos, carrier.pos);
    if (d <= closest) [presser, closest] = [o, d];
  }
  if (
    presser &&
    !mates.some((gp) => gp.intention?.kind === 'support' && gp.intention.teammate === carrier.idx)
  ) {
    const best = mates
      .filter((gp) => !gp.intention && gap(gp.pos, carrier.pos) <= C.support.near)
      .map((gp) => ({ gp, cost: gap(gp.pos, carrier.pos) / weight(s, gp, 'key') }))
      .sort((a, b) => a.cost - b.cost || a.gp.idx - b.gp.idx)[0];
    // One draw per carrier and spell of possession, so the option does not reroll at every touch.
    const r = best && stream(s, best.gp, `support:${carrier.idx}`, s.possessionSince);
    if (best && r!() < C.support.show + C.support.composure * share(s, best.gp, 'composure')) {
      const away = r!() < share(s, best.gp, 'decisions');
      const [from, to] = away ? [presser.pos, carrier.pos] : [carrier.pos, best.gp.pos];
      const d = gap(from, to) || 1;
      setIntention(s, best.gp, {
        kind: 'support',
        priority: 'tactical',
        target: [
          carrier.pos[0] + ((to[0] - from[0]) / d) * C.support.distance,
          carrier.pos[1] + ((to[1] - from[1]) / d) * C.support.distance,
        ],
        teammate: carrier.idx,
        until: s.elapsed + C.seconds.support,
      });
    }
  }
  // Runs: his role's run, more often for a better reader of the moment and fresher legs.
  const ctx = runContext(s, side);
  if (ctx.band < 3) return;
  for (const gp of mates) {
    if (gp.intention) continue;
    const timing = C.timing.min + (C.timing.max - C.timing.min) * share(s, gp, 'decisions');
    const plan = runPlan(s, gp, ctx, stream(s, gp, 'run', s.elapsed), timing * fresh(s, gp));
    if (plan)
      setIntention(s, gp, {
        kind: 'run',
        run: plan.kind,
        priority: 'tactical',
        target: plan.target,
        until: s.elapsed + plan.seconds,
      });
  }
}
