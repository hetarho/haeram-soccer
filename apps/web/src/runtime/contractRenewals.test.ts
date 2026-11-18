import { describe, expect, it } from 'vitest';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { contractRenewalChance, contractTalks } from '../../../../packages/engine/src/contracts';
import { canonical } from '../../../../packages/contracts/src/index';
import { projectWorldFacts } from './worldProjection';
import { contractRenewalReads } from './contractRenewals';

describe('worker renewal chance reads', () => {
  it('preserves the actual legacy bid/stint calculation while excluding career registries', () => {
    const w = worldMarketFixture();
    w.calendar = { day: 0 };
    for (const p of w.players) p.until = w.year + 5;
    const p = w.players[0]!;
    p.until = w.year + 1;
    const bidder = w.clubs[1]!;
    bidder.reputation = 90;
    w.clubs[0]!.reputation = 20;
    p.joined = w.year - 1;
    w.bids = [
      {
        id: 'old-stint-bid',
        direction: 'in',
        playerId: p.id,
        club: bidder.id,
        year: w.year - 1,
        day: 170,
        fee: '1',
        due: 171,
        status: 'rejected',
      },
    ];
    w.playerRecords = {
      [p.id]: {
        moves: [{ year: w.year - 1, day: 180, from: bidder.id, to: w.playerClub, fee: '0' }],
      },
    };
    contractTalks(w);
    const before = canonical(w),
      actual = contractRenewalChance(w, p, p.talk!);
    const projected = projectWorldFacts(w);
    expect(projected).not.toHaveProperty('playerRecords');
    // A local recomputation would wrongly count an offer from his abandoned stint.
    expect(contractRenewalChance(projected, p, p.talk!).chance).toBeLessThan(actual.chance);
    const reads = contractRenewalReads(w);
    expect(reads).toEqual({ [p.id]: actual });
    expect(canonical(w)).toBe(before);
  });
});
