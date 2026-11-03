import type { World } from '../../contracts/src/types';
import { staffAuthority } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/** The business club on the pre-feature path: the business, not the match model, is the subject. */
export function world(country: 'ENG' | 'BEL' = 'ENG', seed = 'business') {
  const w = simulatedWorld({ country, seed }, {}, DISABLED_RELEASE);
  w.settings = staffAuthority(2);
  return w;
}
export const finance = (w: World) => (w.inbox || []).filter((item) => item.kind === 'finance');
