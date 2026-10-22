/** `playGrid`: a whole match, touch by touch (→MATCH-1, MATCH-3, MATCH-7, MATCH-11). */
import type { MatchRecord, Score } from '../../../contracts/src/types';
import { choosePass, decide, DECISION_CONFIG, throughPoint, type Decision } from './decide';
import { computeTags } from './tags';
import { cardForFoul, dissentAt } from './discipline';
import {
  inFront,
  looseWinner,
  resolveCarry,
  resolveClearance,
  resolveCross,
  resolveCutBack,
  resolveHoldUp,
  resolvePass,
  resolveShot,
  resolveTakeOn,
  shotContext,
  type Outcome,
  type ShotOutcome,
} from './resolve';
import {
  classifyOut,
  foulRestart,
  isOffside,
  playRestart,
  RESTART_CONFIG,
  type Restart,
} from './restarts';
import { crossArrival, Tally, type GridDiagnostics } from './record';
import { isLevel, type GridSetup } from './setup';
import { playShootout } from './shootout';
import { moveAll, speedOf, startRuns } from './shape';
import {
  carryTo,
  depart,
  interruptAll,
  losePass,
  takeBall,
  updateIntentions,
} from './intentions';
import { attackFrame, PITCH } from './pitch';
import {
  createState,
  kickOff,
  onPitch,
  other,
  slotOf,
  type GridPlayer,
  type GridState,
} from './state';
import { lineOf } from '../player';
import { applyChanges, coverGoal, drawInjury, leave, planChanges, sideFreshness } from './changes';
import { shotEnd, Tracer, type TraceEntry } from './trace';
import { stampAt } from './playback';
import {
  advance,
  benchPoint,
  flightSeconds,
  heading,
  prepareOnClock,
  readAt,
  reachSeconds,
  type BallSpeed,
  type MotionKnot,
  type Move,
} from './movement';

/** Seconds an action takes before the 0.85 + 0.3·r jitter (design §8.2). */
export const ACTION_SECONDS = {
  short: 2.3,
  long: 3.6,
  switch: 3.6,
  through: 2.8,
  cross: 3.2,
  cutBack: 2.4,
  carry: 3.0,
  takeOn: 2.6,
  shot: 2.0,
  holdUp: 3.0,
  clearance: 2.8,
} as const;

/** Added-time credits in seconds and each period's bounds in minutes (design §8.3). */
export const ADDED_CONFIG = {
  credits: { goal: 45, sub: 30, injury: 90, card: 20, penalty: 60 },
  bounds: [
    [1, 6],
    [2, 10],
    [0, 3],
    [0, 3],
  ],
} as const;

export interface GridResult {
  record: MatchRecord;
  trace?: TraceEntry[];
  /** Match seconds played, dead time included. */
  elapsed: number;
  diagnostics: GridDiagnostics;
}

type Ref = [0 | 1, number];
type ActionKey = keyof typeof ACTION_SECONDS;
/** Each period's length in seconds: two halves of 45 minutes, extra time 2 × 15. */
const PERIOD_SECONDS = [45 * 60, 45 * 60, 15 * 60, 15 * 60] as const;
const CENTRE_SPOT: [number, number] = [PITCH.length / 2, PITCH.width / 2];

/** The speed a kick of an action travels at (candidate model, →MATCH-12). */
const kickSpeed = (key: ActionKey | 'restart'): BallSpeed =>
  key === 'shot'
    ? 'shot'
    : key === 'restart'
      ? 'restart'
      : key === 'clearance' || key === 'carry' || key === 'takeOn' || key === 'holdUp'
        ? 'turnover'
        : 'pass';

/** How long an action takes on the candidate model and how everyone moves meanwhile. */
interface Motion {
  dt: number;
  plan: Move[];
  knots: MotionKnot[];
}

