/** Portable script facts crossing the worker boundary (MATCH-38). */
export type ScriptSide = 0 | 1;
/** Pitch metres: side 0 attacks x=105, side 1 x=0; staging handles changes of ends. */
export type ScriptPoint = readonly [number, number];

export type ScriptPhase = 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'setPiece';
export type ScriptBeatKind =
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
export interface ScriptIncident {
  kind: 'yellow' | 'secondYellow' | 'red' | 'sub' | 'injury';
  side: ScriptSide;
  line: number;
  other?: number;
  reason?: 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious' | 'violent';
}
export type ScriptBeatOutcome =
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
export type ScriptBeatReason = 'pressed' | 'blocked' | 'layoff' | 'cutBack' | 'switch' | 'reset';
/** One on-ball action with its settled outcome. Player fields are side-relative record line indexes; opponent belongs to the other side. */
export interface ScriptBeat {
  index: number;
  /** Possession sequence number; grows by one whenever the ball changes sides or play restarts. */
  possession: number;
  side: ScriptSide;
  phase: ScriptPhase;
  /** The grammar move that produced it (an identifier, also shown by the viewer). */
  move: string;
  kind: ScriptBeatKind;
  actor: number;
  /** Intended receiver of a pass-like beat. */
  receiver?: number;
  /** Interceptor, tackler, fouler, blocker or saving keeper. */
  opponent?: number;
  /** Nominal ball position when the beat starts (world frame). */
  from: ScriptPoint;
  /** Aim (world frame): reception point, carry end, point on the goal line, landing point. */
  to: ScriptPoint;
  loft: boolean;
  /** A pass into the space behind the defending line for a runner. */
  through: boolean;
  /** A shot struck with the head. */
  header: boolean;
  outcome: ScriptBeatOutcome;
  /** Why a backward or safe ball was chosen; a staging cue. */
  reason?: ScriptBeatReason;
  /** Nominal seconds the actor has the ball before acting. */
  hold: number;
  /** The settled event this beat performs (index into the detail's events); absent on a connective beat and on a shot or foul beat. */
  event?: number;
  /** The settled shot or foul this beat performs. */
  shot?: number;
  foul?: number;
  /** Match seconds when the beat starts (0 = kick-off, 2700 = the second half's). */
  clock: number;
  /** The four halves, then 5 for kicks after the final whistle. */
  period: 1 | 2 | 3 | 4 | 5;
  incidents?: ScriptIncident[];
  /** Recorded qualifiers that cannot be inferred from the order or geometry. */
  lineBreaking?: boolean;
  xg?: number;
  shotKind?: 'open' | 'corner' | 'freeKick' | 'penalty';
  source?: number;
  keyPass?: number;
  keeper?: number;
  setPiece?: 'none' | 'corner' | 'freeKick';
  /** False when the detail did not credit the loose-ball winner to a player. */
  creditedOpponent?: boolean;
  outKind?: 'outTouch' | 'outByline' | 'cornerWon';
  corner?: boolean;
}

export interface MatchScript {
  version: 1;
  seed: string;
  beats: ScriptBeat[];
  bound: true;
}
