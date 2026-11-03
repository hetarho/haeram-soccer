import { describe, expect, it } from 'vitest';
import { WEALTH_TIER_IDS } from '../../contracts/src/owner';
import type { Club, SeasonArchive, World } from '../../contracts/src/types';
import {
  clubsForSale,
  clubValue,
  divisionDistribution,
  divisionPlaces,
  facilityStage,
  fromPounds,
  inPounds,
  pricedClubs,
  reachOf,
  tierAnchor,
  tierFortune,
} from './club-value';
import { CLUB_TAKEOVER, CLUB_VALUE, OWNER_TIERS } from './owner-config';
import { squad, stature } from './world';
import { clubOf } from './player-state';
import { marketValueAt } from './market-prices';
import { facilityBuiltUnits } from './facility-model';
import { fanFollowing } from './fans';
import { footballQuote, quote } from './quotes';
import { scaleBy } from './primitives';
import { ownerlessWorld, withBooks } from './ownerless.testkit';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

const big = (amount: string) => BigInt(amount);
/** The strongest club of a division of England. */
const leader = (w: World, tier: number) =>
  w.clubs
    .filter((c) => c.country === 'ENG' && c.tier === tier && !c.representative)
    .sort((a, b) => b.strength - a.strength)[0]!;

describe('club value (→ECON-37)', () => {
  it('sums players, facilities, following, league place and the books', () => {
    const w = ownerlessWorld();
    const club = leader(w, 0);
    withBooks(w, club, { cash: '5000000', debt: '1200000' });
    const year = w.year;
    const players = squad(w, club).reduce(
      (sum, p) => sum + big(marketValueAt('ENG', year, 0, p)),
      0n,
    );
    const facilities = big(footballQuote('ENG', year, facilityBuiltUnits(facilityStage(w, club))));
    const following = big(quote('ENG', year, fanFollowing(club.reputation) * CLUB_VALUE.following));
    const place = big(
      scaleBy(divisionDistribution('ENG', year, 0), CLUB_VALUE.placeSeasons, 1000n),
    );
    expect(players).toBeGreaterThan(0n);
    expect(big(clubValue(w, club))).toBe(
      players + facilities + following + place + 5000000n - 1200000n,
    );
  });

  it('makes an indebted big club cheaper than the same squad kept healthy', () => {
    const w = ownerlessWorld();
    const giant = leader(w, 0);
    const places = divisionPlaces(w);
    const midTable = clubsForSale(w).find(
      (c) => c.country === 'ENG' && c.tier === 0 && places.get(c.id) === 10,
    )!;
    const bare = big(clubValue(w, giant)),
      mid = big(clubValue(w, midTable));
    withBooks(w, giant, { cash: '20000000', debt: '0' });
    expect(big(clubValue(w, giant))).toBe(bare + 20000000n);
    // A debt beyond the gap takes the giant below a mid-table club that owes nothing.
    const debt = bare - mid + 1000000n;
    withBooks(w, giant, { cash: '0', debt: debt.toString() });
    expect(big(clubValue(w, giant))).toBe(bare - debt);
    expect(big(clubValue(w, giant))).toBeLessThan(mid);
  });

  it('never prices a club below a season of its division distribution', () => {
    const w = ownerlessWorld();
    const club = leader(w, 2);
    withBooks(w, club, { cash: '0', debt: '999999999999' });
    expect(clubValue(w, club)).toBe(
      scaleBy(divisionDistribution('ENG', w.year, 2), CLUB_VALUE.floor, 1000n),
    );
  });

  it('counts no cash or debt for a club without books', () => {
    const w = ownerlessWorld();
    const club = leader(w, 1);
    const bare = big(clubValue(w, club));
    withBooks(w, club, { cash: '0', debt: '0' });
    expect(big(clubValue(w, club))).toBe(bare);
  });

  it('stands a club nobody owns at its division and stature’s facilities (→CLUB-1)', () => {
    const w = ownerlessWorld();
    const { division, stature: sizes } = CLUB_TAKEOVER.facilities;
    const sized = (test: (size: number) => boolean, tier: number) =>
      w.clubs.find(
        (c) =>
          c.country === 'ENG' &&
          c.tier === tier &&
          !c.representative &&
          test(stature(w.seed, c.id)),
      )!;
    const giant = sized((s) => s >= sizes.giant.from, 0);
    expect(facilityStage(w, giant)).toEqual({
      stadium: division[0]!.stadium + sizes.giant.stadium,
      trainingGround: division[0]!.training + sizes.giant.levels,
      academyFacility: division[0]!.academy + sizes.giant.levels,
    });
    const ordinary = sized((s) => s > sizes.small.to && s < sizes.big.from, 1);
    expect(facilityStage(w, ordinary)).toEqual({
      stadium: division[1]!.stadium,
      trainingGround: division[1]!.training,
      academyFacility: division[1]!.academy,
    });
    const small = sized((s) => s <= sizes.small.to, 3);
    expect(facilityStage(w, small)).toEqual({
      stadium: division[3]!.stadium + sizes.small.stadium,
      trainingGround: 0,
      academyFacility: 0,
    });
  });

  it('values the owner’s club on its own facilities, supporters, cash and loan', () => {
    const w = careerWorld({ seed: 'valued' }, DISABLED_RELEASE);
    const own = clubOf(w);
    // Its own facilities, as the takeover left them in the lowest professional division.
    expect(facilityStage(w, own)).toEqual({ stadium: 1, trainingGround: 0, academyFacility: 0 });
    expect(facilityStage(w, own).stadium).toBe(w.stadium);
    const before = big(clubValue(w, own));
    w.loan = { balance: '30000', installment: '6000', seasonsLeft: 5 };
    own.fans += 20000;
    const supporters = big(quote('ENG', w.year, own.fans * CLUB_VALUE.following));
    own.fans -= 20000;
    const fewer = big(quote('ENG', w.year, own.fans * CLUB_VALUE.following));
    own.fans += 20000;
    expect(big(clubValue(w, own))).toBe(before - 30000n + supporters - fewer);
  });
});

