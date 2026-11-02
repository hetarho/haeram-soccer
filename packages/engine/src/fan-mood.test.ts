import { describe, expect, it } from 'vitest';
import type { MatchRecord, OwnerTrait, SeasonArchive, World } from '../../contracts/src/types';
import { createWorld } from './founding';
import { operate } from './operations';
import {
  fanMoodAfterLeagueMatch,
  fanMoodClose,
  fanMoodIdentity,
  fanMoodMovers,
  fanMoodRound,
  fanMoodTransfer,
} from './fan-mood';
import { ownerClose } from './owner';
import { FAN_MOOD } from './owner-config';
import { SEASON_END_DAY } from './calendar';
import { activePlayers, clubOf, overall } from './player-state';
import { recordTransfer } from './transfer-records';
import { withOwner } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** A taken-over career at 팬 민심 `mood`, holding `traits`. */
function world(mood: number = FAN_MOOD.start, traits: OwnerTrait[] = []) {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Terrace United',
      color: '#227744',
      seed: 'fan-mood',
      level: 'normal' as const,
    },
    DISABLED_RELEASE,
  );
  withOwner(w, { fanMood: mood, traits, fortune: '100000000000' });
  w.income = '0';
  w.expense = '0';
  return w;
}
/** An own league result, `own`–`other`, at home or away. */
function result(w: World, own: number, other: number, home = true, kind = 'league') {
  const opponent = w.clubs.find((c) => c.id !== w.playerClub)!.id;
  return {
    id: `league:${own}:${other}`,
    kind,
    home: home ? w.playerClub : opponent,
    away: home ? opponent : w.playerClub,
    score: home ? { home: own, away: other } : { home: other, away: own },
  } as MatchRecord;
}
const mood = (w: World) => w.owner!.fanMood;

describe('팬 민심 by league results and the ticket price (→OWNER-12)', () => {
  it('moves +1, 0 and −1 by result, and only for league games', () => {
    const w = world();
    fanMoodAfterLeagueMatch(w, result(w, 2, 0));
    expect(mood(w)).toBe(61);
    fanMoodAfterLeagueMatch(w, result(w, 1, 1, false));
    expect(mood(w)).toBe(61);
    fanMoodAfterLeagueMatch(w, result(w, 0, 3, false));
    expect(mood(w)).toBe(60);
    fanMoodAfterLeagueMatch(w, result(w, 0, 3, true, 'cup'));
    expect(mood(w)).toBe(60);
    // Results move it silently; only named drivers leave a mover.
    expect(fanMoodMovers(w)).toEqual([]);
  });
  it('costs 0.2 a home league match per preset step above the default price', () => {
    for (const [ticket, change] of [
      [0.05, 0],
      [0.035, 0],
      [0.08, -0.2],
      [0.1, -0.2],
      [0.12, -0.4],
    ] as const) {
      const w = world();
      w.ticket = ticket;
      fanMoodAfterLeagueMatch(w, result(w, 1, 1));
      expect(mood(w)).toBeCloseTo(60 + change, 5);
      fanMoodAfterLeagueMatch(w, result(w, 1, 1, false));
      expect(mood(w)).toBeCloseTo(60 + change, 5);
    }
  });
  it('scales every drop by 0.7 for 팬들의 친구, never a rise', () => {
    const w = world(FAN_MOOD.start, ['fansFriend']);
    w.ticket = 0.12;
    fanMoodAfterLeagueMatch(w, result(w, 0, 1));
    expect(mood(w)).toBeCloseTo(60 - 0.7 - 0.4 * 0.7, 5);
    const rise = world(FAN_MOOD.start, ['fansFriend']);
    fanMoodAfterLeagueMatch(rise, result(rise, 1, 0, false));
    expect(mood(rise)).toBe(61);
  });
});

