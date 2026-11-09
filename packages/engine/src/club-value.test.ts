import { describe, expect, it } from 'vitest';
import { WEALTH_TIER_IDS } from '../../contracts/src/owner';
import type { World } from '../../contracts/src/types';
import {
  clubsForSale,
  clubValue,
  divisionDistribution,
  facilityStage,
  fromPounds,
  inPounds,
  pricedClubs,
  reachOf,
  tierAnchor,
  tierFortune,
  type PricedClub,
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
  it('uses the official-scale modern package for league-place value and the indebted value floor', () => {
    // An empty owned club isolates the league-place component without generating a world.
    const w = {
      year: 2024,
      playerClub: 'own',
      clubs: [{ id: 'own', country: 'ENG', tier: 0, fans: 0 }],
      players: [],
      stadium: 0,
      trainingGround: 0,
      academyFacility: 0,
      cash: '0',
    } as unknown as World;
    const club = clubOf(w),
      facilities = big(footballQuote('ENG', 2024, facilityBuiltUnits(facilityStage(w, club))));
    expect(divisionDistribution('ENG', 2024, 0)).toBe('10898461538');
    expect(big(clubValue(w, club))).toBe(facilities + 32695384614n);
    w.loan = { balance: '999999999999999', installment: '0', seasonsLeft: 1 };
    expect(clubValue(w, club)).toBe('10898461538');
  });

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
    const midTable = clubsForSale(w)
      .filter((c) => c.country === 'ENG' && c.tier === 0)
      .sort((a, b) => b.strength - a.strength)[9]!;
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

  it('uses price ranks with exact band edges, stable ties and no overlapping membership', () => {
    // Twenty hand-made prices: unrelated currencies/divisions cannot affect their pound ranking.
    const club = priced[0]!.club;
    const list: PricedClub[] = Array.from({ length: 20 }, (_, i) => ({
      club: { ...club, id: `club-${String(i).padStart(2, '0')}` },
      price: '1',
      pricePounds: String(200 - i),
    }));
    list[2]!.pricePounds = list[1]!.pricePounds;
    const scrambled = [...list].reverse();
    const expected = [
      [0, 2],
      [2, 4],
      [4, 7],
      [7, 11],
      [11, 16],
      [16, 20],
    ];
    for (const [i, tier] of WEALTH_TIER_IDS.entries()) {
      const [from, to] = expected[i]!;
      expect(reachOf(w, tier, scrambled)).toEqual(list.slice(from, to));
      expect(tierAnchor(w, tier, scrambled)).toBe(String([199, 198, 195, 191, 187, 182][i]));
    }
    expect(scrambled).toEqual([...list].reverse());
    expect(reachOf(w, 'oil', [])).toEqual([]);
    expect(tierAnchor(w, 'oil', [])).toBe('0');
  });

  it('gives a three-division country clubs in 지역 유지’s band', () => {
    const local = reachOf(w, 'local', priced);
    expect(local.some(({ club }) => club.country === 'GER')).toBe(true);
    expect(local.some(({ club }) => club.country === 'FRA')).toBe(true);
    const anchors = WEALTH_TIER_IDS.map((tier) => big(tierAnchor(w, tier, priced)));
    for (let i = 1; i < anchors.length; i++)
      expect(anchors[i]!).toBeLessThanOrEqual(anchors[i - 1]!);
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
