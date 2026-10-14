import type { TransferBid } from '../../../../packages/contracts/src/types';

/**
 * How a bid reads in the market's list (→WEB-45, →CLUB-33): an offer for our player, the owner's
 * own bid, or one the chief scout placed at level 4, which the staff answer themselves.
 */
export function bidKind(bid: Pick<TransferBid, 'direction' | 'staff'>) {
  if (bid.direction === 'in') return '받은 제안';
  return bid.staff ? '스태프 제안' : '보낸 제안';
}
