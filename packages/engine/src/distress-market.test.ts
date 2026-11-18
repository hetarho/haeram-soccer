import { describe, expect, it } from 'vitest';
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
import { signingVerdict } from './signings';
import { operate } from './operations';
import { operatingCosts } from './finance';
import { compareIds } from './primitives';
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
  it.each(['pending', 'countered'] as const)(
    'counts a %s arrival for free-agent minimum/keeper exceptions',
    (status) => {
      const w = ownFixture();
      w.players = w.players.slice(0, 13);
      const player = marketCandidate(w, undefined, 'CM');
      expect(distressSigningReason(w, player, true)).toBeUndefined();
      w.bids = [
        {
          id: 'future',
          direction: 'out',
          playerId: 'arriving',
          fee: '1',
          year: w.year,
          day: 0,
          due: 4,
          status,
          offer: { player: { ...structuredClone(player), id: 'arriving' }, fee: '1', loanFee: '1' },
        },
      ];
      expect(distressSigningReason(w, player, true)).toBe(message('finance.distress.freeMinimum'));
      expect(() =>
        operate(w, {
          type: 'recruit',
          target: { world: w.id, kind: 'offer', playerId: player.id },
        }),
      ).toThrow(message('finance.distress.freeMinimum'));
      w.players = w.players.filter((p) => p.position !== 'GK');
      const keeper = { ...player, position: 'GK' as const };
      expect(distressSigningReason(w, keeper, true)).toBeUndefined();
      while (w.players.length < 13)
        w.players.push({ ...structuredClone(player), id: `extra-count:${w.players.length}` });
      w.bids[0]!.offer!.player.position = 'GK';
      expect(distressSigningReason(w, keeper, true)).toBe(message('finance.distress.freeMinimum'));
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
    expect(w.players.filter((p) => p.stance === 'listed')).toHaveLength(1);
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
  it('accepts exactly 70% from an actual pending bid with sales retained by the owner', () => {
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
    const value = BigInt(playerValue(w, p));
    const fee = distressSaleFee(value).toString();
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
    const context = saleContext(w, { playerId: p.id, sellerId: w.playerClub, fee })!;
    expect(saleAnswer(context, 0.99).kind).toBe('accept');
    expect(saleOutlook(context).accept).toBe(1);
    handoverSales(w, true);
    expect(bid.status).toBe('completed');
    expect(activePlayers(w).some((q) => q.id === p.id)).toBe(false);
    expect(w.events.filter((e) => e.kind === 'transfer-out')).toHaveLength(1);
  });
});
