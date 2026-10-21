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
  territory: { dominance: 1.4 },
  completion: {
    min: 0.3,
    max: 0.97,
    /** Effective-skill points (passing against pressing) per unit of completion. */
    skillScale: 450,
    /** Lifts the reference rates to the band once direction, length and the box take theirs. */
    bias: 0.06,
    /** Completion per point of prepared match strength gap. */
    strength: 0.002,
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
  crosses: { scale: 0.6, completion: 0.2, goalArea: 0.3 },
  /** Completed passes of each kind played beyond an opponent line. */
  lineBreaking: { short: 0.1, long: 0.45, through: 0.9 },
  /** How a failed pass ends: offside (into the final third), touchline, byline, interception. */
  failed: {
    offside: { forward: 0.05, through: 0.3 },
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
    band: [0.3, 0.3, 0.8, 1, 1.1, 1.2, 0.5, 0.4],
  },
  shots: {
    /** Scale on the reference shot share of a cell, per completed arrival of each kind. */
    scale: 0.62,
    kind: {
      short: 1,
      long: 0.9,
      through: 2.4,
      cross: 1.3,
      cutBack: 2,
      carry: 0.8,
      takeOn: 1.5,
    },
    /** Effective-skill points (attack against defence) per e-fold of shot rate. */
    skillScale: 120,
    /** The summary path's base chance rate the profiles' points are relative to. */
    profileBase: 18,
    /** Shots a defender blocks before they reach goal; blocks and saves going out for a corner. */
    blocked: 0.35,
    cornerFromBlock: 0.45,
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
    matchupScale: 150,
    fallback: 0.03,
    /** A shot's most and least xG in hundredths, as the record schema bounds them. */
    max: 80,
    min: 1,
    /** Outside the box a chance stays below a big chance (MATCH-13: big chances ≤ box shots). */
    outsideMax: 29,
  },
  penalty: { xg: 76, base: 0.78, min: 0.6, max: 0.92, skillScale: 400 },
  setPieces: {
    corner: { completion: 0.3, shot: 0.55, goalArea: 0.35 },
    /** Fouls in the opponent half's inner lanes outside the box: a direct shot this often. */
    directShot: 0.3,
    directXg: 6,
    /** Other attacking free kicks delivered into the box this often. */
    delivery: 0.45,
    deliveryShot: 0.5,
  },
  /** Per player a side is short, the share of its attack lost and of its defence opened. */
  manShort: { attack: 0.1, defence: 0.1 },
  /** How each preset plays the ball beyond its profile points (→MATCH-8). */
  tactics: {
    balanced: { tempo: 1, direct: 1, through: 1, carries: 1, fouls: 1, press: 1 },
    possession: { tempo: 1.06, direct: 0.8, through: 0.9, carries: 1, fouls: 0.9, press: 1 },
    counter: { tempo: 0.92, direct: 1.45, through: 1.6, carries: 1.2, fouls: 1, press: 0.8 },
    press: { tempo: 1.02, direct: 1.05, through: 1.1, carries: 1, fouls: 1.2, press: 1.45 },
  } satisfies Record<Tactic, Record<string, number>>,
} as const;
