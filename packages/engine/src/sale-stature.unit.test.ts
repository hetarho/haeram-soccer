import { describe, expect, it } from 'vitest';
import { country } from '../../catalogs/src/index';
import { message } from '../../contracts/src/messages';
import type { SaleContext } from './sale-answer';
import { npcSaleContext, saleAnswer, saleContext, saleShare } from './sale-answer';
import { bidOutlook } from './transfers';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { stature } from './world';

const neutral: SaleContext = {
  fee: '800000',
  asking: '1000000',
  ownSeller: false,
  place: 'starter',
  stature: 0,
  contractSeasons: 3,
  age: 26,
  prospect: false,
  cashCrisis: false,
  runway: 999,
  sellingDown: false,
  stance: 'open',
  transferRequest: false,
  unhappy: false,
};

describe('seller stature in the shared answer (→CLUB-52)', () => {
  it.each([
    [9, 0.1],
    [4, 0.05],
    [1, 0],
    [-3, -0.05],
  ] as const)(
    'adds the stature %s row alone, preserving every other factor and the draw',
    (size, delta) => {
      const context = { ...neutral, stature: size };
      const baseline = saleShare(neutral),
        current = saleShare(context);
      expect(current.base).toBeCloseTo(baseline.base + delta, 10);
      expect(current.lines.filter((l) => l.factor !== 'stature')).toEqual(baseline.lines);
      const row = current.lines.find((l) => l.factor === 'stature');
      if (delta) {
        expect(row!.delta).toBe(delta);
        expect(message(row!.message, row!.params)).not.toMatch(/\{/);
      } else expect(row).toBeUndefined();
      for (const draw of [0, 0.25, 0.5, 0.75, 0.999])
        expect(saleAnswer(context, draw).spread).toBe(saleAnswer(neutral, draw).spread);
    },
  );

  it('holds out for more at a giant than a small club on the same bid and draw', () => {
    for (const draw of [0, 0.5, 0.999])
      expect(BigInt(saleAnswer({ ...neutral, stature: 13 }, draw).reservation)).toBeGreaterThan(
        BigInt(saleAnswer({ ...neutral, stature: -5 }, draw).reservation),
      );
  });

  it('reads the real seller’s stable stature for owner, delegated sale and NPC contexts and bid reports', () => {
    const w = worldMarketFixture(),
      seller = w.clubs[1]!,
      buyer = w.clubs[2]!;
    seller.id = country('ENG')
      .groups.flatMap((groups, tier) =>
        groups.flatMap((count, group) =>
          Array.from({ length: count }, (_, index) => `ENG:${tier}:${group}:${index}`),
        ),
      )
      .find((id) => stature(w.seed, id) >= 9)!;
    seller.country = 'ENG';
    w.squads = {};
    const p = marketCandidate(w, seller, 'CM');
    const own = saleContext(w, { playerId: w.players[0]!.id, sellerId: w.playerClub, fee: '1' })!;
    const buying = saleContext(w, { playerId: p.id, sellerId: seller.id, fee: '1' })!;
    const npc = npcSaleContext(w, {
      seller,
      buyer,
      player: p,
      fee: '1',
      asking: buying.asking,
      sellingDown: false,
    });
    expect(own.stature).toBe(stature(w.seed, w.playerClub));
    expect(buying.stature).toBe(stature(w.seed, seller.id));
    expect(npc.stature).toBe(buying.stature);
    expect(saleShare(buying).lines.find((l) => l.factor === 'stature')).toBeDefined();
    const target = { world: w.id, kind: 'club' as const, clubId: seller.id, playerId: p.id };
    expect(bidOutlook(w, target, '1').lines.find((l) => l.factor === 'stature')).toEqual(
      saleShare(buying).lines.find((l) => l.factor === 'stature'),
    );
  });
});
