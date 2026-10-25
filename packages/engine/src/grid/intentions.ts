/**
 * Individual football intentions on the candidate match model (→MATCH-16, MATCH-17;
 * docs/MATCH-MODEL-CONTRACT.md "Intentions and team reactions"). One lifecycle for every kind: an
 * intention keeps its target and its teammate/opponent while it is feasible, ends when achieved,
 * expired or no longer feasible, and yields only to a higher priority or a reasoned event — a
 * turnover, an urgent danger, a restart, a substitution, an injury or a sending-off — whose reason it
 * records. Runs are intentions; `GridPlayer.run` stays their view for the readers that predate them.
 * Who takes which job is planned for each side at once (`coordination.ts`). Match-local state only.
 * Draws are named by fixture, player, decision and its moment, never by an update order, a
 * rendering frame or an observer (→ARCH-5, MATCH-7).
 */
import type {
  INTENTION_ENDS,
  INTENTION_KINDS,
  INTENTION_PRIORITIES,
} from '../../../contracts/src/match-model';
import { boxHeld, boxRunPoint, boxSide, type BoxJob } from './box';
import {
  closedAt,
  gap,
  inside,
  isOwner,
  planCoordination,
  pressReach,
  rank,
  screenable,
  screenPoint,
  type CoordinationPlan,
} from './coordination';
import { attackFrame, PITCH, toEngine } from './pitch';
import { intentionTarget, offsideLine, secondBallOver, speedOf, type SetPieceScene } from './shape';
import { onPitch, other, type GridPlayer, type GridState } from './state';

export type IntentionKind = (typeof INTENTION_KINDS)[number];
export type IntentionPriority = (typeof INTENTION_PRIORITIES)[number];
export type IntentionEnd = (typeof INTENTION_ENDS)[number];

/** Why an intention ended, and which of the contract's endings that is. */
export const INTENTION_REASONS = {
  /** He stands on its target (a reception, a run's end, a restart place). */
  arrival: 'achieved',
  /**
   * What it answered is over: the danger passed, the runner stopped, the presser stopped; for a
   * screen, the carrier played the ball or the receiver left the lane (T442); for a box-scene run
   * or guard, the ball left the scene's area, went to the other side of goal or was cleared (T443).
   */
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
  /** An opponent took the space the combination needed (→MATCH-16). */
  closed: 'infeasible',
  /** The runner he marked entered a teammate's zone and that teammate took him (`ended.teammate`). */
  handover: 'achieved',
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
  /** Roster index of the opponent it tracks: the carrier he presses or screens, the runner he marks. */
  opponent?: number;
  /**
   * Roster index of the carrier's teammate whose lane from the carrier (`opponent`) it shuts
   * (→MATCH-32, T442): the option a tactical press keeps in his cover shadow, a screen's receiver.
   */
  shadow?: number;
  /** A run's kind; an overlap's teammate is the carrier it combines with. */
  run?: 'behind' | 'overlap' | 'box';
  /** A support's job: showing to receive, or stepping out of the lane the ball would take. */
  support?: 'show' | 'open';
  /**
   * A set-piece guard's `cover` (T348, engine frame): the spot a zonal or edge defender guards, or
   * the middle of the goal line his keeper guards; its target follows `guardPoint`.
   */
  zone?: [number, number];
  /**
   * A box-scene job (T443, →MATCH-33/34): the zone a committed box run attacks, or the zone a
   * defender's `cover` guards (`boxGuardPoint`), and the ball's side it was named for.
   */
  box?: BoxJob;
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

/**
 * Initial values for the candidate model; T278 calibrates them against the unchanged targets.
 * Who takes which job is `COORDINATION_CONFIG`.
 */
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
    screen: 6,
  },
  /** Metres within which a fixed target is reached. */
  arrive: 1,
  /** Seconds past its expiry a target may still need and count as reachable. */
  slack: 1,
  /** The carrier within this many metres of the goal he attacks is an urgent danger (→MATCH-17). */
  danger: 30,
  /** A tactical press ends when the carrier gets this many times its reach away. */
  pressLose: 1.6,
  /** A marked runner is given up past this many metres. */
  markLose: 28,
} as const;

/** Kinds whose target follows a reference rather than staying where it was set. */
const TRACKING: ReadonlySet<IntentionKind> = new Set(['press', 'mark', 'cover']);

const C = INTENTION_CONFIG;

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
      if (!i) continue;
      if ((side === gp.side ? i.teammate : i.opponent) === gp.idx) endIntention(s, p, 'departed');
      // A lane's receiver (T442): a screen ends with him, a press only loses its cover shadow.
      else if (side !== gp.side && i.shadow === gp.idx) {
        if (i.kind === 'screen') endIntention(s, p, 'departed');
        else delete i.shadow;
      }
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

/** The carrier runs with the ball to `to`; the reception that brought it to him is achieved if he reached it. */
export function carryTo(s: GridState, gp: GridPlayer, to: readonly [number, number]): void {
  const held = gp.intention;
  if (held?.kind === 'receive' && gap(gp.pos, held.target) <= C.arrive)
    endIntention(s, gp, 'arrival');
  setIntention(s, gp, {
    kind: 'carry',
    priority: 'committed',
    target: [to[0], to[1]],
    until: s.elapsed + C.seconds.carry,
  });
}

