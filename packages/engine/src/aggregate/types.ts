/**
 * The aggregate path's interfaces (→MATCH-22, MATCH-26, MATCH-27; docs/MATCH-MODEL-CONTRACT.md
 * "Full aggregate facts"): what the kernel reads from a prepared fixture, the participation it is
 * conditioned on, its named streams and the coupled team facts with the transient ledger they are
 * derived from. Types only; the kernel is `team.ts`, the ledger's checks and derivations `ledger.ts`.
 */
import type { Incident, Metrics, Tactic } from '../../../contracts/src/types';
import type { Line, PlayTrait } from '../../../contracts/src/player';
import type { EraRules, SubPolicy } from '../grid/setup';
import type { MatchAction } from '../match';

export type AggregateSide = 0 | 1;
/** Regulation is minutes 0–90; extra time (→MATCH-6) extends the same match by 90–120. */
export type AggregatePeriod = 'regulation' | 'extra';
export type AggregateLength = 90 | 120;

/** The effective attributes the kernel reads through the injected skill accessor (→PLAYER-2). */
export const AGGREGATE_ATTRIBUTES = [
  'finishing',
  'passing',
  'vision',
  'dribbling',
  'pace',
  'tackling',
  'positioning',
  'reflexes',
  'crossing',
  'heading',
  'handling',
  'composure',
] as const;
export type AggregateAttribute = (typeof AGGREGATE_ATTRIBUTES)[number];

/**
 * The prepared match's existing values (match.ts `Prepared` satisfies it): the same strength,
 * possession chance, tactics and tactical profiles the other paths read, so the kernel has no
 * strength formula of its own (→MATCH-2).
 */
export interface AggregatePrepared {
  w: { seed: string };
  f: { id: string; year: number };
  /** Each side's starting XI in slot order; `participants` may add the bench after it. */
  squads: readonly [readonly { id: string }[], readonly { id: string }[]];
  tactics: readonly [Tactic, Tactic];
  /** Match strength after home, manager, morale, diminishing returns and the day's form. */
  strength: readonly number[];
  /** Tactical modifiers in percentage points (strategy.ts `TacticalProfile`). */
  profiles: readonly AggregateProfile[];
  /** The home side's share of the ball before in-match effects. */
  possessionChance: number;
}
export interface AggregateProfile {
  possession: number;
  pass: number;
  shot: number;
  defense: number;
  pressure: number;
}

/**
 * Effective skills and the shared finishing curve, injected as values so the kernel never imports
 * the detailed match module: `skill` is a participant's attribute at a match minute after his
 * slot level, multiplier, fatigue, the day's shift and in-match drain; `finishing` and
 * `targetChance` are the curves both existing paths finish chances with.
 */
export interface AggregateSkillAccess {
  skill(side: AggregateSide, line: number, attribute: AggregateAttribute, minute: number): number;
  finishing(shooting: number, keeping: number): number;
  targetChance(goal: number, shooting: number): number;
}

/** A slot of a side's formation: the line it plays in and whether it is a flank slot. */
export interface AggregateSlot {
  line: Line;
  wide: boolean;
}
export interface AggregateSideInput {
  /** Candidate participants by stable ID: the starting XI in slot order, then any bench. */
  lines: readonly { id: string }[];
  slots: readonly AggregateSlot[];
  tactic: Tactic;
  strength: number;
  profile: AggregateProfile;
}
/** Everything one fixture's kernel run is conditioned on; transient, never persisted. */
export interface AggregateInput {
  seed: string;
  fixture: string;
  year: number;
  possessionChance: number;
  sides: readonly [AggregateSideInput, AggregateSideInput];
  access: AggregateSkillAccess;
}

/** One participant's time in one slot, in match minutes `[from, to)` (→MATCH-20, MATCH-27). */
export interface AggregateStint {
  /** Index into the side's `lines`. */
  line: number;
  slot: number;
  from: number;
  to: number;
}
/**
 * The planned participation the team facts are conditioned on (T280 plans it): every on-pitch
 * stint and the incident timeline, whose cards the facts carry and whose dismissals and
 * unreplaced injuries leave a side a man short.
 */
