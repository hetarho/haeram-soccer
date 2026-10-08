import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  advanceRound,
  assertTransferWindow,
  bidBoard,
  bidOutlook,
  createWorld,
  currentDay,
  dailyMarket,
  operate,
  overall,
  placeBid,
  playerValue,
  quote,
  respondBid,
  seasonDayOf,
  seasonLength,
  selectedLineup,
  transferOffers,
  transferWindow,
  unreadAttention,
} from './index';

const CLOSED = '이적시장이 닫혀 있어요. 자유계약 선수만 언제든 영입할 수 있어요.';

function world(seed = 'transfer-market') {
  const w = createWorld({
    country: 'ENG',
    name: 'Market Town',
    color: '#224433',
    seed,
    difficulty: 2,
  });
  w.cash = '999999999999';
  return w;
}
const on = (w: World, month: number, date: number) => {
  w.calendar = { day: seasonDayOf(w.year, month, date) };
  return w;
};
const share = (amount: string, percent: number) =>
  ((BigInt(amount) * BigInt(percent)) / 100n || 1n).toString();
const outBids = (w: World) => (w.bids || []).filter((b) => b.direction === 'out');
const inBids = (w: World) => (w.bids || []).filter((b) => b.direction === 'in');
/** Bids every fee-bearing candidate at a share of the asking fee and lets the clubs answer. */
function bidAll(percent: number, seed?: string) {
  const w = world(seed);
  w.delegation = { ...w.delegation, transfers: false };
  const offers = transferOffers(w);
  for (let i = 1; i < offers.length; i++) placeBid(w, i, share(offers[i].fee, percent));
  const cash = BigInt(w.cash);
  advanceDays(w, 4);
  return { w, offers, cash };
}
function incoming(w: World, playerId: string, fee: string): TransferBid {
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `in:test:${playerId}`,
    direction: 'in',
    playerId,
    club: w.clubs.find((c) => c.tier === 0 && c.country === 'ENG')!.id,
    fee,
    year: w.year,
    day,
    due: day + 5,
    status: 'pending',
  };
  w.bids = [...(w.bids || []), bid];
  return bid;
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
    expect(transferWindow(w, 185)).toMatchObject({ open: false, kind: 'summer', until: 317 });
    expect(transferWindow(w, 185).label).toBe('이적시장 닫힘 · 6월 14일 개장 · D-132');
    expect(transferWindow(w, 316).open).toBe(false);
    expect(transferWindow(w, 317)).toMatchObject({ open: true, kind: 'summer' });
  });

  it('carries the summer window across the season rollover', () => {
    const w = world();
    const last = seasonLength(w) - 1;
    expect(transferWindow(w, last)).toEqual({
      open: true,
      kind: 'summer',
      label: '여름 이적시장 · 9월 1일 마감 · D-32',
      until: seasonLength(w) + 31,
      daysLeft: 32,
    });
    // The next season resumes the same window on its first day.
    w.year++;
    expect(transferWindow(w, 0)).toMatchObject({ open: true, kind: 'summer', daysLeft: 31 });
  });

  it('counts February 29 in leap seasons, including the Gregorian century rule', () => {
    const w = world();
    for (const [year, opening, length] of [
      [1902, 317, 365],
      [1903, 318, 366],
      [1999, 318, 366],
      [2099, 317, 365],
    ] as const) {
      w.year = year;
      expect(seasonLength(w)).toBe(length);
      expect(transferWindow(w, opening - 1)).toMatchObject({ open: false, daysLeft: 1 });
      expect(transferWindow(w, opening)).toMatchObject({
        open: true,
        until: length + 31,
        daysLeft: length + 31 - opening,
      });
      expect(transferWindow(w, 184).open).toBe(true);
      expect(transferWindow(w, 185).open).toBe(false);
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
    const seller = activePlayers(w).find((p) => p.role === 'MID')!;
    expect(() => operate(w, { type: 'sell', id: seller.id })).toThrow(CLOSED);
    expect(() => operate(w, { type: 'bid', candidate: 2, fee: offers[2].fee })).toThrow(CLOSED);
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'recruit', candidate: 0 });
    expect(w.players.some((p) => p.id === offers[0].player.id)).toBe(true);
    on(w, 1, 15);
    operate(w, { type: 'sell', id: seller.id });
    operate(w, { type: 'recruit', candidate: 2 });
    expect(seller.status).toBe('sold');
    expect(w.players.some((p) => p.id === offers[2].player.id)).toBe(true);
  });

  it('announces each opening once as attention and each deadline quietly, never on 1 August', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
    for (let n = 0; n < seasonLength(w) - 1; n++) advanceDays(w, 1);
    const opens = (w.inbox || []).filter((item) => item.kind === 'window-open');
    const closes = (w.inbox || []).filter((item) => item.kind === 'window-close');
    expect(opens.map((item) => [item.day, item.attention])).toEqual([
      [153, true],
      [317, true],
    ]);
    expect(closes.map((item) => [item.day, item.attention])).toEqual([
      [31, false],
      [184, false],
    ]);
    // Whole-round jumps live through the same days without announcing twice.
    const jumped = world();
    jumped.delegation = { ...jumped.delegation, transfers: false };
    while (jumped.round < 46) advanceRound(jumped, undefined, false);
    expect((jumped.inbox || []).filter((item) => item.kind.startsWith('window-'))).toHaveLength(4);
    jumped.calendar = { day: 153 };
    dailyMarket(jumped);
    dailyMarket(jumped);
    expect((jumped.inbox || []).filter((item) => item.kind.startsWith('window-'))).toHaveLength(4);
  });
});