describe('pounds (→ECON-35)', () => {
  it('converts every country’s money at its quotes’ rate', () => {
    expect(inPounds('ENG', 1960, '12345')).toBe('12345');
    // 1999: the euro countries stand at €1.518 per pound.
    const euros = big(fromPounds('ESP', 1999, '100000'));
    expect(Number(euros) / 100000).toBeCloseTo(1.518, 2);
    for (const code of ['GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL'])
      expect(Number(big(inPounds(code, 1999, euros.toString())) - 100000n)).toBeLessThan(
        100000 * 0.01,
      );
    const lira = fromPounds('ITA', 1975, '50000000');
    expect(Number(big(inPounds('ITA', 1975, lira)))).toBeCloseTo(50000000, -1);
  });
});

describe('wealth tiers (→OWNER-3)', () => {
  const w = ownerlessWorld();
  const priced = pricedClubs(w);

  it('lists every professional club of the playable countries for sale', () => {
    expect(priced).toHaveLength(clubsForSale(w).length);
    expect(priced.every(({ club }) => !club.representative)).toBe(true);
    expect(new Set(priced.map(({ club }) => club.country)).size).toBe(8);
  });

  it('reaches distinct places of the pyramid, richest first', () => {
    const places = divisionPlaces(w);
    const reach = (tier: (typeof WEALTH_TIER_IDS)[number]) =>
      reachOf(w, tier, priced).map(({ club }) => [club.tier, places.get(club.id)!]);
    expect(reach('oil').every(([tier, place]) => tier === 0 && place <= 5)).toBe(true);
    expect(reach('oil')).toHaveLength(8 * 5);
    expect(reach('chaebol').every(([tier, place]) => tier === 0 && place >= 6 && place <= 12)).toBe(
      true,
    );
    expect(
      reach('industrial').every(([tier, place]) =>
        tier === 0 ? place >= 13 : tier === 1 && place <= 6,
      ),
    ).toBe(true);
    expect(reach('midsize').every(([tier, place]) => (tier === 1 ? place >= 7 : tier === 2))).toBe(
      true,
    );
    expect(reach('local').length).toBeGreaterThan(0);
    expect(reach('local').every(([tier]) => tier >= 2)).toBe(true);
    // England's fourth tier is its lowest: 자수성가 reaches it, 지역 유지 does not.
    const lowest = reachOf(w, 'selfmade', priced);
    expect(lowest.some(({ club }) => club.country === 'ENG' && club.tier === 3)).toBe(true);
    expect(lowest.some(({ club }) => club.country === 'ENG' && club.tier < 3)).toBe(false);
    expect(lowest.some(({ club }) => club.country === 'ESP' && club.tier === 1)).toBe(true);
    const anchors = WEALTH_TIER_IDS.map((tier) => big(tierAnchor(w, tier, priced)));
    for (let i = 1; i < anchors.length; i++)
      expect(anchors[i]!).toBeLessThanOrEqual(anchors[i - 1]!);
    expect(anchors[3]!).toBeGreaterThan(0n);
  });

  it('starts each tier at its anchor’s multiple, able to buy a club it reaches', () => {
    for (const tier of WEALTH_TIER_IDS) {
      const fortune = big(tierFortune(w, tier, priced));
      expect(fortune).toBe(
        big(scaleBy(tierAnchor(w, tier, priced), OWNER_TIERS[tier].multiple, 1000n)),
      );
      expect(reachOf(w, tier, priced).some(({ pricePounds }) => big(pricePounds) <= fortune)).toBe(
        true,
      );
    }
    const oil = big(tierFortune(w, 'oil', priced));
    expect(priced.every(({ pricePounds }) => big(pricePounds) <= oil)).toBe(true);
  });

  it('reads the anchor from the clubs’ own money in pounds', () => {
    const spanish = priced.find(({ club }) => club.country === 'ESP')!;
    expect(spanish.pricePounds).toBe(inPounds('ESP', w.year, spanish.price));
    expect(big(tierAnchor(w, 'oil'))).toBe(big(tierAnchor(w, 'oil', priced)));
  });
});

