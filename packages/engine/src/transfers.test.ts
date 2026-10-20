import { lineOf } from './player';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  advanceRound,
  assertTransferWindow,
  bidBoard,
  bidOutlook,
  clubOf,
  currentDay,
  dailyMarket,
  FOUNDING_YEAR,
  marketValue,
  operate,
  placeBid,
  playerValue,
  respondBid,
  SEASON_END_DAY,
  seasonLength,
  transferOffers,
  transferWindow,
  unreadAttention,
} from './index';
import { sellPlayer } from './testing';
import { cachedWorld } from '../../../tests/fixtures/worlds';
import { CLOSED, incoming, on, world } from './transfers.testkit';

const share = (amount: string, percent: number) =>
  ((BigInt(amount) * BigInt(percent)) / 100n || 1n).toString();

const outBids = (w: World) => (w.bids || []).filter((b) => b.direction === 'out');

/** The default world after 45 unobserved rounds, one round before the season's last. */
const round45 = () =>
  cachedWorld('round-45', () => {
    const w = world();
    while (w.round < 45) advanceRound(w, undefined, false);
    return w;
  });

/** Bids every fee-bearing candidate at a share of the asking fee and lets the clubs answer. */
function bidAll(percent: number, seed?: string, fresh = false) {
  const w = world(seed, fresh);
  const offers = transferOffers(w);
  for (let i = 1; i < offers.length; i++) placeBid(w, i, share(offers[i].fee, percent));
  const cash = BigInt(w.cash);
  advanceDays(w, 4);
  return { w, offers, cash };
}

function pushAttention(w: World, ref: string) {
  w.inbox = [
    ...(w.inbox || []),
    {
      id: `test:${ref}`,
      year: w.year,
      day: 0,
      kind: 'incoming-bid',
      title: 't',
      detail: '',
      attention: true,
      ref,
    },
  ];
}

describe('transfer windows', () => {
  it('opens in summer to 1 September and in winter for January, with Korean labels', () => {
    const w = world();
    expect(transferWindow(w, 0)).toEqual({
      open: true,
      kind: 'summer',
      label: '여름 이적시장 · 9월 1일 마감 · D-31',
      until: 31,
      daysLeft: 31,
    });
    expect(transferWindow(w, 31).label).toBe('여름 이적시장 · 9월 1일 마감 · D-day');
    expect(transferWindow(w, 32)).toEqual({
      open: false,
      kind: 'winter',
      label: '이적시장 닫힘 · 1월 1일 개장 · D-121',
      until: 153,
      daysLeft: 121,
    });
    expect(transferWindow(w, 152).open).toBe(false);
    expect(transferWindow(w, 153)).toMatchObject({ open: true, kind: 'winter', until: 184 });
    expect(transferWindow(w, 153).label).toBe('겨울 이적시장 · 2월 1일 마감 · D-31');
    expect(transferWindow(w, 184).open).toBe(true);
    expect(transferWindow(w, 185)).toMatchObject({
      open: false,
      kind: 'summer',
      until: SEASON_END_DAY + 1,
    });
    expect(transferWindow(w, 185).label).toBe('이적시장 닫힘 · 시즌 종료 직후 개장 · D-138');
    expect(transferWindow(w, SEASON_END_DAY)).toMatchObject({ open: false, daysLeft: 1 });
  });

  it('keeps window boundaries in leap seasons, including the Gregorian century rule', () => {
    const w = world();
    for (const [year, length] of [
      [1902, 365],
      [1903, 366],
      [1999, 366],
      [2099, 365],
    ] as const) {
      w.year = year;
      expect(seasonLength(w)).toBe(length);
      expect(transferWindow(w, 184).open).toBe(true);
      expect(transferWindow(w, 185).open).toBe(false);
      expect(transferWindow(w, SEASON_END_DAY)).toMatchObject({ open: false, daysLeft: 1 });
    }
  });

  it('refuses fee-bearing purchases, loans and sales while closed but signs free agents', () => {
    const w = on(world(), 10, 1);
    const offers = transferOffers(w);
    expect(offers[0].freeAgent).toBe(true);
    const before = canonical(w);
    expect(() => assertTransferWindow(w)).toThrow(CLOSED);
    expect(() => operate(w, { type: 'recruit', candidate: 2 })).toThrow(CLOSED);
    expect(() => operate(w, { type: 'recruit', candidate: 3, loan: true })).toThrow(CLOSED);
    expect(() => operate(w, { type: 'recruit', candidate: 0, loan: true })).toThrow(CLOSED);
    const seller = activePlayers(w).find((p) => lineOf(p.position) === 'MF')!;
    expect(() => operate(w, { type: 'bid', candidate: 2, fee: offers[2].fee })).toThrow(CLOSED);
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'recruit', candidate: 0 });
    expect(w.players.some((p) => p.id === offers[0].player.id)).toBe(true);
    on(w, 1, 15);
    sellPlayer(w, seller.id);
    operate(w, { type: 'recruit', candidate: 2 });
    expect(seller.status).toBe('sold');
    expect(w.players.some((p) => p.id === offers[2].player.id)).toBe(true);
  });

  it('opens the summer window at the season close and announces each opening once', () => {
    // The season lived day by day up to its last day; the close is played here.
    const w = cachedWorld('last-day', () => {
      const w = world();
      while (currentDay(w) < SEASON_END_DAY) advanceDays(w, 1);
      return w;
    });
    expect(w).toMatchObject({ year: FOUNDING_YEAR, round: 46 });
    expect(transferWindow(w)).toMatchObject({ open: false, kind: 'summer', daysLeft: 1 });
    // The day after the final round closes the season and opens the next summer window.
    advanceDays(w, 1);
    expect(w.year).toBe(FOUNDING_YEAR + 1);
    expect(currentDay(w)).toBe(0);
    expect(transferWindow(w)).toMatchObject({ open: true, kind: 'summer', daysLeft: 31 });
    const opens = (w.inbox || []).filter((item) => item.kind === 'window-open');
    const closes = (w.inbox || []).filter((item) => item.kind === 'window-close');
    expect(opens.map((item) => [item.year, item.day, item.attention])).toEqual([
      [FOUNDING_YEAR, 153, true],
      [FOUNDING_YEAR + 1, 0, true],
    ]);
    expect(closes.map((item) => [item.day, item.attention])).toEqual([
      [31, false],
      [184, false],
    ]);
    // Whole-round jumps live through the same days without announcing twice.
    const jumped = round45();
    while (jumped.round < 46) advanceRound(jumped, undefined, false);
    expect((jumped.inbox || []).filter((item) => item.kind.startsWith('window-'))).toHaveLength(3);
    jumped.calendar = { day: 153 };
    dailyMarket(jumped);
    dailyMarket(jumped);
    expect((jumped.inbox || []).filter((item) => item.kind.startsWith('window-'))).toHaveLength(3);
  });
});

