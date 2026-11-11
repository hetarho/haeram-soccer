import type { TeamId, Vec } from './types';
import { clamp } from './vec';
import { PITCH, attackFrame } from '../grid/pitch';
export { PITCH } from '../grid/pitch';
export const HALFWAY = 52.5;
export const CENTRE: Vec = [52.5, 34];
export const GOAL_Y = 34;
export const POST_LOW = 30.34;
export const POST_HIGH = 37.66;
/** Attack-frame x of the penalty-area line in front of the opponent's goal. */
export const BOX_X = 88.5;
export const BOX_Y: readonly [number, number] = [13.84, 54.16];
export const PENALTY_X = 94;

/** World to the team's attack frame; its own inverse, so it also converts back to world. */
export const toAttack = attackFrame;

/** Inside the penalty area the attack frame's team shoots at. */
export const inBox = (pAttack: Vec): boolean =>
  pAttack[0] >= BOX_X && pAttack[1] >= BOX_Y[0] && pAttack[1] <= BOX_Y[1];

/** At least `margin` inside every line (a negative margin allows that far outside). */
export const inPitch = (p: Vec, margin = 0): boolean =>
  p[0] >= margin && p[0] <= PITCH.length - margin && p[1] >= margin && p[1] <= PITCH.width - margin;

/** `p` moved to at least `margin` inside every line (a negative margin allows that far outside). */
export const clampToPitch = (p: Vec, margin = 0): Vec => [
  clamp(p[0], margin, PITCH.length - margin),
  clamp(p[1], margin, PITCH.width - margin),
];

/** Centre of the goal a team defends (world frame). */
export const ownGoal = (team: TeamId): Vec => (team === 0 ? [0, GOAL_Y] : [PITCH.length, GOAL_Y]);

/** Centre of the goal a team attacks (world frame). */
export const oppGoal = (team: TeamId): Vec => ownGoal(team === 0 ? 1 : 0);
