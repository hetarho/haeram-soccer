/** Only scripted incidents change the XI. Dense bodies survive off-pitch for continuous exits. */
import type { ScriptIncident } from '../../../contracts/src/match-script';
import { FORMATIONS } from '../formations';
import { invalidDetail } from '../script/failure';
import { giveBall } from './ball';
import { STAGING_CONFIG } from './config';
import { nominalSpot } from './places';
import type { BeatContext } from './perform';
import type { TeamId, Vec } from './types';
import { onPitch, presentPlayers } from './types';
import { dist } from './vec';
import { PITCH } from './pitch';
import { pushEvent, refreshFrame, runUntil, type StageState } from './world';

const SCENE = STAGING_CONFIG.stage.scene;

export const participant = (state: StageState, side: TeamId, line: number): number => {
  const p = state.fixture.teams[side].players.find((p) => p.line === line);
  if (!p) throw invalidDetail('staging:input');
  return p.index;
};

/** The active keeper, including an outfielder the script names after a dismissal. */
export const keeperOf = (state: StageState, side: TeamId): number => {
  const keeper = presentPlayers(state.fixture, side).find((p) => p.slot === 0);
  if (!keeper) throw invalidDetail('staging:input');
  return keeper.index;
};

export function stopPlay(state: StageState): void {
  state.live = false;
  state.orders.clear();
  state.cues.clear();
  state.marks.clear();
  state.pressing = undefined;
  state.ball.mode = 'dead';
  state.ball.owner = -1;
  state.ball.z = 0;
  delete state.ball.flight;
  delete state.retrieve;
  delete state.keepOut;
}

export function* holdScene(state: StageState, seconds: number): Generator<void, void> {
  const until = state.t + seconds;
  yield* runUntil(state, () => state.t >= until - 1e-9, seconds);
}

/** Bounded walking, followed by standing; a timeout never licenses a position assignment. */
export function* walkTo(state: StageState, index: number, target: Vec): Generator<void, void> {
  state.orders.set(index, { target, pace: 'walk' });
  yield* runUntil(
    state,
    () => dist(state.bodies[index].pos, target) <= SCENE.ready,
    SCENE.maxTravel,
  );
  if (dist(state.bodies[index].pos, target) > SCENE.ready) throw invalidDetail('staging:input');
}

function* leave(state: StageState, index: number): Generator<void, void> {
  if (!onPitch(state.fixture, index)) return;
  yield* walkTo(state, index, SCENE.gate);
  state.fixture.present![index] = false;
  state.orders.delete(index);
  state.bodies[index].vel = [0, 0];
  pushEvent(state, {
    kind: 'exit',
    team: state.fixture.players[index].team,
    actor: index,
    at: SCENE.gate,
  });
  refreshFrame(state);
}

/** Read a successor from an actual scripted keeper credit, never select an arbitrary man. */
function keeperChange(state: StageState, side: TeamId, ctx: BeatContext): void {
  if (presentPlayers(state.fixture, side).some((p) => p.slot === 0)) return;
  const future = state.beats
    .filter((b) => b.index >= ctx.beat.index)
    .find(
      (b) =>
        (b.team !== side && b.original?.keeper !== undefined) ||
        (b.team === side && b.kind === 'goalKick'),
    );
  const named =
    future?.kind === 'goalKick'
      ? future.actor
      : future?.original?.keeper === undefined
        ? undefined
        : participant(state, side, future.original.keeper);
  const handover = ctx.beat.team === side ? ctx.beat.receiver : undefined;
  const index = named ?? handover;
  // If the script has no further keeper action, it names no new keeper to stage.
  if (index === undefined || !onPitch(state.fixture, index)) return;
  const p = state.fixture.players[index];
  p.slot = 0;
  p.position = 'GK';
  p.role = FORMATIONS[state.fixture.teams[side].style].slots[0].role;
  refreshFrame(state);
}

/** The touchline point nearest a player: a substituted man leaves the pitch there (Law 3). */
const touchlineExit = (at: Vec): Vec => [
  Math.min(PITCH.length - 1, Math.max(1, at[0])),
  at[1] < PITCH.width / 2 ? 0 : PITCH.width,
];

