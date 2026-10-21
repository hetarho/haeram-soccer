/**
 * The aggregate kernel's one tuning surface (→MATCH-22, MATCH-23). These are starting values
 * aimed at MATCH-23's bands for equal top-tier sides, built on the 40-cell reference tables
 * (grid/baselines.json, docs/MATCH-BASELINES.md); T284 calibrates them against held-out detailed
 * play and the intended targets. Rates are per action of the kind named, never per minute.
 */
import type { Tactic } from '../../../contracts/src/types';

export const AGGREGATE_CONFIG = {
  periods: {
    regulation: { from: 0, to: 90 },
    extra: { from: 90, to: 120 },
  },
  /** Seconds of a period the ball is in play (MATCH-23: 54–58 of 90 minutes). */
  ballInPlay: 0.62,
  /** The match's shared latent state: its tempo and how the ball splits beyond the prepared chance. */
  latent: { tempoSd: 0.06, possessionSd: 0.025, attackSd: 0.12 },
  possession: {
    min: 0.22,
    max: 0.78,
    /** Share of the ball a side cedes per player it is short. */
    manShort: 0.035,
  },
  passes: {
    /** Pass attempts of both sides in 90 minutes (MATCH-23: 430–520 a side). */
    perMatch: 960,
    /** Each side's own spread around its share. */
    sideSd: 0.05,
  },
  /** How far a side that has more of the ball plays up the pitch, from its share above a half. */
  territory: { dominance: 1.1 },
  completion: {
    min: 0.3,
    max: 0.97,
    /** Effective-skill points (passing against pressing) per unit of completion. */
    skillScale: 450,
    /** Lifts the reference rates to the band once direction, length and the box take theirs. */
    bias: 0.05,
    /** Completion per point of prepared match strength gap. */
    strength: 0.002,
    /**
     * Completion per hundred profile points (the side's pass against the opponent's pressure): the
     * summary path's profile points move its chance model, and at full weight here they lifted a
     * possession mirror to 88% completion (T284).
     */
    profile: 0.5,
    /** By direction, before the per-cell rate is renormalised to keep its mean. */
    direction: { forward: -0.1, lateral: 0.05, back: 0.09 },
    /** A forward pass that skips a band, and a pass into the box, are harder still. */
    long: -0.12,
    intoBox: -0.12,
    /** Completion lost in the own half per unit of the opponent preset's press above 1. */
    pressed: 0.12,
  },
  /** Completed forward passes skip a band this often, drift a lane this often. */
  forward: { long: 0.16, drift: 0.4 },
  through: {
    /** Share of forward attempts from the middle and front-of-box bands' inner lanes. */
    share: 0.05,
    completion: 0.38,
  },
  /** Scale on the reference cross share of a cell's passes. */
  crosses: { scale: 0.6, completion: 0.17, goalArea: 0.25 },
  /** Completed passes of each kind played beyond an opponent line. */
  lineBreaking: { short: 0.1, long: 0.45, through: 0.9 },
  /** How a failed pass ends: offside (into the final third), touchline, byline, interception. */
  failed: {
    offside: { forward: 0.06, through: 0.3 },
    touch: 0.42,
    byline: 0.7,
    intercepted: 0.16,
    /** Of the byline outs from a cross or a pass into the box, deflections giving a corner. */
    corner: 0.32,
  },
  carries: {
    /** Scale on the reference carries per pass of each cell. */
    scale: 0.8,
    progressive: 0.4,
    lost: 0.05,
  },
  takeOns: {
    scale: 0.95,
    /** Effective-skill points (dribbling against pressing) per unit of success. */
    skillScale: 250,
    min: 0.2,
    max: 0.8,
    /** A won take-on carries the ball into the next band this often. */
    progress: 0.5,
  },
  fouls: {
    /** Fouls a side commits in 90 minutes beyond those its cards were shown for. */
    perMatch: 9.4,
    /** Relative foul rate on actions in each band (own goal area … opponent goal area). */
    band: [0.3, 0.3, 0.8, 1, 1.1, 1.2, 0.4, 0.3],
  },
  shots: {
    /** Scale on the reference shot share of a cell, per completed arrival of each kind. */
    scale: 0.55,
    kind: {
      short: 1,
      long: 0.9,
      through: 2.4,
      cross: 1.3,
      cutBack: 2,
      carry: 0.8,
      takeOn: 1.5,
    },
    /**
     * Scale on the open-play shot rate by where the arrival ends: outside the box, in it, in the
     * goal area (T284: MATCH-23 shot place on calibration seeds).
     */
    place: { outside: 1.7, box: 1, goalArea: 0.4 },
    /** Effective-skill points (attack against defence) per e-fold of shot rate. */
    skillScale: 220,
    /** The summary path's base chance rate the profiles' points are relative to. */
    profileBase: 18,
    /** Shots a defender blocks before they reach goal; blocks and saves going out for a corner. */
    blocked: 0.44,
    cornerFromBlock: 0.35,
    cornerFromSave: 0.25,
    /** A cross is met by a header this often. */
    header: 0.7,
  },
  xg: {
    /** Reference xG per shot of the cell, scaled by the kind of chance. */
    kind: {
      short: 1,
      long: 1,
      through: 1.9,
      cross: 0.85,
      cutBack: 1.7,
      carry: 0.9,
      takeOn: 1.2,
    },
    header: 0.75,
    /** Log-normal spread of one chance's quality. */
    spread: 0.55,
    /** Effective-skill points (attack against defence) per e-fold of chance quality. */
    matchupScale: 300,
    fallback: 0.03,
    /** A shot's most and least xG in hundredths, as the record schema bounds them. */
    max: 80,
    min: 1,
    /** Outside the box a chance stays below a big chance (MATCH-13: big chances ≤ box shots). */
    outsideMax: 29,
  },
  penalty: { xg: 76, base: 0.78, min: 0.6, max: 0.92, skillScale: 400 },
  setPieces: {
    corner: { completion: 0.35, shot: 1.4, goalArea: 0.3 },
    /** Fouls in the opponent half's inner lanes outside the box: a direct shot this often. */
    directShot: 0.3,
    directXg: 6,
    /** Other attacking free kicks delivered into the box this often. */
    delivery: 0.6,
    deliveryShot: 1.1,
  },
  /** Per player a side is short, the share of its attack lost and of its defence opened. */
  manShort: { attack: 0.1, defence: 0.1 },
  /**
   * How each preset plays the ball beyond its profile points (→MATCH-8): `shot` scales its own
   * open-play shots per completed arrival (possession: fewer direct shots), `guard` the opponent's
   * chance rate against it (balanced: defensive stability). T284 calibrates them on MATCH-29's
   * pairing bands.
   */
  tactics: {
    balanced: {
      tempo: 1,
      direct: 1,
      through: 1,
      carries: 1,
      fouls: 1,
      press: 1,
      shot: 1,
      guard: 0.94,
    },
    possession: {
      tempo: 1.06,
      direct: 0.8,
      through: 0.9,
      carries: 1,
      fouls: 0.9,
      press: 1,
      shot: 0.85,
      guard: 1,
    },
    counter: {
      tempo: 0.92,
      direct: 1.45,
      through: 1.6,
      carries: 1.2,
      fouls: 1,
      press: 0.8,
      shot: 1.2,
      guard: 0.95,
    },
    press: {
      tempo: 1.02,
      direct: 1.05,
      through: 1.1,
      carries: 1,
      fouls: 1.2,
      press: 1.35,
      shot: 1,
      guard: 1,
    },
  } satisfies Record<Tactic, Record<string, number>>,
} as const;

