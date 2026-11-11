// Shared contracts of the match prototype (review/match-engine-split-261110 F1). Every later task
// of the chain imports these names; the world frame is metres, x 0-105 along, y 0-68 across.

export type Vec = readonly [number, number];
export type TeamId = 0 | 1;
export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';
export type Line = 'GK' | 'DF' | 'MF' | 'FW';
export type RoleId =
  | 'keeper'
  | 'sweeperKeeper'
  | 'centreBack'
  | 'ballPlayingDefender'
  | 'fullBack'
  | 'overlappingFullBack'
  | 'invertedFullBack'
  | 'anchor'
  | 'boxToBox'
  | 'mezzala'
  | 'ballWinner'
  | 'wideMidfielder'
  | 'traditionalWinger'
  | 'invertedWinger'
  | 'falseNine'
  | 'poacher'
  | 'targetMan';
export type Style = 'possession' | 'counter';
export type FormationId = '4-3-3' | '4-4-2';
export interface Attrs {
  passing: number;
  vision: number;
  finishing: number;
  dribbling: number;
  pace: number;
  decisions: number;
  positioning: number;
  tackling: number;
  heading: number;
  composure: number;
}
export interface PlayerSpec {
  index: number;
  team: TeamId;
  slot: number;
  number: number;
  position: Position;
  role: RoleId;
  attrs: Attrs;
}
export interface TeamSpec {
  id: TeamId;
  code: 'H' | 'A';
  formation: FormationId;
  style: Style;
  players: readonly PlayerSpec[];
}
/** `players` holds all 22 by index; `teams[t].players` holds that team's 11 by slot. */
export interface Fixture {
  teams: readonly [TeamSpec, TeamSpec];
  players: readonly PlayerSpec[];
}

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
  | 'freeKick';
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
  /** 44 numbers: x0, y0, x1, y1, … by player index (world frame). */
  p: number[];
}
export type StageEventKind =
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
  | 'whistle';
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
  /** Goal events: the score after the goal. */
  score?: readonly [number, number];
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
];
/** A shot, or a free kick struck at goal. */
export const isShotLike = (b: Pick<Beat, 'kind' | 'outcome'>): boolean =>
  b.kind === 'shot' || (b.kind === 'freeKick' && SHOT_OUTCOMES.includes(b.outcome));
export const lineOf = (position: Position): Line =>
  position === 'GK'
    ? 'GK'
    : position === 'CB' || position === 'LB' || position === 'RB'
      ? 'DF'
      : position === 'LW' || position === 'RW' || position === 'ST'
        ? 'FW'
        : 'MF';
