import { lineOf } from './player';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  bidBoard,
  clubOf,
  currentDay,
  operate,
  operatingCosts,
  overall,
  playerValue,
  respondBid,
  saleBar,
  slotCovered,
  talkFor,
  ownStarters,
  seasonLength,
  transferWindow,
  untouchableVerdict,
} from './index';
import { CLOSED, inBids, incoming, on, world } from './transfers.testkit';

describe('incoming bids', () => {
  it('arrive only inside windows, at most three at a time, and lapse after their due day', () => {
    const w = world();
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
        // Buyers are clubs about the player's level or above, whatever their tier (suitorFor).
        expect(club.strength).toBeGreaterThanOrEqual(overall(player) - 4);
        expect(club.strength).toBeLessThanOrEqual(overall(player) + 12);
        // A player on the transfer list (a transfer request lists him) draws listed offers.
        const listed = bid.id.includes(':list:');
        expect(item.title).toContain(
          `${club.name}이(가) ${listed ? '이적 명단의 ' : ''}${player.name}에게`,
        );
        const value = BigInt(playerValue(w, player));
        expect(BigInt(bid.fee) * 100n).toBeGreaterThanOrEqual(value * (listed ? 85n : 90n) - 100n);
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
    const mid = activePlayers(w).find((p) => lineOf(p.position) === 'MF')!;
    const bid = incoming(w, mid.id, '12345');
    w.inbox = [];
    const cash = BigInt(w.cash);
    operate(w, { type: 'respond-bid', id: bid.id, accept: true });
    expect(mid.status).toBe('sold');
    expect(bid.status).toBe('completed');
    expect(BigInt(w.cash)).toBe(cash + 12345n);
    expect(w.events.at(-1)).toMatchObject({ kind: 'transfer-out', amount: '12345' });
    const def = activePlayers(w).find((p) => lineOf(p.position) === 'DF')!;
    const refused = incoming(w, def.id, '500');
    respondBid(w, refused.id, false);
    expect(refused.status).toBe('rejected');
    expect(def.status).toBe('active');
    // Squad minimum and the last goalkeeper.
    const keepers = activePlayers(w).filter((p) => p.position === 'GK');
    keepers[1].status = 'retired';
    const lastKeeper = incoming(w, keepers[0].id, '500');
    expect(() => respondBid(w, lastKeeper.id, true)).toThrow('골키퍼');
    for (const p of activePlayers(w)
      .filter((p) => p.position !== 'GK')
      .slice(14 - 1))
      p.status = 'retired';
    expect(activePlayers(w)).toHaveLength(14);
    const minimum = incoming(
      w,
      activePlayers(w).find((p) => lineOf(p.position) === 'FW')!.id,
      '500',
    );
    const before = canonical(w);
    expect(() => respondBid(w, minimum.id, true)).toThrow('최소 선수단');
    expect(canonical(w)).toBe(before);
    // Sales need an open window.
    on(w, 10, 1);
    for (const p of w.players) if (p.status === 'retired') p.status = 'active';
    expect(() => respondBid(w, minimum.id, true)).toThrow(CLOSED);
  });

  it('sets the staff sale bar from age, contract, cash and prospect status', () => {
    const w = world('sale-bar');
    const p = activePlayers(w).find((x) => w.year - x.born >= 24 && w.year - x.born <= 29)!;
    const reset = () => {
      p.born = w.year - 26;
      p.until = w.year + 3;
      w.cash = '999999999999';
    };
    reset();
    expect(saleBar(w, p)).toEqual({ percent: 130, base: 130, prospect: false, cuts: [] });
    p.born = w.year - 31;
    expect(saleBar(w, p).percent).toBe(115);
    p.born = w.year - 34;
    p.until = w.year + 1;
    // 130 − 30 − 20, and a crisis would take it below the 80% floor.
    expect(saleBar(w, p).percent).toBe(80);
    w.cash = '0';
    expect(saleBar(w, p)).toMatchObject({ percent: 80 });
    expect(saleBar(w, p).cuts).toEqual([
      '34세 −30%p',
      '계약 마지막 시즌 −20%p',
      '운영자금 위기 −20%p',
    ]);
    reset();
    p.until = w.year + 2;
    expect(saleBar(w, p).percent).toBe(120);
    reset();
    // Twenty rounds of fixed costs: above the warning, short of comfortable.
    const annual = BigInt(operatingCosts(w).annual);
    w.cash = ((annual * 20n) / 46n).toString();
    expect(saleBar(w, p)).toMatchObject({ percent: 120 });
    reset();
    p.born = w.year - 19;
    p.potential = overall(p) + 20;
    expect(saleBar(w, p)).toEqual({ percent: 200, base: 200, prospect: true, cuts: [] });
    p.potential = overall(p) + 3;
    expect(saleBar(w, p).percent).toBe(130);
  });

  it('keeps older saves without bids or inbox working', () => {
    const w = world();
    delete w.bids;
    delete w.inbox;
    delete w.intervention;
    for (let n = 0; n < 31; n++) advanceDays(w, 1);
    expect(Array.isArray(w.bids) || w.bids === undefined).toBe(true);
    expect(() => respondBid(w, 'missing', true)).toThrow('없는');
    const bare = world();
    delete bare.bids;
    expect(bidBoard(bare)).toEqual([]);
    expect(validateWorld(w).id).toBe(w.id);
  });
});

