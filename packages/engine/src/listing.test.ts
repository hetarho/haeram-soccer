import { describe, expect, it } from 'vitest';
import { COUNTRIES, currency } from '../../catalogs/src/index';
import { clubListings } from './listing';
import { clubValue, fromPounds, inPounds, tierFortune } from './club-value';
import { rating } from './world';
import { ownerlessWorld, withBooks } from './ownerless.testkit';

describe('the takeover list (→WEB-15)', () => {
  it('lists every professional club of the playable countries once, in its own money and pounds', () => {
    const w = ownerlessWorld();
    const listings = clubListings(w);
    const professional = COUNTRIES.reduce(
      (sum, c) => sum + c.groups.flat().reduce((a, b) => a + b, 0),
      0,
    );
    expect(listings).toHaveLength(professional);
    expect(new Set(listings.map((l) => l.clubId)).size).toBe(professional);
    for (const listing of listings) {
      const club = w.clubs.find((c) => c.id === listing.clubId)!;
      expect(club.representative).toBeUndefined();
      expect(listing).toMatchObject({
        name: club.name,
        country: club.country,
        division: club.tier,
        currency: currency(club.country, w.year).code,
        price: clubValue(w, club),
        pricePounds: inPounds(club.country, w.year, listing.price),
        strength: rating(w, club),
        affordable: false,
      });
    }
  });

  it('orders countries as the catalog does, then divisions, then the dearest first', () => {
    const listings = clubListings(ownerlessWorld());
    const order = (code: string) => COUNTRIES.findIndex((c) => c.code === code);
    for (let i = 1; i < listings.length; i++) {
      const [a, b] = [listings[i - 1]!, listings[i]!];
      const key = order(a.country) - order(b.country) || a.division - b.division;
      expect(key <= 0).toBe(true);
      if (key === 0) expect(BigInt(a.price) >= BigInt(b.price)).toBe(true);
    }
  });

  it('shows the books’ cash, debt and last season’s income and wage bill (→ECON-36)', () => {
    const w = ownerlessWorld();
    const club = w.clubs.find((c) => c.country === 'GER' && c.tier === 1)!;
    withBooks(w, club, { cash: '350000', debt: '125000', income: '900000', wages: '610000' });
    const listing = clubListings(w).find((l) => l.clubId === club.id)!;
    expect(listing).toMatchObject({
      cash: '350000',
      debt: '125000',
      lastIncome: '900000',
      lastWages: '610000',
    });
    const other = clubListings(w).find((l) => l.clubId !== club.id)!;
    expect(other).toMatchObject({ cash: '0', debt: '0', lastIncome: '0', lastWages: '0' });
  });

  it('marks what the chosen tier’s fortune pays, converted into each club’s money', () => {
    const w = ownerlessWorld();
    const oil = clubListings(w, 'oil');
    expect(oil.every((l) => l.affordable)).toBe(true);
    const cheapest = [...oil].sort((a, b) =>
      Number(BigInt(a.pricePounds) - BigInt(b.pricePounds)),
    )[0]!;
    expect(cheapest.affordable).toBe(true);
    expect(BigInt(cheapest.pricePounds)).toBeLessThanOrEqual(BigInt(tierFortune(w, 'oil')));
    const selfmade = clubListings(w, 'selfmade');
    const fortune = tierFortune(w, 'selfmade');
    expect(selfmade.some((l) => l.affordable)).toBe(true);
    expect(selfmade.some((l) => !l.affordable)).toBe(true);
    for (const l of selfmade)
      expect(l.affordable).toBe(BigInt(l.price) <= BigInt(fromPounds(l.country, w.year, fortune)));
  });
});