describe('division places', () => {
  /** Last season's archived table: rows of [club index, tier, group, points, goals for, against]. */
  const archive = (w: World, rows: number[][]) =>
    (w.history = [{ year: w.year - 1, standings: rows } as unknown as SeasonArchive]);
  const row = (w: World, club: Club, tier: number, points: number) => [
    w.clubs.indexOf(club),
    tier,
    0,
    points,
    40,
    40,
  ];

  it('orders a division by strength in a world’s first season', () => {
    const w = ownerlessWorld();
    const places = divisionPlaces(w);
    const top = w.clubs
      .filter((c) => c.country === 'ENG' && c.tier === 0)
      .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
    expect(top.map((c) => places.get(c.id))).toEqual(top.map((_, i) => i + 1));
  });

  it('orders it by last season’s finish, the relegated first and the promoted last', () => {
    const w = ownerlessWorld();
    const top = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 0);
    const second = w.clubs.filter((c) => c.country === 'ENG' && c.tier === 1);
    const weakest = [...top].sort((a, b) => a.strength - b.strength)[0]!;
    const [up, down] = [second[0]!, top.find((c) => c !== weakest)!];
    archive(w, [
      ...top.map((c) => row(w, c, 0, c === weakest ? 90 : 40)),
      ...second.map((c) => row(w, c, 1, c === up ? 99 : 30)),
    ]);
    // The promotion and relegation of the close.
    up.tier = 0;
    down.tier = 1;
    const places = divisionPlaces(w);
    expect(places.get(weakest.id)).toBe(1);
    expect(places.get(up.id)).toBe(top.length);
    expect(places.get(down.id)).toBe(1);
  });
});
