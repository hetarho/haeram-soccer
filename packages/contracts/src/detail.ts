/**
 * Advanced match counters (→MATCH-13), recorded by the duel chain for every own-club match from
 * rules 1.6.0 and widened for the grid engine of rules 4.0.0. Each record is a fixed-width row of
 * non-negative integers indexed by these keys; new keys are appended, existing indexes never move.
 */

/** One side of one match. */
export const TD = {
  /** Last completed passes before a shot (assists included): chances created. */
  keyPasses: 0,
  /** Shots from big-chance situations. */
  bigChances: 1,
  bigChancesScored: 2,
  /** Shots from inside the box: big chances plus ordinary box chances. */
  boxShots: 3,
  /** Pass attempts that start in the attacking third. */
  finalThirdPasses: 4,
  finalThirdCompleted: 5,
  /** Completed passes that move the ball into a higher zone. */
  progressivePasses: 6,
  /** Attempted take-ons (successful ones are the dribble counter). */
  takeOns: 7,
  /** Sequences started by a ball won in open play near the opponent's goal (MATCH-13). */
  highTurnovers: 8,
  /** Own pass attempts in the own part of the pitch PPDA reads: the opponent's PPDA numerator. */
  buildUpPasses: 9,
  /**
   * Defensive actions in the opponent's part of the pitch PPDA reads: tackles and interceptions,
   * and on the candidate model also challenges lost and fouls (MATCH-13).
   */
  pressActions: 10,
  /** Completed passes or carries ending in the box from outside it. */
  boxEntries: 11,
  /** Entries into the band in front of the box from a lower band. */
  frontOfBoxEntries: 12,
  lineBreakingPasses: 13,
  /** Positive expected-threat gains of completed passes and carries, in thousandths. */
  xtAdded: 14,
  crosses: 15,
  crossesCompleted: 16,
  cutBacks: 17,
  throughBalls: 18,
  throughBallsCompleted: 19,
  /** Carries that end in a higher band. */
  progressiveCarries: 20,
  fouls: 21,
  yellowCards: 22,
  redCards: 23,
  /** Restarts awarded to the side that takes them. */
  corners: 24,
  offsides: 25,
  throwIns: 26,
  goalKicks: 27,
  freeKicks: 28,
  /** Penalties awarded, then scored. */
  penalties: 29,
  penaltiesScored: 30,
} as const;
export const TEAM_DETAIL_SIZE = 31;

/** One own player in one match. */
export const PD = {
  /** Expected goals of the player's shots, in hundredths. */
  xg: 0,
  /** Expected goals of the shots the player's key passes set up, in hundredths. */
  xa: 1,
  keyPasses: 2,
  bigChancesCreated: 3,
  finalThirdPasses: 4,
  finalThirdCompleted: 5,
  progressivePasses: 6,
  takeOns: 7,
  highTurnovers: 8,
  boxEntries: 9,
  frontOfBoxEntries: 10,
  lineBreakingPasses: 11,
  /** Positive expected-threat gains, in thousandths. */
  xtAdded: 12,
  crosses: 13,
  crossesCompleted: 14,
  cutBacks: 15,
  throughBalls: 16,
  throughBallsCompleted: 17,
  progressiveCarries: 18,
  fouls: 19,
  foulsWon: 20,
  yellowCards: 21,
  redCards: 22,
  offsides: 23,
} as const;
export const PLAYER_DETAIL_SIZE = 24;

export const emptyTeamDetail = () => Array<number>(TEAM_DETAIL_SIZE).fill(0);
export const emptyPlayerDetail = () => Array<number>(PLAYER_DETAIL_SIZE).fill(0);
