import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { expireContracts } from './contracts';
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { invalidateNpcSquad } from './world';
import { suitorFor } from './transfers';

describe('contract expiry is free in every era', () => {
  it.each([1960, 2000])('records no fee or compensation in %i', (year) => {
    const w = worldMarketFixture();
    w.year = year;
    w.clubs[2]!.representative = true;
    foundSquads(w);
    const buyer = w.clubs[1]!;
    const p = w.players[0]!;
    p.born = year - 25;
    p.until = year;
    p.potential = 55;
    for (const a of ATTRIBUTES) p.attrs[a] = 55;
    for (const other of w.players.slice(1)) other.until = year + 2;
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((q) => q.position !== 'GK');
    buyer.books = { seasons: [], cash: '999999999', debt: '0', openingIncome: '999999999' };
    invalidateNpcSquad(w, buyer.id);
    expect(suitorFor(w, p, () => 0, '0')).toBe(buyer);
    const cash = w.cash;
    const books = structuredClone(buyer.books);
    expireContracts(w);
    expect(p.status).toBe('sold');
    expect(w.squads![buyer.id]!.find((q) => q.id === p.id)).toBeDefined();
    expect(w.playerRecords![p.id]!.moves.at(-1)).toMatchObject({
      from: w.playerClub,
      to: buyer.id,
      fee: '0',
    });
    expect(w.cash).toBe(cash);
    expect(buyer.books).toEqual({ ...books, transfersPaid: '0' });
    expect(w.events.at(-1)).toMatchObject({ kind: 'contract-expiry' });
    expect(w.events.at(-1)!.amount).toBeUndefined();
    expect(w.events.some((event) => event.kind === 'free-transfer-compensation')).toBe(false);
  });
});
