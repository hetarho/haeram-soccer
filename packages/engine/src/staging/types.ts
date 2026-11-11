import type { ScriptBeat, StagingPlayer, StagingSide } from '../../../contracts/src/match-script';
import type { PlayerMotionState, Position, RoleId, Tactic } from '../../../contracts/src/types';
export type { Position, RoleId };
export type Vec = readonly [number, number];
export type TeamId = 0 | 1;
export type Line = 'GK' | 'DF' | 'MF' | 'FW';
/** Dense body indexes are private; `line` retains the record identity at the boundary. */
export interface PlayerSpec extends StagingPlayer {
  index: number;
  team: TeamId;
  number: number;
  position: Position;
  attrs: { pace: number; anticipation: number };
  /** Relative to the match's outfield pace range; 1 when every outfielder has the same pace. */
  paceScale: number;
}
export interface TeamSpec {
  id: TeamId;
  code: 'H' | 'A';
  style: Tactic;
  players: PlayerSpec[];
}
export interface Fixture {
  teams: readonly [TeamSpec, TeamSpec];
  players: PlayerSpec[];
  sides: readonly [StagingSide, StagingSide];
  /** Current on-pitch bodies; absent on older synthetic fixtures means everyone. */
  present?: boolean[];
  period?: 1 | 2 | 3 | 4 | 5;
}
export const onPitch = (fixture: Fixture, index: number): boolean =>
  fixture.present?.[index] ?? true;
export const presentPlayers = (fixture: Fixture, team: TeamId): PlayerSpec[] =>
  fixture.teams[team].players.filter((p) => onPitch(fixture, p.index));
export type Phase = 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'setPiece';
export type BeatKind =
  | 'kickOff'
  | 'pass'
  | 'carry'
  | 'takeOn'
  | 'shot'
  | 'clearance'
  | 'throwIn'
  | 'goalKick'
  | 'corner'
  | 'freeKick'
  | 'penalty'
  | 'stoppage'
  | 'shootoutKick';
export type BeatOutcome =
  | 'complete'
  | 'intercepted'
  | 'tackled'
  | 'offside'
  | 'out'
  | 'foul'
  | 'goal'
  | 'saved'
  | 'blocked'
  | 'wide'
  /** A heavy touch (or a ball nobody controls): it runs to the opponent named in `opponent`, or with none stays with the side. */
  | 'loose';
export type BeatReason = 'pressed' | 'blocked' | 'layoff' | 'cutBack' | 'switch' | 'reset';
/** One on-ball action with its settled outcome. Player fields are player indexes. */
export interface Beat {
  index: number;
  /** Possession sequence number; grows by one whenever the ball changes sides or play restarts. */
  possession: number;
  team: TeamId;
  phase: Phase;
  /** The grammar move that produced it (an identifier, also shown by the viewer). */
  move: string;
  kind: BeatKind;
  actor: number;
  /** Intended receiver of a pass-like beat. */
  receiver?: number;
  /** Interceptor, tackler, fouler, blocker or saving keeper. */
  opponent?: number;
  /** Nominal ball position when the beat starts (world frame). */
  from: Vec;
  /** Aim (world frame): reception point, carry end, point on the goal line, landing point. */
  to: Vec;
  loft: boolean;
  /** A pass into the space behind the defending line for a runner. */
  through: boolean;
  /** A shot struck with the head. */
  header: boolean;
  outcome: BeatOutcome;
  /** Why a backward or safe ball was chosen; a staging cue. */
  reason?: BeatReason;
  /** Nominal seconds the actor has the ball before acting. */
  hold: number;
  /** The settled event this beat performs (index into `Settled.events`); absent on a connective beat and on a shot or foul beat. */
  event?: number;
  /** The settled shot or foul this beat performs. */
  shot?: number;
  foul?: number;
  /** Match seconds when the beat starts (0 = kick-off, 2700 = the second half's). */
  clock?: number;
  original?: ScriptBeat;
}
/** `times[i]` is the nominal second beat `i` starts at; `nominalSeconds` the nominal length of the whole script. */
export interface Script {
  seed: string;
  fixture: Fixture;
  beats: Beat[];
  times: number[];
  nominalSeconds: number;
  /** Written from a settled result: staging may not replace a beat's opponent (T821). */
  bound?: true;
}

