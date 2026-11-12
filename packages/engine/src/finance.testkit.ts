import type { CareerInput } from './career.testkit';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

export const CAREER: CareerInput = { country: 'ENG', seed: 'finance' };

/** The finance club taken over on the released model: money, not the match model, is the subject. */
export function world() {
  return simulatedWorld(CAREER);
}
