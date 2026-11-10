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
  marketValue,
  operate,
  placeBid,
  playerValue,
  respondBid,
  SEASON_END_DAY,
  seasonLength,
  transferOffers,
  transferWindow,
} from './index';
import { holdRows, sellPlayer, staffAuthority, unreadAttention } from './testing';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { CLOSED, incoming, on, world } from './transfers.testkit';
import { CAREER_YEAR, careerWorld } from './career.testkit';
import { clubById, squad } from './world';

const share = (amount: string, percent: number) =>
  ((BigInt(amount) * BigInt(percent)) / 100n || 1n).toString();

const outBids = (w: World) => (w.bids || []).filter((b) => b.direction === 'out');
/** The scout's list positions of other clubs' players, who join only through a bid (→CLUB-4). */
const clubIndexes = (w: World) =>
  transferOffers(w).flatMap((offer, i) => (offer.freeAgent ? [] : [i]));
const clubIndex = (w: World) => clubIndexes(w)[0]!;
const freeIndex = (w: World) => transferOffers(w).findIndex((offer) => offer.freeAgent);

/** The default world after 45 unobserved rounds, one round before the season's last. */
const round45 = () =>
  cachedWorld('round-45', () => {
    const w = world();
    while (w.round < 45) advanceRound(w, undefined, false);
    return w;
  });

/** `world`'s market seen from `club`, taken over instead of the lowest division's first club. */
function clubMarket(club: string, seed = 'transfer-market') {
  const w = cachedWorld(`founded:${seed}:${club}`, () =>
    careerWorld({ seed, club }, DISABLED_RELEASE),
  );
  w.settings = staffAuthority(2);
  w.cash = '999999999999';
  return w;
}

/**
 * A market whose scout lists at least six other clubs' players, so bids for every fee-bearing
 * candidate are answered several at once: each division's first club, the lowest first, until one
 * lists six. Since each club's own age ladder (→WORLD-6) spread the ages of the players clubs let
 * go, top-flight free agents inside 영입 기조 표준's ages (→ECON-16) outrank a lowest-division
 * club's candidates, and its list of eight holds one to four of other clubs' players on any seed.
 */
function biddingMarket() {
  for (const club of ['ENG:3:0:0', 'ENG:2:0:0', 'ENG:1:0:0', 'ENG:0:0:0']) {
    const w = clubMarket(club);
    if (clubIndexes(w).length >= 6) return w;
  }
  throw new Error('no first club of a division whose scout lists six other clubs’ players');
}