describe('player value', () => {
  it('is his market value in our division unless another is given, more for promise', () => {
    const w = world();
    const own = clubOf(w).tier;
    for (const p of activePlayers(w)) {
      expect(playerValue(w, p)).toBe(marketValue(w, p, own));
      // The top flight pays more for the same player than the amateur league.
      expect(BigInt(playerValue(w, p, 0))).toBeGreaterThan(BigInt(playerValue(w, p)));
    }
    const prospect = structuredClone(activePlayers(w)[3]);
    prospect.born = w.year - 18;
    prospect.potential = 95;
    const older = { ...prospect, born: w.year - 24 };
    expect(BigInt(playerValue(w, prospect))).toBeGreaterThan(BigInt(playerValue(w, older)));
  });
});

describe('outgoing bids', () => {
  it('validates the candidate, price, window and squad before recording a pending bid', () => {
    const w = world();
    const offers = transferOffers(w);
    expect(() => placeBid(w, 0, '1')).toThrow('자유계약');
    expect(() => placeBid(w, 99, '1')).toThrow('없는 선수');
    expect(() => placeBid(w, 2, '0')).toThrow('금액');
    expect(() => placeBid(w, 2, '-5')).toThrow('금액');
    w.cash = '10';
    expect(() => placeBid(w, 2, '11')).toThrow('부족');
    w.cash = '999999999999';
    const cash = w.cash;
    operate(w, { type: 'bid', candidate: 2, fee: share(offers[2].fee, 90) });
    expect(w.cash).toBe(cash);
    const [bid] = outBids(w);
    expect(bid).toMatchObject({ direction: 'out', status: 'pending', year: w.year, day: 0 });
    expect(bid.due).toBeGreaterThanOrEqual(2);
    expect(bid.due).toBeLessThanOrEqual(4);
    expect(w.events.at(-1)?.kind).toBe('transfer-bid');
    expect(() => placeBid(w, 2, offers[2].fee)).toThrow('협상 중');
    const full = world();
    for (let i = 0; full.players.filter((p) => p.status === 'active').length < 40; i++)
      full.players.push({ ...structuredClone(full.players[4]), id: `extra:${i}` });
    expect(() => placeBid(full, 2, offers[2].fee)).toThrow('40');
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('completes generous bids like a recruitment, paying only at completion', () => {
    const { w, offers, cash } = bidAll(500);
    const completed = outBids(w).filter((b) => b.status === 'completed');
    expect(completed.length).toBeGreaterThanOrEqual(5);
    // No match is played in the first four days, so the fees are the only movement.
    const paid = completed.reduce((sum, b) => sum + BigInt(b.fee), 0n);
    expect(cash - BigInt(w.cash)).toBe(paid);
    for (const bid of completed) {
      const offer = offers.find((o) => o.player.id === bid.playerId)!;
      expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('active');
      expect(
        w.events.some(
          (e) =>
            e.kind === 'transfer-in' && e.amount === bid.fee && e.title.includes(offer.player.name),
        ),
      ).toBe(true);
      expect(
        w.inbox?.some(
          (item) => item.ref === bid.id && item.kind === 'bid-response' && item.attention,
        ),
      ).toBe(true);
      expect(w.inbox?.find((item) => item.ref === bid.id)?.title).toBe(
        `${offer.player.name} 영입 완료`,
      );
    }
  });

  it('answers modest bids with counters or refusals and is deterministic per seed', () => {
    // One run from a world founded here, so the founding's determinism is checked too.
    const first = bidAll(80),
      again = bidAll(80, undefined, true);
    expect(canonical(first.w)).toBe(canonical(again.w));
    const statuses = outBids(first.w).map((b) => b.status);
    expect(statuses).toContain('countered');
    expect(statuses).toContain('rejected');
    expect(statuses).not.toContain('pending');
    const other = bidAll(80, 'another-market');
    expect(canonical(outBids(other.w))).not.toBe(canonical(outBids(first.w)));
    const lowball = bidAll(1);
    expect(outBids(lowball.w).filter((b) => b.status === 'rejected').length).toBeGreaterThanOrEqual(
      6,
    );
    expect(outBids(lowball.w).some((b) => b.status === 'countered')).toBe(false);
    for (const bid of outBids(lowball.w).filter((b) => b.status === 'rejected'))
      expect(lowball.w.inbox?.find((item) => item.ref === bid.id)?.title).toContain('제안 거절');
  });

  it('completes an accepted counter at the counter fee and lets the owner refuse another', () => {
    const { w, offers } = bidAll(80);
    const [accepted, refused] = outBids(w).filter((b) => b.status === 'countered');
    const asking = BigInt(offers.find((o) => o.player.id === accepted.playerId)!.fee);
    const counter = BigInt(accepted.counterFee!);
    expect(counter * 100n).toBeGreaterThanOrEqual(asking * 110n - 100n);
    expect(counter * 100n).toBeLessThanOrEqual(asking * 125n + 100n);
    const board = bidBoard(w).find((entry) => entry.bid.id === accepted.id)!;
    expect(board).toMatchObject({ actionable: true, asking: asking.toString() });
    expect(unreadAttention(w).some((item) => item.ref === accepted.id)).toBe(true);
    const cash = BigInt(w.cash);
    operate(w, { type: 'respond-bid', id: accepted.id, accept: true });
    expect(accepted.status).toBe('completed');
    expect(BigInt(w.cash)).toBe(cash - counter);
    expect(w.players.some((p) => p.id === accepted.playerId)).toBe(true);
    expect(unreadAttention(w).some((item) => item.ref === accepted.id)).toBe(false);
    expect(() => respondBid(w, accepted.id, true)).toThrow('응답할 수 있는');
    if (refused) {
      operate(w, { type: 'respond-bid', id: refused.id, accept: false });
      expect(refused.status).toBe('rejected');
      expect(w.players.some((p) => p.id === refused.playerId)).toBe(false);
    }
  });

  it('refuses at completion when the money ran out after submission', () => {
    const w = world();
    const offers = transferOffers(w);
    const fees = offers.map((o) => share(o.fee, 500));
    for (let i = 1; i < offers.length; i++) placeBid(w, i, fees[i]);
    w.cash = '1';
    advanceDays(w, 4);
    expect(outBids(w).some((b) => b.status === 'completed')).toBe(false);
    const failed = outBids(w).filter(
      (b) =>
        b.status === 'rejected' && w.inbox?.find((i) => i.ref === b.id)?.title.includes('무산'),
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(w.inbox?.find((i) => i.ref === failed[0].id)?.detail).toContain('자금');
  });

  it('answers late bids by the deadline and expires open negotiations when the window closes', () => {
    const w = on(world(), 8, 30);
    const offers = transferOffers(w);
    for (let i = 1; i < offers.length; i++) placeBid(w, i, share(offers[i].fee, 80));
    expect(outBids(w).every((b) => b.due === 31)).toBe(true);
    advanceDays(w, 2);
    expect(transferWindow(w).daysLeft).toBe(0);
    const countered = outBids(w).filter((b) => b.status === 'countered');
    expect(countered.length).toBeGreaterThan(0);
    expect(outBids(w).some((b) => b.status === 'pending')).toBe(false);
    // A deadline-day bid is answered at once.
    const late = on(world(), 9, 1);
    placeBid(late, 3, share(transferOffers(late)[3].fee, 500));
    expect(outBids(late)[0].status).not.toBe('pending');
    advanceDays(w, 1);
    expect(transferWindow(w).open).toBe(false);
    for (const bid of countered) {
      expect(bid.status).toBe('expired');
      const note = w.inbox?.filter((i) => i.ref === bid.id).at(-1);
      expect(note).toMatchObject({ kind: 'staff-report', attention: false });
    }
    expect(() => respondBid(w, countered[0].id, true)).toThrow('응답할 수 있는');
  });

  it('ends a negotiation left open by older rules once the window is closed', () => {
    const w = cachedWorld('two-days-before-the-end', () => {
      const w = round45();
      advanceDays(w, SEASON_END_DAY - 2 - currentDay(w));
      return w;
    });
    const offers = transferOffers(w);
    // 1.2.0 opened the summer window on 14 June, during the final rounds.
    const bid: TransferBid = {
      id: 'out:legacy',
      direction: 'out',
      playerId: offers[5].player.id,
      fee: share(offers[5].fee, 500),
      year: w.year,
      day: currentDay(w),
      due: currentDay(w) + 4,
      status: 'pending',
    };
    w.bids = [bid];
    expect(() => placeBid(w, 6, share(offers[6].fee, 500))).toThrow('이적시장이 닫혀');
    advanceDays(w, 1);
    expect(w.year).toBe(FOUNDING_YEAR);
    expect(w.bids?.[0]).toMatchObject({ id: 'out:legacy', status: 'expired' });
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('closes a negotiation once the player was signed directly', () => {
    const w = world();
    placeBid(w, 4, share(transferOffers(w)[4].fee, 90));
    operate(w, { type: 'recruit', candidate: 4 });
    expect(bidOutlook(w, 4, '100').chance).toBe(0);
    advanceDays(w, 1);
    const [bid] = outBids(w);
    expect(bid.status).toBe('expired');
    expect(w.inbox?.find((i) => i.ref === bid.id)?.detail).toContain('이미 우리 선수');
    expect(w.players.filter((p) => p.id === bid.playerId)).toHaveLength(1);
  });

  it('ends negotiations priced in a currency that has since been replaced', () => {
    const w = world();
    w.year = 1970;
    w.currency = 'GBP-LSD';
    const p = activePlayers(w)[5];
    const bid = incoming(w, p.id, '2400');
    w.inbox = [];
    pushAttention(w, bid.id);
    w.year = 1971;
    w.currency = 'GBP';
    w.calendar = { day: 1 };
    dailyMarket(w);
    expect(bid.status).toBe('expired');
    expect(unreadAttention(w)).toEqual([]);
    expect(w.inbox?.at(-1)?.detail).toContain('화폐');
  });

  it('describes the chance without consuming randomness or changing the world', () => {
    const w = world();
    const before = canonical(w),
      asking = transferOffers(w)[2].fee;
    const low = bidOutlook(w, 2, share(asking, 50)),
      even = bidOutlook(w, 2, asking),
      high = bidOutlook(w, 2, share(asking, 200));
    expect(canonical(w)).toBe(before);
    expect(low).toMatchObject({ label: '낮음', asking, counterPossible: false, chance: 0.05 });
    expect(even.counterPossible).toBe(true);
    expect(even.chance).toBeGreaterThan(low.chance);
    expect(high).toMatchObject({ label: '높음', chance: 0.95 });
    expect(bidOutlook(w, 0, '100').chance).toBe(0);
    expect(bidOutlook(w, 2, 'abc').chance).toBe(0);
    expect(bidOutlook(w, 3, transferOffers(w)[3].loanFee, true).asking).toBe(
      transferOffers(w)[3].loanFee,
    );
  });

  it('an inbox read does not change a bid', () => {
    const plain = world(),
      read = world();
    operate(read, { type: 'read-inbox' });
    expect(read.revision).toBe(plain.revision + 1);
    const fee = share(transferOffers(plain)[3].fee, 90);
    for (const w of [plain, read]) operate(w, { type: 'bid', candidate: 3, fee });
    const [bid] = outBids(plain);
    expect(bid.id).toBe(`out:${plain.year}:0:0:${bid.playerId}`);
    expect(outBids(read)).toEqual([bid]);
    for (const w of [plain, read]) advanceDays(w, 4);
    expect(outBids(plain)[0].status).not.toBe('pending');
    expect(canonical(outBids(read))).toBe(canonical(outBids(plain)));
    expect(canonical({ ...read, revision: plain.revision })).toBe(canonical(plain));
  });

  it('gives a renewed bid on the same day its own ID', () => {
    const w = on(world(), 9, 1);
    placeBid(w, 3, '1');
    const [first] = outBids(w);
    expect(first.status).toBe('rejected');
    placeBid(w, 3, '1');
    const [, renewed] = outBids(w);
    expect(first.id).toBe(`out:${w.year}:${first.day}:0:${first.playerId}`);
    expect(renewed.id).toBe(`out:${w.year}:${first.day}:1:${first.playerId}`);
    expect(w.inbox?.filter((item) => item.ref === renewed.id)).toHaveLength(1);
  });

  it('completes a negotiated loan like a direct loan', () => {
    const w = world();
    const offers = transferOffers(w);
    for (let i = 1; i < offers.length; i++) placeBid(w, i, share(offers[i].loanFee, 500), true);
    advanceDays(w, 4);
    const done = outBids(w).filter((b) => b.status === 'completed');
    expect(done.length).toBeGreaterThan(0);
    for (const bid of done) {
      expect(bid.loan).toBe(true);
      expect(w.players.find((p) => p.id === bid.playerId)?.loanUntil).toBe(w.year + 1);
    }
  });
});

describe('market identity', () => {
  const ids = (w: World) => transferOffers(w).map((o) => o.player.id);
  const profile = (p: Player) => {
    const { id, name, position, born, attrs, potential, wage } = p;
    return { id, name, position, born, attrs, potential, wage };
  };

  it('draws one list per combination of settings and the same list on switching back', () => {
    const w = world();
    const balanced = transferOffers(w),
      before = ids(w);
    for (const id of before) expect(id).toMatch(/^market:\d{4}:[0-9a-z]{7}:f?\d+$/);
    operate(w, { type: 'policy', key: 'recruitment', level: 1 });
    const prospects = ids(w);
    expect(prospects.filter((id) => before.includes(id))).toEqual([]);
    operate(w, { type: 'policy', key: 'recruitment', level: 3 });
    expect(transferOffers(w)).toEqual(balanced);
    w.build = { scouting: 'data' };
    expect(ids(w).filter((id) => [...before, ...prospects].includes(id))).toEqual([]);
  });

  it('signs the player a bid was made for at its fee after the list changed', () => {
    const w = world();
    const offer = transferOffers(w)[2],
      fee = share(offer.fee, 500);
    placeBid(w, 2, fee);
    const [bid] = outBids(w);
    expect(bid.offer).toEqual({ player: offer.player, fee: offer.fee, loanFee: offer.loanFee });
    operate(w, { type: 'policy', key: 'recruitment', level: 5 });
    expect(ids(w)).not.toContain(offer.player.id);
    expect(bidBoard(w)[0]).toMatchObject({ player: offer.player, asking: offer.fee });
    const cash = BigInt(w.cash);
    advanceDays(w, 4);
    expect(bid.status).toBe('completed');
    // No match is played in the first four days, so the fee is the only movement.
    expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
    const signed = w.players.find((p) => p.id === offer.player.id)!;
    expect(profile(signed)).toEqual(profile(offer.player));
    expect(signed).not.toBe(bid.offer!.player);
    expect(w.events.some((e) => e.kind === 'transfer-in' && e.amount === fee)).toBe(true);
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('answers a bid pending from before 1.15.0 through its season list', () => {
    const w = world();
    const legacy = transferOffers(w, w.year, true)[2];
    expect(legacy.player.id).toBe(`market:${w.year}:2`);
    const fee = share(legacy.fee, 500);
    const bid: TransferBid = {
      id: `out:${w.year}:0:0:${legacy.player.id}`,
      direction: 'out',
      playerId: legacy.player.id,
      fee,
      year: w.year,
      day: 0,
      due: 2,
      status: 'pending',
    };
    w.bids = [bid];
    expect(bidBoard(w)[0]).toMatchObject({ player: legacy.player, asking: legacy.fee });
    const cash = BigInt(w.cash);
    advanceDays(w, 2);
    expect(bid.status).toBe('completed');
    expect(bid.offer).toBeUndefined();
    expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
    expect(profile(w.players.find((p) => p.id === legacy.player.id)!)).toEqual(
      profile(legacy.player),
    );
    expect(validateWorld(w).id).toBe(w.id);
  });
});