describe('the drift and 퇴진 압박 (→OWNER-12/13)', () => {
  it('drifts 2% of the gap toward the start each settled round', () => {
    const high = world(80),
      low = world(40);
    fanMoodRound(high);
    fanMoodRound(low);
    expect(mood(high)).toBe(79.6);
    expect(mood(low)).toBe(40.4);
  });
  it('counts rounds below the floor, resets at the floor and forces the owner out at 8', () => {
    const w = world(5);
    for (let round = 1; round < FAN_MOOD.rounds; round++) fanMoodRound(w);
    expect(w.owner!.fanCrisis).toEqual({ rounds: FAN_MOOD.rounds - 1 });
    expect(w.ended).toBeUndefined();
    expect(w.inbox!.filter((item) => item.title.startsWith('퇴진 압박'))).toHaveLength(1);
    fanMoodRound(w);
    expect(w.ended).toBe('fans');
    expect(w.events.at(-1)!.kind).toBe('owner-ousted');
    // An ended career counts nothing more.
    const after = structuredClone(w.owner);
    fanMoodRound(w);
    expect(w.owner).toEqual(after);
    const back = world(5);
    for (let round = 1; round <= 3; round++) fanMoodRound(back);
    back.owner!.fanMood = FAN_MOOD.floor;
    fanMoodRound(back);
    expect(back.owner!.fanCrisis).toBeUndefined();
    back.owner!.fanMood = 5;
    fanMoodRound(back);
    expect(back.owner!.fanCrisis).toEqual({ rounds: 1 });
  });
});

describe('the season close and its record (→OWNER-12, OWNER-17)', () => {
  /** The archive the close just wrote, with what the test names. */
  const archive = (w: World, season: Partial<SeasonArchive>) => {
    const own = clubOf(w);
    w.history.push({
      year: w.year,
      tier: own.tier,
      group: own.group,
      rank: 5,
      champions: [],
      europe: [],
      standings: [],
      ...season,
    } as SeasonArchive);
  };
  it('adds 15 a title, 10 a promotion and takes 15 for a relegation', () => {
    const champion = world(40),
      own = clubOf(champion);
    own.tier = 1;
    archive(champion, {
      tier: 2,
      rank: 1,
      champions: [{ country: own.country, club: 'other', cup: champion.playerClub }],
      europe: [
        { kind: 'cwc', name: '컵위너스컵', winner: champion.playerClub, field: 32 },
      ] as SeasonArchive['europe'],
    });
    fanMoodClose(champion);
    expect(mood(champion)).toBe(40 + 3 * FAN_MOOD.title + FAN_MOOD.promotion);
    expect(fanMoodMovers(champion).map((e) => e.title)).toEqual([
      '승격',
      '컵위너스컵 우승',
      '컵 우승',
      '리그 우승',
    ]);
    const relegated = world();
    clubOf(relegated).tier = 2;
    archive(relegated, { tier: 1 });
    fanMoodClose(relegated);
    expect(mood(relegated)).toBe(60 + FAN_MOOD.relegation);
  });
  it('takes 10 for last place in the lowest professional division only', () => {
    const last = (tier: number) => {
      const w = world(),
        own = clubOf(w);
      own.tier = tier;
      archive(w, {
        tier,
        group: 0,
        rank: 3,
        standings: [
          [0, tier, 0, 50, 0, 0],
          [1, tier, 0, 40, 0, 0],
          [2, tier, 0, 30, 0, 0],
          [3, tier + 1, 0, 90, 0, 0],
        ],
      });
      fanMoodClose(w);
      return mood(w);
    };
    // England's professional pyramid has four divisions, the last at tier 3.
    expect(last(3)).toBe(60 + FAN_MOOD.lastInLowest);
    expect(last(2)).toBe(60);
  });
  it('records the owner’s season at each close, the season that ended the career too', () => {
    const w = world();
    w.owner!.dividendShare = 50;
    w.income = '1000000';
    w.expense = '600000';
    operate(w, { type: 'owner-inject', amount: '300000' });
    w.calendar = { day: SEASON_END_DAY + 1 };
    ownerClose(w);
    archive(w, {});
    fanMoodClose(w);
    const sum = (kind: string) =>
      w.events
        .filter((e) => e.kind === kind)
        .reduce((total, e) => total + BigInt(e.amount!), 0n)
        .toString();
    expect(w.owner!.seasonRecords).toEqual([
      {
        year: w.year,
        currency: w.currency,
        fortune: w.owner!.fortune,
        business: '0',
        living: sum('owner-living'),
        injected: '300000',
        dividend: '200000',
        fanMood: mood(w),
      },
    ]);
    w.ended = 'owner';
    const before = mood(w);
    archive(w, { rank: 1 });
    fanMoodClose(w);
    expect(w.owner!.seasonRecords).toHaveLength(2);
    expect(mood(w)).toBe(before);
  });
});

