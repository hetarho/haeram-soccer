/** Real-football reference tables for the 40 cells and the position profiles (→MATCH-23, MATCH-24). */
import type { Position } from '../../../contracts/src/player';
import data from './baselines.json';
import { cellKey } from './pitch';

export interface CellBaseline {
  share: number;
  pass: number;
  carry: number;
  takeOn: number;
  shot: number;
  clearance: number;
  crossOfPasses: number;
  passCompletion: number;
  forward: number;
  lateral: number;
  back: number;
  lostPer100: number;
  takeOnSuccess: number | null;
  goalPerShot: number | null;
  xgPerShot: number | null;
  shots: number;
  xT: number;
}

export type ProfileKey = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';

export interface PositionProfile {
  forward: number;
  lateral: number;
  back: number;
  passCompletion: number;
  longShare: number;
  crossShare: number;
  takeOnPerPass: number;
  takeOnSuccess: number;
  progressiveCarryPerPass: number;
  meanPassLengthYd: number;
}

const cells = data.cells as Record<string, CellBaseline>;

/** Index = `cellOf(point)`. */
export const CELL_BASELINES: readonly CellBaseline[] = Array.from(
  { length: 40 },
  (_, cell) => cells[cellKey(cell)]!,
);

export const POSITION_PROFILES = data.positionProfiles.rows as Record<ProfileKey, PositionProfile>;

/** Pass direction split of open play across all positions (MATCH-BASELINES §D). */
export const OVERALL_PROFILE = { forward: 0.355, lateral: 0.499, back: 0.145 } as const;

const PROFILE_OF: Record<Position, ProfileKey> = {
  GK: 'GK',
  CB: 'CB',
  LB: 'FB',
  RB: 'FB',
  LWB: 'FB',
  RWB: 'FB',
  DM: 'DM',
  CM: 'CM',
  LM: 'W',
  RM: 'W',
  AM: 'AM',
  LW: 'W',
  RW: 'W',
  ST: 'ST',
};

export function profileKey(position: Position): ProfileKey {
  return PROFILE_OF[position];
}
