import { afterEach, describe, expect, it } from 'vitest';
import type { DistressState } from '../../contracts/src/owner';
import { DISTRESS_FLOW, repayDistress, stepDistress } from './distress';
import { npcBooksFixture } from './npc-books.testkit';
import { booksClose, npcFixedCosts, settleNpcBooks, settleNpcDistress } from './books';
import { settleRound } from './settlement';
import { operatingCosts } from './finance';
import { careerEnded } from '../../contracts/src/owner';

const tick = (state: DistressState | undefined, debt: bigint, round = 1, closed = false) =>
  stepDistress(state, debt, 100n, { year: 1950, round }, closed);
afterEach(() => {
  delete DISTRESS_FLOW.observe;
});
describe('financial distress boundaries', () => {
  it('uses strict entry lines, eight consecutive settled rounds and idempotent ticks', () => {
    expect(tick(undefined, 25n)).toBeUndefined();
    expect(tick(undefined, 26n)?.stage).toBe(1);
    expect(tick(undefined, 100n)?.stage).toBe(1);
    expect(tick(undefined, 101n)?.stage).toBe(3);
    let state: DistressState | undefined;
    for (let round = 1; round <= 7; round++) state = tick(state, 51n, round);
    expect(state).toMatchObject({ stage: 1, overHalfRounds: 7 });
    expect(tick(state, 51n, 7)).toBe(state);
    expect(tick(state, 51n, 8)?.stage).toBe(2);
    state = tick(state, 50n, 8);
    expect(state?.overHalfRounds).toBe(0);
    expect(tick(state, 51n, 9)?.stage).toBe(1);
  });
  it('retains warning until zero, stage 2 at a quarter, and administration until a close below half', () => {
    expect(tick({ stage: 1 }, 1n)?.stage).toBe(1);
    expect(tick({ stage: 1 }, 0n)?.stage).toBeUndefined();
    expect(tick({ stage: 2 }, 25n)?.stage).toBe(2);
    expect(tick({ stage: 2 }, 24n)?.stage).toBe(1);
    expect(tick({ stage: 3 }, 0n)?.stage).toBe(3);
    expect(tick({ stage: 3 }, 50n, 46, true)?.stage).toBe(3);
    expect(tick({ stage: 3 }, 49n, 46, true)?.stage).toBe(2);
    expect(tick({ stage: 3 }, 24n, 46, true)?.stage).toBe(1);
    expect(tick({ stage: 3 }, 0n, 46, true)?.stage).toBeUndefined();
    expect(tick({ stage: 1, overHalfRounds: 7 }, 51n, 46, true)?.overHalfRounds).toBe(7);
  });
  it('checks the owner settlement and records one entry without ending play', () => {
    const { w } = npcBooksFixture();
    const facts: unknown[] = [];
    DISTRESS_FLOW.observe = (fact) => {
      expect(Object.isFrozen(fact)).toBe(true);
      facts.push(fact);
    };
    w.round = 1;
    w.cash = (-BigInt(operatingCosts(w).annual) * 2n).toString();
    settleRound(w);
    expect(w.distress?.stage).toBe(3);
    expect(careerEnded(w)).toBe(false);
    expect(w.bankrupt).toBeUndefined();
    expect(w.ended).toBeUndefined();
    expect(w.events.filter((e) => e.kind === 'distress-entry')).toHaveLength(1);
    expect(w.inbox?.filter((e) => e.kind === 'finance' && e.title === '법정관리')).toHaveLength(1);
    settleRound(w, false);
    expect(facts).toEqual([{ club: w.playerClub, stage: 3, pointsDeducted: 10 }]);
    w.cash = '0';
    w.distress = { stage: 2 };
    repayDistress(w);
    expect(w.distress).toBeUndefined();
    w.distress = { stage: 3 };
    repayDistress(w);
    expect(w.distress.stage).toBe(3);
  });
  it('drops quiet recovered state but retains live sanction metadata through JSON reload', () => {
    expect(tick({ stage: 1, lastRound: { year: 1949, round: 3 } }, 0n)).toBeUndefined();
    const pending = { season: 1951, points: 10 };
    const state = tick({ stage: 1, pendingDeduction: pending, deductionSeason: 1950 }, 0n)!;
    expect(Object.hasOwn(state, 'stage')).toBe(false);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state.pendingDeduction).toEqual(pending);
    expect(tick({ deductionSeason: 1949 }, 0n)).toBeUndefined();
  });
  it('releases administration at a legacy founded season close without opening NPC books', () => {
    const { w, c } = npcBooksFixture();
    expect(w.owner).toBeUndefined();
    w.distress = { stage: 3, overHalfRounds: 7, lastRound: { year: w.year, round: 46 } };
    w.cash = '0';
    booksClose(w);
    expect(w.distress).toBeUndefined();
    expect(c.books).toBeUndefined();
  });
  it('checks NPCs only on their settled league rounds and removes the silent debt floor', () => {
    const { w, c } = npcBooksFixture();
    const annual = npcFixedCosts(w, c);
    c.books = { seasons: [], cash: '0', debt: (annual * 2n).toString() };
    const fixture = {
      id: 'round',
      year: w.year,
      round: 1,
      kind: 'league' as const,
      home: c.id,
      away: 'other',
      country: c.country,
      groupKey: 'ESP:0:0',
      score: { home: 0, away: 0 },
    };
    const facts: unknown[] = [];
    DISTRESS_FLOW.observe = (fact) => facts.push(fact);
    w.round = 1;
    settleNpcDistress(w, []);
    expect(c.books.distress).toBeUndefined();
    settleNpcDistress(w, [fixture]);
    expect(c.books.distress?.stage).toBe(3);
    settleNpcDistress(w, [fixture]);
    expect(c.books.distress?.overHalfRounds).toBe(1);
    expect(facts).toEqual([{ club: c.id, stage: 3, pointsDeducted: 10 }]);
    c.books.distress = { stage: 1 };
    c.books.cash = '0';
    c.books.debt = '0';
    w.round++;
    settleNpcDistress(w, [fixture]);
    expect(c.books.distress).toBeUndefined();
    facts.length = 0;
    c.books.debt = (annual / 3n).toString();
    w.round++;
    settleNpcDistress(w, [fixture]);
    settleNpcDistress(w, [fixture]);
    expect(facts).toEqual([{ club: c.id, stage: 1 }]);
    c.books.distress = { stage: 3 };
    c.books.debt = (10n ** 20n).toString();
    const books = settleNpcBooks(w, c);
    expect(BigInt(books.debt)).toBeGreaterThan(10n ** 19n);
    expect(books.distress?.stage).toBe(3);
    expect(books.seasons[0]?.income).toBeDefined();
  });
});