/**
 * A stoppage's substitutions all at once: the men going off walk to their nearest touchline
 * together, then every entrant comes on at the halfway gate and jogs to his place while the
 * stoppage runs its course; play resumes without waiting for him to arrive.
 */
function* substitute(
  state: StageState,
  ctx: BeatContext,
  subs: readonly ScriptIncident[],
): Generator<void, void> {
  const going = subs.map((x) => participant(state, x.side, x.line));
  const exits = going.map((index) => touchlineExit(state.bodies[index].pos));
  const off = (k: number): boolean =>
    !onPitch(state.fixture, going[k]) || dist(state.bodies[going[k]].pos, exits[k]) <= SCENE.ready;
  going.forEach((index, k) => {
    if (onPitch(state.fixture, index)) state.orders.set(index, { target: exits[k], pace: 'walk' });
  });
  yield* runUntil(state, () => going.every((_, k) => off(k)), SCENE.maxTravel);
  if (!going.every((_, k) => off(k))) throw invalidDetail('staging:input');
  const coming: number[] = [];
  for (const [k, x] of subs.entries()) {
    if (x.other === undefined) throw invalidDetail('staging:input');
    const actor = going[k];
    const other = participant(state, x.side, x.other);
    if (onPitch(state.fixture, actor)) {
      state.fixture.present![actor] = false;
      state.orders.delete(actor);
      state.bodies[actor].vel = [0, 0];
      pushEvent(state, { kind: 'exit', team: x.side, actor, at: exits[k] });
    }
    state.fixture.present![other] = true;
    state.enteredAt![other] = state.clock ?? state.t;
    // Refill delay history on the next tick; the entrant follows his own scripted slot.
    pushEvent(state, { kind: 'sub', team: x.side, actor, other, at: SCENE.gate });
    keeperChange(state, x.side, ctx);
    coming.push(other);
  }
  state.seen = [];
  refreshFrame(state);
  for (const other of coming)
    state.orders.set(other, {
      target: nominalSpot(
        { fixture: state.fixture, ball: state.ball.pos, team: state.team, phase: state.phase },
        other,
      ),
      pace: 'jog',
    });
}

export function* runIncidents(state: StageState, ctx: BeatContext): Generator<void, void> {
  const incidents = ctx.beat.original?.incidents ?? [];
  if (!incidents.length) return;
  const heldBy = state.ball.owner;
  stopPlay(state);
  state.beat = ctx.beat.index;
  const subs = incidents.filter((x) => x.kind === 'sub');
  for (const incident of incidents) {
    const actor = participant(state, incident.side, incident.line);
    const start = state.t;
    const at = [...state.bodies[actor].pos] as Vec;
    const kind: ScriptIncident['kind'] = incident.kind;
    if (kind === 'sub') {
      if (incident !== subs[0]) continue;
      yield* substitute(state, ctx, subs);
    } else if (kind === 'injury') {
      state.bodies[actor].vel = [0, 0];
      state.orders.set(actor, { target: at, pace: 'walk', speedCap: 0 });
      pushEvent(state, { kind: 'injury', team: incident.side, actor, at });
      yield* holdScene(state, SCENE.injuryDown);
      yield* leave(state, actor);
    } else {
      pushEvent(state, {
        kind: 'card',
        team: incident.side,
        actor,
        at,
        card: kind,
        ...(incident.reason ? { reason: incident.reason } : {}),
      });
      yield* holdScene(state, SCENE.card);
      if (kind !== 'yellow') yield* leave(state, actor);
    }
    const duration =
      kind === 'sub' ? SCENE.substitution : kind === 'injury' ? SCENE.injury : SCENE.card;
    yield* holdScene(state, Math.max(0, duration - (state.t - start)));
    keeperChange(state, incident.side, ctx);
  }
  state.orders.clear();
  const receiver = ctx.beat.receiver;
  if (
    ctx.beat.kind === 'stoppage' &&
    receiver !== undefined &&
    heldBy >= 0 &&
    !onPitch(state.fixture, heldBy)
  ) {
    // The writer explicitly hands a departing keeper's dead ball to this successor.
    yield* walkTo(state, receiver, state.ball.pos);
    giveBall(state, receiver);
  }
}
