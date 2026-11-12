import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  PlayerMotion,
  PlayerMotionState,
} from '../../../../../../packages/contracts/src/types';

/**
 * What the player sheet opened from the pitch says a player is doing (→WEB-50): his staged motion
 * state alone. The staging is presentation (→MATCH-39) and holds no intention, so the sheet reads
 * nothing beyond the state; every state has its label.
 */
export const MOTION_STATE_LABELS: Readonly<Record<PlayerMotionState, string>> = {
  shape: sourceMessage('copy.Pitch.c8b026ca9e'),
  support: sourceMessage('copy.Pitch.d0fdc8c1b3'),
  run: sourceMessage('copy.Pitch.b66ab772e3'),
  press: sourceMessage('copy.Pitch.75e147f54f'),
  mark: sourceMessage('copy.Pitch.dd4d63cca3'),
  recover: sourceMessage('copy.Pitch.4cdbdae8b5'),
  carry: sourceMessage('copy.Pitch.0c24193053'),
  keeper: sourceMessage('copy.Pitch.abcf2c81c5'),
};

export const motionStateLabel = ({ state }: Pick<PlayerMotion, 'state'>) =>
  MOTION_STATE_LABELS[state];
