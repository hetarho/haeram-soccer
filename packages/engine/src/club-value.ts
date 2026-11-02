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
import { broadcastQuote, footballQuote, quote } from './quotes';
import { DISTRIBUTION_CONFIG } from './finance';
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
 * One season of a division's distribution (→ECON-28): the equal share every club of it earns, in
 * the country's money of `year` on the broadcasting index (→ECON-31).
 */
export function divisionDistribution(code: string, year: number, tier: number) {
  const table = DISTRIBUTION_CONFIG.share[code] ?? DISTRIBUTION_CONFIG.share.ENG;
  return broadcastQuote(code, year, table[Math.min(tier, table.length - 1)]!);
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

/**
 * Each professional club's place in its division (its group, 1 first), the order the reach bands
 * read (→OWNER-3): last season's finish when the world archived that season, clubs that came down
 * from the division above first and those that came up last; else, as in a world's first season,
 * its strength.
 */
export function divisionPlaces(w: World): Map<string, number> {
  const last = w.history.at(-1);
  const finish = new Map<string, [tier: number, rank: number]>();
  if (last && last.year === w.year - 1) {
    const groups = new Map<string, number[][]>();
    for (const row of last.standings) {
      const key = `${w.clubs[row[0]]?.country}:${row[1]}:${row[2]}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const rows of groups.values())
      [...rows]
        .sort(
          (a, b) =>
            b[3]! - a[3]! ||
            b[4]! - b[5]! - (a[4]! - a[5]!) ||
            b[4]! - a[4]! ||
            compareIds(w.clubs[a[0]!]?.id ?? '', w.clubs[b[0]!]?.id ?? ''),
        )
        .forEach((row, rank) => {
          const club = w.clubs[row[0]!];
          if (club) finish.set(club.id, [row[1]!, rank + 1]);
        });
  }
  const divisions = new Map<string, Club[]>();
  for (const club of clubsForSale(w)) {
    const key = `${club.country}:${club.tier}:${club.group}`;
    divisions.set(key, [...(divisions.get(key) ?? []), club]);
  }
  const places = new Map<string, number>();
  const unknown: [number, number] = [Infinity, Infinity];
  for (const clubs of divisions.values())
    [...clubs]
      .sort((a, b) => {
        const [ta, ra] = finish.get(a.id) ?? unknown,
          [tb, rb] = finish.get(b.id) ?? unknown;
        return ta - tb || ra - rb || b.strength - a.strength || compareIds(a.id, b.id);
      })
      .forEach((club, i) => places.set(club.id, i + 1));
  return places;
}

/**
 * One rule of a tier's reach: clubs from division `from` (0 the top flight) down to `to`, at
 * places `first`–`last` in their division's order; `lowest` keeps only a country's lowest
 * professional division, and `lowest: false` leaves it out.
 */
export interface ReachRule {
  from: number;
  to?: number;
  first?: number;
  last?: number;
  lowest?: boolean;
}
/**
 * The clubs each wealth tier reaches (→OWNER-3), whose median price is its anchor: the top flight's
 * places 1–5 and 6–12; its places from 13 with the second tier's 1–6; the rest of the second tier
 * with the third; the lower professional tiers, from the third down but a country's lowest; and
 * each country's lowest professional tier. A club may lie in two reaches.
 */
export const REACH_BANDS: Record<WealthTier, readonly ReachRule[]> = {
  oil: [{ from: 0, to: 0, first: 1, last: 5 }],
  chaebol: [{ from: 0, to: 0, first: 6, last: 12 }],
  industrial: [
    { from: 0, to: 0, first: 13 },
    { from: 1, to: 1, first: 1, last: 6 },
  ],
  midsize: [
    { from: 1, to: 1, first: 7 },
    { from: 2, to: 2 },
  ],
  local: [{ from: 2, lowest: false }],
  selfmade: [{ from: 0, lowest: true }],
};

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
/** Whether a club lies in a tier's reach, given its place in its division. */
export function inReach(tier: WealthTier, club: Club, place: number) {
  const lowest = club.tier === country(club.country).groups.length - 1;
  return REACH_BANDS[tier].some(
    (rule) =>
      club.tier >= rule.from &&
      club.tier <= (rule.to ?? Infinity) &&
      place >= (rule.first ?? 1) &&
      place <= (rule.last ?? Infinity) &&
      (rule.lowest === undefined || rule.lowest === lowest),
  );
}
/** The priced clubs in a tier's reach. */
export function reachOf(w: World, tier: WealthTier, priced = pricedClubs(w)): PricedClub[] {
  const places = divisionPlaces(w);
  return priced.filter(({ club }) => inReach(tier, club, places.get(club.id) ?? Infinity));
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
