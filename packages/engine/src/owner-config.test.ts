import { describe, expect, it } from 'vitest';
import { OWNER_TRAIT_IDS, WEALTH_TIER_IDS } from '../../contracts/src/owner';
import {
  CLUB_TAKEOVER,
  CLUB_VALUE,
  FAN_MOOD,
  FFP,
  OWNER_BUSINESS,
  OWNER_DIVIDEND,
  OWNER_LIVING,
  OWNER_TIERS,
  OWNER_TRAIT_LIMIT,
  OWNER_TRAITS,
  TAKEOVER_DEBT,
} from './owner-config';

/** The SSOT's numbers (OWNER r1, ECON r42, CLUB r50); a retune changes the SSOT first. */
describe('owner settings (→OWNER, ECON-36–38, CLUB-1)', () => {
  it('sizes six tiers, richest first, as multiples of their anchor (→OWNER-3)', () => {
    expect(Object.keys(OWNER_TIERS)).toEqual([...WEALTH_TIER_IDS]);
    expect(Object.values(OWNER_TIERS).map((tier) => [tier.label, tier.multiple])).toEqual([
      ['석유 재벌', 10],
      ['재벌 총수', 1.3],
      ['산업 자본가', 1.3],
      ['중견 사업가', 1.3],
      ['지역 유지', 1.3],
      ['자수성가 축구팬', 1.3],
    ]);
  });

  it('gives the eight traits their effects, at most five taken (→OWNER-2, OWNER-5)', () => {
    expect(OWNER_TRAIT_LIMIT).toBe(5);
    expect(Object.keys(OWNER_TRAITS)).toEqual([...OWNER_TRAIT_IDS]);
    expect(OWNER_TRAITS).toEqual({
      businessman: { label: '성공한 사업가', success: 0.6 },
      talisman: { label: '승리의 부적', strength: 1 },
      negotiator: { label: '협상의 달인', wages: 0.9, fees: 0.9 },
      fansFriend: { label: '팬들의 친구', drop: 0.7 },
      networker: { label: '마당발', candidates: 1, ability: 5 },
      talentSpotter: { label: '원석 감별사', potential: 3, scoutRange: 0.5 },
      marketer: { label: '마케팅 귀재', sponsor: 1.15 },
      politician: { label: '정치력', operating: 0.9 },
    });
  });

  it('settles the business on 1 Nov, 1 Feb, 1 May and the close at even odds (→OWNER-7/8)', () => {
    expect(OWNER_BUSINESS).toEqual({
      dates: [
        { month: 11, date: 1 },
        { month: 2, date: 1 },
        { month: 5, date: 1 },
      ],
      close: true,
      chance: 0.5,
      stake: { min: 0, max: 100, start: 0 },
    });
    expect(OWNER_LIVING.rate).toBe(0.01);
    expect(OWNER_DIVIDEND).toEqual({ shares: [0, 25, 50, 75, 100], start: 0 });
  });

  it('caps injections in the top flight from 2011/12, €45m then €30m over three seasons (→OWNER-10)', () => {
    expect(FFP).toEqual({
      start: 2011,
      window: 3,
      caps: [
        { from: 2011, euros: 45_000_000 },
        { from: 2015, euros: 30_000_000 },
      ],
    });
  });

  it('moves 팬 민심 by every driver of OWNER-12 and forces the owner out by OWNER-13', () => {
    expect(FAN_MOOD).toEqual({
      start: 60,
      min: 0,
      max: 100,
      floor: 15,
      rounds: 8,
      drift: 0.02,
      friendly: 0.7,
      result: { win: 1, draw: 0, defeat: -1 },
      title: 15,
      promotion: 10,
      relegation: -15,
      lastInLowest: -10,
      injection: { perPercent: 1, max: 10 },
      recordSigning: 5,
      dividend: { perPercent: -1 },
      starSale: { change: -8, top: 3 },
      identity: -20,
      ticket: { perStep: -0.2 },
    });
    // One number for 팬들의 친구, read by the trait and the drivers alike.
    expect(FAN_MOOD.friendly).toBe(OWNER_TRAITS.fansFriend.drop);
  });

  it('values clubs, turns their debt into a loan and sets the bought club as it stands (→ECON-37/38, CLUB-1)', () => {
    expect(CLUB_VALUE).toEqual({ following: 0.05, placeSeasons: 3, floor: 1 });
    expect(TAKEOVER_DEBT).toEqual({ seasons: 5, rate: 0.05 });
    expect(CLUB_TAKEOVER.squad).toBe(20);
    expect(CLUB_TAKEOVER.goalkeepers).toBe(2);
    const { division, stature } = CLUB_TAKEOVER.facilities;
    // A bigger division never stands on smaller facilities, and every stage is on its ladder.
    for (const [i, stage] of division.entries()) {
      expect(stage.stadium).toBeGreaterThanOrEqual(0);
      expect(stage.stadium + stature.giant.stadium).toBeLessThanOrEqual(8);
      expect(stage.training + stature.giant.levels).toBeLessThanOrEqual(5);
      expect(stage.academy + stature.giant.levels).toBeLessThanOrEqual(5);
      const below = division[i + 1];
      if (below) {
        expect(stage.stadium).toBeGreaterThanOrEqual(below.stadium);
        expect(stage.training).toBeGreaterThanOrEqual(below.training);
        expect(stage.academy).toBeGreaterThanOrEqual(below.academy);
      }
    }
    // Giants (+13, +11, +9) and big clubs (+6 to +4) above ordinary ones, small (−3 to −5) below.
    expect(stature.giant.from).toBe(9);
    expect(stature.big.from).toBe(4);
    expect(stature.small.to).toBe(-3);
  });
});