/**
 * The participation plan's rates (→MATCH-19/20/21, CLUB-23, MATCH-23): cards a side, per 90
 * minutes on the pitch, and how the manager's stoppages fall. Injury chances are CLUB-23's own
 * (careers.ts `injuryChance`) and the injury hazard's rise through the match grid/changes.ts's.
 */
export const AGGREGATE_PARTICIPATION_CONFIG = {
  discipline: {
    /** Cautions of unbooked players, second cautions and straight reds a side in 90 minutes. */
    yellows: 1.8,
    secondYellows: 0.03,
    reds: 0.04,
    /** How a caution comes about, and a straight red. */
    yellowReasons: { reckless: 0.7, tactical: 0.18, dissent: 0.12 },
    redReasons: { dogso: 0.5, serious: 0.35, violent: 0.15 },
    /** How often each line is booked, relative to the others. */
    line: { GK: 0.2, DF: 1.3, MF: 1.2, FW: 0.8 },
  },
  /** A side keeps at least this many on the pitch: a dismissal or an injury past it is not drawn. */
  minimumPlayers: 7,
  changes: {
    /** Minutes between in-play stoppages the manager may use, and their jitter. */
    every: 6,
    jitter: 3,
    /** A red card is answered at the stoppage this many minutes later (1 up to it). */
    afterRed: 3,
    /**
     * Red-card rebalance decisions tried for one stretch of the match before it is drawn again on
     * the fixture's next retry streams, and the retries allowed (→STAFF-45).
     */
    rebalanceSearches: 16,
    rebalanceRetries: 8,
  },
} as const;

