import { describe, expect, it } from 'vitest';
import { bidKind, freeSigning } from './bids';

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
