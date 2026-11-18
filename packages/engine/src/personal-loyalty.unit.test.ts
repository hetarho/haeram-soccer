import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import {
  termsChance,
  termsContext,
  npcTermsContext,
  resolvedTermsContext,
  termsSearchContext,
} from './personal-terms';
import { loyaltyTerm } from './loyalty';
import { bidOutlook } from './transfers';
import { reachOffers } from './scout-search';
import { clubTerms } from './world-market';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';

function fixture() {
  const w = worldMarketFixture(),
    seller = w.clubs[1]!,
    buyer = w.clubs[2]!;
  seller.country = buyer.country = 'ENG';
  w.squads = {};
  const p = marketCandidate(w, seller, 'CM', 25);
  p.joined = w.year - 10;
  p.graduate = true;
  p.personality.loyalty = 5;
  return { w, seller, buyer, p };
}

describe('loyalty against leaving in shared personal terms (→CLUB-53/54)', () => {
  it('greatly reduces a long-serving graduate’s chance and includes the row at every bid-view wage step', () => {
    const { w, seller, p } = fixture();
    const before = canonical(w),
      loyal = termsContext(w, { playerId: p.id, clubId: seller.id, step: 1 })!;
    expect(loyal.loyalty).toBe(4);
    const target = { world: w.id, kind: 'club' as const, clubId: seller.id, playerId: p.id };
    const view = bidOutlook(w, target, '1');
    for (const step of view.terms!.steps) {
      const read = termsChance({ ...loyal, offer: step.wage });
      expect(step.chance).toBe(read.chance);
      expect(step.lines.find((l) => l.factor === 'loyalty')).toMatchObject({
        delta: -4,
        message: 'market.terms.loyalty',
      });
    }
    expect(canonical(w)).toBe(before);
    p.joined = w.year;
    delete p.graduate;
    p.personality.loyalty = 1;
    const newcomer = termsContext(w, { playerId: p.id, clubId: seller.id, step: 1 })!;
    expect(newcomer.loyalty).toBe(0);
    expect(termsChance(loyal).chance).toBeLessThan(termsChance(newcomer).chance / 4);
    expect(termsChance(newcomer).lines.some((l) => l.factor === 'loyalty')).toBe(false);
  });

  it('uses the seller’s academy fact when the buyer’s registration quote has cleared it', () => {
    const { w, seller, buyer, p } = fixture();
    const quoted = clubTerms(w, seller, p);
    expect(quoted.player.graduate).toBeUndefined();
    expect(loyaltyTerm(quoted.player, w.year)).toBe(3);
    const source = termsContext(w, { playerId: p.id, clubId: seller.id, step: 1 })!;
    const offer = reachOffers(w).find((one) => one.player.id === p.id)!;
    expect(
      resolvedTermsContext(w, { player: p, club: seller, offer, step: 1 }, termsSearchContext(w)),
    ).toEqual(source);
    const npc = npcTermsContext(w, {
      buyer,
      seller,
      player: p,
      wage: quoted.player.wage,
      wouldStart: source.wouldStart,
      startsNow: source.startsNow,
    });
    expect(source.loyalty).toBe(4);
    expect(npc.loyalty).toBe(source.loyalty);
    expect(termsChance(npc).lines.find((l) => l.factor === 'loyalty')!.delta).toBe(-4);
  });

  it('does not count a past academy at the buyer as loyalty to a different current seller', () => {
    const { w, seller, p } = fixture();
    delete p.graduate;
    w.players.push({ ...p, status: 'sold', graduate: true });
    expect(clubTerms(w, seller, p).player.graduate).toBe(true);
    expect(termsContext(w, { playerId: p.id, clubId: seller.id, step: 1 })!.loyalty).toBe(3);
  });

  it('gives free agents no club loyalty despite retained tenure and origin', () => {
    const { w, p } = fixture();
    w.freeAgents = [{ ...p, freeSince: w.year }];
    w.squads = {};
    const free = termsContext(w, { playerId: p.id, step: 1 })!;
    expect(free.freeAgent).toBe(true);
    expect(free.loyalty).toBe(0);
    expect(termsChance(free).lines.some((l) => l.factor === 'loyalty')).toBe(false);
  });
});