/**
 * Who is credited with the team facts (→MATCH-11, MATCH-26/27): a line's weight for an action by
 * the band it starts in (the acting side's attack frame), times the role and trait weights of
 * match.ts `actionWeight`, times the reading attribute's effective value over `attributeScale`
 * raised to `attributePower`. Only shares come from these; the counts are the ledger's.
 */
export const AGGREGATE_ATTRIBUTION_CONFIG = {
  attributeScale: 70,
  attributePower: 2,
  /** Passes and carries started in each band (own goal area … opponent goal area). */
  pass: {
    GK: [3, 1.2, 0.1, 0, 0, 0, 0, 0],
    DF: [2, 2.2, 1.8, 0.9, 0.4, 0.2, 0.1, 0.1],
    MF: [0.3, 0.8, 1.4, 1.8, 1.8, 1.4, 1, 0.8],
    FW: [0, 0.1, 0.3, 0.7, 1.1, 1.5, 1.6, 1.6],
  },
  takeOn: { GK: 0, DF: 0.4, MF: 1, FW: 1.8 },
  /** Crosses and cut-backs go to flank slots this much more than to central ones. */
  wide: 4,
  through: { GK: 0, DF: 0.2, MF: 1.5, FW: 1 },
  /** Shots with the foot and headers (→MATCH-23: goals by line 50–60 / 27–37 / 8–15%). */
  shot: { GK: 0, DF: 0.25, MF: 1.1, FW: 2.2 },
  header: { GK: 0, DF: 0.8, MF: 0.8, FW: 2.2 },
  /** Outside the box midfielders shoot relatively more. */
  outsideShot: { GK: 0, DF: 0.3, MF: 1.6, FW: 1.1 },
  /** Offsides by the receiver's line. */
  offside: { GK: 0, DF: 0.05, MF: 0.5, FW: 2.5 },
  /** Tackles, interceptions and fouls by the band they happen in (the defending side's frame). */
  defend: {
    GK: [0.3, 0.05, 0, 0, 0, 0, 0, 0],
    DF: [2.2, 2.2, 1.8, 1, 0.5, 0.3, 0.2, 0.2],
    MF: [0.6, 1, 1.4, 1.7, 1.6, 1.2, 0.8, 0.6],
    FW: [0.1, 0.2, 0.3, 0.6, 0.9, 1.2, 1.3, 1.2],
  },
} as const;
