import { describe, expect, it } from 'vitest';
import type { TransferBid } from '../../../../packages/contracts/src/types';
import { BID_LIST_LIMIT, bidKind, freeSigning, visibleBids } from './bids';

const row = (id: string, status: TransferBid['status']) => ({ bid: { id, status } });
/** A board as bidBoard orders it: open bids first, then closed ones. */
const board = (open: number, closed: number) => [
  ...Array.from({ length: open }, (_, i) => row(`open-${i}`, i % 2 ? 'countered' : 'pending')),
  ...Array.from({ length: closed }, (_, i) =>
    row(`closed-${i}`, (['accepted', 'rejected', 'expired', 'completed'] as const)[i % 4]),
  ),
];
const ids = (rows: { bid: { id: string } }[]) => rows.map((r) => r.bid.id);

describe('the market bid list (→WEB-45, CLUB-33)', () => {
  it("marks the 단장's bids apart from the owner's and from offers we received", () => {
    expect(bidKind({ direction: 'in', fee: '500' })).toBe('받은 제안');
    expect(bidKind({ direction: 'out', fee: '500' })).toBe('보낸 제안');
    expect(bidKind({ direction: 'out', staff: 'short', fee: '500' })).toBe('단장 제안');
    expect(bidKind({ direction: 'out', staff: 'upgrade', fee: '500' })).toBe('단장 제안');
  });
  it("lists the 단장's free-agent signing as a signing, never an offer of 0", () => {
    expect(bidKind({ direction: 'out', staff: 'short', fee: '0' })).toBe('단장 영입');
    expect(freeSigning({ direction: 'out', fee: '0' })).toBe(true);
    expect(freeSigning({ direction: 'out', fee: '1' })).toBe(false);
  });
});

describe('the 이적 협상 rows on show', () => {
  it('keeps every open bid past the limit', () => {
    const rows = board(12, 5);
    expect(BID_LIST_LIMIT).toBe(8);
    expect(ids(visibleBids(rows, false))).toEqual(ids(rows.slice(0, 12)));
  });
  it('fills to the limit with closed bids', () => {
    const rows = board(3, 10),
      shown = visibleBids(rows, false);
    expect(shown).toHaveLength(8);
    expect(ids(shown)).toEqual(ids(rows.slice(0, 8)));
  });
  it('expanded returns the whole board', () => {
    const rows = board(3, 10);
    expect(ids(visibleBids(rows, true))).toEqual(ids(rows));
    expect(ids(visibleBids(board(12, 5), true))).toHaveLength(17);
  });
  it("keeps the board's order", () => {
    const rows = [
      row('c', 'countered'),
      row('a', 'pending'),
      row('b', 'countered'),
      row('z', 'expired'),
      row('y', 'accepted'),
    ];
    expect(ids(visibleBids(rows, false))).toEqual(['c', 'a', 'b', 'z', 'y']);
    expect(ids(visibleBids(board(2, 0), false))).toEqual(['open-0', 'open-1']);
  });
});
