import type { CareerInput } from './career.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

export const CAREER: CareerInput = { country: 'ENG', seed: 'finance' };

/** The finance club taken over on the pre-feature path: money, not the match model, is the subject. */
export function world() {
  return simulatedWorld(CAREER, {}, DISABLED_RELEASE);
}