export type BallMode = 'held' | 'flight' | 'loose' | 'dead';
export interface Frame {
  t: number;
  /** x, y, height above the pitch. */
  ball: readonly [number, number, number];
  /** Player index holding the ball, or -1. */
  owner: number;
  mode: BallMode;
  /** Team in possession (the last one while the ball is dead). */
  team: TeamId;
  phase: Phase;
  /** False during dead-ball scenes. */
  live: boolean;
  /** Index of the beat being performed. */
  beat: number;
  /** Match seconds of the record's clock (a fitted script's frames only, T821). */
  clock?: number;
  /** Dense participant bodies: x0, y0, x1, y1, …; `present` selects the visible XI. */
  p: number[];
  /** Per-frame membership and slots, retained before the mutable stage moves on. */
  present?: number[];
  slots?: number[];
  period?: 1 | 2 | 3 | 4 | 5;
  /** Observation at this tick, before mutable orders/roles move on. Pitch metres and m/s. */
  movement?: { velocity: Vec; intent: Vec; state: PlayerMotionState }[];
  action?: BeatKind;
}
export type StageEventKind =
  | 'begin'
  | 'settled'
  | 'performed'
  | 'kick'
  | 'receive'
  | 'intercept'
  | 'tackle'
  | 'foul'
  | 'offside'
  | 'out'
  | 'shot'
  | 'goal'
  | 'save'
  | 'block'
  | 'wide'
  | 'restart'
  | 'whistle'
  | 'card'
  | 'sub'
  | 'injury'
  /** Presentation boundary: a departing body has reached the touchline. No new match fact. */
  | 'exit'
  /** A heavy touch or a loose pass: the ball runs to `other` (or lies for the side when absent). */
  | 'loose';
export interface StageEvent {
  t: number;
  beat: number;
  kind: StageEventKind;
  /** Team of the beat's actor. */
  team: TeamId;
  actor: number;
  /** Receiver or opponent involved. */
  other?: number;
  /** Ball position (x, y) at the event. */
  at: Vec;
  /** Offside events: world x of the defending line at the kick. */
  line?: number;
  /** The scripted opponent was replaced by a nearer one. */
  recast?: boolean;
  /** The opponent needed the lunge allowance to get there. */
  stretch?: boolean;
  /** The opponent was still not there when the ball arrived; the ball became his once he got there. */
  late?: boolean;
  /** Goal events: the score after the goal. */
  score?: readonly [number, number];
  card?: 'yellow' | 'secondYellow' | 'red';
  reason?: import('../../../contracts/src/match-script').ScriptIncident['reason'];
  /** Penalty attempts and kicks after the final whistle are counted independently. */
  penalty?: boolean;
  shootout?: boolean;
}
export interface Playback {
  version: 1;
  seed: string;
  hz: number;
  /** Seconds covered by `frames`. */
  duration: number;
  fixture: Fixture;
  /** Only the beats that were performed. */
  beats: Beat[];
  frames: Frame[];
  events: StageEvent[];
  score: readonly [number, number];
  /** Staged ticks per stored frame (default 1); events keep their times. */
  stride?: number;
}
export const SHOT_OUTCOMES: readonly BeatOutcome[] = ['goal', 'saved', 'blocked', 'wide'];
export const PASS_KINDS: readonly BeatKind[] = [
  'kickOff',
  'pass',
  'throwIn',
  'goalKick',
  'corner',
  'freeKick',
];
export const RESTART_KINDS: readonly BeatKind[] = [
  'kickOff',
  'throwIn',
  'goalKick',
  'corner',
  'freeKick',
  'penalty',
];
/** A shot, including a spot kick or a free kick struck at goal. */
export const isShotLike = (b: Pick<Beat, 'kind' | 'outcome'>): boolean =>
  b.kind === 'shot' ||
  b.kind === 'penalty' ||
  b.kind === 'shootoutKick' ||
  (b.kind === 'freeKick' && SHOT_OUTCOMES.includes(b.outcome));
export const lineOf = (position: Position): Line =>
  position === 'GK'
    ? 'GK'
    : position === 'CB' ||
        position === 'LB' ||
        position === 'RB' ||
        position === 'LWB' ||
        position === 'RWB'
      ? 'DF'
      : position === 'LW' || position === 'RW' || position === 'ST'
        ? 'FW'
        : 'MF';
