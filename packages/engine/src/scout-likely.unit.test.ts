import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { canonical } from '../../contracts/src/index';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { basicStaff } from './staff';
import { SCOUT_LIST, transferOffers } from './scout-search';
import { termsChance, termsContext } from './personal-terms';
import { worldMarketPage } from './world-market';

function fixture(tier = 2) {
  const w = worldMarketFixture();
  const [own, top, second] = w.clubs;
  own!.tier = tier;
  own!.reputation = tier === 0 ? 99 : 20;
  top!.country = second!.country = 'ENG';
  top!.reputation = 90;
  second!.tier = 1;
  second!.reputation = 25;
  w.squads = {};
  w.staff = basicStaff(w).map((s) =>
    s.role === 'scout' ? { ...s, ability: 85, trait: undefined } : s,
  );
  const stars = marketCandidate(w, top!, 'CM', 25);
  const willing = marketCandidate(w, second!, 'CM', 25);
  for (const [p, level] of [
    [stars, 75],
    [willing, 70],
  ] as const) {
    for (const a of ATTRIBUTES) p.attrs[a] = level;
    p.potential = level;
    p.personality.ambition = 5;
  }
  const chance = (id: string, clubId: string) =>
    termsChance(termsContext(w, { playerId: id, clubId, step: 1 })!).chance;
  return { w, stars, willing, chance, top: top!, second: second! };
}

describe('likely takers in the chief scout list (→CLUB-51)', () => {
  it('lists a willing second-tier player before a stronger top-flight player who would refuse', () => {
    const { w, stars, willing, chance, top, second } = fixture();
    expect(chance(stars.id, top.id)).toBeLessThan(SCOUT_LIST.likelyChance);
    expect(chance(willing.id, second.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    const before = canonical(w);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([willing.id, stars.id]);
    expect(canonical(w)).toBe(before);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([willing.id, stars.id]);
  });

  it('retains the sporting order for a top-flight club when both players would come', () => {
    const { w, stars, willing, chance, top, second } = fixture(0);
    expect(chance(stars.id, top.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    expect(chance(willing.id, second.id)).toBeGreaterThanOrEqual(SCOUT_LIST.likelyChance);
    expect(transferOffers(w).map((o) => o.player.id)).toEqual([stars.id, willing.id]);
  });

  it('keeps the owner’s world-market search unfiltered and ordered by its requested measure', () => {
    const { w, stars, willing } = fixture();
    transferOffers(w);
    const page = worldMarketPage(w, {
      world: w.id,
      line: 'MF',
      sort: 'ovr',
      direction: 'desc',
      page: 0,
      pageSize: 50,
    });
    expect(page.items.filter((o) => !o.own).map((o) => o.player.id)).toEqual([
      stars.id,
      willing.id,
    ]);
  });
});
