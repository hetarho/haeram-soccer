import { describe, expect, it, vi } from 'vitest';
import type { TransferBid } from '../../contracts/src/types';
import { message } from '../../contracts/src/messages';
import { distressSaleFee, distressSalePlan, distressSigningReason } from './distress';
import { npcBooksFixture } from './npc-books.testkit';
import { marketCandidate, worldMarketFixture } from './world-market.testkit';
import { npcDebt, npcFixedCosts } from './books';
import { forceDistressSales, handoverSales, placeBid, playerValue } from './transfers';
import { npcOffer } from './npc-market';
import { saleAnswer, saleContext, saleOutlook } from './sale-answer';
import { recruitmentPreview } from './recruitment';
import { signingVerdict, wageOffer, recruitmentProjection, staffSignings } from './signings';
import { operatingCosts } from './finance';
import { compareIds, ratio } from './primitives';
import { defaultSettings } from './responsibilities';
import * as scoutSearch from './scout-search';
import { footballQuote } from './quotes';
import { staffBidShare } from './director-bidding';
import { activePlayers } from './player-state';

function ownFixture() {
  const w = worldMarketFixture();
  for (let i = 0; i < 5; i++)
    w.players.push({ ...structuredClone(w.players[1]!), id: `extra:${i}` });
  w.distress = { stage: 2 };
  return w;
}
describe('distress market sanctions', () => {
  it('blocks real owner fee/loan commands, previews and delegated verdicts with the same reason', () => {
    const w = ownFixture();
    const seller = w.clubs[1]!;
    const player = marketCandidate(w, seller, 'CM');
    const target = { world: w.id, kind: 'club' as const, clubId: seller.id, playerId: player.id };
    for (const loan of [false, true])
      expect(() => placeBid(w, target, '1', loan)).toThrow(message('finance.distress.noSigning'));
    expect(signingVerdict(w, player, '1')).toEqual({
      ok: false,
      reason: message('finance.distress.noSigning'),
    });
    const offer = {
      player,
      available: true,
      freeAgent: false,
      foreign: false,
      fee: '1',
      loanFee: '1',
    };
    expect(recruitmentPreview(w, offer)).toMatchObject({
      eligible: false,
      reason: message('finance.distress.noSigning'),
    });
    expect(recruitmentPreview(w, offer, true).eligible).toBe(false);
    delete w.distress;
    expect(() => placeBid(w, target, '1')).not.toThrow();
  });
  it('uses actual agency/loan facts for zero quotes and ignores prohibited pending places', () => {
    const w = ownFixture();
    w.players = w.players.slice(0, 13);
    const p = marketCandidate(w, undefined, 'CM');
    const offer = {
      player: p,
      available: true,
      freeAgent: false,
      foreign: false,
      fee: '1',
      loanFee: '0',
      source: { kind: 'club' as const, club: w.clubs[1]!.id },
    };
    expect(wageOffer(w, offer, '0', 'short')).toMatchObject({ ok: false });
    for (const facts of [
      { freeAgent: false },
      { freeAgent: false, loan: true },
      { freeAgent: true, loan: true },
    ])
      expect(signingVerdict(w, p, '0', 'short', undefined, facts)).toMatchObject({
        ok: false,
        reason: message('finance.distress.noSigning'),
      });
    expect(signingVerdict(w, p, '0', 'short', undefined, { freeAgent: true }).ok).toBe(true);
    w.bids = [
      {
        id: 'prohibited',
        direction: 'out',
        playerId: 'blocked',
        fee: '0',
        year: w.year,
        day: 0,
        due: 4,
        status: 'pending',
        loan: true,
        offer: { player: p, fee: '0', loanFee: '0' },
      },
    ];
    expect(distressSigningReason(w, p, true)).toBeUndefined();
  });
  it('safely advances delegated recruitment when a paid quote rounds to zero', () => {
    const w = ownFixture();
    w.settings = defaultSettings();
    w.settings.responsibilities.recruitment = 'delegated';
    w.delegationRequests = { recruitment: 1 };
    w.calendar = { day: 0 };
    w.players = w.players.filter((p) => p.position !== 'GK');
    const seller = w.clubs[1]!;
    const p = marketCandidate(w, seller, 'GK');
    const offer = {
      player: p,
      available: true,
      freeAgent: false,
      foreign: false,
      fee: footballQuote('ENG', w.year, 0.000001),
      loanFee: '0',
      source: { kind: 'club' as const, club: seller.id },
    };
    expect(ratio(offer.fee, BigInt(staffBidShare(w)), 100n)).toBe('0');
    const spy = vi.spyOn(scoutSearch, 'reachOffers').mockReturnValue([offer]);
    try {
      expect(() => staffSignings(w)).not.toThrow();
      expect(w.bids?.filter((b) => b.direction === 'out') ?? []).toEqual([]);
      expect(w.players.some((q) => q.id === p.id)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
  it('restores previous stances after recovery while preserving voluntary listings', () => {
    const w = ownFixture();
    w.cash = (-BigInt(operatingCosts(w).annual)).toString();
    w.players[1]!.stance = 'untouchable';
    w.players[2]!.stance = 'listed';
    forceDistressSales(w);
    const previous = w.players
      .filter((p) => p.distressListing !== undefined)
      .map((p) => [p.id, p.distressListing] as const);
    expect(previous.length).toBeGreaterThan(0);
    w.cash = '0';
    forceDistressSales(w);
    for (const [id, stance] of previous)
      expect(w.players.find((p) => p.id === id)?.stance).toBe(
        stance === 'open' ? undefined : stance,
      );
    expect(w.players[2]!.stance).toBe('listed');
    expect(w.players.every((p) => p.distressListing === undefined)).toBe(true);
  });
  it.each(['pending', 'countered'] as const)(
    'does not count a prohibited %s fee bid as an emergency place',
    (status) => {
      const w = ownFixture();
      w.players = w.players.slice(0, 13);
      const player = marketCandidate(w, undefined, 'CM');
      w.bids = [
        {
          id: 'future',
          direction: 'out',
          club: w.clubs[1]!.id,
          playerId: 'arriving',
          fee: '0',
          year: w.year,
          day: 0,
          due: 4,
          status,
          offer: { player: { ...structuredClone(player), id: 'arriving' }, fee: '1', loanFee: '0' },
        },
      ];
      expect(distressSigningReason(w, player, true)).toBeUndefined();
      expect(recruitmentProjection(w).arriving).toEqual([]);
      w.players = w.players.filter((p) => p.position !== 'GK');
      while (w.players.length < 14)
        w.players.push({ ...structuredClone(player), id: `extra-count:${w.players.length}` });
      const keeper = { ...player, position: 'GK' as const };
      w.bids[0]!.offer!.player.position = 'GK';
      expect(distressSigningReason(w, keeper, true)).toBeUndefined();
      expect(distressSigningReason(w, player, true)).toBe(
        message('finance.distress.freeMinimumLimit', { minimum: 14 }),
      );
    },
  );
  it('lists the most valuable saleable owner player without delegation and stops below the strict half line', () => {
    const w = ownFixture();
    const candidates = w.players.sort(
      (a, b) =>
        Number(BigInt(playerValue(w, b)) - BigInt(playerValue(w, a))) || compareIds(a.id, b.id),
    );
    const top = candidates[0]!;
    const annual = BigInt(operatingCosts(w).annual);
    const debt = annual / 2n + distressSaleFee(BigInt(playerValue(w, top))) - 1n;
    w.cash = (-debt).toString();
    forceDistressSales(w);
    expect(w.players.filter((p) => p.stance === 'listed').map((p) => p.id)).toEqual([top.id]);
    w.cash = (-annual / 2n + 1n).toString();
    forceDistressSales(w);
    expect(w.players.filter((p) => p.stance === 'listed')).toHaveLength(0);
    expect(top.distressListing).toBeUndefined();
    const plan = distressSalePlan(
      candidates,
      50n,
      100n,
      () => 10n,
      () => true,
    );
    expect(plan).toHaveLength(1);
    expect(
      distressSalePlan(
        candidates,
        49n,
        100n,
        () => 10n,
        () => true,
      ),
    ).toHaveLength(0);
  });
  it('uses actual NPC balances and receipts, and refuses both fee and loan buyers under sanctions', () => {
    const { w, c } = npcBooksFixture();
    c.books = {
      seasons: [],
      cash: '20',
      debt: '100',
      transfersReceived: '30',
      transfersPaid: '5',
      distress: { stage: 2 },
    };
    expect(npcDebt(w, c)).toBe(55n);
    const p = w.players.find((p) => p.position === 'GK')!;
    w.squads![c.id] = w.squads![c.id]!.filter((p) => p.position !== 'GK');
    c.books.cash = '999999999999';
    for (const loan of [false, true])
      expect(npcOffer(w, c, p, w.clubs[0]!, '1', loan)).toBeUndefined();
    delete c.books.distress;
    expect(npcOffer(w, c, p, w.clubs[0]!, '1')).toBeDefined();
    expect(npcFixedCosts(w, c)).toBeGreaterThan(0n);
  });
  it.each([false, true])(
    'accepts a pending 70 percent sale while cash remains negative (delegated: %s)',
    (delegated) => {
      const { w, c } = npcBooksFixture();
      for (let i = 0; i < 5; i++)
        w.players.push({ ...structuredClone(w.players[1]!), id: `extra:${i}` });
      const p = {
        ...structuredClone(w.players[0]!),
        id: 'keeper-for-sale',
        stance: 'untouchable' as const,
      };
      w.players.push(p);
      w.squads![c.id] = w.squads![c.id]!.filter((p) => p.position !== 'GK');
      c.books = { seasons: [], cash: '999999999999', debt: '0', openingIncome: '999999999' };
      w.distress = { stage: 2 };
      if (delegated) w.settings = defaultSettings();
      if (delegated) w.settings!.responsibilities.sales = 'delegated';
      const value = BigInt(playerValue(w, p));
      const fee = distressSaleFee(value).toString();
      w.cash = (-BigInt(fee) * 3n).toString();
      const bid: TransferBid = {
        id: 'distress-sale',
        direction: 'in',
        playerId: p.id,
        club: c.id,
        fee,
        year: w.year,
        day: 0,
        due: 10,
        status: 'pending',
      };
      w.bids = [bid];
      const paid = npcOffer(w, c, p, w.clubs[0]!, fee)!.paid;
      const context = saleContext(w, { playerId: p.id, sellerId: w.playerClub, fee })!;
      expect(saleAnswer(context, 0.99).kind).toBe('accept');
      expect(saleOutlook(context).accept).toBe(1);
      handoverSales(w, !delegated);
      expect(bid.status).toBe('completed');
      expect(BigInt(w.cash)).toBe(-BigInt(fee) * 2n);
      expect(c.books!.transfersPaid).toBe(paid);
      expect(activePlayers(w).some((q) => q.id === p.id)).toBe(false);
      expect(w.events.filter((e) => e.kind === 'transfer-out')).toHaveLength(1);
    },
  );
});
