/** `playGrid`: a whole match, touch by touch (→MATCH-1, MATCH-3, MATCH-7, MATCH-11). */
import type { MatchRecord } from '../../../contracts/src/types';
import { choosePass, decide, type Decision } from './decide';
import { computeTags } from './tags';
import {
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
} from './resolve';
import {
  classifyOut,
  foulRestart,
  isOffside,
  playRestart,
  RESTART_CONFIG,
  type Restart,
} from './restarts';
import { Tally } from './record';
import type { GridSetup } from './setup';
import { moveAll, startRuns } from './shape';
import { attackFrame, type Point } from './pitch';
import { createState, kickOff, type GridState } from './state';
import { Tracer, type TraceEntry } from './trace';

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
}

type Ref = [0 | 1, number];
const other = (side: 0 | 1) => (1 - side) as 0 | 1;
const PERIOD_SECONDS = 45 * 60;
const af = (side: 0 | 1, p: readonly [number, number]): Point => attackFrame(side, p);

export function playGrid(setup: GridSetup): GridResult {
  const s: GridState = createState(setup);
  const r = setup.r;
  const ctx = shotContext(s);
  const tally = new Tally(setup);
  const tracer = new Tracer(setup.observe);
  const added: number[] = [];
  const credits = [0, 0];
  let pending: Restart | undefined;
  let lastPasser: Ref | undefined;
  let justBeat: Ref | undefined;
  /** The take-on that came immediately before the current action (an assist needs a pass, not a dribble). */
  let prevBeat: Ref | undefined;
  let holdBias = false;

  const minute = () => Math.min(45, Math.floor(s.t / 60) + 1) + (s.period === 2 ? 45 : 0);

  /** Hands the ball to `(side, idx)` at `at` (or where he stands); a change of side is a regain and a loss. */
  function setOwner(side: 0 | 1, idx: number, at?: [number, number]) {
    const gp = s.players[side][idx]!;
    if (at) gp.pos = [at[0], at[1]];
    if (s.possession !== side || !s.owner) {
      if (s.owner) tally.regain(side, idx, af(side, gp.pos));
      s.lastRegain = { side, at: s.elapsed };
      s.lastLoss = { side: other(side), at: s.elapsed };
      s.possessionSince = s.elapsed;
      lastPasser = undefined;
      holdBias = false;
    }
    s.owner = [side, idx];
    s.possession = side;
    s.ball = [gp.pos[0], gp.pos[1]];
  }

  function endOfPlay(side: 0 | 1, o: Extract<Outcome, { kind: 'shot' }>): [number, number] {
    const keeperEnd = side === 0 ? 105 : 0;
    const shooter = s.players[side][o.shooter ?? 0]!;
    return [keeperEnd, shooter.pos[1]];
  }

  function applyShot(side: 0 | 1, o: Extract<Outcome, { kind: 'shot' }>) {
    const shooter = o.shooter ?? 0;
    tally.shot(side, shooter, o.recordedXg, o.result);
    const passer =
      lastPasser &&
      lastPasser[0] === side &&
      lastPasser[1] !== shooter &&
      !(prevBeat && prevBeat[0] === side && prevBeat[1] === shooter)
        ? lastPasser[1]
        : undefined;
    tally.shotDetail(side, shooter, {
      from: af(side, s.players[side][shooter]!.pos),
      xg: o.xg,
      recordedXg: o.recordedXg,
      goal: o.result === 'goal',
      passer,
    });
    const foe = other(side);
    if (o.result === 'goal') {
      s.score[side]++;
      const assist =
        lastPasser &&
        lastPasser[0] === side &&
        lastPasser[1] !== shooter &&
        !(prevBeat && prevBeat[0] === side && prevBeat[1] === shooter)
          ? lastPasser[1]
          : undefined;
      tally.goal(side, shooter, minute(), assist);
      credits[s.period - 1]! += ADDED_CONFIG.credits.goal;
      pending = { kind: 'kickoff', side: foe, spot: [52.5, 34], dead: RESTART_CONFIG.dead.goal };
      return;
    }
    if (o.result === 'save') tally.save(foe, o.by ?? 0);
    const at = endOfPlay(side, o);
    if (o.then === 'hold') setOwner(foe, o.by ?? 0, s.players[foe][o.by ?? 0]!.pos);
    else if (o.then === 'corner')
      pending = classifyOut({ at, lastTouch: foe, over: 'byline', blockedOrSaved: true });
    else if (o.then === 'goalKick') pending = classifyOut({ at, lastTouch: side, over: 'byline' });
    else {
      const loose: [number, number] = [side === 0 ? 100 : 5, s.players[side][shooter]!.pos[1]];
      const winner = looseWinner(s, loose, r);
      setOwner(winner[0], winner[1], loose);
    }
  }

  /** Applies any outcome of the player `(side, idx)` on the ball. */
  function apply(side: 0 | 1, idx: number, o: Outcome) {
    const foe = other(side);
    switch (o.kind) {
      case 'complete':
        if (o.receiver !== idx) {
          lastPasser = [side, idx];
          const from = s.players[side][idx]!.pos;
          const dx = (o.to[0] - from[0]) * (side === 0 ? 1 : -1);
          const dy = (o.to[1] - from[1]) * (side === 0 ? 1 : -1);
          setOwner(side, o.receiver, o.to);
          s.lastPass = { dx, dy };
        } else {
          s.players[side][idx]!.pos = [o.to[0], o.to[1]];
          s.ball = [o.to[0], o.to[1]];
        }
        return;
      case 'intercepted':
        tally.interception(foe, o.by, af(foe, o.at));
        setOwner(foe, o.by, o.at);
        return;
      case 'tackled':
        tally.tackle(foe, o.by, af(foe, s.ball));
        setOwner(foe, o.by, [s.ball[0], s.ball[1]]);
        return;
      case 'loose':
        setOwner(o.winner[0], o.winner[1], o.at);
        return;
      case 'out':
        pending = classifyOut(o);
        return;
      case 'foul':
        tally.foul(foe, o.by, idx);
        pending = foulRestart(s, side, o.at);
        return;
      case 'held':
        if (o.by !== undefined) setOwner(foe, o.by, s.players[foe][o.by]!.pos);
        else holdBias = true;
        return;
      case 'shot':
        applyShot(side, o);
    }
  }

  const secondsOf = (kind: string | undefined) =>
    ACTION_SECONDS[(kind as keyof typeof ACTION_SECONDS) ?? 'short'] ?? ACTION_SECONDS.short;

  /** One decision by the player on the ball; returns the seconds it took. */
  function play(
    side: 0 | 1,
    idx: number,
    d: Decision,
  ): { key: string; outcome: Outcome | 'offside' } {
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
          tally.passEvent(side, idx, {
            from: af(side, s.players[side][idx]!.pos),
            to: af(side, spot),
            ok: false,
            kind: d.kind === 'through' ? 'through' : 'short',
          });
          tally.offside(side, d.target);
          return { key: d.kind ?? 'short', outcome: 'offside' };
        }
        const from = af(side, s.players[side][idx]!.pos);
        const to = af(side, s.players[side][d.target]!.pos);
        const o = resolvePass(
          s,
          side,
          idx,
          d.target,
          tags,
          d.kind ?? 'short',
          d.lineBreaking ?? false,
          r,
        );
        tally.passEvent(side, idx, {
          from,
          to,
          ok: o.kind === 'complete',
          kind: d.kind ?? 'short',
          lineBreaking: d.lineBreaking,
        });
        apply(side, idx, o);
        return { key: d.kind ?? 'short', outcome: o };
      }
      case 'cross': {
        const from = af(side, s.players[side][idx]!.pos);
        const o = resolveCross(s, side, idx, tags, ctx, r);
        tally.passEvent(side, idx, { from, to: from, ok: o.kind === 'shot', kind: 'cross' });
        if (o.kind === 'shot') lastPasser = [side, idx];
        apply(side, idx, o);
        return { key: 'cross', outcome: o };
      }
      case 'cutBack': {
        if (d.target === undefined) break;
        const from = af(side, s.players[side][idx]!.pos);
        const to = af(side, s.players[side][d.target]!.pos);
        const o = resolveCutBack(s, side, idx, d.target, r);
        tally.passEvent(side, idx, { from, to, ok: o.kind === 'complete', kind: 'cutBack' });
        apply(side, idx, o);
        if (o.kind === 'complete') {
          const shot = resolveShot(s, side, d.target, computeTags(s, side, d.target), ctx, r, {
            cutBack: true,
          });
          applyShot(side, shot as Extract<Outcome, { kind: 'shot' }>);
          return { key: 'cutBack', outcome: shot };
        }
        return { key: 'cutBack', outcome: o };
      }
      case 'takeOn': {
        const from = af(side, s.players[side][idx]!.pos);
        const o = resolveTakeOn(s, side, idx, tags, r);
        tally.takeOnAttempt(side, idx);
        if (o.kind === 'complete') {
          tally.dribble(side, idx);
          tally.carryEvent(side, idx, from, af(side, o.to));
          justBeat = [side, idx];
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
    const from = af(side, s.players[side][idx]!.pos);
    const o = resolveCarry(s, side, idx, tags, [to[0], to[1]], r);
    if (o.kind === 'complete') tally.carryEvent(side, idx, from, af(side, o.to));
    apply(side, idx, o);
    return { key: 'carry', outcome: o };
  }

  for (const period of [1, 2] as const) {
    s.period = period;
    s.t = 0;
    const start: 0 | 1 = period === 1 ? 0 : 1;
    pending = { kind: 'kickoff', side: start, spot: [52.5, 34], dead: 0 };
    for (let guard = 0; guard < 20000; guard++) {
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
        if (rs.kind === 'kickoff') kickOff(s, rs.side);
        const res = playRestart(s, rs, r, ctx);
        actor = [rs.side, res.taker];
        const kind = res.kind === 'penalty' ? 'shot' : res.kind;
        if (res.outcome.kind === 'complete' && res.outcome.receiver !== res.taker)
          tally.pass(rs.side, res.taker, true);
        else if (res.kind !== 'shot' && res.kind !== 'penalty' && res.kind !== 'cross')
          tally.pass(rs.side, res.taker, false);
        if (res.kind === 'cross') {
          const spot = af(rs.side, rs.spot);
          tally.passEvent(rs.side, res.taker, {
            from: spot,
            to: spot,
            ok: res.outcome.kind === 'shot',
            kind: 'cross',
          });
        }
        if (res.outcome.kind === 'shot' && res.outcome.shooter === undefined)
          res.outcome.shooter = res.taker;
        apply(rs.side, res.taker, res.outcome);
        tally.restart(
          rs.side,
          rs.kind,
          res.kind === 'penalty' && res.outcome.kind === 'shot' && res.outcome.result === 'goal',
        );
        dt = rs.dead + secondsOf(kind);
        label = rs.kind;
        outcomeLabel = res.outcome.kind;
        s.t += dt;
        s.elapsed += dt;
        moveAll(s, 8);
      } else {
        const owner = s.owner!;
        prevBeat = justBeat;
        justBeat = undefined;
        from = [...s.players[owner[0]][owner[1]]!.pos] as [number, number];
        const tags = computeTags(s, owner[0], owner[1]);
        let d: Decision;
        if (holdBias) {
          holdBias = false;
          const pass = choosePass(s, owner[0], owner[1], tags, r, { backBias: 3 });
          d = pass
            ? {
                action: 'pass',
                target: pass.target,
                kind: pass.kind,
                lineBreaking: pass.lineBreaking,
              }
            : decide(s, owner[0], owner[1], tags, r);
        } else d = decide(s, owner[0], owner[1], tags, r);
        const played = play(owner[0], owner[1], d);
        actor = owner;
        label = d.action;
        outcomeLabel = played.outcome === 'offside' ? 'offside' : played.outcome.kind;
        dt = secondsOf(played.key) * (0.85 + 0.3 * r());
        s.t += dt;
        s.elapsed += dt;
        tally.possession(possessing, dt);
        moveAll(s, dt);
      }
      startRuns(s, s.possession, r);
      tracer.push(s, actor[0], actor[1], label, outcomeLabel, from);
      const [lo, hi] = ADDED_CONFIG.bounds[period - 1]!;
      const extra = Math.min(hi, Math.max(lo, Math.ceil(credits[period - 1]! / 60)));
      if (s.t >= PERIOD_SECONDS + extra * 60) {
        added.push(extra);
        break;
      }
    }
  }
  const record: MatchRecord = {
    ...setup.f,
    score: { home: tally.goals(0), away: tally.goals(1) },
    ...tally.finish(s),
    tactics: setup.tactics,
    added,
  };
  return { record, ...(setup.observe ? { trace: tracer.entries } : {}), elapsed: s.elapsed };
}