/**
 * A pass `passer` played to `receiver` did not reach him (intercepted, out, offside, won by the
 * other side): the opportunity is cancelled as lost — the intention he played for (a run) ends with
 * that reason, or, with none, his receiving chance is recorded as lost.
 */
export function losePass(s: GridState, side: 0 | 1, passer: number, receiver: number): void {
  const gp = s.players[side][receiver]!;
  if (gp.intention) {
    if (rank(gp.intention.priority) > rank('restart')) endIntention(s, gp, 'lost');
    return;
  }
  gp.ended = {
    kind: 'receive',
    priority: 'committed',
    target: [gp.pos[0], gp.pos[1]],
    teammate: passer,
    since: s.elapsed,
    until: s.elapsed,
    end: INTENTION_REASONS.lost,
    reason: 'lost',
    at: s.elapsed,
  };
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

/**
 * The defending side of a delivery at its kick (→MATCH-18, T348): its scene keeps its jobs through
 * the delivery, the aerial contest and the second ball until `until`, as the players who went up
 * keep their box spots (`restartTaken`), instead of being released into the shape. Each
 * man-marker marks the attacker his place names, goal-side; each zonal or edge defender guards his
 * spot; the keeper guards his goal against the delivery (`guardPoint`). They are committed, so only
 * an urgent danger, a turnover, a restart or leaving the pitch displaces them. A mark ends with
 * its runner's hold, a guard once the second ball is over (`secondBallOver`). A player off the pitch
 * takes no job, and nobody marks one.
 */
export function defendSetPiece(
  s: GridState,
  scene: Pick<SetPieceScene, 'marks' | 'keeper'>,
  until: number,
): void {
  const track = (gp: GridPlayer) => (gp.intention!.target = inside(intentionTarget(s, gp)));
  for (const { gp, to, opponent } of scene.marks) {
    if (!onPitch(gp)) continue;
    const spec =
      opponent && onPitch(opponent)
        ? { kind: 'mark' as const, opponent: opponent.idx }
        : { kind: 'cover' as const, zone: [to[0], to[1]] as [number, number] };
    if (setIntention(s, gp, { ...spec, priority: 'committed', target: [to[0], to[1]], until }))
      track(gp);
  }
  const keeper = scene.keeper;
  if (!keeper || !onPitch(keeper)) return;
  const goal = toEngine(keeper.side, [0, PITCH.width / 2]);
  if (
    setIntention(s, keeper, {
      kind: 'cover',
      priority: 'committed',
      target: goal,
      zone: goal,
      until,
    })
  )
    track(keeper);
}

/**
 * Sends `gp`'s box-scene run (T443) to his load point, or into his zone itself (`attack`). The
 * target and the run's view are replaced rather than changed in place, as a hypothetical update
 * (the defenders' read, `engine.ts`) restores them by their old values.
 */
function boxRunTo(gp: GridPlayer, attack: boolean): void {
  const i = gp.intention!;
  const { zone, ball } = i.box!;
  if (zone === 'middle') return;
  const target = inside(boxRunPoint(gp.side, ball, zone, attack));
  i.target = target;
  if (gp.run) gp.run = { ...gp.run, target: [target[0], target[1]] };
}

/**
 * The carrier of `side` has decided a cross or a cut-back (→MATCH-33, T443): every runner of its
 * box scene attacks his zone itself from now on, read at the decision as the defenders read the
 * decided pass (T426), so he arrives as the ball does.
 */
export function attackZones(s: GridState, side: 0 | 1): void {
  for (const gp of s.players[side])
    if (gp.intention?.kind === 'run' && gp.intention.box && onPitch(gp)) boxRunTo(gp, true);
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
      if (i.support !== 'open' && closedAt(s, gp.side, i.target)) return 'closed';
      break;
    case 'run':
      if (s.possession !== gp.side) return 'turnover';
      // A box-scene run holds while the ball stays in the scene's area on its side of goal (T443).
      if (i.box && !boxHeld(s, gp.side, i.box.ball)) return 'cleared';
      // A committed run holds its spot (a box spot kept for the second ball) until it expires.
      if (i.priority === 'committed') return undefined;
      // An overlap is a combination with its carrier: it ends once he has played on or its space is taken.
      if (i.run === 'overlap' && mate) {
        if (!isOwner(s, mate)) return 'moved';
        if (closedAt(s, gp.side, i.target)) return 'closed';
      }
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
      return gap(gp.pos, foe.pos) > C.markLose ? 'unreachable' : undefined;
    case 'cover':
      // A box guard holds until the ball leaves the scene's area or is cleared (T443).
      if (i.box) return boxHeld(s, other(gp.side), i.box.ball) ? undefined : 'cleared';
      // A set-piece guard holds until the second ball is over (T348).
      if (i.zone) return secondBallOver(s, other(gp.side)) ? 'cleared' : undefined;
      return mate?.intention?.kind === 'press' ? undefined : 'cleared';
    case 'screen': {
      // He stands in the lane until the carrier plays the ball or the receiver leaves it (T442).
      const receiver = i.shadow === undefined ? undefined : s.players[other(gp.side)][i.shadow];
      if (receiver && !onPitch(receiver)) return 'departed';
      if (!foe || !receiver || !isOwner(s, foe)) return 'cleared';
      return screenable(s, foe, receiver) && screenPoint(s, gp, foe, receiver)
        ? undefined
        : 'cleared';
    }
  }
  const d = gap(gp.pos, i.target);
  if (d <= C.arrive) return 'arrival';
  return d / speedOf(s, gp) > i.until - s.elapsed + C.slack ? 'unreachable' : undefined;
}

