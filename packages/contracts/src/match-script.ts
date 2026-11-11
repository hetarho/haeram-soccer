/**
 * An own match's script (→MATCH-38, T826): its detail laid out as an order of play, every recorded
 * row played once by its recorded player in its recorded cell. It crosses the worker boundary to the
 * staging (T834), so it holds identifiers and numbers only, no prose (→ARCH-32).
 *
 * Players are record line indexes of their side (the detail's `sides[side].lines`); points are pitch
 * metres in side 0's attack frame (x from side 0's goal line toward side 1's, y from side 0's left
 * touchline); `event`, `shot` and `foul` index the detail's rows of that name.
 */

/**
 * A beat's on-ball action. A restart's delivery carries the restart's kind; `penalty` is a restart
 * whose only action is the kick, `stoppage` a dead ball with no restart of its own (it carries
 * incidents, and play resumes with the restart owed or, in open play, with the man who had the
 * ball), `shootoutKick` one kick of the shoot-out after the last whistle (T827).
 */
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

/** How a beat ends: `loose` a ball nobody controls, run to `opponent` or kept by the side. */
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
  | 'loose';

/** The phase of play a beat stands in (→MATCH-15). */
export type ScriptPhase = 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'setPiece';

/** Why a backward or safe ball was chosen; a staging cue. */
export type ScriptBeatReason = 'pressed' | 'blocked' | 'layoff' | 'cutBack' | 'switch' | 'reset';

export type ScriptVec = readonly [number, number];

/**
 * A recorded incident a beat carries (→MATCH-19/20/21), in the record's own values: a card, a
 * substitution (`line` off, `other` on) or an injury, of `side`'s lines.
 */
export interface ScriptIncident {
  kind: 'yellow' | 'secondYellow' | 'red' | 'sub' | 'injury';
  side: 0 | 1;
  line: number;
  other?: number;
  reason?: 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious' | 'violent';
  /** The detail incident row it plays. */
  incident: number;
}

/** A beat's period: 1 and 2 the halves, 3 and 4 extra time's, 5 the shoot-out. */
export type ScriptPeriod = 1 | 2 | 3 | 4 | 5;

/** One on-ball action of the script, with its recorded outcome. */
export interface ScriptBeat {
  index: number;
  /** Possession sequence number: grows by one whenever the ball changes sides or play restarts. */
  possession: number;
  side: 0 | 1;
  phase: ScriptPhase;
  /**
   * What produced it: a recorded row's kind (`short`, `long`, `through`, `cross`, `cutBack`,
   * `carry`, `takeOn`, `shot`, `freeKick`, `foul`) or a connective beat's form (`link`,
   * `miscontrol`, `restart`).
   */
  move: string;
  kind: ScriptBeatKind;
  /** The line of `side` on the ball. */
  actor: number;
  /** The intended receiver of a pass-like beat, or the man caught offside: a line of `side`. */
  receiver?: number;
  /** The interceptor, tackler, fouler, blocker, saving keeper or the man a heavy touch runs to: a line of the other side. */
  opponent?: number;
  /** The ball when the beat starts (pitch metres). */
  from: ScriptVec;
  /** Its aim: a reception point, a carry's end, a point on the goal line or where the ball lands. */
  to: ScriptVec;
  loft: boolean;
  /** A pass into the space behind the defending line for a runner. */
  through: boolean;
  /** A shot struck with the head. */
  header: boolean;
  outcome: ScriptBeatOutcome;
  reason?: ScriptBeatReason;
  /** Nominal seconds the actor has the ball before acting. */
  hold: number;
  /** The detail event row this beat plays; absent on a connective, shot or foul beat. */
  event?: number;
  /** The detail shot row this beat plays. */
  shot?: number;
  /** The detail foul row this beat plays. */
  foul?: number;
  /** The detail shoot-out kick this beat plays. */
  kick?: number;
  /** Incidents shown on this beat: a booked foul's card on the foul, the rest on a stoppage or a period's kick-off. */
  incidents?: ScriptIncident[];
  /** Match seconds when the beat starts (0 the kick-off, 2700 the second half's, 5400 and 6300 extra time's). */
  clock: number;
  period: ScriptPeriod;
}

/** A detail's script: the same detail and seed always give the same script (→ARCH-5). */
export interface MatchScript {
  version: 1;
  seed: string;
  beats: ScriptBeat[];
  /** Written from a settled record: the staging never replaces a beat's player. */
  bound: true;
}
