import { describe, expect, it } from 'vitest';
import type { FanDisposition } from '../../contracts/src/owner';
import type { MatchRecord } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
import {
  fanMoodAfterLeagueMatch,
  fanMoodDividend,
  fanMoodIdentity,
  fanMoodInjection,
  fanMoodRound,
} from './fan-mood';
import { reportDistress } from './distress';
import { withOwner } from './testing';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { ownStarters } from './world';
import { respondBid } from './transfers';
import { fanMoodAfter } from './fan-mood-read';

function fixture(
  mix: FanDisposition = { results: 45, identity: 10, finance: 35, stars: 10 },
  friendly = false,
) {
  const w = worldMarketFixture();
  withOwner(w, { fanDisposition: mix, traits: friendly ? ['fansFriend'] : [] });
  return w;
}
const result = {
  kind: 'league',
  home: 'own',
  away: 'foreign',
  score: { home: 1, away: 0 },
} as MatchRecord;

describe('caring fan dispositions on settled drivers (→OWNER-12)', () => {
  it('moves a result twice as far at 45% as at 10% and retains the friends drop factor', () => {
    const high = fixture(),
      low = fixture({ results: 10, identity: 45, finance: 35, stars: 10 });
    fanMoodAfterLeagueMatch(high, result);
    fanMoodAfterLeagueMatch(low, result);
    expect(high.owner!.fanMood).toBe(61.4);
    expect(low.owner!.fanMood).toBe(60.7);
    const friendly = fixture(undefined, true);
    fanMoodAfterLeagueMatch(friendly, { ...result, score: { home: 0, away: 1 } });
    expect(friendly.owner!.fanMood).toBe(59.02);
  });

  it('scales tickets and dividends once by finance, injections by stars, and identity by identity', () => {
    const w = fixture({ results: 10, identity: 35, finance: 45, stars: 10 }, true);
    w.ticket = 0.12;
    fanMoodAfterLeagueMatch(w, { ...result, score: { home: 0, away: 0 } });
    expect(w.owner!.fanMood).toBe(59.61); // two steps × −0.2 × 1.4 × 0.7, rounded once
    w.owner!.fanMood = 60;
    w.income = '10000';
    fanMoodDividend(w, 2000n);
    expect(w.owner!.fanMood).toBe(50.2);
    w.owner!.fanMood = 60;
    w.owner!.takeover.lastIncome = '10000';
    fanMoodInjection(w, 100n);
    expect(w.owner!.fanMood).toBe(60.7);
    w.owner!.fanMood = 60;
    fanMoodIdentity(w);
    expect(w.owner!.fanMood).toBe(43.2);
  });

  it('counts debt, drift and pressure only on actual settled owner league rounds', () => {
    const w = fixture();
    w.cash = '-1';
    const before = structuredClone(w.owner);
    fanMoodRound(w, false);
    expect(w.owner).toEqual(before);
    fanMoodRound(w, true);
    expect(w.owner!.fanMood).toBe(59.76); // −0.2 × 1.2 then 2% drift
    w.owner!.fanMood = 5;
    fanMoodRound(w, false);
    expect(w.owner!.fanCrisis).toBeUndefined();
    fanMoodRound(w, true);
    expect(w.owner!.fanCrisis).toEqual({ rounds: 1 });
  });

  it.each([1, 2, 3] as const)(
    'moves only an actual upward owner distress entry to stage %s',
    (stage) => {
      const w = fixture(undefined, true),
        base = { 1: -5, 2: -10, 3: -20 }[stage];
      reportDistress(w, 'foreign', undefined, { stage });
      expect(w.owner!.fanMood).toBe(60);
      reportDistress(w, w.playerClub, undefined, { stage });
      expect(w.owner!.fanMood).toBe(
        fanMoodAfter({ owner: { ...w.owner!, fanMood: 60 } }, base, 'finance'),
      );
      const after = structuredClone(w.owner);
      reportDistress(w, w.playerClub, { stage }, { stage });
      reportDistress(w, w.playerClub, { stage: 3 }, { stage: 1 });
      expect(w.owner).toEqual(after);
      expect(w.events.filter((e) => e.kind === 'fan-mood')).toHaveLength(1);
    },
  );

  it.each(['starter', 'bench', 'unrecorded'] as const)(
    'uses pre-movement XI and recorded graduate facts for a %s sale',
    (kind) => {
      const w = fixture(undefined, true);
      for (let i = 0; i < 5; i++)
        w.players.push({ ...structuredClone(w.players[1]!), id: `bench:${i}` });
      const xi = ownStarters(w),
        p =
          kind === 'bench'
            ? w.players.find((p) => !xi.some((s) => s.id === p.id))!
            : xi.find((p) => p.position !== 'GK')!;
      if (kind !== 'unrecorded') p.graduate = true;
      const buyer = w.clubs[1]!;
      buyer.strength = 80;
      buyer.books = { cash: '999999999999', debt: '0', seasons: [], openingIncome: '999999999' };
      marketCandidate(w, buyer, 'GK');
      w.bids = [
        {
          id: 'sale',
          direction: 'in',
          playerId: p.id,
          club: buyer.id,
          fee: '100',
          year: w.year,
          day: 3,
          due: 5,
          status: 'pending',
        },
      ];
      respondBid(w, 'sale', true);
      expect(w.bids[0]!.status).toBe('completed');
      expect(ownStarters(w).some((s) => s.id === p.id)).toBe(false);
      const events = w.events.filter(
        (e) => e.kind === 'fan-mood' && e.title === message('fans.homegrownSale'),
      );
      expect(events).toHaveLength(kind === 'starter' ? 1 : 0);
      if (kind === 'starter') expect(w.owner!.fanMood).toBe(58.53); // −3 × 0.7 disposition × 0.7 friend
    },
  );
});
