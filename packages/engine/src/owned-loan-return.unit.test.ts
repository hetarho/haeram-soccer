import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { message as sourceMessage } from '../../contracts/src/messages';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Club, World } from '../../contracts/src/types';
import { currentDay, SEASON_END_DAY, SEASON_ROUNDS } from './calendar';
import { npcWageBill } from './books';
import { marketWageAt } from './market-prices';
import { npcMarket, npcMarketDays, returnNpcLoans } from './npc-market';
import { closeNpcSummer } from './npc-careers';
import { retainPerson, openEmployment } from './person-careers';
import { foundSquads } from './persisted-squads';
import { generatedPlayer, invalidateNpcSquad } from './world';
import { worldMarketOffer } from './world-market';
import { worldMarketFixture, marketCandidate } from './world-market.testkit';
import { placeBid, respondBid } from './transfers';

// BEGIN DRAW OBSERVATION
const draws = vi.hoisted(() => [] as [string, number][]);
vi.mock('./primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./primitives')>();
  return {
    ...actual,
    random(seed: string) {
      const r = actual.random(seed);
      return () => {
        const value = r();
        draws.push([seed, value]);
        return value;
      };
    },
  };
});
// END DRAW OBSERVATION
/**
 * Draws that consume randomness. A club manager is a pure derivation keyed by the seed, club and
 * manager count, memoized by club strength; whether a squad re-choice finds him cached depends on
 * earlier work skipped elsewhere (T919), never on what the return settles.
 */
const streamDraws = () => draws.filter(([seed]) => !seed.includes(':club-manager:'));

/** The real owned bid/acceptance path, with a persisted parent and player employment. */
function ownedLoan(age: number, missingParent = false) {
  const w = worldMarketFixture();
  const parent = w.clubs.find((c) => c.id === 'foreign')!;
  parent.country = 'ENG';
  const target = marketCandidate(w, parent, 'LW', age);
  retainPerson(w, target, parent.id);
  openEmployment(w, target.id, 'player', parent.id);
  const offer = worldMarketOffer(w, {
    world: w.id,
    kind: 'club',
    clubId: parent.id,
    playerId: target.id,
  })!;
  placeBid(w, offer.target, offer.loanFee, true);
  const bid = w.bids![0]!;
  bid.status = 'countered';
  bid.counterFee = bid.fee;
  respondBid(w, bid.id, true);
  if (missingParent) w.clubs = w.clubs.filter((c) => c.id !== parent.id);
  return { w, id: target.id, parent: parent.id };
}

