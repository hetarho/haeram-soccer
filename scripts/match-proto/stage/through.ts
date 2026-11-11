// Through balls. The runner waits a couple of metres short of the offside line while the passer
// holds, sets off as the hold runs out and is kicked to while he is onside, so ball and runner meet
// behind the line; a runner the script catches offside goes early, is beyond the line when the ball
// is played, and the flag stops play a moment later. Intercepted and out through balls are timed
// the same way and end as an ordinary interception or ball out.
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch, toAttack } from '../core/pitch.ts';
import { offsideLineX } from '../core/shape.ts';
import type { TeamId, Vec } from '../core/types.ts';
import { clamp, dist } from '../core/vec.ts';
import { apexFor, flightTime, startFlight, startFlightTimed } from './ball.ts';
import { cueNext, resolveCut } from './contest.ts';
import { paceSpeed, timeToReach } from './motion.ts';
import { holdTouch } from './pass.ts';
import type { BeatContext } from './perform.ts';
import {
  ensureOwner,
  positionsOf,
  pushEvent,
  runUntil,
  setPossession,
  type Order,
  type StageState,
} from './world.ts';

const STAGE = PROTO_CONFIG.stage;
const THROUGH = STAGE.through;
const BALL = PROTO_CONFIG.ball;
const TICK = PROTO_CONFIG.tick;