describe('player value', () => {
  it('extends the sale price with a bounded youth premium', () => {
    const w = world();
    for (const p of activePlayers(w)) {
      const sale = BigInt(quote('ENG', w.year, Math.max(10, (overall(p) - 25) * 5)));
      const value = BigInt(playerValue(w, p));
      expect(value).toBeGreaterThanOrEqual(sale);
      expect(value).toBeLessThanOrEqual(sale * 2n + 1n);
      if (w.year - p.born > 23) expect(value).toBe(sale);
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
    for (let i = 0; full.players.filter((p) => p.status === 'active').length < 26; i++)
      full.players.push({ ...structuredClone(full.players[4]), id: `extra:${i}` });
    expect(() => placeBid(full, 2, offers[2].fee)).toThrow('26');
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
    const first = bidAll(80),
      again = bidAll(80);
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
    w.delegation = { ...w.delegation, transfers: false };
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
    w.delegation = { ...w.delegation, transfers: false };
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

  it('settles a bid whose answer falls in the next season against the market it was made in', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
    while (w.round < 46) advanceRound(w, undefined, false);
    w.calendar = { day: seasonLength(w) - 2 };
    const offers = transferOffers(w);
    placeBid(w, 5, share(offers[5].fee, 500));
    const [bid] = outBids(w);
    expect(bid.due).toBeGreaterThanOrEqual(seasonLength(w));
    advanceDays(w, 6);
    expect(w.year).toBe(1902);
    expect(bid.status).toBe('completed');
    const signed = w.players.find((p) => p.id === offers[5].player.id)!;
    expect(signed).toMatchObject({ name: offers[5].player.name, status: 'active' });
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('closes a negotiation once the player was signed directly', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
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
    w.delegation = { ...w.delegation, transfers: false };
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

  it('completes a negotiated loan like a direct loan', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
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

describe('incoming bids', () => {
  it('arrive only inside windows, at most three at a time, and lapse after their due day', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
    const seen = new Set<string>();
    for (let n = 0; n < seasonLength(w) - 1; n++) {
      advanceDays(w, 1);
      const day = currentDay(w),
        open = transferWindow(w).open;
      const pending = inBids(w).filter((b) => b.status === 'pending');
      expect(pending.length).toBeLessThanOrEqual(3);
      for (const bid of pending) expect(day).toBeLessThanOrEqual(bid.due);
      for (const bid of inBids(w).filter((b) => !seen.has(b.id))) {
        seen.add(bid.id);
        expect(bid.day).toBe(day);
        expect(open).toBe(true);
        expect(bid.due).toBeLessThanOrEqual(transferWindow(w).until!);
        const item = (w.inbox || []).find((i) => i.ref === bid.id)!;
        expect(item).toMatchObject({ kind: 'incoming-bid', attention: true });
        const club = w.clubs.find((c) => c.id === bid.club)!;
        const player = w.players.find((p) => p.id === bid.playerId)!;
        expect(club.tier).toBeLessThanOrEqual(w.clubs.find((c) => c.id === w.playerClub)!.tier);
        expect(item.title).toContain(`${club.name}이(가) ${player.name}에게`);
        const value = BigInt(playerValue(w, player));
        expect(BigInt(bid.fee) * 100n).toBeGreaterThanOrEqual(value * 90n - 100n);
        expect(BigInt(bid.fee) * 100n).toBeLessThanOrEqual(value * 160n + 100n);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(inBids(w).some((b) => b.status === 'expired')).toBe(true);
    expect(w.players.every((p) => p.status === 'active')).toBe(true);
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('lets the owner sell to a bidder within the squad rules or refuse', () => {
    const w = world();
    w.delegation = { ...w.delegation, transfers: false };
    const mid = activePlayers(w).find((p) => p.role === 'MID')!;
    const bid = incoming(w, mid.id, '12345');
    w.inbox = [];
    const cash = BigInt(w.cash);
    operate(w, { type: 'respond-bid', id: bid.id, accept: true });
    expect(mid.status).toBe('sold');
    expect(bid.status).toBe('completed');
    expect(BigInt(w.cash)).toBe(cash + 12345n);
    expect(w.events.at(-1)).toMatchObject({ kind: 'transfer-out', amount: '12345' });
    const def = activePlayers(w).find((p) => p.role === 'DEF')!;
    const refused = incoming(w, def.id, '500');
    respondBid(w, refused.id, false);
    expect(refused.status).toBe('rejected');
    expect(def.status).toBe('active');
    // Squad minimum and the last goalkeeper.
    const keepers = activePlayers(w).filter((p) => p.role === 'GK');
    keepers[1].status = 'retired';
    const lastKeeper = incoming(w, keepers[0].id, '500');
    expect(() => respondBid(w, lastKeeper.id, true)).toThrow('골키퍼');
    for (const p of activePlayers(w)
      .filter((p) => p.role !== 'GK')
      .slice(14 - 1))
      p.status = 'retired';
    expect(activePlayers(w)).toHaveLength(14);
    const minimum = incoming(w, activePlayers(w).find((p) => p.role === 'FWD')!.id, '500');
    const before = canonical(w);
    expect(() => respondBid(w, minimum.id, true)).toThrow('최소 선수단');
    expect(canonical(w)).toBe(before);
    // Sales need an open window.
    on(w, 10, 1);
    for (const p of w.players) if (p.status === 'retired') p.status = 'active';
    expect(() => respondBid(w, minimum.id, true)).toThrow(CLOSED);
  });

  it('lets delegated staff answer quietly: only generous offers for non-essential players', () => {
    const w = world();
    // New clubs answer offers themselves; this scenario hands transfers to the staff.
    expect(w.delegation?.transfers).toBe(false);
    w.delegation = { ...w.delegation, transfers: true };
    const decisions: { bid: TransferBid; starter: boolean; age: number; value: bigint }[] = [];
    for (let n = 0; n < seasonLength(w) - 1; n++) {
      const known = new Set(inBids(w).map((b) => b.id));
      advanceDays(w, 1);
      for (const bid of inBids(w).filter((b) => !known.has(b.id))) {
        // Nothing else changes after the day's market, so this reproduces the staff's view.
        const p = w.players.find((x) => x.id === bid.playerId)!;
        const squad = [
          ...activePlayers(w),
          ...(p.status === 'sold' ? [{ ...p, status: 'active' as const }] : []),
        ];
        const starters = selectedLineup(squad, w.lineup, w.manager, w.year).map((x) => x.id);
        decisions.push({
          bid,
          starter: starters.includes(p.id),
          age: w.year - p.born,
          value: BigInt(playerValue(w, p)),
        });
      }
      expect(activePlayers(w).length).toBeGreaterThanOrEqual(14);
    }
    expect(decisions.some((d) => d.bid.status === 'completed')).toBe(true);
    expect(decisions.some((d) => d.bid.status === 'rejected')).toBe(true);
    for (const { bid, starter, age, value } of decisions) {
      expect(['completed', 'rejected']).toContain(bid.status);
      const item = w.inbox?.find((i) => i.ref === bid.id);
      if (item) expect(item).toMatchObject({ kind: 'staff-report', attention: false });
      if (bid.status === 'completed') {
        expect(BigInt(bid.fee) * 10n).toBeGreaterThanOrEqual(value * 13n);
        expect(!starter || age >= 30).toBe(true);
        expect(w.players.find((p) => p.id === bid.playerId)?.status).toBe('sold');
      }
    }
    expect(
      unreadAttention(w).filter((i) => i.kind === 'incoming-bid' || i.kind === 'staff-report'),
    ).toEqual([]);
  });

  it('keeps older saves without bids or inbox working', () => {
    const w = world();
    delete w.bids;
    delete w.inbox;
    delete w.delegation;
    for (let n = 0; n < 31; n++) advanceDays(w, 1);
    expect(Array.isArray(w.bids) || w.bids === undefined).toBe(true);
    expect(() => respondBid(w, 'missing', true)).toThrow('없는');
    const bare = world();
    delete bare.bids;
    expect(bidBoard(bare)).toEqual([]);
    expect(validateWorld(w).id).toBe(w.id);
  });
});
