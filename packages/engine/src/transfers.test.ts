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
import { holdRows, prepareSaleBuyer, sellPlayer, staffAuthority, unreadAttention } from './testing';
import { handoverSales, saleBar } from './transfers';
import { saleAnswer, saleContext } from './sale-answer';
import { random } from './primitives';
import { openNeeds } from './replacements';
import { ownStarters } from './world';
import { overall } from './player-state';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
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
const freeIndexes = (w: World) =>
  transferOffers(w).flatMap((offer, i) => (offer.freeAgent ? [i] : []));
/**
 * Our club as a top-flight one: the pool's free agents are top-flight players, who would not drop
 * three divisions for a lowest-division club on any wage (→CLUB-53).
 */
const topFlight = (w: World) => {
  clubOf(w).tier = 0;
  return w;
};
const signed = (w: World, id: string) =>
  w.players.some((p) => p.id === id && p.status === 'active');
/**
 * The first of `indexes` whose player answers `act` as wanted, tried on a copy of the world: each
 * player's terms are his own seeded draw (→CLUB-53), so a test picks one who agrees or refuses.
 */
function whoAnswers(
  w: World,
  indexes: number[],
  act: (w: World, index: number) => void,
  agrees: boolean,
) {
  const id = (i: number) => transferOffers(w)[i]!.player.id;
  const found = indexes.find((i) => {
    const trial = structuredClone(w);
    act(trial, i);
    return signed(trial, id(i)) === agrees;
  });
  if (found === undefined) throw new Error(`no candidate who ${agrees ? 'agrees' : 'refuses'}`);
  return found;
}

/** The default world after 45 unobserved rounds, one round before the season's last. */
const round45 = () =>
  cachedWorld('round-45', () => {
    const w = world();
    while (w.round < 45) advanceRound(w, undefined, false);
    return w;
  });

