import { describe, expect, it } from 'vitest';
import { bidKind } from './bids';

describe('the market bid list (→WEB-45, CLUB-33)', () => {
  it("marks the chief scout's bids apart from the owner's and from offers we received", () => {
    expect(bidKind({ direction: 'in' })).toBe('받은 제안');
    expect(bidKind({ direction: 'out' })).toBe('보낸 제안');
    expect(bidKind({ direction: 'out', staff: 'short' })).toBe('스태프 제안');
    expect(bidKind({ direction: 'out', staff: 'upgrade' })).toBe('스태프 제안');
  });
});
