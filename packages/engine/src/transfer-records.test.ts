import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/index';
import type { TransferFact, World } from '../../contracts/src/types';
import { activePlayers, advanceDays, currentDay, operate, placeBid, transferOffers } from './index';
import { addEvent } from './events';
import { inTodayMoney, transferLedger, transferRanking } from './transfer-records';
import { incoming, world } from './transfers.testkit';

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
    const offers = transferOffers(w),
      day = currentDay(w);
    operate(w, { type: 'recruit', candidate: 1 });
    operate(w, { type: 'recruit', candidate: 2, loan: true });
    const sold = activePlayers(w).find((p) => p.position !== 'GK')!;
    const bid = incoming(w, sold.id, '12345');
    operate(w, { type: 'respond-bid', id: bid.id, accept: true });
    expect(w.transfers!.ledgerBefore).toBe(w.events.length - 3);
    expect(w.transfers!.facts).toEqual([
      {
        direction: 'in',
        loan: false,
        player: offers[1].player.id,
        person: offers[1].player.id,
        name: offers[1].player.name,
        fee: offers[1].fee,
        currency: w.currency,
        year: w.year,
        day,
      },
      {
        direction: 'in',
        loan: true,
        player: offers[2].player.id,
        person: offers[2].player.id,
        name: offers[2].player.name,
        fee: offers[2].loanFee,
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
    for (let i = 1; i < offers.length; i++) placeBid(w, i, (BigInt(offers[i].fee) * 5n).toString());
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
    expect(transferOffers(w)[0].fee).toBe('0');
    operate(w, { type: 'recruit', candidate: 0 });
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
    operate(w, { type: 'recruit', candidate: 1 });
    expect(w.transfers!.ledgerBefore).toBe(start + 3);
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