/** `world`'s market seen from `club`, taken over instead of the lowest division's first club. */
function clubMarket(club: string, seed = 'transfer-market') {
  const w = cachedWorld(`founded:${seed}:${club}`, () => careerWorld({ seed, club }));
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
    const w = topFlight(on(world(), 10, 1));
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
    // He answers our terms at once (→CLUB-53): one who agrees signs outside the window.
    const keen = whoAnswers(
      w,
      freeIndexes(w),
      (trial, i) => operate(trial, { type: 'recruit', candidate: i, wage: 2 }),
      true,
    );
    operate(w, { type: 'recruit', candidate: keen, wage: 2 });
    expect(signed(w, offers[keen]!.player.id)).toBe(true);
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
    // A bid above the asking fee is always accepted (→CLUB-52); only a player's refusal of our
    // terms ends one, with nothing paid (→CLUB-53), or his move elsewhere in the clubs' own window
    // market before the answer, which lapses it (→CLUB-50, WORLD-16).
    expect(completed.length).toBeGreaterThanOrEqual(1);
    for (const bid of outBids(w).filter((b) => b.status !== 'completed'))
      if (bid.status === 'expired')
        expect(squad(w, clubById(w, bid.club!)!).some((p) => p.id === bid.playerId)).toBe(false);
      else expect(bid).toMatchObject({ status: 'rejected', refusedBy: 'player' });
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
      expect(w.inbox?.find((item) => item.ref === bid.id)?.detail).toContain('구단이 버틴 선');
    }
  });

  it('counters modest bids and refuses low bids deterministically per seed', () => {
    // One run from a world founded here, so the founding's determinism is checked too.
    const first = bidAll(80),
      again = bidAll(80, undefined, true);
    expect(canonical(first.w)).toBe(canonical(again.w));
    const statuses = outBids(first.w).map((b) => b.status);
    expect(statuses).toContain('countered');
    expect(statuses).not.toContain('pending');
    const other = bidAll(80, 'another-market');
    expect(canonical(outBids(other.w))).not.toBe(canonical(outBids(first.w)));
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
    const countered = outBids(w).filter((b) => b.status === 'countered');
    // The counter whose player agrees to our terms, and another to refuse.
    const accepted = countered.find((bid) => {
      const trial = structuredClone(w);
      respondBid(trial, bid.id, true);
      return signed(trial, bid.playerId);
    })!;
    const refused = countered.find((bid) => bid !== accepted);
    const asking = BigInt(offers.find((o) => o.player.id === accepted.playerId)!.fee);
    const counter = BigInt(accepted.counterFee!);
    // The seller counters at its reservation: above the bid, never above its asking fee (→CLUB-52).
    expect(counter).toBeGreaterThan(BigInt(accepted.fee));
    expect(counter).toBeLessThanOrEqual(asking);
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
      near = bidOutlook(w, club, share(asking, 85)),
      even = bidOutlook(w, club, asking),
      high = bidOutlook(w, club, share(asking, 200));
    expect(canonical(w)).toBe(before);
    // At or above the asking fee the seller always accepts (→CLUB-52); below it the chances fall.
    expect(even).toMatchObject({ asking, chance: 1, counter: 0 });
    expect(high).toMatchObject({ chance: 1, counter: 0 });
    expect(near.chance).toBeLessThanOrEqual(even.chance);
    expect(low.chance).toBeLessThanOrEqual(near.chance);
    expect(low.chance + low.counter).toBeLessThanOrEqual(near.chance + near.counter);
    for (const read of [low, near, even]) expect(read.chance + read.counter).toBeLessThanOrEqual(1);
    expect(near.lines.some((line) => line.factor === 'place')).toBe(true);
    // The player's chance at each wage step, higher the more we offer (→CLUB-53).
    const steps = even.terms!.steps;
    expect(steps.map((step) => step.step)).toEqual([1, 1.25, 1.5, 2]);
    expect(steps[0]!.wage).toBe(even.terms!.demand);
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]!.chance).toBeGreaterThan(steps[i - 1]!.chance);
    // A free agent has no seller to answer, only his terms, with the free agent's lift.
    const free = bidOutlook(w, freeIndex(w), '100');
    expect(free.chance).toBe(0);
    expect(free.terms!.steps[0]!.lines.some((line) => line.factor === 'freeAgent')).toBe(true);
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

