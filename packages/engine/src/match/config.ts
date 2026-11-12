/**
 * The named values every result path reads from the match's configs (→MATCH-2, MATCH-6, MATCH-18):
 * the grid's `SHOT_CONFIG.penalty` and `RESTART_CONFIG.offside` read them from here.
 */

/** A penalty's and a shoot-out kick's conversion: base chance, its bounds and the kick's xG (→MATCH-6). */
export const PENALTY_CONFIG = { base: 0.78, min: 0.6, max: 0.92, xg: 0.76 } as const;

/**
 * How the duels feel a skill point (→MATCH-2, MATCH-22, T216): a skill counts by its distance from the
 * match's level, spread by `skillScale` around `anchor` — the level T215 set the distributions at — so a
 * strength gap plays the same at every tier.
 */
export const STRENGTH_CONFIG = {
  skillScale: 1.8,
  anchor: 76,
  /**
   * Candidate model only (T357, T365, →MATCH-2): its own `skillScale`, and the share of a side's
   * distance from the match's level — its XI's mean 실효 OVR plus the day's shift (form, home,
   * manager and morale points and the gap diminishing returns take away) — that reaches its
   * players' skills (`side`). At 1, as on the pre-feature model, favourites won 4–7 points too
   * often at every gap of 10 or more (curve error 3.09 on T357's rounds 21 and 22); 0.8 shrinks
   * every source of a strength point alike, so a point still counts the same wherever it comes
   * from, and leaves the spread inside a side as it was.
   */
  candidate: { skillScale: 1.8, side: 0.8 },
} as const;

/** The offside call's chance (→MATCH-18): the shared rule and the candidate model's (`candidate`). */
export const OFFSIDE_CONFIG = {
  base: 0.03,
  /** Points of 판단력 per unit of offside chance: 200 on the raw scale, times the grid's skill scale (T216). */
  decisions: 360,
  linebreaker: 0.1,
  highLine: 0.05,
  highLineFrom: 40,
  min: 0.012,
  max: 0.7,
  /**
   * The candidate model's call (→MATCH-18 r21, T384): with `spread` above 0 the chance is
   * `base` × e^(−(판단력 − `pivot`) / `spread`) on the receiver's own 판단력 attribute, times
   * `linebreakerFactor` for a linebreaker and `highLineFactor` against a high line, then
   * clamped. The attribute, not the duels' scale: there the match's level, the day's form, the
   * slot and fatigue outweigh it, and the attribute's quarters stayed at 1.5× whatever the slope
   * (T384's screens). Factors rather than the shared rule's added terms keep his 판단력 deciding
   * against every line. `spread` 0 keeps the shared linear rule. T397: `base` 0.055 → 0.05, as
   * the stronger pull of a ball in behind (DECISION_CONFIG.candidate.through) finds more runners
   * in an offside position, so calls stay at 1.85 a team.
   */
  candidate: {
    base: 0.05,
    decisions: 360,
    pivot: 67,
    spread: 15,
    linebreaker: 0.1,
    linebreakerFactor: 0.3,
    highLine: 0.05,
    highLineFactor: 1.5,
    highLineFrom: 40,
    min: 0.002,
    max: 0.7,
  },
} as const;