describe('cover by slot and ambition (→CLUB-24, CLUB-27)', () => {
  it('slot cover raises the price', () => {
    const w = world('slot-cover');
    w.cash = '999999999999';
    const xi = ownStarters(w);
    w.lineup = xi.map((p) => p.id);
    const starter = xi[2]!;
    const bench = activePlayers(w).filter((p) => !xi.includes(p));
    for (const p of bench)
      for (const a of Object.keys(p.attrs) as (keyof Player['attrs'])[]) p.attrs[a] = 10;
    expect(slotCovered(w, starter)).toBe(false);
    // A bench player who plays his slot within 3 of him there covers it.
    const cover = bench[0]!;
    cover.attrs = { ...starter.attrs };
    cover.positions = { ...starter.positions };
    cover.adaptation = starter.adaptation;
    cover.fatigue = starter.fatigue;
    expect(slotCovered(w, starter)).toBe(true);
    // A player outside the XI is always covered.
    expect(slotCovered(w, cover)).toBe(true);
    // The manager holds out 25 points longer for a starter nobody can replace.
    const plain = untouchableVerdict(w, 210, false),
      essential = untouchableVerdict(w, 210, true);
    expect(plain.accept).toBe(true);
    expect(essential.accept).toBe(false);
    expect(essential.reason).toContain('+25%p');
  });

  let serial = 0;
  /** An offer from `club` for `p` at `fee`, each with its own id (and so its own stream). */
  function offer(w: World, p: Player, clubId: string, fee: string, n: number) {
    const day = currentDay(w);
    const bid: TransferBid = {
      id: `in:test:${n}:${serial++}:${p.id}`,
      direction: 'in',
      playerId: p.id,
      club: clubId,
      fee,
      year: w.year,
      day,
      due: day + 5,
      status: 'pending',
    };
    w.bids = [...(w.bids || []), bid];
    return bid;
  }
  /** How many of 40 declined offers leave `p` unhappy with ambition `grade`. */
  function resentments(w: World, p: Player, grade: 1 | 2 | 3 | 4 | 5, clubId: string, fee: string) {
    p.personality = { ...p.personality, ambition: grade };
    let unhappy = 0;
    for (let n = 0; n < 40; n++) {
      delete p.unhappy;
      respondBid(w, offer(w, p, clubId, fee, n).id, false);
      if (p.unhappy) unhappy++;
    }
    delete p.unhappy;
    return unhappy;
  }

  it('ambitious player resents a declined bigger offer', () => {
    const w = world('ambition');
    const own = clubOf(w),
      bigger = w.clubs.find((c) => c.tier < own.tier)!;
    const p = activePlayers(w)[3]!;
    const fee = playerValue(w, p);
    // 매우 높음 half the time, 높음 a quarter, each unless the manager talks him round.
    const high = resentments(w, p, 5, bigger.id, fee),
      some = resentments(w, p, 4, bigger.id, fee);
    expect(high).toBeGreaterThan(5);
    expect(high).toBeLessThan(25);
    expect(some).toBeLessThan(high);
    expect(resentments(w, p, 3, bigger.id, fee)).toBe(0);
    // The same offer decides the same way; the unhappiness names its reason and has no floor.
    p.personality = { ...p.personality, ambition: 5 };
    let n = 0;
    while (!p.unhappy && n < 40) respondBid(w, offer(w, p, bigger.id, fee, 100 + n++).id, false);
    expect(p.unhappy).toMatchObject({ reason: 'ambition', year: w.year });
    expect(w.inbox!.at(-1)).toMatchObject({ kind: 'unhappy', ref: p.id, attention: true });
    expect(w.inbox!.at(-1)!.title).toContain('빅클럽 이적 무산');
    expect(talkFor(w, p)).toBeUndefined();
  });

  it('no resentment below value or from a smaller club', () => {
    const w = world('no-ambition');
    const own = clubOf(w),
      bigger = w.clubs.find((c) => c.tier < own.tier)!,
      peer = w.clubs.find((c) => c.tier === own.tier && c.id !== own.id)!;
    const p = activePlayers(w)[3]!;
    const value = BigInt(playerValue(w, p));
    expect(resentments(w, p, 5, bigger.id, (value - 1n).toString())).toBe(0);
    // A club of our division with a lower reputation is no bigger stage.
    peer.reputation = own.reputation - 1;
    expect(resentments(w, p, 5, peer.id, (value * 2n).toString())).toBe(0);
    peer.reputation = own.reputation + 1;
    expect(resentments(w, p, 5, peer.id, (value * 2n).toString())).toBeGreaterThan(0);
  });
});
