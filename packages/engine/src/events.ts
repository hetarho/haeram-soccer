import type { World } from '../../contracts/src/types';

export function addEvent(
  w: Pick<World, 'events' | 'year' | 'round' | 'currency'>,
  kind: string,
  title: string,
  detail: string,
  amount?: string,
) {
  w.events.push({
    year: w.year,
    round: w.round,
    kind,
    title,
    detail,
    ...(amount ? { amount, currency: w.currency } : {}),
  });
}
