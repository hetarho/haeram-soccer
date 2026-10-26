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