/** `pass:*` with `through` set, and `pass:offside`. */
export function performThrough(state: StageState, ctx: BeatContext): void {
  const beat = ctx.beat;
  const T = beat.team;
  const actor = beat.actor;
  const runner = beat.receiver;
  if (runner === undefined) throw new Error('through ball without runner ' + beat.index);
  setPossession(state, beat);
  ensureOwner(state, actor);
  const fixture = state.fixture;
  const line = (): number => offsideLineX(fixture, positionsOf(state), T);
  const runnerPos = (): Vec => state.bodies[runner].pos;
  const rx = (): number => toAttack(T, runnerPos())[0];
  const [ax, ay] = toAttack(T, beat.to);
  const offside = beat.outcome === 'offside';
  const lead = THROUGH.runLead + (offside ? THROUGH.earlyBy : 0);
  const start = state.t;
  const left = (): number => beat.hold - (state.t - start);

  state.orders.set(actor, holdTouch(state, actor, beat.to));
  const runOrder: Order = {
    target: (): Vec => {
      const me = toAttack(T, runnerPos());
      if (left() > lead) return toAttack(T, [line() - THROUGH.setBack, me[1]]);
      if (!offside) {
        return toAttack(T, [Math.min(ax, line() - THROUGH.onsideGap), me[1] + (ay - me[1]) * 0.5]);
      }
      return beat.to;
    },
    get pace() {
      return left() > lead ? 'run' : 'sprint';
    },
  };
  state.orders.set(runner, runOrder);
  const kickReady = (): boolean => {
    if (left() > 1e-9) return false;
    const l = line();
    const x = rx();
    return offside ? x >= l + THROUGH.offsideGap : x >= l - THROUGH.window && x < l - 0.05;
  };
  if (offside) {
    // The trap: once the runner goes early, the back line holds where it stands instead of
    // dropping with the ball, so a runner starting far behind it is still beyond it at the kick.
    runUntil(state, () => left() <= lead, beat.hold);
    holdLine(state, T, line(), runner);
  }
  runUntil(state, kickReady, beat.hold + THROUGH.maxWait - (state.t - start));

  const ballPos: Vec = [state.ball.pos[0], state.ball.pos[1]];
  pushEvent(state, { kind: 'kick', actor, other: runner, at: ballPos });
  if (offside) {
    pushEvent(state, {
      kind: 'offside',
      actor,
      other: runner,
      at: [runnerPos()[0], runnerPos()[1]],
      line: toAttack(T, [line(), 0])[0],
    });
  }
  const sprint = paceSpeed('sprint', fixture.players[runner]);
  const Rw = beat.outcome === 'out' ? beat.to : clampToPitch(beat.to, 0.5);
  const eta = timeToReach(state.bodies[runner], Rw, sprint);
  const speed = clamp(
    dist(ballPos, Rw) / Math.max(0.4, eta - STAGE.receiveSlack),
    BALL.minSpeed,
    BALL.through,
  );
  state.orders.delete(actor);
  // He chases a ball running out only as far as the line: braking from a sprint past a target
  // beyond it carried runners 4 m off the pitch.
  state.orders.set(runner, { target: clampToPitch(Rw, 0.5), pace: 'sprint' });
  const untilLanded = (flight: { t1: number }): void =>
    runUntil(state, () => state.t >= flight.t1 - 1e-9, flight.t1 - state.t + TICK);

  if (beat.outcome === 'intercepted') {
    const scripted = beat.opponent;
    if (scripted === undefined) throw new Error('interception without opponent ' + beat.index);
    const r = resolveCut(state, scripted, ballPos, Rw, flightTime(ballPos, Rw, speed));
    const apex = apexFor(dist(ballPos, Rw), beat.loft) * r.plan.param;
    const flight = startFlightTimed(state, r.plan.point, r.plan.time, apex);
    const opponent = r.plan.opponent;
    state.orders.set(opponent, {
      target: r.plan.point,
      pace: 'sprint',
      boost: r.stretch ? STAGE.lunge : 0,
    });
    untilLanded(flight);
    ensureOwner(state, opponent);
    pushEvent(state, {
      kind: 'intercept',
      actor,
      other: opponent,
      at: [state.ball.pos[0], state.ball.pos[1]],
      recast: r.recast,
      stretch: r.stretch,
    });
  } else if (beat.outcome === 'out') {
    const flight = startFlight(state, Rw, speed, beat.loft);
    untilLanded(flight);
    deadBall(state);
    pushEvent(state, { kind: 'out', actor, at: clampToPitch(Rw, 0) });
  } else if (offside) {
    const flight = startFlight(state, Rw, speed, beat.loft);
    const flagged = state.t;
    runUntil(
      state,
      () => state.t >= flight.t1 - 1e-9 || state.t - flagged >= THROUGH.flagDelay - 1e-9,
      THROUGH.flagDelay + TICK,
    );
    deadBall(state);
    pushEvent(state, { kind: 'whistle', actor, at: [state.ball.pos[0], state.ball.pos[1]] });
  } else {
    const flight = startFlight(state, Rw, speed, beat.loft);
    cueNext(state, ctx, Rw);
    untilLanded(flight);
    ensureOwner(state, runner);
    pushEvent(state, {
      kind: 'receive',
      actor,
      other: runner,
      at: [state.ball.pos[0], state.ball.pos[1]],
    });
  }
  state.orders.clear();
}

/**
 * The free outfield defenders against `attacking` hold the offside line `lineX` (attack frame of
 * `attacking`): one behind it steps up to it, one ahead of it (still in the attackers' half, the
 * line on halfway) stays where he is, so the line cannot drop away from the runner.
 */
function holdLine(state: StageState, attacking: TeamId, lineX: number, runner: number): void {
  const D: TeamId = attacking === 0 ? 1 : 0;
  for (const p of state.fixture.teams[D].players) {
    if (p.slot === 0 || state.orders.has(p.index) || p.index === runner) continue;
    const at = toAttack(attacking, state.bodies[p.index].pos);
    const target = toAttack(attacking, [Math.min(at[0], lineX), at[1]]);
    state.orders.set(p.index, { target, pace: 'run' });
  }
}

/** The ball lies dead where it is and play stops. */
function deadBall(state: StageState): void {
  const ball = state.ball;
  ball.mode = 'dead';
  ball.owner = -1;
  ball.z = 0;
  delete ball.flight;
  state.live = false;
}
