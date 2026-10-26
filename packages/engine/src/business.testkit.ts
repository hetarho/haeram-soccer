import type { World } from '../../contracts/src/types';
import { legacySettings } from './responsibilities';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

/** The business club on the pre-feature path: the business, not the match model, is the subject. */
export function world(country: 'ENG' | 'BEL' = 'ENG', seed = 'business') {
  const w = simulatedWorld(
    {
      country,
      name: 'Ledger Town',
      color: '#335544',
      seed,
      level: 'easy' as const,
    },
    {},
    DISABLED_RELEASE,
  );
  w.settings = legacySettings(2);
  return w;
}
export const finance = (w: World) => (w.inbox || []).filter((item) => item.kind === 'finance');