export interface AggregateParticipation {
  length: AggregateLength;
  stints: readonly [readonly AggregateStint[], readonly AggregateStint[]];
  incidents: readonly Incident[];
  /** The red-card rebalances the plan could make, made or withheld, for the score check (→STAFF-45). */
  rebalances?: readonly AggregateRebalance[];
}
/**
 * A side's answer to a red card at the next stoppage (→STAFF-45): made when it is level or ahead
 * there and withheld when it trails, which the plan cannot know before the facts, so the match
 * checks it afterwards. Only a rebalance the side could make (a forward on, a slot to fill, a
 * defender or midfielder on the bench, a change left) is listed.
 */
export interface AggregateRebalance {
  side: AggregateSide;
  /** The stoppage's stamped minute. */
  minute: number;
  /** Names the red card answered: the side and its count of reds then, as `side:reds`. */
  key: string;
  made: boolean;
}
/** Per red card (`side:reds`), whether the plan makes its rebalance; unlisted ones are made. */
export type AggregateRebalanceDecisions = ReadonlyMap<string, boolean>;

/** The decision families a fixture's kernel draws from, each on a stream of its own. */
export const AGGREGATE_STREAM_FAMILIES = [
  'latent',
  'flow',
  'fouls',
  'shots',
  'setPieces',
  'discipline',
  'injuries',
  'changes',
  'attribution',
  'shootout',
  'loose',
] as const;
export type AggregateStreamFamily = (typeof AGGREGATE_STREAM_FAMILIES)[number];
/**
 * Named seeded streams of the candidate model for one fixture (→ARCH-5): a stream is named by its
 * family, period and fixture, so the same name always restarts the same sequence whatever else
 * was drawn, observed or queried.
 */
export interface AggregateStreams {
  readonly names: (family: AggregateStreamFamily, period?: AggregatePeriod) => string;
  readonly draw: (family: AggregateStreamFamily, period?: AggregatePeriod) => () => number;
}

/**
 * The kernel's pass kinds, then the carrying kinds. Crosses and through balls are MATCH-13's
 * counters by kind; `cutBack` is the kernel's pull-back flow, while MATCH-13's cut-back counter
 * reads the cells of any pass (grid/record.ts `isCutBack`), as the detailed tally does.
 */
export const AGGREGATE_PASS_KINDS = ['short', 'long', 'through', 'cross', 'cutBack'] as const;
export const AGGREGATE_MOVE_KINDS = [...AGGREGATE_PASS_KINDS, 'carry', 'takeOn'] as const;
export type AggregateMoveKind = (typeof AGGREGATE_MOVE_KINDS)[number];

/**
 * A group of one side's same-kind actions between two of the 40 grid cells (`band * 5 + lane`,
 * in that side's attack frame) in one period. Failed passes end in an offside, an interception,
 * the touchline (a throw-in to the opponent), the byline (a goal kick, or a corner this side won)
 * or a loose ball, which the opponent recovers (`recovered`, a ball won without a tackle or an
 * interception) or this side keeps; a failed carry or take-on is an opponent's tackle.
 */
export interface AggregateMove {
  period: AggregatePeriod;
  from: number;
  to: number;
  kind: AggregateMoveKind;
  /** A corner or free kick delivered into the box (a cross). */
  setPiece?: 'corner' | 'freeKick';
  attempts: number;
  completed: number;
  /**
   * Completed passes played beyond an opponent line (MATCH-13): a pass of any kind that ends in a
   * higher band than it starts.
   */
  lineBreaking: number;
  offside: number;
  intercepted: number;
  outTouch: number;
  outByline: number;
  /** Of `outByline`, the deflections that gave this side a corner. */
  cornersWon: number;
  /**
   * Of the failed passes neither offside, intercepted nor out of play, the loose balls the
   * opponent won (T323, →MATCH-13 high turnovers); the rest stayed with this side. Always 0 for a
   * carry or take-on.
   */
  recovered: number;
}
export type AggregateShotOutcome = 'goal' | 'save' | 'block' | 'miss';
/**
 * One shot, from the arrival of a completed move it follows (`source`, an index into the side's
 * moves: a pass kind is its key pass) or from a set piece without one.
 */
