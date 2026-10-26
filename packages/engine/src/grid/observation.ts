import type { PlayerMotionState } from '../../../contracts/src/types';

/** Motion states by the index a trace entry stores them under. */
export const MOTION_STATES = [
  'shape',
  'support',
  'run',
  'press',
  'mark',
  'recover',
  'carry',
  'keeper',
] as const satisfies readonly PlayerMotionState[];

export const OBSERVATION_STATES = { recover: 15, support: 20, mark: 5 } as const;

/**
 * Candidate traces (→MATCH-12): match seconds at least between drawn player samples, and the speed
 * (metres per match second) below which every player of a restart's walk-in counts as standing on
 * his place (T477), so dead time draws them hurrying there and then waiting.
 */
export const SAMPLING = { spacing: 2, settle: 0.2 } as const;
