// Pitch constants and frames of reference. The values are copied from MATCH-14 (5 lanes x 8 bands
// on a 105 x 68 m pitch); the prototype does not import the engine.
//
// World frame: team 0 attacks toward x = 105, team 1 toward x = 0, with no change of ends.
// Attack frame of a team: that team attacks toward x = 105 and y = 0 is its own left touchline.
import type { TeamId, Vec } from './types.ts';
import { clamp } from './vec.ts';

export const PITCH = { length: 105, width: 68 } as const;
/** Lane edges in metres from the attacking side's left touchline. */
export const LANE_EDGES: readonly number[] = [0, 13.84, 24.84, 43.16, 54.16, 68];
/** Band edges in metres from the own goal line. */
export const BAND_EDGES: readonly number[] = [0, 5.5, 16.5, 35, 52.5, 70, 88.5, 99.5, 105];
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
export const toAttack = (team: TeamId, p: Vec): Vec =>
  team === 0 ? [p[0], p[1]] : [PITCH.length - p[0], PITCH.width - p[1]];

/** Index of the slot `value` falls in: an inner edge belongs to the higher slot, the outer ends to the first and last. */
const slotOf = (edges: readonly number[], value: number): number => {
  let slot = 0;
  for (let i = 1; i < edges.length - 1; i++) if (value >= edges[i]) slot = i;
  return slot;
};

/** Lane 0-4 of an attack-frame y. */
export const laneOf = (y: number): number => slotOf(LANE_EDGES, y);

/** Band 0-7 of an attack-frame x. */
export const bandOf = (x: number): number => slotOf(BAND_EDGES, x);

/** Cell 0-39 of an attack-frame point: `band * 5 + lane`. */
export const cellOf = (pAttack: Vec): number => bandOf(pAttack[0]) * 5 + laneOf(pAttack[1]);

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
