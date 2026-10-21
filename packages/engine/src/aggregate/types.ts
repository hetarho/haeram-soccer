/**
 * The aggregate path's interfaces (→MATCH-22, MATCH-26, MATCH-27; docs/MATCH-MODEL-CONTRACT.md
 * "Full aggregate facts"): what the kernel reads from a prepared fixture, the participation it is
 * conditioned on, its named streams and the coupled team facts with the transient ledger they are
 * derived from. Types only; the kernel is `team.ts`, the ledger's checks and derivations `ledger.ts`.
 */
import type { Incident, Metrics, Tactic } from '../../../contracts/src/types';
import type { Line } from '../../../contracts/src/player';

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
}

/** The decision families a fixture's kernel draws from, each on a stream of its own. */
export const AGGREGATE_STREAM_FAMILIES = ['latent', 'flow', 'fouls', 'shots', 'setPieces'] as const;
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

/** Pass kinds of MATCH-13's classifications, then the carrying kinds. */
export const AGGREGATE_PASS_KINDS = ['short', 'long', 'through', 'cross', 'cutBack'] as const;
export const AGGREGATE_MOVE_KINDS = [...AGGREGATE_PASS_KINDS, 'carry', 'takeOn'] as const;
export type AggregateMoveKind = (typeof AGGREGATE_MOVE_KINDS)[number];

/**
 * A group of one side's same-kind actions between two of the 40 grid cells (`band * 5 + lane`,
 * in that side's attack frame) in one period. Failed passes end in an offside, an interception,
 * the touchline (a throw-in to the opponent), the byline (a goal kick, or a corner this side won)
 * or a loose ball nobody is credited with; a failed carry or take-on is an opponent's tackle.
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
  /** Completed passes played beyond an opponent line. */
  lineBreaking: number;
  offside: number;
  intercepted: number;
  outTouch: number;
  outByline: number;
  /** Of `outByline`, the deflections that gave this side a corner. */
  cornersWon: number;
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
