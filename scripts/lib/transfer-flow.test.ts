import { describe, expect, it } from 'vitest';
import { countZeroFeeArrivals } from './transfer-flow';

describe('zero-fee arrival observations', () => {
  it('counts monetary zero-fee moves and nonmonetary pool top-ups separately, once each', () => {
    expect(
      countZeroFeeArrivals(
        [
          { year: 2025, kind: 'transfer-in', amount: '0', currency: 'GBP' },
          { year: 2025, kind: 'free-agent-signing' },
          { year: 2025, kind: 'transfer-in', amount: '200', currency: 'GBP' },
          { year: 2025, kind: 'transfer-out', amount: '0', currency: 'GBP' },
        ],
        2025,
        'GBP',
      ),
    ).toEqual({ zeroFeeMoves: 1, topUps: 1, total: 2 });
  });

  it('requires matching years and explicit currency for monetary zero-fee events', () => {
    const events = [
      { year: 2024, kind: 'transfer-in', amount: '0', currency: 'GBP' },
      { year: 2024, kind: 'free-agent-signing' },
      { year: 2025, kind: 'transfer-in', amount: '0', currency: 'EUR' },
      { year: 2025, kind: 'transfer-in', amount: '0' },
      { year: 2025, kind: 'free-agent-signing', amount: '0', currency: 'GBP' },
      { year: 2025, kind: 'free-agent-signing' },
    ];
    expect(countZeroFeeArrivals(events, 2025, 'GBP')).toEqual({
      zeroFeeMoves: 0,
      topUps: 1,
      total: 1,
    });
    expect(countZeroFeeArrivals(events, 2025, 'EUR')).toEqual({
      zeroFeeMoves: 1,
      topUps: 1,
      total: 2,
    });
  });

  it('keeps more moves than the retained bid-history limit without needing any bid records', () => {
    const events = Array.from({ length: 75 }, () => ({
      year: 2025,
      kind: 'transfer-in',
      amount: '0',
      currency: 'GBP',
    }));
    expect(countZeroFeeArrivals(events, 2025, 'GBP')).toEqual({
      zeroFeeMoves: 75,
      topUps: 0,
      total: 75,
    });
    expect(countZeroFeeArrivals([], 2025, 'GBP')).toEqual({ zeroFeeMoves: 0, topUps: 0, total: 0 });
  });
});