describe('personal terms (→CLUB-53)', () => {
  /** A bid above the asking fee, so the seller surely agrees, at a wage step, answered on day 4. */
  const generous = (w: World, i: number, wage?: 1 | 1.25 | 1.5 | 2) => {
    operate(w, {
      type: 'bid',
      candidate: i,
      fee: share(transferOffers(w)[i]!.fee, 500),
      ...(wage ? { wage } : {}),
    });
    advanceDays(w, 4);
  };

  it('signs a player who agrees on the wage step offered, his demand times the step', () => {
    const w = world(),
      i = whoAnswers(w, clubIndexes(w), (trial, j) => generous(trial, j, 1.5), true),
      offer = transferOffers(w)[i]!,
      cash = BigInt(w.cash);
    generous(w, i, 1.5);
    const [bid] = outBids(w);
    expect(bid).toMatchObject({ status: 'completed', wage: 1.5 });
    expect(BigInt(w.cash)).toBe(cash - BigInt(bid.fee));
    const p = w.players.find((x) => x.id === offer.player.id)!;
    expect(BigInt(p.wage)).toBe((BigInt(offer.player.wage) * 15000n) / 10000n);
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('ends the bid when he refuses: no fee paid, no player, a report naming his factors', () => {
    const w = biddingMarket(),
      i = whoAnswers(w, clubIndexes(w), (trial, j) => generous(trial, j), false),
      offer = transferOffers(w)[i]!,
      cash = w.cash;
    generous(w, i);
    const [bid] = outBids(w);
    expect(bid).toMatchObject({ status: 'rejected', refusedBy: 'player' });
    expect(bid.wage).toBeUndefined();
    expect(w.cash).toBe(cash);
    expect(signed(w, offer.player.id)).toBe(false);
    const report = w.inbox!.find((item) => item.ref === bid.id)!;
    expect(report).toMatchObject({ kind: 'bid-response', attention: true });
    expect(report.title).toContain('개인 조건 거절');
    expect(report.detail).toContain('이적료는 내지 않았어요');
    // His chance and factors, and the club's reservation with its own factors (→CLUB-52/53).
    expect(report.detail).toContain('수락 가능성');
    expect(report.detail).toContain('구단이 버틴 선');
    expect(validateWorld(w).id).toBe(w.id);
  });

  it('answers the same terms the same way and a bigger step can win him', () => {
    const w = biddingMarket(),
      i = whoAnswers(w, clubIndexes(w), (trial, j) => generous(trial, j), false);
    const again = biddingMarket();
    generous(again, i);
    generous(w, i);
    expect(canonical(outBids(again))).toBe(canonical(outBids(w)));
    // His chance rises with the step; the draw stays his own.
    const steps = bidOutlook(biddingMarket(), i, '1').terms!.steps;
    expect(steps[3]!.chance).toBeGreaterThan(steps[0]!.chance);
  });

  it('refuses a wage step that is not one of the four', () => {
    const w = world(),
      i = clubIndex(w);
    expect(() =>
      operate(w, {
        type: 'bid',
        candidate: i,
        fee: transferOffers(w)[i]!.fee,
        wage: 1.3 as unknown as 1.25,
      }),
    ).toThrow('100%');
    expect(outBids(w)).toEqual([]);
  });

  it('asks a free agent at once: he signs on the step or stays free with a report', () => {
    const w = topFlight(world()),
      frees = freeIndexes(w),
      recruit = (trial: World, i: number, wage: 1 | 2) =>
        operate(trial, { type: 'recruit', candidate: i, wage });
    const keen = whoAnswers(w, frees, (trial, i) => recruit(trial, i, 2), true);
    const offer = transferOffers(w)[keen]!;
    const ok = structuredClone(w),
      cash = ok.cash;
    recruit(ok, keen, 2);
    expect(ok.cash).toBe(cash);
    expect(ok.players.find((p) => p.id === offer.player.id)!.wage).toBe(
      (BigInt(offer.player.wage) * 2n).toString(),
    );
    expect(ok.freeAgents!.some((p) => p.id === offer.player.id)).toBe(false);
    // At a lowest-division club one refuses and stays in the pool, cash and squad as they were;
    // asked again that day at the same step he answers the same.
    const low = world(),
      cold = whoAnswers(low, freeIndexes(low), (trial, i) => recruit(trial, i, 1), false),
      id = transferOffers(low)[cold]!.player.id,
      before = { cash: low.cash, players: low.players.length };
    recruit(low, cold, 1);
    expect(signed(low, id)).toBe(false);
    expect({ cash: low.cash, players: low.players.length }).toEqual(before);
    expect(low.freeAgents!.some((p) => p.id === id)).toBe(true);
    expect(low.inbox!.at(-1)!.title).toContain('자유계약 조건 거절');
    expect(low.inbox!.at(-1)!.detail).toMatch(/수락 가능성 \d+%: .*자유계약 선수/);
    recruit(low, cold, 1);
    expect(signed(low, id)).toBe(false);
    // A name as long as a save allows still leaves a valid report naming him (→SAVE-5).
    low.freeAgents!.find((p) => p.id === id)!.name = 'N'.repeat(160);
    recruit(low, cold, 1);
    expect(signed(low, id)).toBe(false);
    expect(low.inbox!.at(-1)!.title.length).toBeLessThanOrEqual(160);
    expect(low.inbox!.at(-1)!.title).toContain('N'.repeat(100));
    expect(validateWorld(low).id).toBe(low.id);
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
    // The search whose ages leave him out (→ECON-16: 17–21 at 1, 26–33 at 5): the standard list's
    // ablest players now fall inside either end's ages, so the switch follows his age.
    holdRows(w, { policy: { recruitment: w.year - offer.player.born > 21 ? 1 : 5 } });
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

describe('delegated sales answered as the selling club (→CLUB-18, CLUB-52)', () => {
  /** The market's club with every decision delegated, in the summer window. */
  function selling(seed = 'delegated-sales') {
    const w = world(seed);
    w.settings = staffAuthority(4);
    on(w, 8, 10);
    expect(transferWindow(w).open).toBe(true);
    return w;
  }
  let serial = 0;
  /** Another club's pending bid for `p` at `fee`, from a buyer able to pay (→WORLD-16). */
  function bidFor(w: World, p: Player, fee: string) {
    const club = prepareSaleBuyer(w, p),
      day = currentDay(w);
    const bid: TransferBid = {
      id: `in:test:sale:${serial++}:${p.id}`,
      direction: 'in',
      playerId: p.id,
      club: club.id,
      fee,
      year: w.year,
      day,
      due: day + 5,
      status: 'pending',
    };
    w.bids = [...(w.bids || []), bid];
    return { bid, club };
  }
  /** The selling-club answer the 단장 gives to `bid`, read as the engine reads it. */
  const expected = (w: World, bid: TransferBid) =>
    saleAnswer(
      saleContext(w, { playerId: bid.playerId, sellerId: w.playerClub, fee: bid.fee })!,
      random(`${w.seed}:sale:${bid.id}`)(),
    );
  const report = (w: World, bid: TransferBid) => w.inbox!.find((item) => item.ref === bid.id)!;
  const status = (w: World, p: Player) => w.players.find((one) => one.id === p.id)!.status;
  const value = (w: World, p: Player) => BigInt(playerValue(w, p));
  /** A player outside the XI, so his place lowers the reservation and leaves room for a counter. */
  const benchPlayer = (w: World) => {
    const xi = new Set(ownStarters(w).map((p) => p.id));
    return activePlayers(w).find((p) => !xi.has(p.id) && p.position !== 'GK' && !p.loanUntil)!;
  };

  it('sells at the asking fee, the sale bar of value, and names the bar and its factors', () => {
    const w = selling();
    const p = benchPlayer(w),
      bar = saleBar(w, p).percent,
      asking = ((value(w, p) * BigInt(bar)) / 100n).toString(),
      cash = BigInt(w.cash);
    expect(bar).toBe(saleBar(w, p).prospect ? 200 : 130);
    const { bid } = bidFor(w, p, asking);
    expect(expected(w, bid).kind).toBe('accept');
    handoverSales(w);
    expect(bid.status).toBe('completed');
    expect(status(w, p)).toBe('sold');
    expect(BigInt(w.cash)).toBe(cash + BigInt(asking));
    const item = report(w, bid);
    expect(item).toMatchObject({ kind: 'staff-report', attention: false });
    expect(item.title).toMatch(/^단장이 /);
    expect(item.detail).toContain(`평가 가치의 ${bar}%`);
    expect(item.detail).toContain('구단이 버틴 선');
    // His place outside the XI is one of the factors the report names.
    expect(item.detail).toContain('주전이 아닌 선수');
    expect(item.detail).toContain('제안을 받아들여 매각했어요');
  });

  it('counters below the reservation; the bidder takes it when its books allow, else not', () => {
    const w = selling();
    const p = benchPlayer(w);
    const probe = bidFor(structuredClone(w), p, '1').bid;
    const reservation = BigInt(expected(w, probe).reservation),
      fee = (reservation - 1n).toString();
    // Taken: the sale completes at the counter, not the bid.
    const taken = structuredClone(w),
      { bid } = bidFor(taken, p, fee);
    bid.id = probe.id;
    const answer = expected(taken, bid);
    expect(answer.kind).toBe('counter');
    const cash = BigInt(taken.cash);
    handoverSales(taken);
    expect(bid).toMatchObject({ status: 'completed', counterFee: answer.counter });
    expect(BigInt(taken.cash)).toBe(cash + BigInt(answer.counter!));
    expect(status(taken, p)).toBe('sold');
    expect(report(taken, bid).detail).toContain('역제안했고 상대 구단이 받아들여 매각했어요');
    // Declined: a bidder without the money for the counter walks away; he stays.
    const declined = structuredClone(w),
      other = bidFor(declined, p, fee);
    other.bid.id = probe.id;
    other.club.books = { seasons: [], cash: '0', debt: '999999999999', openingIncome: '0' };
    handoverSales(declined);
    expect(other.bid).toMatchObject({ status: 'rejected', counterFee: answer.counter });
    expect(status(declined, p)).toBe('active');
    expect(report(declined, other.bid).detail).toContain('상대 구단이 받아들이지 않았어요');
  });

  it('refuses a bid far below the reservation and is deterministic', () => {
    const w = selling();
    const p = benchPlayer(w);
    const { bid } = bidFor(w, p, (value(w, p) / 10n).toString());
    expect(expected(w, bid).kind).toBe('refuse');
    const copy = structuredClone(w);
    handoverSales(w);
    handoverSales(copy);
    expect(canonical(copy)).toBe(canonical(w));
    expect(bid.status).toBe('rejected');
    expect(status(w, p)).toBe('active');
    expect(report(w, bid).detail).toContain('역제안 없이 거절했어요');
  });

  it('sells a starter, even one of the three best, and opens a replacement need (→CLUB-42)', () => {
    const w = selling();
    const best = [...ownStarters(w)].sort((a, b) => overall(b) - overall(a))[0]!;
    const asking = ((value(w, best) * BigInt(saleBar(w, best).percent)) / 100n).toString();
    const { bid } = bidFor(w, best, asking);
    handoverSales(w);
    expect(bid.status).toBe('completed');
    expect(status(w, best)).toBe('sold');
    expect(openNeeds(w).some((need) => need.playerId === best.id)).toBe(true);
    expect(report(w, bid).detail).toContain('핵심 주전');
  });

  it("keeps the vetoes: 이적 불가 below 150%, 핵심 지키기's three best starters; listed players sell", () => {
    const w = selling();
    const [best] = [...ownStarters(w)].sort((a, b) => overall(b) - overall(a));
    // 핵심 지키기: no fee buys one of the three best starters.
    const hold = structuredClone(w);
    holdRows(hold, { build: { market: 'hold' } });
    const core = bidFor(hold, best!, (value(hold, best!) * 5n).toString()).bid;
    handoverSales(hold);
    expect(core.status).toBe('rejected');
    expect(report(hold, core).detail).toContain('주전 상위 3명은 팔지 않아요');
    // 이적 불가: refused unseen below 150% of value.
    const locked = structuredClone(w),
      p = benchPlayer(locked);
    locked.players.find((one) => one.id === p.id)!.stance = 'untouchable';
    const firm = bidFor(locked, p, ((value(locked, p) * 140n) / 100n).toString()).bid;
    handoverSales(locked);
    expect(firm.status).toBe('rejected');
    expect(status(locked, p)).toBe('active');
    // A listed player takes his offer (→CLUB-22).
    const listed = structuredClone(w),
      q = benchPlayer(listed);
    listed.players.find((one) => one.id === q.id)!.stance = 'listed';
    const low = bidFor(listed, q, ((value(listed, q) * 85n) / 100n).toString()).bid;
    handoverSales(listed);
    expect(low.status).toBe('completed');
    expect(report(listed, low).detail).toContain('이적 명단에 오른 선수라 매각했어요.');
    // Held by the owner, the bid waits in the inbox for his answer.
    const owner = structuredClone(w);
    owner.settings = staffAuthority(3);
    const held = bidFor(owner, benchPlayer(owner), playerValue(owner, benchPlayer(owner))).bid;
    handoverSales(owner);
    expect(held.status).toBe('pending');
    expect(report(owner, held)).toMatchObject({ kind: 'incoming-bid', attention: true });
  });
});
