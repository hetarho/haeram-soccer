/**
 * Advanced match counters (→MATCH-13), recorded by the duel chain for every own-club match from
 * rules 1.6.0. Each record is a fixed-width row of non-negative integers indexed by these keys.
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
  /** Ball won while the opponent had it in its defensive third. */
  highTurnovers: 8,
  /** Own pass attempts in the defensive and middle thirds: the opponent's PPDA numerator. */
  buildUpPasses: 9,
  /** Tackles and interceptions while the opponent had the ball in those two thirds. */
  pressActions: 10,
} as const;
export const TEAM_DETAIL_SIZE = 11;

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
} as const;
export const PLAYER_DETAIL_SIZE = 9;

export const emptyTeamDetail = () => Array<number>(TEAM_DETAIL_SIZE).fill(0);
export const emptyPlayerDetail = () => Array<number>(PLAYER_DETAIL_SIZE).fill(0);
