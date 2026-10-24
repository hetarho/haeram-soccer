import type { Founding } from '../../contracts/src/types';
import { DISABLED_RELEASE, simulatedWorld } from '../../../tests/fixtures/worlds';

export const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Budget Athletic',
  color: '#335544',
  seed: 'finance',
  level: 'easy',
};

/** The finance club founded on the pre-feature path: money, not the match model, is the subject. */
export function world() {
  return simulatedWorld(FOUNDING, {}, DISABLED_RELEASE);
}
