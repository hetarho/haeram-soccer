import type { World } from '../../contracts/src/types';
import { ratio } from './primitives';

/** Current-season result excluding the owner's transfers; no simulation or settlement imports. */
export function seasonResult(w: World): string {
  let owner = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const event = w.events[i];
    if (event.year < w.year) break;
    if (event.year !== w.year || event.currency !== w.currency || !event.amount) continue;
    if (event.kind === 'owner-injection') owner -= BigInt(event.amount);
    else if (event.kind === 'owner-dividend') owner += BigInt(event.amount);
  }
  return (BigInt(w.income) - BigInt(w.expense) + owner).toString();
}

/** One exact share of an annual amount, retaining the remainder across round boundaries. */
export function roundShare(annual: string, round: number, count = 46) {
  if (round <= 0 || count <= 0) return '0';
  return (
    BigInt(ratio(annual, BigInt(round), BigInt(count))) -
    BigInt(ratio(annual, BigInt(round - 1), BigInt(count)))
  ).toString();
}
