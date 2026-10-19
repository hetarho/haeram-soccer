import type { TransferBid } from '../../../../packages/contracts/src/types';
import type { bidBoard } from '../../../../packages/engine/src/transfers';

/** A row of the market's bid list, as the engine orders it: open bids first, newest first. */
type BidRow = ReturnType<typeof bidBoard>[number];

/** Rows the 이적 협상 list shows before 모두 보기; open bids are never cut. */
export const BID_LIST_LIMIT = 8;

const isOpen = (row: { bid: Pick<BidRow['bid'], 'status'> }) =>
  row.bid.status === 'pending' || row.bid.status === 'countered';

/**
 * The 이적 협상 rows on show (→WEB-45): every open bid, so none the owner can still answer is
 * hidden, in the board's order, then closed bids up to `BID_LIST_LIMIT` rows; expanded, the
 * whole board.
 */
export function visibleBids<Row extends { bid: Pick<BidRow['bid'], 'status'> }>(
  board: readonly Row[],
  expanded: boolean,
): Row[] {
  if (expanded) return [...board];
  const open = board.filter(isOpen),
    room = Math.max(0, BID_LIST_LIMIT - open.length);
  return [...open, ...board.filter((row) => !isOpen(row)).slice(0, room)];
}

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
