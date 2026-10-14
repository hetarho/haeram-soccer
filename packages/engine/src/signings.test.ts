import { describe, expect, it } from 'vitest';
import type { Direction, Role, TransferBid, World } from '../../contracts/src/types';
import {
  activePlayers,
  advanceDays,
  createWorld,
  currentDay,
  financeStance,
  operatingCosts,
  overall,
  placeBid,
  ratio,
  SEASON_ROUNDS,
  seasonDayOf,
  shortRole,
  signingVerdict,
  staffSignings,
  transferOffers,
} from './index';

/**
 * A rich level-4 club on the winter window's opening day, half its season played with revenue far
 * beyond its wage bill, so only the rule under test holds the chief scout back.
 */
function club(finance?: Direction['finance'], seed = 'staff-signings') {
  const w = createWorld({
    country: 'ENG',
    name: 'Scout Town',
    color: '#224433',
    seed,
    difficulty: 2,
  });
  w.intervention = 4;
  w.cash = '999999999999';
  w.round = 23;
  w.income = '999999999999';
  w.calendar = { day: seasonDayOf(w.year, 1, 1) };
  if (finance) w.direction = { finance };
  return w;
}
const staffBids = (w: World) => (w.bids || []).filter((bid) => bid.staff);
const reports = (w: World) =>
  (w.inbox || []).filter(
    (item) => item.kind === 'staff-report' && item.title.startsWith('스카우트'),
  );
/** Leaves `count` active players of `role`, the others sold. */
function keep(w: World, role: Role, count: number) {
  for (const p of activePlayers(w)
    .filter((one) => one.role === role)
    .slice(count))
    p.status = 'sold';
}
/** Marks a player as already bid for in this window, so the scout passes him by. */
function tried(w: World, playerId: string) {
  const day = currentDay(w);
  const bid: TransferBid = {
    id: `out:test:${playerId}`,
    direction: 'out',
    playerId,
    fee: '1',
    year: w.year,
    day,
    due: day,
    status: 'rejected',
  };
  w.bids = [...(w.bids || []), bid];
}