export function playGrid(setup: GridSetup): GridResult {
  const s: GridState = createState(setup);
  const r = setup.r;
  /**
   * The candidate model (→MATCH-12, SAVE-23): bounded movement, physically feasible action times
   * and restarts prepared on the clock. Absent metadata keeps the pre-feature path untouched.
   */
  const candidate = setup.model !== undefined;
  /** Added-time seconds of a stoppage: the pre-feature credit, or what the candidate clock really spent. */
  const charge = (old: number, spent: number) => (candidate ? spent : old);
  const ctx = shotContext(s);
  const tally = new Tally(setup, s);
  const tracer = new Tracer(setup.observe, () => tally.running());
  const added: number[] = [];
  const credits = [0, 0, 0, 0];
  let pending: Restart | undefined;
  let lastPasser: Ref | undefined;
  let justBeat: Ref | undefined;
  /** The take-on that came immediately before the current action (an assist needs a pass, not a dribble). */
  let prevBeat: Ref | undefined;
  let holdBias = false;
  /** When the last corner or free kick was taken, and whether the current restart is a penalty. */
  let setPieceAt: number | undefined;
  let penalty = false;

  const minute = () => stampAt(s.period, s.t, 0).minute;
  /** The match minute of an incident: the label of the playback frame that shows it (→MATCH-24). */
  const stamp = () => stampAt(s.period, s.t, added[s.period - 1]);

  /**
   * Hands the ball to `(side, idx)` at `at` (or where he stands); a change of side is a regain and a
   * loss. The pre-feature path puts him there at once; on the candidate model he runs there during
   * the action (`motionOf`), committed to it as an intention; a change of side interrupts both
   * sides' intentions as a turnover.
   */
  function setOwner(side: 0 | 1, idx: number, at?: [number, number], passer?: number) {
    const gp = s.players[side][idx]!;
    if (at && !candidate) gp.pos = [at[0], at[1]];
    const where = at ?? gp.pos;
    if (candidate) {
      if (s.possession !== side) interruptAll(s, 'turnover');
      takeBall(s, gp, where, passer);
    }
    if (s.possession !== side || !s.owner) {
      if (s.owner) tally.regain(side, idx, attackFrame(side, where));
      s.lastRegain = { side, at: s.elapsed };
      s.lastLoss = { side: other(side), at: s.elapsed };
      s.possessionSince = s.elapsed;
      lastPasser = undefined;
      holdBias = false;
    }
    s.owner = [side, idx];
    s.possession = side;
    s.ball = [where[0], where[1]];
  }

  function endOfPlay(side: 0 | 1, o: ShotOutcome): [number, number] {
    const keeperEnd = side === 0 ? PITCH.length : 0;
    const shooter = s.players[side][o.shooter ?? 0]!;
    return [keeperEnd, shooter.pos[1]];
  }

  function applyShot(side: 0 | 1, o: ShotOutcome) {
    const shooter = o.shooter ?? 0;
    tally.shot(side, shooter, o.recordedXg, o.result);
    const gp = s.players[side][shooter]!;
    const [x, y] = attackFrame(side, gp.pos);
    tally.diagnostics.shots.push({
      side,
      x,
      y,
      xg: o.recordedXg,
      header: o.header ?? false,
      setPiece: !penalty && setPieceAt !== undefined && s.elapsed - setPieceAt <= 10,
      penalty,
      goal: o.result === 'goal',
      line: lineOf(slotOf(s, gp).position),
    });
    tally.material?.shot(side, shooter, o.result, tally.diagnostics.shots.at(-1)!);
    const passer =
      lastPasser &&
      lastPasser[0] === side &&
      lastPasser[1] !== shooter &&
      !(prevBeat && prevBeat[0] === side && prevBeat[1] === shooter)
        ? lastPasser[1]
        : undefined;
    tally.shotDetail(side, shooter, {
      from: attackFrame(side, s.players[side][shooter]!.pos),
      xg: o.xg,
      recordedXg: o.recordedXg,
      goal: o.result === 'goal',
      passer,
    });
    const foe = other(side);
    // On the candidate model the ball rests where the shot ended until it is retrieved.
    const rest = () => {
      if (candidate) s.ball = shotEnd(s, side, shooter, o);
    };
    if (o.result === 'goal') {
      s.score[side]++;
      tally.goal(side, shooter, minute(), passer);
      credits[s.period - 1]! += charge(ADDED_CONFIG.credits.goal, RESTART_CONFIG.dead.goal);
      pending = { kind: 'kickoff', side: foe, spot: CENTRE_SPOT, dead: RESTART_CONFIG.dead.goal };
      rest();
      return;
    }
    if (o.result === 'save') tally.save(foe, o.by ?? 0);
    const at = endOfPlay(side, o);
    if (o.then === 'hold') setOwner(foe, o.by ?? 0, s.players[foe][o.by ?? 0]!.pos);
    else if (o.then === 'corner') {
      pending = classifyOut({ at, lastTouch: foe, over: 'byline', blockedOrSaved: true });
      rest();
    } else if (o.then === 'goalKick') {
      pending = classifyOut({ at, lastTouch: side, over: 'byline' });
      rest();
    } else {
      const loose: [number, number] = [
        side === 0 ? PITCH.length - 5 : 5,
        s.players[side][shooter]!.pos[1],
      ];
      const winner = looseWinner(s, loose, r);
      setOwner(winner[0], winner[1], loose);
    }
  }

  /** Shows a card: a caution is remembered; a second yellow or a red sends the player off and his side plays a man short. */
  function applyCard(
    side: 0 | 1,
    idx: number,
    card: 'yellow' | 'secondYellow' | 'red',
    reason: 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious',
  ) {
    const gp = s.players[side][idx]!;
    tally.card(side, idx, card);
    // The candidate clock charges a card where it stops play (a foul's free kick), not here.
    credits[s.period - 1]! += charge(ADDED_CONFIG.credits.card, 0);
    tally.incidents.push({
      ...stamp(),
      side,
      kind: card,
      player: gp.player.id,
      reason,
    });
    // A sending-off ends his intention first, so his exit is traced with it.
    const off = candidate && card !== 'yellow';
    if (off) depart(s, gp, 'dismissal');
    tracer.note(s, side, idx, card, {
      reason,
      ...(off ? { transition: 'exit' as const, left: gp.ended } : {}),
    });
    if (card === 'yellow') {
      gp.yellow = true;
      return;
    }
    gp.sentOff = true;
    leave(s, gp);
    s.changes[side].reds++;
    coverGoal(s, side);
  }

  /** A player hurt in play leaves at once; play stops for a drop ball unless it is already dead (→MATCH-21). */
  function injure(side: 0 | 1, idx: number) {
    const gp = s.players[side][idx]!;
    gp.injured = true;
    leave(s, gp);
    if (candidate) depart(s, gp, 'injury');
    s.changes[side].injured.push(idx);
    tally.incidents.push({ ...stamp(), side, kind: 'injury', player: gp.player.id });
    tracer.note(s, side, idx, 'injury', candidate ? { transition: 'exit', left: gp.ended } : {});
    credits[s.period - 1]! += charge(ADDED_CONFIG.credits.injury, RESTART_CONFIG.dead.injury);
    if (pending) pending.dead += RESTART_CONFIG.dead.injury;
    else
      pending = {
        kind: 'dropBall',
        side: s.possession,
        spot: [s.ball[0], s.ball[1]],
        dead: RESTART_CONFIG.dead.injury,
      };
  }

  /** Both managers' changes at a dead ball or at half-time (design §8.1). */
  function stoppage(rs: Restart) {
    const half = s.period > 1 && s.t === 0;
    for (const side of [0, 1] as const) {
      const plan = planChanges(s, side, r);
      applyChanges(s, side, plan);
      for (const ch of plan) {
        // An injured player has already left with his own reason.
        const out = s.players[side][ch.out]!;
        if (candidate && !out.injured) depart(s, out, 'substitution');
        tally.incidents.push({
          ...stamp(),
          side,
          kind: 'sub',
          player: s.players[side][ch.out]!.player.id,
          other: s.players[side][ch.in]!.player.id,
        });
        // On the candidate model the substitute comes on from the touchline and walks in.
        const entry = candidate ? benchPoint(side) : undefined;
        if (entry) {
          const inn = s.players[side][ch.in]!;
          inn.pos = [entry[0], entry[1]];
          inn.vel = undefined;
        }
        tracer.note(s, side, ch.out, 'sub', {
          other: ch.in,
          ...(entry ? { transition: 'entry' as const, to: entry, left: out.ended } : {}),
        });
        if (half) continue;
        credits[s.period - 1]! += charge(
          ADDED_CONFIG.credits.sub,
          RESTART_CONFIG.dead.substitution,
        );
        rs.dead += RESTART_CONFIG.dead.substitution;
      }
    }
  }

  /** Applies any outcome of the player `(side, idx)` on the ball. */
  function apply(side: 0 | 1, idx: number, o: Outcome) {
    const foe = other(side);
    if ('aerial' in o && o.aerial !== undefined) tally.material?.aerial(o.aerial);
    switch (o.kind) {
      case 'complete':
        if (o.receiver !== idx) {
          tally.material?.received(side, idx, o.receiver, o.to);
          lastPasser = [side, idx];
          const from = s.players[side][idx]!.pos;
          const dx = (o.to[0] - from[0]) * (side === 0 ? 1 : -1);
          const dy = (o.to[1] - from[1]) * (side === 0 ? 1 : -1);
          setOwner(side, o.receiver, o.to, idx);
          s.lastPass = { dx, dy };
        } else {
          // A carry: at once on the pre-feature path, run with the ball on the candidate model.
          if (!candidate) s.players[side][idx]!.pos = [o.to[0], o.to[1]];
          else carryTo(s, s.players[side][idx]!, o.to);
          s.ball = [o.to[0], o.to[1]];
        }
        return;
      case 'intercepted':
        tally.interception(foe, o.by, attackFrame(foe, o.at));
        setOwner(foe, o.by, o.at);
        return;
      case 'tackled':
        tally.tackle(foe, o.by, attackFrame(foe, s.ball));
        setOwner(foe, o.by, [s.ball[0], s.ball[1]]);
        return;
      case 'loose':
        setOwner(o.winner[0], o.winner[1], o.at);
        return;
      case 'out':
        pending = classifyOut(o);
        if (candidate) s.ball = [o.at[0], o.at[1]];
        return;
      case 'foul': {
        const [fouledSide, fouled] = o.on ?? [side, idx];
        const fouler = other(fouledSide);
        tally.foul(fouler, o.by, fouled, attackFrame(fouler, o.at));
        pending = foulRestart(s, fouledSide, o.at);
        if (candidate) s.ball = [o.at[0], o.at[1]];
        const verdict = cardForFoul(
          s,
          fouler,
          o.by,
          { at: o.at, inBox: pending.kind === 'penalty' },
          r,
        );
        if (verdict.card !== 'none') {
          applyCard(fouler, o.by, verdict.card, verdict.reason ?? 'reckless');
          pending.dead += RESTART_CONFIG.dead.card;
          credits[s.period - 1]! += charge(0, RESTART_CONFIG.dead.card);
        }
        return;
      }
      case 'held':
        if (o.by !== undefined) setOwner(foe, o.by, s.players[foe][o.by]!.pos);
        else holdBias = true;
        return;
      case 'shot':
        applyShot(side, o);
    }
  }

  const secondsOf = (kind: ActionKey | undefined) => ACTION_SECONDS[kind ?? 'short'];

  /**
   * Candidate model (→MATCH-12): the action `actor` played from `from` at `start`, already applied,
   * lasts at least `least` and until its route is done — the ball's flight to where it ended at
   * bounded speed and the new owner's run to it. The actor keeps the ball until the kick, timed so
   * the ball lands as the action ends; the new owner runs to the ball, everyone else to his shape.
   * With `before` (where everyone was heading before the action) the others keep going there until
   * the kick and only then react to the ball (→MATCH-17).
   */
  function motionOf(
    actor: Ref,
    from: readonly [number, number],
    o: Outcome | 'offside',
    speed: BallSpeed,
    least: number,
    start: number,
    before?: ReadonlyMap<GridPlayer, readonly [number, number]>,
  ): Motion {
    const gp = s.players[actor[0]][actor[1]]!;
    const carry = o !== 'offside' && o.kind === 'complete' && o.receiver === actor[1];
    const legs: { to: [number, number]; speed: BallSpeed }[] = [];
    if (!carry) {
      const shot = o !== 'offside' && o.kind === 'shot';
      const shooter = shot ? (o.shooter ?? actor[1]) : actor[1];
      // A header or a cut-back's finish: the delivery reaches the shooter, who strikes it.
      if (shooter !== actor[1]) {
        const p = s.players[actor[0]][shooter]!.pos;
        legs.push({ to: [p[0], p[1]], speed });
      }
      legs.push({ to: [s.ball[0], s.ball[1]], speed: shot ? 'shot' : speed });
    }
    const times: number[] = [];
    let flight = 0,
      p = from;
    for (const leg of legs) {
      flight += flightSeconds(p, leg.to, leg.speed);
      times.push(flight);
      p = leg.to;
    }
    const owner = pending || !s.owner ? undefined : s.players[s.owner[0]][s.owner[1]]!;
    const ball: [number, number] = [s.ball[0], s.ball[1]];
    const reach = owner ? reachSeconds(owner, ball, speedOf(s, owner)) : 0;
    const dt = Math.max(least, flight, reach);
    const plan: Move[] = [];
    if (owner) plan.push({ gp: owner, to: ball });
    if (owner !== gp) plan.push({ gp, holdUntil: dt - flight });
    // `forEach` walks the map in the same insertion order without an entry array per player.
    if (before && flight > 0)
      before.forEach((to, p) => {
        if (p !== owner && p !== gp && onPitch(p))
          plan.push({ gp: p, before: to, readAt: readAt(s, p, actor[0], dt - flight) });
      });
    const knots: MotionKnot[] = [];
    if (carry)
      knots.push(
        { kind: 'carry', at: start, ball: [from[0], from[1]] },
        { kind: 'arrive', at: start + reach, ball },
      );
    else if (flight > 0) {
      const kick = start + dt - flight;
      knots.push({ kind: 'kick', at: kick, ball: [from[0], from[1]] });
      legs.forEach((leg, i) =>
        knots.push({
          kind: i < legs.length - 1 ? 'touch' : owner ? 'receive' : 'arrive',
          at: i < legs.length - 1 ? kick + times[i]! : start + dt,
          ball: leg.to,
        }),
      );
    } else if (o !== 'offside' && o.kind === 'tackled')
      knots.push({ kind: 'tackle', at: start + dt, ball });
    return { dt, plan, knots };
  }

  /** One decision by the player on the ball; returns the timing key of what was played and its outcome. */
  function play(
    side: 0 | 1,
    idx: number,
    d: Decision,
  ): { key: ActionKey; outcome: Outcome | 'offside' } {
    const tags = computeTags(s, side, idx);
    switch (d.action) {
      case 'pass': {
        if (d.target === undefined) break;
        if (isOffside(s, side, d.target, r)) {
          const spot = s.players[side][d.target]!.pos;
          pending = {
            kind: 'indirectFreeKick',
            side: other(side),
            spot: [spot[0], spot[1]],
            dead: RESTART_CONFIG.dead.offside,
          };
          // The flag goes up as the ball reaches him, and his chance to receive it is gone.
          if (candidate) {
            s.ball = [spot[0], spot[1]];
            losePass(s, side, idx, d.target);
          }
          tally.passEvent(side, idx, {
            from: attackFrame(side, s.players[side][idx]!.pos),
            to: attackFrame(side, spot),
            ok: false,
            kind: d.kind === 'through' ? 'through' : 'short',
          });
          tally.offside(side, d.target);
          return { key: d.kind ?? 'short', outcome: 'offside' };
        }
        const from = attackFrame(side, s.players[side][idx]!.pos);
        // On the candidate model a through ball goes into the runner's path (T324).
        const lead =
          candidate && d.kind === 'through' ? throughPoint(s, side, idx, d.target) : undefined;
        const to = attackFrame(side, lead ?? s.players[side][d.target]!.pos);
        const o = resolvePass(
          s,
          side,
          idx,
          d.target,
          tags,
          d.kind ?? 'short',
          d.lineBreaking ?? false,
          r,
          0,
          lead,
        );
        tally.passEvent(side, idx, {
          from,
          to,
          ok: o.kind === 'complete',
          kind: d.kind ?? 'short',
          lineBreaking: d.lineBreaking,
        });
        if (candidate && o.kind !== 'complete') losePass(s, side, idx, d.target);
        apply(side, idx, o);
        return { key: d.kind ?? 'short', outcome: o };
      }
      case 'cross': {
        const from = attackFrame(side, s.players[side][idx]!.pos);
        const o = resolveCross(s, side, idx, tags, ctx, r);
        const ok = o.kind === 'shot' || o.kind === 'complete';
        tally.passEvent(side, idx, { from, to: crossArrival(s, side, o, from), ok, kind: 'cross' });
        if (o.kind === 'shot') lastPasser = [side, idx];
        apply(side, idx, o);
        return { key: 'cross', outcome: o };
      }
      case 'cutBack': {
        if (d.target === undefined) break;
        const from = attackFrame(side, s.players[side][idx]!.pos);
        const to = attackFrame(side, s.players[side][d.target]!.pos);
        const o = resolveCutBack(s, side, idx, d.target, r);
        tally.passEvent(side, idx, { from, to, ok: o.kind === 'complete', kind: 'cutBack' });
        if (candidate && o.kind !== 'complete') losePass(s, side, idx, d.target);
        apply(side, idx, o);
        if (o.kind === 'complete') {
          const shot = resolveShot(s, side, d.target, computeTags(s, side, d.target), ctx, r, {
            cutBack: true,
          });
          applyShot(side, shot);
          return { key: 'cutBack', outcome: shot };
        }
        return { key: 'cutBack', outcome: o };
      }
      case 'takeOn': {
        const from = attackFrame(side, s.players[side][idx]!.pos);
        // With nobody in front to beat it is a carry, not a take-on (MATCH-13).
        const opposed = inFront(s, side, idx) !== undefined;
        const o = resolveTakeOn(s, side, idx, tags, r);
        if (opposed) tally.takeOnAttempt(side, idx);
        if (o.kind === 'complete') {
          if (opposed) tally.dribble(side, idx, from);
          tally.carryEvent(side, idx, from, attackFrame(side, o.to));
          if (opposed) justBeat = [side, idx];
        }
        apply(side, idx, o);
        return { key: 'takeOn', outcome: o };
      }
      case 'shot': {
        const o = resolveShot(s, side, idx, tags, ctx, r);
        apply(side, idx, o);
        return { key: 'shot', outcome: o };
      }
      case 'holdUp': {
        const o = resolveHoldUp(s, side, idx, r);
        apply(side, idx, o);
        return { key: 'holdUp', outcome: o };
      }
      case 'clearance': {
        const o = resolveClearance(s, side, idx, r);
        apply(side, idx, o);
        return { key: 'clearance', outcome: o };
      }
      case 'carry':
        break;
    }
    const to = d.point ?? [s.ball[0], s.ball[1]];
    const from = attackFrame(side, s.players[side][idx]!.pos);
    const o = resolveCarry(s, side, idx, tags, [to[0], to[1]], r);
    if (o.kind === 'complete') tally.carryEvent(side, idx, from, attackFrame(side, o.to));
    apply(side, idx, o);
    return { key: 'carry', outcome: o };
  }

  // A knockout tie still level after 90 minutes plays extra time (→MATCH-6, design §8.4).
  const periods: (1 | 2 | 3 | 4)[] = [1, 2];
  let regulation: Score | undefined;
  for (const period of periods) {
    s.period = period;
    s.t = 0;
    // Where the period starts on the match clock: a whole minute on the candidate model.
    const begun = s.elapsed;
    const start: 0 | 1 = period % 2 === 1 ? 0 : 1;
    pending = { kind: 'kickoff', side: start, spot: CENTRE_SPOT, dead: 0 };
    for (let guard = 0; guard < 20000; guard++) {
      const held = tally.incidents.length;
      let dt: number;
      let actor: Ref;
      let label: string;
      let outcomeLabel: string;
      const possessing = s.possession;
      let from: [number, number] | undefined;
      if (pending) {
        prevBeat = undefined;
        justBeat = undefined;
        const rs = pending;
        pending = undefined;
        // A dead ball interrupts every intention below leaving the pitch (→MATCH-17).
        if (candidate) interruptAll(s, 'restart');
        // Where the ball went dead; a period's start is an explicit transition, not running play.
        const rest: [number, number] = [s.ball[0], s.ball[1]];
        const transition = s.t === 0;
        stoppage(rs);
        if (rs.kind === 'kickoff') kickOff(s, rs.side, !candidate || transition);
        // The candidate transition lines up the kick-off taker too, before its whistle is traced.
        if (candidate && transition && s.owner)
          s.players[s.owner[0]][s.owner[1]]!.pos = [rs.spot[0], rs.spot[1]];
        if (transition)
          tracer.note(s, rs.side, -1, 'whistle', candidate ? { transition: 'period' } : {});
        tracer.hold();
        penalty = rs.kind === 'penalty';
        setPieceAt =
          rs.kind === 'corner' || rs.kind === 'freeKick' || rs.kind === 'indirectFreeKick'
            ? s.elapsed + rs.dead
            : undefined;
        const nominal = rs.dead;
        const prepared: { knots: MotionKnot[] } = { knots: [] };
        const res = playRestart(
          s,
          rs,
          r,
          ctx,
          candidate && !transition ? prepareOnClock(rest, prepared) : undefined,
        );
        const { knots } = prepared;
        if (candidate) {
          // A set piece is taken when the preparation ends; any wait past its nominal dead time is a delay.
          if (setPieceAt !== undefined) setPieceAt = s.elapsed;
          credits[s.period - 1]! += rs.dead - nominal;
        }
        const kickAt = s.elapsed;
        actor = [rs.side, res.taker];
        tally.material?.touch(rs.side, res.taker, rs.spot);
        const kind = res.kind === 'penalty' ? 'shot' : res.kind;
        if (res.kind === 'cross') {
          const spot = attackFrame(rs.side, rs.spot);
          tally.passEvent(rs.side, res.taker, {
            from: spot,
            to: crossArrival(s, rs.side, res.outcome, spot),
            ok: res.outcome.kind === 'shot' || res.outcome.kind === 'complete',
            kind: 'cross',
          });
        } else if (res.kind !== 'shot' && res.kind !== 'penalty')
          tally.restartPass(rs.side, res.taker, rs.spot, res);
        if (res.outcome.kind === 'shot' && res.outcome.shooter === undefined)
          res.outcome.shooter = res.taker;
        apply(rs.side, res.taker, res.outcome);
        // Everyone reacts to the kick as it is played, before anyone moves (→MATCH-17).
        if (candidate) updateIntentions(s);
        const motion = candidate
          ? motionOf(
              actor,
              rs.spot,
              res.outcome,
              kickSpeed(kind === 'shot' ? 'shot' : 'restart'),
              secondsOf(kind),
              kickAt,
            )
          : undefined;
        tracer.act(s, rs.side, res.taker, {
          outcome: res.outcome,
          kind: res.kind,
          target: res.target,
          restart: rs,
          ...(motion ? { knots: [...knots, ...motion.knots] } : {}),
        });
        penalty = false;
        tally.restart(
          rs.side,
          rs.kind,
          res.kind === 'penalty' && res.outcome.kind === 'shot' && res.outcome.result === 'goal',
        );
        label = rs.kind;
        outcomeLabel = res.outcome.kind;
        if (motion) {
          // The preparation is already on the clock (`prepareRestart`); only the kick's own time follows.
          advance(s, motion.dt, motion.plan);
          dt = rs.dead + motion.dt;
          tally.diagnostics.ballInPlay += motion.dt;
          s.t += motion.dt;
          s.elapsed += motion.dt;
        } else {
          dt = rs.dead + secondsOf(kind);
          tally.diagnostics.ballInPlay += secondsOf(kind);
          s.t += dt;
          s.elapsed += dt;
          moveAll(s, 8);
        }
      } else {
        const owner = s.owner!;
        prevBeat = justBeat;
        justBeat = undefined;
        from = [...s.players[owner[0]][owner[1]]!.pos] as [number, number];
        const tags = computeTags(s, owner[0], owner[1]);
        tally.material?.touch(owner[0], owner[1], from, tags.phase);
        let d: Decision;
        if (holdBias) {
          holdBias = false;
          const pass = choosePass(s, owner[0], owner[1], tags, r, {
            backBias: DECISION_CONFIG.pass.backBias,
          });
          d = pass
            ? {
                action: 'pass',
                target: pass.target,
                kind: pass.kind,
                lineBreaking: pass.lineBreaking,
              }
            : decide(s, owner[0], owner[1], tags, r);
        } else d = decide(s, owner[0], owner[1], tags, r);
        tracer.hold();
        // Where everyone heads before the action: off the ball they keep on until they read the kick.
        const before = candidate ? heading(s) : undefined;
        const played = play(owner[0], owner[1], d);
        // Tracing draws nothing, so the duration's draw may come before it.
        const least = candidate ? secondsOf(played.key) * (0.85 + 0.3 * r()) : 0;
        // Everyone reacts to the action as it is played — a pass, a carry, a turnover — before anyone moves.
        if (candidate) updateIntentions(s);
        const motion = candidate
          ? motionOf(owner, from, played.outcome, kickSpeed(played.key), least, s.elapsed, before)
          : undefined;
        tracer.act(s, owner[0], owner[1], {
          outcome: played.outcome,
          kind: d.kind,
          target: d.target,
          lineBreaking: d.lineBreaking,
          tags,
          ...(motion ? { knots: motion.knots } : {}),
        });
        actor = owner;
        label = d.action;
        outcomeLabel = played.outcome === 'offside' ? 'offside' : played.outcome.kind;
        if (motion) {
          dt = motion.dt;
          advance(s, dt, motion.plan);
        } else dt = secondsOf(played.key) * (0.85 + 0.3 * r());
        s.t += dt;
        s.elapsed += dt;
        tally.possession(possessing, dt);
        tally.diagnostics.ballInPlay += dt;
        if (!motion) moveAll(s, dt);
      }
      tally.spellTo(s.possession);
      if (!candidate) startRuns(s, s.possession, r);
      tracer.push(s, actor[0], actor[1], label, outcomeLabel, from);
      const hurt = drawInjury(s, dt, r);
      if (hurt) injure(hurt.side, hurt.idx);
      const [lo, hi] = ADDED_CONFIG.bounds[period - 1]!;
      const length = PERIOD_SECONDS[period - 1]!;
      // The candidate referee adds the lost seconds themselves and stops after the action that
      // reaches them; the added minutes recorded are those that action reached, so the period's
      // last frame draws all of it (→MATCH-1/12). The pre-feature path plays whole announced minutes.
      // Both are read on the match clock from the period's start, so its minutes are whole.
      const lost = Math.min(hi * 60, Math.max(lo * 60, credits[period - 1]!));
      let extra = candidate
        ? Math.max(lo, Math.ceil((s.elapsed - begun - length) / 60))
        : Math.min(hi, Math.max(lo, Math.ceil(credits[period - 1]! / 60)));
      if (candidate) while (begun + length + extra * 60 < s.elapsed) extra++;
      // Cards of a play take the minute it ends, as their trace entries follow it; subs keep the stoppage.
      for (const i of tally.incidents.slice(held))
        if (i.kind !== 'sub') Object.assign(i, stampAt(period, s.t, extra));
      if ((candidate ? s.elapsed - begun : s.t) >= length + (candidate ? lost : extra * 60)) {
        added.push(extra);
        // Dissent is drawn once per side at the end of each period.
        for (const side of [0, 1] as const) {
          const d = dissentAt(s, side, r);
          if (d) applyCard(side, d.player, d.card, 'dissent');
        }
        tracer.note(s, 0, -1, 'whistle');
        tally.spellTo(undefined);
        // The rest of the final minute after the whistle is the interval between periods, so the
        // next one starts on a minute boundary and every minute is drawn whole (→MATCH-12).
        if (candidate) s.elapsed = Math.max(s.elapsed, begun + length + extra * 60);
        break;
      }
    }
    if (period === 2 && setup.decide && isLevel(setup.decide, tally.goals(0), tally.goals(1))) {
      regulation = { home: tally.goals(0), away: tally.goals(1) };
      periods.push(3, 4);
    }
  }
  const shootout =
    regulation && isLevel(setup.decide!, tally.goals(0), tally.goals(1))
      ? playShootout(s, r).score
      : undefined;
  const finished = tally.finish(s);
  if (shootout) {
    const side = shootout.home > shootout.away ? 0 : 1;
    finished.highlights.push({
      minute: 120,
      side,
      player: '승부차기',
      action: `승부차기 ${side === 0 ? '홈' : '원정'} 승리`,
    });
  }
  const record: MatchRecord = {
    ...setup.f,
    score: { home: tally.goals(0), away: tally.goals(1) },
    ...finished,
    tactics: setup.tactics,
    added,
    ...(setup.model ? { model: setup.model } : {}),
    ...(regulation && { regulation }),
    ...(shootout && { shootout }),
  };
  return {
    record,
    ...(setup.observe ? { trace: tracer.entries } : {}),
    elapsed: s.elapsed,
    diagnostics: { ...tally.diagnostics, freshness: [sideFreshness(s, 0), sideFreshness(s, 1)] },
  };
}