/** Bids every fee-bearing candidate at a share of the asking fee and lets the clubs answer. */
function bidAll(percent: number, seed?: string, fresh = false) {
  return bidEvery(world(seed, fresh), percent);
}
function bidEvery(w: World, percent: number) {
  const offers = transferOffers(w);
  for (const i of clubIndexes(w)) placeBid(w, i, share(offers[i].fee, percent));
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
    const offers = transferOffers(w),
      free = freeIndex(w),
      [club, other] = clubIndexes(w);
    expect(offers[free]!.freeAgent).toBe(true);
    const before = canonical(w);
    expect(() => assertTransferWindow(w)).toThrow(CLOSED);
    expect(() => operate(w, { type: 'recruit', candidate: club! })).toThrow(CLOSED);
    expect(() => operate(w, { type: 'recruit', candidate: other!, loan: true })).toThrow(CLOSED);
    // A free agent is never loaned: he signs at once (→CLUB-4).
    expect(() => operate(w, { type: 'recruit', candidate: free, loan: true })).toThrow('임대');
    const seller = activePlayers(w).find((p) => lineOf(p.position) === 'MF')!;
    expect(() => operate(w, { type: 'bid', candidate: club!, fee: offers[club!]!.fee })).toThrow(
      CLOSED,
    );
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'recruit', candidate: free });
    expect(w.players.some((p) => p.id === offers[free]!.player.id)).toBe(true);
    on(w, 1, 15);
    sellPlayer(w, seller.id);
    // Another club's player is approached with a bid at his asking fee, never bought outright.
    const target = transferOffers(w)[clubIndex(w)]!;
    operate(w, { type: 'recruit', candidate: clubIndex(w) });
    expect(seller.status).toBe('sold');
    expect(outBids(w).at(-1)).toMatchObject({
      playerId: target.player.id,
      fee: target.fee,
      status: 'pending',
    });
    expect(w.players.some((p) => p.id === target.player.id)).toBe(false);
  });

  it('opens the summer window at the season close and announces each opening once', () => {
    // The season lived day by day up to its last day; the close is played here.
    const w = cachedWorld('last-day', () => {
      const w = world();
      while (currentDay(w) < SEASON_END_DAY) advanceDays(w, 1);
      return w;
    });
    expect(w).toMatchObject({ year: CAREER_YEAR, round: 46 });
    expect(transferWindow(w)).toMatchObject({ open: false, kind: 'summer', daysLeft: 1 });
    // The day after the final round closes the season and opens the next summer window.
    advanceDays(w, 1);
    expect(w.year).toBe(CAREER_YEAR + 1);
    expect(currentDay(w)).toBe(0);
    expect(transferWindow(w)).toMatchObject({ open: true, kind: 'summer', daysLeft: 31 });
    const opens = (w.inbox || []).filter((item) => item.kind === 'window-open');
    const closes = (w.inbox || []).filter((item) => item.kind === 'window-close');
    expect(opens.map((item) => [item.year, item.day, item.attention])).toEqual([
      [CAREER_YEAR, 153, true],
      [CAREER_YEAR + 1, 0, true],
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
      // The top flight pays more for the same player than the last division.
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
    const offers = transferOffers(w),
      club = clubIndex(w);
    expect(() => placeBid(w, freeIndex(w), '1')).toThrow('자유계약');
    expect(() => placeBid(w, 99, '1')).toThrow('없는 선수');
    expect(() => placeBid(w, club, '0')).toThrow('금액');
    expect(() => placeBid(w, club, '-5')).toThrow('금액');
    w.cash = '10';
    expect(() => placeBid(w, club, '11')).toThrow('부족');
    w.cash = '999999999999';
    const cash = w.cash;
    operate(w, { type: 'bid', candidate: club, fee: share(offers[club]!.fee, 90) });
    expect(w.cash).toBe(cash);
    const [bid] = outBids(w);
    expect(bid).toMatchObject({ direction: 'out', status: 'pending', year: w.year, day: 0 });
    expect(bid.due).toBeGreaterThanOrEqual(2);
    expect(bid.due).toBeLessThanOrEqual(4);
    expect(w.events.at(-1)?.kind).toBe('transfer-bid');
    // The bid names the selling club the scout found him at (→CLUB-14).
    expect(bid.club).toBe((offers[club]!.source as { club: string }).club);
    expect(() => placeBid(w, club, offers[club]!.fee)).toThrow('협상 중');
    const full = world();
    for (let i = 0; full.players.filter((p) => p.status === 'active').length < 40; i++)
      full.players.push({ ...structuredClone(full.players[4]), id: `extra:${i}` });
    expect(() => placeBid(full, clubIndex(full), offers[club]!.fee)).toThrow('40');
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('completes generous bids like a recruitment, paying only at completion', () => {
    const { w, offers, cash } = bidEvery(biddingMarket(), 500);
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
    expect(statuses).not.toContain('pending');
    const other = bidAll(80, 'another-market');
    expect(canonical(outBids(other.w))).not.toBe(canonical(outBids(first.w)));
    // Across both markets some modest bids are refused outright.
    expect([...statuses, ...outBids(other.w).map((b) => b.status)]).toContain('rejected');
    const lowball = bidEvery(biddingMarket(), 1);
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
    for (const i of clubIndexes(w)) placeBid(w, i, fees[i]!);
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
    for (const i of clubIndexes(w)) placeBid(w, i, share(offers[i]!.fee, 80));
    expect(outBids(w).every((b) => b.due === 31)).toBe(true);
    advanceDays(w, 2);
    expect(transferWindow(w).daysLeft).toBe(0);
    const countered = outBids(w).filter((b) => b.status === 'countered');
    expect(countered.length).toBeGreaterThan(0);
    expect(outBids(w).some((b) => b.status === 'pending')).toBe(false);
    // A deadline-day bid is answered at once.
    const late = on(world(), 9, 1);
    placeBid(late, clubIndex(late), share(transferOffers(late)[clubIndex(late)]!.fee, 500));
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
    const offers = transferOffers(w),
      [first, second] = clubIndexes(w);
    // 1.2.0 opened the summer window on 14 June, during the final rounds.
    const bid: TransferBid = {
      id: 'out:legacy',
      direction: 'out',
      playerId: offers[first!]!.player.id,
      fee: share(offers[first!]!.fee, 500),
      year: w.year,
      day: currentDay(w),
      due: currentDay(w) + 4,
      status: 'pending',
    };
    w.bids = [bid];
    expect(() => placeBid(w, second!, share(offers[second!]!.fee, 500))).toThrow('이적시장이 닫혀');
    advanceDays(w, 1);
    expect(w.year).toBe(CAREER_YEAR);
    expect(w.bids?.[0]).toMatchObject({ id: 'out:legacy', status: 'expired' });
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('closes a negotiation once the player joined by another route', () => {
    const w = world();
    const offer = transferOffers(w)[clubIndex(w)]!,
      club = (offer.source as { club: string }).club;
    placeBid(w, clubIndex(w), share(offer.fee, 90));
    // He arrives some other way (a loan return, an older save's direct signing).
    w.players.push(structuredClone(offer.player));
    const target = { world: w.id, kind: 'club' as const, clubId: club, playerId: offer.player.id };
    expect(bidOutlook(w, target, '100').chance).toBe(0);
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
    const club = clubIndex(w),
      before = canonical(w),
      asking = transferOffers(w)[club]!.fee;
    const low = bidOutlook(w, club, share(asking, 50)),
      even = bidOutlook(w, club, asking),
      high = bidOutlook(w, club, share(asking, 200));
    expect(canonical(w)).toBe(before);
    expect(low).toMatchObject({ label: '낮음', asking, counterPossible: false, chance: 0.05 });
    expect(even.counterPossible).toBe(true);
    expect(even.chance).toBeGreaterThan(low.chance);
    expect(high).toMatchObject({ label: '높음', chance: 0.95 });
    expect(bidOutlook(w, freeIndex(w), '100').chance).toBe(0);
    expect(bidOutlook(w, club, 'abc').chance).toBe(0);
    expect(bidOutlook(w, club, transferOffers(w)[club]!.loanFee, true).asking).toBe(
      transferOffers(w)[club]!.loanFee,
    );
  });

  it('an inbox read does not change a bid', () => {
    const plain = world(),
      read = world();
    operate(read, { type: 'read-inbox' });
    expect(read.revision).toBe(plain.revision + 1);
    const club = clubIndex(plain),
      fee = share(transferOffers(plain)[club]!.fee, 90);
    for (const w of [plain, read]) operate(w, { type: 'bid', candidate: club, fee });
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
    // The window's last day answers a bid at once; a refused one lets the same player be bid for
    // again that day. A club accepts a bid of 1 one time in twenty, its draw keyed on the bid's ID
    // and so on the player's, which each club's own age ladder (→WORLD-6) renamed: the first of
    // the scout's club candidates whose bid of 1 is refused.
    const candidate = clubIndexes(w).find((i) => {
      const trial = structuredClone(w);
      placeBid(trial, i, '1');
      return outBids(trial)[0]!.status === 'rejected';
    });
    if (candidate === undefined) throw new Error('every club candidate accepts a bid of 1');
    placeBid(w, candidate, '1');
    const [first] = outBids(w);
    expect(first.status).toBe('rejected');
    placeBid(w, candidate, '1');
    const [, renewed] = outBids(w);
    expect(first.id).toBe(`out:${w.year}:${first.day}:0:${first.playerId}`);
    expect(renewed.id).toBe(`out:${w.year}:${first.day}:1:${first.playerId}`);
    expect(w.inbox?.filter((item) => item.ref === renewed.id)).toHaveLength(1);
  });

  it('completes a negotiated loan like a direct loan', () => {
    const w = world();
    const offers = transferOffers(w);
    for (const i of clubIndexes(w)) placeBid(w, i, share(offers[i]!.loanFee, 500), true);
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

  it('finds world players under each setting and the same ones on switching back', () => {
    const w = world();
    const balanced = transferOffers(w),
      before = ids(w);
    // Every listed player is a club's or the pool's: no setting makes one (→CLUB-50).
    for (const offer of balanced)
      expect(
        offer.source.kind === 'club'
          ? squad(w, clubById(w, offer.source.club)!).some((p) => p.id === offer.player.id)
          : w.freeAgents!.some((p) => p.id === offer.player.id),
      ).toBe(true);
    holdRows(w, { policy: { recruitment: 1 } });
    expect(ids(w)).not.toEqual(before);
    holdRows(w, { policy: { recruitment: 3 } });
    expect(transferOffers(w)).toEqual(balanced);
    w.build = { scouting: 'data' };
    expect(ids(w)).not.toEqual(before);
    delete w.build;
    expect(transferOffers(w)).toEqual(balanced);
  });

  it('signs the player a bid was made for at its fee after the list changed', () => {
    const w = world();
    const offer = transferOffers(w)[clubIndex(w)]!,
      fee = share(offer.fee, 500);
    placeBid(w, clubIndex(w), fee);
    const [bid] = outBids(w);
    expect(bid.offer).toEqual({ player: offer.player, fee: offer.fee, loanFee: offer.loanFee });
    holdRows(w, { policy: { recruitment: 5 } });
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

  it('finds a bid saved without terms by its player id; one for a generated player lapses', () => {
    const w = world();
    const offer = transferOffers(w)[clubIndex(w)]!;
    const fee = share(offer.fee, 500);
    // Before 1.15.0 a bid kept no terms and no club: he is found by his id where he plays.
    const bid: TransferBid = {
      id: `out:${w.year}:0:0:${offer.player.id}`,
      direction: 'out',
      playerId: offer.player.id,
      fee,
      year: w.year,
      day: 0,
      due: 2,
      status: 'pending',
    };
    // A scout-generated candidate of an older save exists nowhere (→CLUB-50).
    const ghost: TransferBid = { ...bid, id: 'out:ghost', playerId: `market:${w.year}:2` };
    w.bids = [bid, ghost];
    expect(bidBoard(w).find((entry) => entry.bid.id === bid.id)).toMatchObject({
      player: offer.player,
      asking: offer.fee,
    });
    const cash = BigInt(w.cash);
    advanceDays(w, 2);
    expect(ghost.status).toBe('expired');
    expect(w.inbox?.filter((item) => item.ref === ghost.id)).toHaveLength(1);
    expect(bid.status).toBe('completed');
    expect(bid.offer).toBeUndefined();
    expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
    expect(profile(w.players.find((p) => p.id === offer.player.id)!)).toEqual(
      profile(offer.player),
    );
    expect(w.players.some((p) => p.id === ghost.playerId)).toBe(false);
    expect(validateWorld(w).id).toBe(w.id);
  });
});
