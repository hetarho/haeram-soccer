import type { TransferBid } from '../../../../packages/contracts/src/types';

/**
 * How a bid reads in the market's list (→WEB-45, →CLUB-33): an offer for our player, the owner's
 * own bid, or one the 단장 placed at level 4, which he answers himself.
 */
export function bidKind(bid: Pick<TransferBid, 'direction' | 'staff'>) {
  if (bid.direction === 'in') return '받은 제안';
  return bid.staff ? '단장 제안' : '보낸 제안';
}
