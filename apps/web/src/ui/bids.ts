import type { TransferBid } from '../../../../packages/contracts/src/types';

/** A free agent the 단장 signed, kept as a completed bid with no fee: a signing, never an offer. */
export const freeSigning = (bid: Pick<TransferBid, 'direction' | 'fee'>) =>
  bid.direction === 'out' && BigInt(bid.fee) === 0n;
/**
 * How a bid reads in the market's list (→WEB-45, →CLUB-33): an offer for our player, the owner's
 * own bid, or one the 단장 placed at level 4, which he answers himself, or his free signing.
 */
export function bidKind(bid: Pick<TransferBid, 'direction' | 'staff' | 'fee'>) {
  if (bid.direction === 'in') return '받은 제안';
  if (freeSigning(bid)) return bid.staff ? '단장 영입' : '영입';
  return bid.staff ? '단장 제안' : '보낸 제안';
}
