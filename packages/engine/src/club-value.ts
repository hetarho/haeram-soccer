/**
 * A club's value, the price it is bought at (→ECON-37), and the wealth tiers sized on it
 * (→OWNER-3): each tier's anchor is the median pound price of the clubs in its reach, and its
 * starting fortune a multiple of that anchor. Pounds are the money every playable country's
 * amounts convert into at ECON-35's rates.
 */
import { COUNTRIES, country } from '../../catalogs/src/index';
import type { Club, WealthTier, World } from '../../contracts/src/types';
import { CLUB_TAKEOVER, CLUB_VALUE, OWNER_TIERS } from './owner-config';
import { squad, stature } from './world';
import { marketValueAt } from './market-prices';
import { facilityBuiltUnits, MAX_LEVEL, STADIUM_STEPS } from './facility-model';
import { footballQuote, quote } from './quotes';
import { leagueDistributionAt } from './finance';
import { fanFollowing } from './fans';
import { clamp, compareIds, ratio, scaleBy } from './primitives';

/** The facility parts a club stands at (→ECON-32). */
export type FacilityStage = Pick<World, 'stadium' | 'trainingGround' | 'academyFacility'>;

/**
 * Where a club's facilities stand. The owner's club holds its own; a club nobody owns stands where
 * its division and stature set (→CLUB-1): `CLUB_TAKEOVER.facilities` by division (the last entry for
 * every division below), giants and big clubs higher and small clubs lower, within each ladder.
 */
export function facilityStage(w: World, club: Club): FacilityStage {
  if (club.id === w.playerClub)
    return {
      stadium: w.stadium,
      trainingGround: w.trainingGround,
      academyFacility: w.academyFacility,
    };
  const { division, stature: sizes } = CLUB_TAKEOVER.facilities;
  const base = division[Math.min(club.tier, division.length - 1)]!,
    size = stature(w.seed, club.id);
  const shift =
    size >= sizes.giant.from
      ? sizes.giant
      : size >= sizes.big.from
        ? sizes.big
        : size <= sizes.small.to
          ? sizes.small
          : { stadium: 0, levels: 0 };
  return {
    stadium: clamp(base.stadium + shift.stadium, 0, STADIUM_STEPS.length - 1),
    trainingGround: clamp(base.training + shift.levels, 0, MAX_LEVEL),
    academyFacility: clamp(base.academy + shift.levels, 0, MAX_LEVEL),
  };
}

/**
 * A club's following (→ECON-23): the owner's club's supporters, or for a club nobody owns the
 * following its reputation commands, which is what a buyer takes over (→CLUB-1).
 */
export function clubFollowing(w: World, club: Club) {
  return club.id === w.playerClub ? club.fans : fanFollowing(club.reputation);
}

/**
 * One season of the same minimum central package the division's clubs receive (→ECON-28), in
 * the country's money of `year`, including the canonical normalization after broadcast pricing.
 */
export function divisionDistribution(code: string, year: number, tier: number) {
  return leagueDistributionAt(code, year, tier);
}

/** A club's cash less its debt: the owner's club's own, a club nobody owns's books (→ECON-36). */
function balance(w: World, club: Club) {
  if (club.id === w.playerClub) return BigInt(w.cash) - BigInt(w.loan?.balance ?? '0');
  return club.books ? BigInt(club.books.cash) - BigInt(club.books.debt) : 0n;
}

/**
 * A club's value, its price (→ECON-37), in its country's money this season: its players' transfer
 * values (→CLUB-46), its facilities at their stage costs on the football index (→ECON-32), its
 * following at `CLUB_VALUE.following` price units per supporter, its league place at
 * `CLUB_VALUE.placeSeasons` seasons of its division's distribution, plus its cash, less its debt;
 * never below `CLUB_VALUE.floor` seasons of that distribution. A club without books counts no cash
 * and no debt.
 */
