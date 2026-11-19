import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { TransferFact, World } from '../../contracts/src/types';
import { activePlayers, advanceDays, currentDay, operate, placeBid, transferOffers } from './index';
import { addEvent } from './events';
import { inTodayMoney, transferLedger, transferRanking } from './transfer-records';
import { suitorFor } from './transfers';
import { incoming, world } from './transfers.testkit';
import { buyOffer, wouldJoin } from './testing';

/** The scout's list positions of other clubs' players, who join only through a bid (→CLUB-4). */
const clubIndexes = (w: World) =>
  transferOffers(w).flatMap((offer, i) => (offer.freeAgent ? [] : [i]));
const clubOfOffer = (offer: { source: { kind: string; club?: string } }) => offer.source.club!;

const fact = (w: World, year: number, fee: string, name: string): TransferFact => ({
  direction: 'in',
  loan: false,
  player: `p:${name}`,
  name,
  fee,
  currency: w.currency,
  year,
  day: 10,
});

describe('own-club transfer facts (→HIST-20)', () => {
  it('records a fee signing, a loan and a sale', () => {
    const w = world();
    // A chief scout who searches the whole country (→CLUB-51): likely takers come first in each
    // line (→CLUB-53), so a basic scout's short list can hold a single other club's player.
    w.staff = w.staff!.map((member) =>
      member.role === 'scout' ? { ...member, ability: 80 } : member,
    );
    // Each joins when he agrees to our terms at the 200% step too (→CLUB-53): the first and then the
    // next of the list whose seeded answers do.
    const offers = transferOffers(w),
      first = clubIndexes(w).find((i) =>
        wouldJoin(w, offers[i]!.player.id, (c) => buyOffer(c, i, false, 2)),
      ),
      bought = offers[first!]!,
      day = currentDay(w);
    expect(bought).toMatchObject({ freeAgent: false, available: true });
    buyOffer(w, first!, false, 2);
    const listed = transferOffers(w),
      second = clubIndexes(w).find(
        (i) =>
          listed[i]!.player.id !== bought.player.id &&
          wouldJoin(w, listed[i]!.player.id, (c) => buyOffer(c, i, true, 2)),
      ),
      loaned = listed[second!]!;
    expect(loaned).toMatchObject({ freeAgent: false, available: true });
    buyOffer(w, second!, true, 2);
    // An outfield player a club would actually sign at the bid's fee: each buyer takes only a
    // player it needs and can register and pay for (→WORLD-16).
    const sold = activePlayers(w).find(
      (p) => p.position !== 'GK' && suitorFor(w, p, () => 0, '12345'),
    )!;
    const bid = incoming(w, sold.id, '12345');
    bid.club = suitorFor(w, sold, () => 0, '12345')!.id;
    operate(w, { type: 'respond-bid', id: bid.id, accept: true });
    // The record starts at the first fee signing's ledger line, the bid's own line before it.
    expect(w.events[w.transfers!.ledgerBefore]).toMatchObject({
      kind: 'transfer-in',
      amount: bought.fee,
    });
    expect(w.transfers!.facts).toEqual([
      {
        direction: 'in',
        loan: false,
        player: bought.player.id,
        person: bought.player.id,
        name: bought.player.name,
        club: clubOfOffer(bought),
        fee: bought.fee,
        currency: w.currency,
        year: w.year,
        day,
      },
      {
        direction: 'in',
        loan: true,
        player: loaned.player.id,
        person: loaned.player.id,
        name: loaned.player.name,
        club: clubOfOffer(loaned),
        fee: loaned.loanFee,
        currency: w.currency,
        year: w.year,
        day,
      },
      {
        direction: 'out',
        loan: false,
        player: sold.id,
        person: sold.id,
        name: sold.name,
        club: bid.club,
        fee: '12345',
        currency: w.currency,
        year: w.year,
        day,
      },
    ]);
    expect(validateWorld(w).transfers).toEqual(w.transfers);
  });

  it('records an accepted bid as it completes', () => {
    const w = world();
    const offers = transferOffers(w);
    for (const i of clubIndexes(w)) placeBid(w, i, (BigInt(offers[i]!.fee) * 5n).toString());
    advanceDays(w, 4);
    const completed = (w.bids || []).filter(
      (b) => b.direction === 'out' && b.status === 'completed',
    );
    expect(completed.length).toBeGreaterThan(0);
    // Clubs answer on their own days, so the facts keep completion order, not bid order.
    expect(w.transfers!.facts.map((f) => `${f.player} ${f.fee} ${f.direction}`).sort()).toEqual(
      completed.map((b) => `${b.playerId} ${b.fee} in`).sort(),
    );
  });

  it('records nothing for a free agent', () => {
    const w = world();
    // A free agent answers our terms at once, on a draw of the day (→CLUB-53). This list's free
    // agents suit divisions far above ours, so each says yes to the 200% step only now and then:
    // the season's first day one of them does, and the first who does that day.
    const recruit = (copy: World, candidate: number) =>
      operate(copy, { type: 'recruit', candidate, wage: 2 });
    let free = -1;
    for (let day = 0; free < 0 && day < 30; day++) {
      w.calendar = { day };
      free = transferOffers(w).findIndex(
        (offer, i) => offer.freeAgent && wouldJoin(w, offer.player.id, (c) => recruit(c, i)),
      );
    }
    expect(free).toBeGreaterThanOrEqual(0);
    expect(transferOffers(w)[free]!.fee).toBe('0');
    recruit(w, free);
    expect(w.events.at(-1)).toMatchObject({ kind: 'transfer-in' });
    expect(w.transfers).toBeUndefined();
  });

  it('ranks by today’s money across seasons', () => {
    const w = world();
    const old = w.year - 30;
    w.transfers = {
      ledgerBefore: w.events.length,
      facts: [
        fact(w, w.year, '1200000', 'now'),
        fact(w, old, '1000000', 'then'),
        fact(w, w.year, '1200000', 'tied later'),
      ],
    };
    const then = inTodayMoney(w, '1000000', old);
    // Prices rose, so the older, smaller fee is worth more today.
    expect(BigInt(then)).toBeGreaterThan(1200000n);
    expect(inTodayMoney(w, '1200000', w.year)).toBe('1200000');
    const rows = transferRanking(w, { direction: 'in' });
    expect(rows.map((r) => (r.source === 'fact' ? r.fact.name : r.index))).toEqual([
      'then',
      'now',
      'tied later',
    ]);
    expect(rows[0].today).toBe(then);
    expect(transferRanking(w, { direction: 'out' })).toEqual([]);
  });

  it('falls back to ledger entries before the first fact', () => {
    const w = world();
    const start = w.events.length;
    addEvent(w, 'transfer-in', '옛 영입', '', '700000');
    addEvent(w, 'transfer-in', '자유계약', '', '0');
    addEvent(w, 'transfer-out', '옛 매각', '', '900000');
    // Without facts every ledger entry is the older career's.
    expect(transferRanking(w, { direction: 'in' })).toEqual([
      { source: 'ledger', event: w.events[start], index: start, today: '700000' },
    ]);
    buyOffer(w, clubIndexes(w)[0]!);
    // The bid's own line (no amount, no ledger entry) comes before the signing's.
    expect(w.events[start + 3]!.kind).toBe('transfer-bid');
    expect(w.transfers!.ledgerBefore).toBe(start + 4);
    expect(transferLedger(w).map((entry) => entry.index)).toEqual([start, start + 2]);
    const rows = transferRanking(w, { direction: 'in' });
    // The new signing's own ledger entry is not ranked a second time.
    expect(rows.map((r) => r.source).sort()).toEqual(['fact', 'ledger']);
    expect(rows.find((r) => r.source === 'ledger')).toMatchObject({ index: start });
    expect(transferRanking(w, { direction: 'out' })).toEqual([
      { source: 'ledger', event: w.events[start + 2], index: start + 2, today: '900000' },
    ]);
  });

  it('filters one season', () => {
    const w = world();
    w.transfers = {
      ledgerBefore: w.events.length,
      facts: [fact(w, w.year - 1, '200', 'last'), fact(w, w.year, '100', 'this')],
    };
    expect(
      transferRanking(w, { direction: 'in', year: w.year }).map(
        (r) => r.source === 'fact' && r.fact.name,
      ),
    ).toEqual(['this']);
    expect(transferRanking(w, { direction: 'in', year: w.year - 2 })).toEqual([]);
    expect(transferRanking(w, { direction: 'in' })).toHaveLength(2);
  });
});