export interface AggregateShot {
  period: AggregatePeriod;
  /** Match minute 1–120. */
  minute: number;
  cell: number;
  /** Index into the side's `moves`, or -1 for a penalty, a direct free kick or a solo chance. */
  source: number;
  kind: 'open' | 'corner' | 'freeKick' | 'penalty';
  header: boolean;
  /** Expected goals in hundredths (1–80), the unit records carry. */
  xg: number;
  outcome: AggregateShotOutcome;
  /** A block or save that went out for a corner to the shooting side. */
  corner: boolean;
}
/** Fouls the opponent committed on this side's actions in one cell (this side's attack frame). */
export interface AggregateFouls {
  period: AggregatePeriod;
  cell: number;
  n: number;
  /** Fouls in the box: penalties to this side. */
  penalties: number;
}
export interface AggregateSideLedger {
  moves: AggregateMove[];
  shots: AggregateShot[];
  fouled: AggregateFouls[];
  /** Seconds with the ball, per period in `AggregateLedger.periods` order. */
  held: number[];
  /** Cards from the participation timeline (TD: a second yellow counts one of each). */
  cards: { yellow: number; red: number };
  /** Of the cards, those shown for a foul: the side commits at least that many. */
  cardFouls: number;
}
/**
 * The compact internal ledger of one generated match (→MATCH-26): grouped flows between coarse
 * cells, every shot and every foul location. It is not a frame trace; it is discarded once the
 * complete result is built and settled.
 */
export interface AggregateLedger {
  length: AggregateLength;
  periods: AggregatePeriod[];
  sides: [AggregateSideLedger, AggregateSideLedger];
}

/** One side's team rows in the record's units (Metrics, TD) and its xG in hundredths. */
export interface AggregateSideFacts {
  metrics: Metrics;
  detail: Metrics;
  xg: number;
}
/**
 * Coupled complete team facts (→MATCH-13, MATCH-26): every Metrics and TD counter of both sides,
 * derived from one ledger. No player attribution: T280 allocates them to participants.
 */
export interface AggregateTeamFacts {
  length: AggregateLength;
  score: [number, number];
  /** The score after 90 minutes when extra time was played. */
  regulation?: [number, number];
  sides: [AggregateSideFacts, AggregateSideFacts];
  ledger: AggregateLedger;
}

/**
 * One matchday candidate as the participation plan reads him (→MATCH-19/20/21, CLUB-23): his own
 * values before kick-off, aligned with the side's `lines`. The plan needs no Player object.
 */
export interface AggregateCandidate {
  id: string;
  /** His main position's line: bench choices and card weights read it. */
  line: Line;
  born: number;
  /** Pre-match fatigue and 체력, which drain him through the match. */
  fatigue: number;
  stamina: number;
  /** His chance of an injury over a full match on the pitch (careers.ts `injuryChance`). */
  injury: number;
  /** 선방, for an outfielder who has to go in goal. */
  reflexes: number;
  /** A substitute's effective OVR at each slot of the side's formation (world.ts `slotOvr`). */
  slotLevel: readonly number[];
  traits: readonly PlayTrait[];
}
export interface AggregateSidePlan {
  /** Aligned with `AggregateSideInput.lines`: the XI in slot order, then the named bench. */
  candidates: readonly AggregateCandidate[];
  policy: SubPolicy;
  pressing: boolean;
  /** How fast the side tires: its manager style's drain. */
  drain: number;
  /**
   * How much more often a line attempts an action in a slot: the slot's role times his play
   * traits (match.ts `actionWeight`, →MATCH-11), 1 for neither.
   */
  actionWeight(line: number, slot: number, action: MatchAction): number;
}
/** What the participation plan is conditioned on beyond the kernel input. */
export interface AggregatePlan {
  era: EraRules;
  sides: readonly [AggregateSidePlan, AggregateSidePlan];
}

/** One named line of a side in record order: the starters, then substitutes as they came on. */
export interface AggregateLine {
  /** Index into the side's `lines`. */
  line: number;
  metrics: Metrics;
  detail: Metrics;
}
/** Who one shot of the ledger is credited to: shooter and, for a pass, the key passer. */
export interface AggregateShotCredit {
  side: AggregateSide;
  /** Index into the side's ledger shots. */
  shot: number;
  minute: number;
  shooter: number;
  passer?: number;
}
/** The player lines allocated from one match's team facts (→MATCH-26/27). */
export interface AggregatePlayerFacts {
  sides: [AggregateLine[], AggregateLine[]];
  shots: AggregateShotCredit[];
}