/**
 * Once per action, after it is applied and before anyone moves, so everyone reacts to the pass,
 * carry or turnover as it happens: ends the intentions that are achieved, expired or no longer
 * feasible, follows the references of the ones that hold (a screen keeps to its lane), then gives
 * out the jobs both sides planned from that one snapshot (`planCoordination`): the defending side
 * presses with a cover shadow, guards the box's zones (T443), covers, marks runners, screens a
 * lane and recovers (an urgent danger displaces lower jobs), the side with the ball runs to the
 * box's zones, shows for a pressured carrier, clears his lane and runs. A box runner waits at his
 * load point again while the scene is on. An ordinary update keeps every feasible intention.
 * `inFlight` (T373): the update that reads a delivery's kick when its taker has played the ball
 * and nobody has it yet. It reads no carrier: no urgent danger and no jobs to give, so nobody
 * presses the taker while the ball is in the air and the scene keeps its set-piece jobs.
 */
export function updateIntentions(s: GridState, inFlight = false): void {
  const def = other(s.possession);
  const danger = !inFlight && inDanger(s, def);
  const review = (gp: GridPlayer) => {
    const i = gp.intention;
    if (!i || rank(i.priority) <= rank('restart')) return undefined;
    return onPitch(gp) ? verdict(s, gp, i, gp.side === def && danger) : 'departed';
  };
  // Every verdict reads the same state, then they all take effect: no player sees another's first.
  const ended: GridPlayer[] = [];
  const why: IntentionReason[] = [];
  for (const roster of s.players)
    for (const gp of roster) {
      const reason = review(gp);
      if (reason) {
        ended.push(gp);
        why.push(reason);
      }
    }
  for (let k = 0; k < ended.length; k++) endIntention(s, ended[k]!, why[k]!);
  // A cover whose presser stopped, or a mark whose runner stopped, ends with it.
  for (const roster of s.players)
    for (const gp of roster) {
      const reason =
        gp.intention?.kind === 'cover' || gp.intention?.kind === 'mark' ? review(gp) : undefined;
      if (reason) endIntention(s, gp, reason);
    }
  // The side whose box scene is on, and its ball's side of goal (T443).
  const scene = boxSide(s, s.possession);
  for (const roster of s.players)
    for (const gp of roster) {
      const i = gp.intention;
      if (i && TRACKING.has(i.kind)) i.target = inside(intentionTarget(s, gp));
      // A screen keeps to the lane as its carrier and receiver move, once an action (T442).
      else if (i?.kind === 'screen') {
        const foes = s.players[other(gp.side)];
        i.target = inside(screenPoint(s, gp, foes[i.opponent!]!, foes[i.shadow!]!) ?? i.target);
      }
      // A box runner waits at his load point again while the scene is on (T443): the delivery he
      // attacked is over and the ball is with a carrier out wide again.
      else if (i?.box && i.kind === 'run' && gp.side === s.possession && scene === i.box.ball)
        boxRunTo(gp, false);
    }
  // With no carrier `planCoordination` plans nothing (its empty plan), so it is not asked.
  if (!inFlight) applyCoordination(s, planCoordination(s, danger));
}

/**
 * Gives out a plan's jobs. Every job was chosen from the same snapshot and goes to a different
 * player, so the order they are given out in changes nothing.
 */
export function applyCoordination(s: GridState, plan: CoordinationPlan): void {
  if (plan.escalate) {
    const gp = s.players[plan.escalate[0]][plan.escalate[1]]!;
    gp.intention!.priority = 'danger';
    gp.intention!.target = inside(intentionTarget(s, gp));
  }
  for (const h of plan.handovers) {
    const gp = s.players[h.side][h.from]!;
    endIntention(s, gp, 'handover');
    gp.ended!.teammate = h.to;
  }
  for (const { side, idx, option } of plan.shadows) {
    const gp = s.players[side][idx]!;
    if (option === undefined) delete gp.intention!.shadow;
    else gp.intention!.shadow = option;
    gp.intention!.target = inside(intentionTarget(s, gp));
  }
  for (const job of plan.jobs) {
    const gp = s.players[job.side][job.idx]!;
    const { kind } = job.intention;
    const seconds = job.seconds ?? C.seconds[kind as keyof typeof C.seconds];
    if (!setIntention(s, gp, { ...job.intention, until: s.elapsed + seconds }, job.reason))
      continue;
    if (TRACKING.has(kind)) gp.intention!.target = inside(intentionTarget(s, gp));
  }
}
