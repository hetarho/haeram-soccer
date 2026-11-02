/**
 * The takeover list (→WEB-15): every club of the playable countries with its price (→ECON-37) in
 * its own money and in pounds (→ECON-35), its cash and debt, last season's income and wage bill
 * (→ECON-36), its squad's strength and whether the chosen tier's fortune pays for it (→OWNER-3).
 */
import { COUNTRIES, currency } from '../../catalogs/src/index';
import type { Club, ClubListing, WealthTier, World } from '../../contracts/src/types';
import { fromPounds, pricedClubs, tierFortune, type PricedClub } from './club-value';
import { rating } from './world';

/** Last season's book: the newest closed season the books keep (→ECON-36). */
function lastSeason(w: World, club: Club) {
  return club.books?.seasons.find((season) => season.year < w.year);
}

/**
 * Whether a fortune in pounds pays a price, both in the club's money this season: the takeover
 * converts the fortune into the bought club's currency before the price leaves it (→OWNER-3).
 */
export function pays(w: World, priced: PricedClub, fortunePounds: string) {
  return BigInt(priced.price) <= BigInt(fromPounds(priced.club.country, w.year, fortunePounds));
}

/**
 * Every club for sale, by country, then division, then price, dearest first. With a tier each
 * reads whether its fortune pays the price; without one, none is marked affordable.
 */
export function clubListings(w: World, tier?: WealthTier): ClubListing[] {
  const priced = pricedClubs(w),
    fortune = tier === undefined ? undefined : tierFortune(w, tier, priced);
  const order = (code: string) => COUNTRIES.findIndex((c) => c.code === code);
  return [...priced]
    .sort(
      (a, b) =>
        order(a.club.country) - order(b.club.country) ||
        a.club.tier - b.club.tier ||
        (BigInt(b.price) > BigInt(a.price) ? 1 : BigInt(b.price) < BigInt(a.price) ? -1 : 0) ||
        (a.club.id < b.club.id ? -1 : 1),
    )
    .map((entry) => {
      const { club } = entry,
        last = lastSeason(w, club);
      return {
        clubId: club.id,
        name: club.name,
        country: club.country as ClubListing['country'],
        division: club.tier,
        currency: currency(club.country, w.year).code,
        price: entry.price,
        pricePounds: entry.pricePounds,
        cash: club.books?.cash ?? '0',
        debt: club.books?.debt ?? '0',
        lastIncome: last?.income ?? '0',
        lastWages: last?.wages ?? '0',
        strength: rating(w, club),
        affordable: fortune !== undefined && pays(w, entry, fortune),
      };
    });
}
