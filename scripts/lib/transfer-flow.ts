import type { Event } from '../../packages/contracts/src/types';

/**
 * Observable incoming moves, independent of the bounded bid list and positive-fee-only facts.
 * Zero-fee transfer events do not retain loan metadata; they are not a permanent-transfer count.
 * Pool top-ups are separate nonmonetary events and carry no currency.
 */
export function countZeroFeeArrivals(
  events: readonly Pick<Event, 'year' | 'kind' | 'amount' | 'currency'>[],
  year: number,
  currency: string,
) {
  let zeroFeeMoves = 0,
    topUps = 0;
  for (const event of events) {
    if (event.year !== year) continue;
    if (event.kind === 'transfer-in' && event.amount === '0' && event.currency === currency)
      zeroFeeMoves++;
    else if (
      event.kind === 'free-agent-signing' &&
      event.amount === undefined &&
      event.currency === undefined
    )
      topUps++;
  }
  return { zeroFeeMoves, topUps, total: zeroFeeMoves + topUps };
}