/** A blocked young keeper is genuinely loaned through the normal NPC settlement. */
function npcLoan() {
  const w = worldMarketFixture();
  w.calendar = { day: npcMarketDays(w.year)[0]![0]! };
  w.clubs = [
    w.clubs[0]!,
    ...[0, 1].map((n): Club => ({
      ...w.clubs[1]!,
      id: `ENG:0:0:${n}`,
      country: 'ENG',
      strength: 65,
    })),
  ];
  foundSquads(w);
  w.people = {};
  for (const club of w.clubs.slice(1)) {
    for (const p of w.squads![club.id]!) {
      p.born = w.year - 24;
      p.potential = 65;
      p.until = w.year + 3;
      for (const a of ATTRIBUTES) p.attrs[a] = 65;
      p.wage = marketWageAt('ENG', w.year, club.tier, p);
    }
    club.books = {
      seasons: [],
      cash: '999999999999',
      debt: '0',
      openingIncome: npcWageBill(w, club).toString(),
    };
    invalidateNpcSquad(w, club.id);
  }
  const seller = w.clubs[1]!,
    buyer = w.clubs[2]!;
  const p = generatedPlayer('ENG', w.seed, 'listed-keeper', w.year, 75, 'GK', 19, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = 40;
  p.potential = 75;
  p.until = w.year + 4;
  p.wage = marketWageAt('ENG', w.year, 0, p);
  p.graduate = true;
  p.joined = w.year - 2;
  w.squads![seller.id]!.push(p);
  // The pull market bids for unlisted players too (→WORLD-16): the seller's other keepers announce
  // their retirement, which keeps them off it, so the blocked youngster is the keeper on offer.
  for (const q of w.squads![seller.id]!) if (q.position === 'GK' && q !== p) q.retiring = w.year;
  seller.books!.openingIncome = npcWageBill(w, seller).toString();
  w.squads![buyer.id] = w.squads![buyer.id]!.filter((q) => q.position !== 'GK');
  invalidateNpcSquad(w, buyer.id);
  npcMarket(w);
  return { w, id: p.id, parent: seller.id };
}
function atReturn(w: World) {
  w.round = SEASON_ROUNDS;
  w.calendar = { day: SEASON_END_DAY + 1 };
}
function facts(w: World, eventAt: number) {
  const copy = structuredClone(w);
  // New notification only; retain every earlier event and every other world field.
  copy.events.splice(eventAt);
  // The capture predates loyalty, including player snapshots held in pending bids.
  // Keep every earlier fact and compatible release-independent field in this comparison.
  return JSON.parse(
    JSON.stringify({ ...copy, engine: undefined }, (key, value) => {
      if (key !== 'personality' || !value || typeof value !== 'object') return value;
      const { loyalty: _loyalty, ...earlier } = value;
      void _loyalty;
      return earlier;
    }),
  );
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// Baseline captures with the T977 pricing level. Original 134ae45f raw worlds are in .tmp/t912.
const BASELINE = {
  // T979 review correction retains the borrower's own joined/origin facts on its sold row.
  'owned-22': 'fc01e1f0c1c77cc63e709677c4a13fdf9e6b339a910f6718648dbabb7ed1465b',
  'owned-35': '015c80890cec05a6bf46357032f175f3c243ac2ad67d9ca78bed2150d66d4089',
  // T957 production spread changes the NPC founding roster and extra bench players.
  npc: 'a7571099c069f9dae738d6307a4c0976600c81051f67b5586db2612dff8b52d1',
  missing: '02e03844776f859de510dd4890c1c170f074ffffd965f7e4940ff207bd69ed9d',
};

describe('canonical owned loan return notification', () => {
  it.each([22, 35])(
    'notifies one actual return at age %i without changing settled facts',
    (age) => {
      const { w, id, parent } = ownedLoan(age);
      const p = w.players.find((q) => q.id === id)!;
      const terms = structuredClone(w.playerRecords![id]!.loan!);
      const borrowerFacts = { joined: p.joined, graduate: p.graduate };
      expect(p.loanUntil).toBe(w.year + 1);
      expect(w.people![id]!.loan!.club).toBe(parent);
      atReturn(w);
      const eventAt = w.events.length;
      const moveAt = w.playerRecords![id]!.moves.length;
      draws.length = 0;
      returnNpcLoans(w);
      expect(streamDraws()).toEqual([]);
      expect(w.events.slice(eventAt)).toEqual([
        {
          year: w.year,
          round: SEASON_ROUNDS,
          kind: 'loan-return',
          title: sourceMessage('copy.careers.a1549f3110', { p0: p.name }),
          detail: sourceMessage('copy.season.f3d7a85a92'),
        },
      ]);
      expect(p.status).toBe('sold');
      expect({ joined: p.joined, graduate: p.graduate }).toEqual(borrowerFacts);
      expect(p.loanUntil).toBeUndefined();
      expect(w.people![id]!.loan).toBeUndefined();
      expect(w.playerRecords![id]!.loan).toBeUndefined();
      expect(w.people![id]!.club).toBe(parent);
      expect(w.people![id]!.employment.filter((j) => j.role === 'player' && !j.to)).toEqual([
        expect.objectContaining({ club: parent, from: { year: w.year, day: currentDay(w) } }),
      ]);
      const rows = w.squads![parent]!.filter((q) => q.id === id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ wage: terms.wage, until: terms.contractUntil });
      expect(rows[0]!.loanUntil).toBeUndefined();
      expect(w.playerRecords![id]!.moves.slice(moveAt)).toEqual([
        {
          year: w.year,
          day: currentDay(w),
          from: w.playerClub,
          to: parent,
          fee: '0',
        },
      ]);
      expect(digest(facts(w, eventAt))).toBe(BASELINE[`owned-${age}` as keyof typeof BASELINE]);
      const once = structuredClone(w);
      returnNpcLoans(w);
      expect(w).toEqual(once);
      expect(streamDraws()).toEqual([]);
      closeNpcSummer(w);
      expect(w.events.slice(eventAt).filter((e) => e.kind === 'loan-return')).toHaveLength(1);
      expect(w.playerRecords![id]!.moves).toHaveLength(moveAt + 1);
      const closed = structuredClone(w);
      closeNpcSummer(w);
      expect(w).toEqual(closed);
    },
  );

  it('keeps a genuine NPC-to-NPC loan return silent and idempotent', () => {
    const { w, id, parent } = npcLoan();
    expect(w.playerRecords![id]!.moves[0]!.loan).toBe(true);
    expect(w.playerRecords![id]!.loan!.club).toBe(parent);
    atReturn(w);
    const eventAt = w.events.length;
    draws.length = 0;
    returnNpcLoans(w);
    expect(w.events.slice(eventAt)).toEqual([]);
    expect(streamDraws()).toEqual([]);
    expect(w.squads![parent]!.filter((p) => p.id === id)).toHaveLength(1);
    expect(w.playerRecords![id]!.loan).toBeUndefined();
    expect(digest(facts(w, eventAt))).toBe(BASELINE.npc);
    const once = structuredClone(w);
    returnNpcLoans(w);
    expect(w).toEqual(once);
  });

  it('preserves missing-parent behavior without announcing an unsuccessful return', () => {
    const { w, id } = ownedLoan(22, true);
    atReturn(w);
    const eventAt = w.events.length;
    const moves = structuredClone(w.playerRecords![id]!.moves);
    draws.length = 0;
    returnNpcLoans(w);
    expect(w.events.slice(eventAt)).toEqual([]);
    expect(streamDraws()).toEqual([]);
    expect(w.playerRecords![id]!.moves).toEqual(moves);
    expect(w.players.find((p) => p.id === id)!.status).toBe('active');
    expect(w.playerRecords![id]!.loan).toBeUndefined();
    expect(digest(facts(w, eventAt))).toBe(BASELINE.missing);
  });
});