describe('the owner’s money and 팬 민심 (→OWNER-9/11/12)', () => {
  it('adds 1 per 1% of last season’s turnover an injection, at most 10', () => {
    const w = world();
    clubOf(w).books = {
      seasons: [{ year: w.year - 1, income: '1000000', wages: '0', costs: '0', result: '1000000' }],
      cash: '0',
      debt: '0',
    };
    operate(w, { type: 'owner-inject', amount: '30000' });
    expect(mood(w)).toBe(63);
    operate(w, { type: 'owner-inject', amount: '500000' });
    expect(mood(w)).toBe(73);
    expect(fanMoodMovers(w, 1)[0]!.title).toBe('구단주 자금 투입');
    // With no turnover known yet, an injection counts the most.
    const fresh = world();
    operate(fresh, { type: 'owner-inject', amount: '1' });
    expect(mood(fresh)).toBe(60 + FAN_MOOD.injection.max);
  });
  it('takes 1 per 1% of the season’s turnover a dividend, 0.7 for 팬들의 친구', () => {
    for (const [traits, expected] of [
      [[], 60 - 20],
      [['fansFriend'], 60 - 20 * 0.7],
    ] as const) {
      const w = world(FAN_MOOD.start, [...traits]);
      w.owner!.dividendShare = 50;
      w.income = '1000000';
      w.expense = '600000';
      w.calendar = { day: SEASON_END_DAY + 1 };
      ownerClose(w);
      expect(mood(w)).toBeCloseTo(expected, 5);
    }
  });
});

describe('transfers and identity (→OWNER-12, KIT-9)', () => {
  it('adds 5 for a fee above the club’s previous record, never for the first or a loan', () => {
    const w = world(),
      [a, b, c, d] = activePlayers(w);
    const sign = (player: typeof a, fee: string, loan = false) =>
      fanMoodTransfer(w, recordTransfer(w, { direction: 'in', loan, player: player!, fee })!);
    sign(a, '1000000');
    expect(mood(w)).toBe(60);
    sign(b, '3000000', true);
    expect(mood(w)).toBe(60);
    sign(c, '2000000');
    expect(mood(w)).toBe(60);
    sign(d, '3000001');
    expect(mood(w)).toBe(60 + FAN_MOOD.recordSigning);
  });
  it('takes 8 for selling one of the three highest-OVR players, ties counting against it', () => {
    const sell = (place: number, lift = true) => {
      const w = world(),
        squad = [...activePlayers(w)].sort((x, y) => overall(y) - overall(x));
      // Three clear leaders above a squad of near equals.
      if (lift)
        squad.slice(0, 3).forEach((p, i) => {
          for (const key of Object.keys(p.attrs) as (keyof typeof p.attrs)[])
            p.attrs[key] += 30 - 10 * i;
        });
      const player = squad[place]!;
      player.status = 'sold';
      fanMoodTransfer(
        w,
        recordTransfer(w, { direction: 'out', loan: false, player, fee: '1000' })!,
      );
      return mood(w);
    };
    expect(sell(2)).toBe(60 + FAN_MOOD.starSale.change);
    expect(sell(3)).toBe(60);
    // Without clear leaders the third place is shared by equals: none of them is a star.
    expect(sell(5, false)).toBe(60);
  });
  it('takes 20 for adopting a designer draft', () => {
    const w = world();
    fanMoodIdentity(w);
    expect(mood(w)).toBe(60 + FAN_MOOD.identity);
    expect(fanMoodMovers(w)[0]!.title).toBe('구단 정체성 변경');
  });
});