export function clubValue(w: World, club: Club): string {
  const code = club.country,
    year = w.year;
  const players = squad(w, club).reduce(
    (sum, p) => sum + BigInt(marketValueAt(code, year, club.tier, p)),
    0n,
  );
  const facilities = BigInt(footballQuote(code, year, facilityBuiltUnits(facilityStage(w, club))));
  const following = BigInt(quote(code, year, clubFollowing(w, club) * CLUB_VALUE.following));
  const share = divisionDistribution(code, year, club.tier);
  const place = BigInt(scaleBy(share, CLUB_VALUE.placeSeasons, 1000n));
  const floor = BigInt(scaleBy(share, CLUB_VALUE.floor, 1000n));
  const total = players + facilities + following + place + balance(w, club);
  return (total > floor ? total : floor).toString();
}

/** Quote units whose two countries' amounts set the rate between them, large enough to be exact. */
const RATE_UNITS = 1_000_000;
/**
 * An amount in `code`'s money of `year` in pounds of that year (→ECON-35): every country's money
 * stands against the pound as its quotes of the same price units do.
 */
export function inPounds(code: string, year: number, amount: string) {
  if (code === 'ENG') return amount;
  return ratio(
    amount,
    BigInt(quote('ENG', year, RATE_UNITS)),
    BigInt(quote(code, year, RATE_UNITS)),
  );
}
/** Pounds of `year` in `code`'s money of that year (→ECON-35), the inverse of `inPounds`. */
export function fromPounds(code: string, year: number, pounds: string) {
  if (code === 'ENG') return pounds;
  return ratio(
    pounds,
    BigInt(quote(code, year, RATE_UNITS)),
    BigInt(quote('ENG', year, RATE_UNITS)),
  );
}

/**
 * The clubs a buyer can take over (→WORLD-5, WEB-15): every professional club of the playable
 * countries that is not the owner's.
 */
export function clubsForSale(w: World): Club[] {
  return w.clubs.filter(
    (c) =>
      !c.representative &&
      c.id !== w.playerClub &&
      COUNTRIES.some((p) => p.code === c.country) &&
      c.tier < country(c.country).groups.length,
  );
}

/** A club for sale with its price in its own money and in pounds. */
export interface PricedClub {
  club: Club;
  price: string;
  pricePounds: string;
}
/** Every club for sale, priced (→ECON-37, ECON-35). */
export function pricedClubs(w: World): PricedClub[] {
  return clubsForSale(w).map((club) => {
    const price = clubValue(w, club);
    return { club, price, pricePounds: inPounds(club.country, w.year, price) };
  });
}
/**
 * The priced clubs in a tier's price-rank band, dearest first (→OWNER-3). Rank shares start at
 * zero; an edge belongs to the band starting there. Equal prices use stable club IDs.
 */
export function reachOf(w: World, tier: WealthTier, priced = pricedClubs(w)): PricedClub[] {
  const [from, to] = OWNER_TIERS[tier].band;
  return [...priced]
    .sort((a, b) => {
      const x = BigInt(a.pricePounds),
        y = BigInt(b.pricePounds);
      return (x > y ? -1 : x < y ? 1 : 0) || compareIds(a.club.id, b.club.id);
    })
    .filter((_, rank) => rank / priced.length >= from && rank / priced.length < to);
}
/**
 * A tier's anchor (→OWNER-3): the median pound price, this season, of the clubs in its reach across
 * the playable countries (the mean of the middle two for an even count); 0 when it reaches none.
 */
export function tierAnchor(w: World, tier: WealthTier, priced = pricedClubs(w)): string {
  const prices = reachOf(w, tier, priced)
    .map(({ pricePounds }) => BigInt(pricePounds))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!prices.length) return '0';
  const middle = prices.length >> 1;
  return (
    prices.length % 2 ? prices[middle]! : (prices[middle - 1]! + prices[middle]!) / 2n
  ).toString();
}
/** A tier's starting fortune in pounds (→OWNER-3): its anchor × the tier's `OWNER_TIERS` multiple. */
export function tierFortune(w: World, tier: WealthTier, priced = pricedClubs(w)): string {
  return scaleBy(tierAnchor(w, tier, priced), OWNER_TIERS[tier].multiple, 1000n);
}