describe('the chief scout signs players at level 4 (→CLUB-33)', () => {
  it('fills a short role with a free agent first', () => {
    const w = club('careful');
    const free = transferOffers(w)[0];
    expect(free.freeAgent).toBe(true);
    keep(w, free.player.role, 1);
    expect(shortRole(w)).toMatchObject({ kind: 'short', role: free.player.role, count: 1 });
    const cash = w.cash;
    staffSignings(w);
    const signed = w.players.find((p) => p.id === free.player.id)!;
    expect(signed.status).toBe('active');
    expect(signed.clauses).toBeDefined();
    expect(w.cash).toBe(cash);
    expect(staffBids(w)).toMatchObject([{ staff: 'short', status: 'completed', fee: '0' }]);
    expect(reports(w).at(-1)!.title).toBe(`스카우트 영입 · 자유계약 ${free.player.name}`);
    expect(reports(w).at(-1)!.detail).toContain('영입 기조');
  });

  it('bids the asking fee for an upgrade at 표준, none at 신중', () => {
    const w = club();
    expect(shortRole(w)).toBeUndefined();
    // The free agent is passed by, so the upgrade goes to a fee-bearing player.
    tried(w, transferOffers(w)[0].player.id);
    staffSignings(w);
    const [bid] = staffBids(w);
    expect(bid).toMatchObject({ staff: 'upgrade', status: 'pending' });
    const offer = transferOffers(w).find((one) => one.player.id === bid.playerId)!;
    expect(bid.fee).toBe(offer.fee);
    const starter = Math.min(
      ...activePlayers(w)
        .filter((p) => p.role === offer.player.role)
        .map((p) => overall(p)),
    );
    expect(overall(offer.player)).toBeGreaterThanOrEqual(starter + 5);
    expect(reports(w).at(-1)!.title).toBe(`스카우트 영입 제안 · ${offer.player.name}`);
    // 공격적 bids 110% of asking.
    const bold = club('aggressive');
    tried(bold, transferOffers(bold)[0].player.id);
    staffSignings(bold);
    const [high] = staffBids(bold);
    const asked = transferOffers(bold).find((one) => one.player.id === high.playerId)!.fee;
    expect(high.fee).toBe(ratio(asked, 110n, 100n));
    for (const finance of ['careful', 'stable'] as const) {
      const quiet = club(finance);
      staffSignings(quiet);
      expect(staffBids(quiet)).toEqual([]);
      expect(quiet.players).toHaveLength(w.players.length);
    }
  });

  it("keeps 재정 기조's money checks", () => {
    const w = club();
    const offer = transferOffers(w)[1];
    const perRound =
      (BigInt(operatingCosts(w).annual) + BigInt(offer.player.wage)) / BigInt(SEASON_ROUNDS);
    // Cash for the runway and one and a half fees: 표준 may spend half the cash above it.
    w.cash = (perRound * 13n + (BigInt(offer.fee) * 3n) / 2n).toString();
    const standard = signingVerdict(w, offer.player, offer.fee);
    expect(standard.ok).toBe(false);
    expect(standard.reason).toContain('여유 자금의 50%');
    w.direction = { finance: 'aggressive' };
    expect(signingVerdict(w, offer.player, offer.fee).ok).toBe(true);
    // Below the runway nothing is spent at all.
    w.cash = (perRound * BigInt(financeStance(w).runway)).toString();
    expect(signingVerdict(w, offer.player, offer.fee).reason).toContain('운영비');
    // Without revenue the wage bill has no room.
    const poor = club();
    poor.income = '0';
    expect(signingVerdict(poor, offer.player, offer.fee).reason).toContain('인건비');
    tried(poor, transferOffers(poor)[0].player.id);
    staffSignings(poor);
    expect(staffBids(poor)).toEqual([]);
  });

  it("answers its own counters, never the owner's", () => {
    // The selling clubs counter some bids at the asking fee: find a staff bid they countered.
    for (let seed = 0; seed < 40; seed++) {
      const w = club(undefined, `counter-${seed}`);
      tried(w, transferOffers(w)[0].player.id);
      staffSignings(w);
      const [bid] = staffBids(w);
      if (!bid) continue;
      advanceDays(w, 4);
      const answer = (w.inbox || []).find(
        (item) => item.ref === bid.id && /역제안/.test(item.title),
      );
      if (!answer) continue;
      expect(['completed', 'rejected']).toContain(bid.status);
      expect(answer.attention).toBe(false);
      expect(answer.detail).toContain('스카우트');
      return;
    }
    throw new Error('no countered staff bid in 40 seeds');
  });

  it("leaves the owner's countered bid to the owner", () => {
    for (let seed = 0; seed < 40; seed++) {
      const w = club(undefined, `owner-${seed}`);
      w.intervention = 3;
      const offers = transferOffers(w);
      placeBid(w, 1, offers[1].fee);
      w.intervention = 4;
      advanceDays(w, 4);
      const own = (w.bids || []).find((bid) => !bid.staff && bid.direction === 'out')!;
      if (own.status !== 'countered') continue;
      expect(own.counterFee).toBeDefined();
      return;
    }
    throw new Error('no countered owner bid in 40 seeds');
  });

  it('looks on the opening day and every 7th day after, and waits for a pending bid', () => {
    const w = club();
    tried(w, transferOffers(w)[0].player.id);
    const opening = currentDay(w);
    w.calendar = { day: opening + 3 };
    staffSignings(w);
    expect(staffBids(w)).toEqual([]);
    w.calendar = { day: opening + 7 };
    staffSignings(w);
    expect(staffBids(w)).toHaveLength(1);
    // A week later his bid is still open: he waits.
    staffBids(w)[0].due = opening + 20;
    w.calendar = { day: opening + 14 };
    staffSignings(w);
    expect(staffBids(w)).toHaveLength(1);
  });

  it('makes no signings below level 4 or outside windows', () => {
    const below = club();
    below.intervention = 3;
    staffSignings(below);
    expect(staffBids(below)).toEqual([]);
    const closed = club();
    closed.calendar = { day: seasonDayOf(closed.year, 3, 1) };
    staffSignings(closed);
    expect(staffBids(closed)).toEqual([]);
    // Over a whole window at level 4 the daily market makes the looks itself.
    const daily = club();
    const free = transferOffers(daily)[0];
    keep(daily, free.player.role, 1);
    daily.calendar = { day: seasonDayOf(daily.year, 12, 31) };
    advanceDays(daily, 2);
    expect(daily.players.some((p) => p.id === free.player.id)).toBe(true);
  });
});
