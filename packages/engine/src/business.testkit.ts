import type { World } from '../../contracts/src/types';
import { legacySettings } from './responsibilities';
import { simulatedWorld } from '../../../tests/fixtures/worlds';

export function world(country: 'ENG' | 'BEL' = 'ENG', seed = 'business') {
  const w = simulatedWorld({
    country,
    name: 'Ledger Town',
    color: '#335544',
    seed,
    level: 'easy' as const,
  });
  w.settings = legacySettings(2);
  return w;
}
export const finance = (w: World) => (w.inbox || []).filter((item) => item.kind === 'finance');
