// The script generator's state: who has the ball, where it nominally is, the phase, the clock and
// the restart still to play. Moves read it through these helpers and change it only through
// emit.ts and restarts.ts. Places are nominal (core/shape.ts without positions): the generator
// never simulates where players are.
import { PROTO_CONFIG } from '../core/config.ts';
import { CENTRE, toAttack } from '../core/pitch.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { nominalSpot } from '../core/shape.ts';
import type { Beat, Fixture, Phase, PlayerSpec, TeamId, Vec } from '../core/types.ts';

export interface Restart {
  kind: 'kickOff' | 'throwIn' | 'goalKick' | 'corner' | 'freeKick';
  team: TeamId;
  spot: Vec;
}

export interface ScriptFlags {
  counterBeats: number;
  counterBoost: boolean;
  beatMan: boolean;
  boostLong: boolean;
  boostSwitch: boolean;
}

export interface ScriptState {
  fixture: Fixture;
  rng: Rng;
  beats: Beat[];
  times: number[];
  /** Nominal seconds. */
  clock: number;
  possession: number;
  /** Team with the ball and the player who has it (the next beat's actor). */
  team: TeamId;
  holder: number;
  /** Ball position, world frame. */
  ball: Vec;
  phase: Phase;
  score: [number, number];
  /** A restart to play before open play goes on. */
  pending?: Restart;
  flags: ScriptFlags;
}

const GRAMMAR = PROTO_CONFIG.grammar;

/** The slot that takes a kick-off. */
export const KICK_OFF_SLOT = 9;

export const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

export const freshFlags = (): ScriptFlags => ({
  counterBeats: 0,
  counterBoost: false,
  beatMan: false,
  boostLong: false,
  boostSwitch: false,
});

/** The open-play phase of a ball for the team in possession, by its attack x. */
export function phaseAt(team: TeamId, ball: Vec): Phase {
  const x = toAttack(team, ball)[0];
  if (x < GRAMMAR.phaseX.progression) return 'buildUp';
  if (x < GRAMMAR.phaseX.finalThird) return 'progression';
  return 'finalThird';
}

/** A kick-off pending for team 0 at the centre spot, held by its slot 9. */
export function initialState(seed: string, fixture: Fixture): ScriptState {
  return {
    fixture,
    rng: createRng(seed),
    beats: [],
    times: [],
    clock: 0,
    possession: 0,
    team: 0,
    holder: fixture.teams[0].players[KICK_OFF_SLOT].index,
    ball: CENTRE,
    phase: phaseAt(0, CENTRE),
    score: [0, 0],
    pending: { kind: 'kickOff', team: 0, spot: CENTRE },
    flags: freshFlags(),
  };
}

export function player(state: ScriptState, index: number): PlayerSpec {
  return state.fixture.players[index];
}

/** World-frame nominal spot of `index` for the state's ball, team and phase. */
export function spot(state: ScriptState, index: number): Vec {
  return nominalSpot(
    { fixture: state.fixture, ball: state.ball, team: state.team, phase: state.phase },
    index,
  );
}

/** The same in the attack frame of the team in possession. */
export function attackSpot(state: ScriptState, index: number): Vec {
  return toAttack(state.team, spot(state, index));
}

/** The ball in the attack frame of the team in possession. */
export function attackBall(state: ScriptState): Vec {
  return toAttack(state.team, state.ball);
}
