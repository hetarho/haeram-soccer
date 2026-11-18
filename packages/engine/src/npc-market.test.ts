import { describe, expect, it, vi } from 'vitest';
import type { Club, MatchPlayback, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import {
  npcCanSell,
  npcMarket,
  npcMarketDays,
  npcOffer,
  NPC_MARKET,
  npcBidFee,
  returnNpcLoans,
  SettlementRatings,
} from './npc-market';
import { FORMATIONS, mainOvr } from './player';
import { closeNpcSummer, closeNpcWindow, intakeNpcYouth } from './npc-careers';
import { foundSquads } from './persisted-squads';
import { clubStyle, generatedPlayer, invalidateNpcSquad, stature } from './world';
import { formationOf, freshSlotOvr, slotOvr, withSlotRatings } from './player-state';
import { compareIds, random } from './primitives';
import { worldMarketFixture } from './world-market.testkit';
import { marketValueAt, marketWageAt } from './market-prices';
import { NPC_WAGE_DECISIONS, npcWageBill, npcWageLimit } from './books';
import { clubRegistration } from './registration';
import { currentDay, SEASON_END_DAY } from './calendar';
import { playerTotals, settleNpcSeason } from './npc-stats';
import { zeroMetrics } from './primitives';
import { M } from './match/record';
import { enrollSquadPlayer } from './persisted-squads';
import { coachingGrade } from './aptitude';
import { crossWar } from './wartime';
import { suitorFor } from './transfers';
import { expireContracts } from './contracts';
import { operatingExpensesAt } from './finance';

/**
 * The seller's and the player's answers are seeded draws (→CLUB-52/53); these mechanics cases pin
 * them so a bid the seller and the player would take is taken: the lowest reservation spread and a
 * player who agrees whenever his chance is above zero. Answer models have their own tests below.
 */
const answerDraws = vi.hoisted(() => ({ sale: 0, terms: 0, bid: 0.5 }));
vi.mock('./primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./primitives')>();
  return {
    ...actual,
    random(seed: string) {
      if (seed.includes(':npc-sale:')) return () => answerDraws.sale;
      if (seed.includes(':npc-terms:')) return () => answerDraws.terms;
      if (seed.includes(':npc-bid:')) return () => answerDraws.bid;
      return actual.random(seed);
    },
  };
});

/** Three tiny synthetic NPC squads; no fixture simulation, world generation or time progression. */
function fixture(year = 1950, count = 3) {
  const w = worldMarketFixture();
  w.year = year;
  w.calendar = { day: npcMarketDays(w.year)[0]![0]! };
  w.clubs = [
    w.clubs[0]!,
    ...Array.from({ length: count }, (_, n): Club => ({
      ...w.clubs[1]!,
      id: `ENG:0:0:${n}`,
      country: 'ENG',
      strength: 65,
    })),
  ];
  foundSquads(w);
  w.people = {};
  for (const c of w.clubs.slice(1)) {
    for (const p of w.squads![c.id]!) {
      p.born = w.year - 24;
      p.potential = 65;
      p.until = w.year + 3;
      for (const a of ATTRIBUTES) p.attrs[a] = 65;
      p.wage = marketWageAt(c.country, w.year, c.tier, p);
    }
    c.books = {
      seasons: [],
      cash: '999999999999',
      debt: '0',
      openingIncome: npcWageBill(w, c).toString(),
    };
    invalidateNpcSquad(w, c.id);
  }
  const other = w.clubs[3]!;
  other.books!.openingIncome = '0';
  other.books!.cash = (
    npcWageBill(w, other) + BigInt(operatingExpensesAt(other.country, w.year, other.tier))
  ).toString();
  return { w, seller: w.clubs[1]!, buyer: w.clubs[2]!, other: w.clubs[3]! };
}
function listedKeeper(w: World, seller: Club, age = 24) {
  const p = generatedPlayer('ENG', w.seed, 'listed-keeper', w.year, 75, 'GK', age, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = 75;
  p.until = w.year;
  p.potential = 75;
  p.wage = marketWageAt('ENG', w.year, 0, p);
  w.squads![seller.id]!.push(p);
  // Keep this seller inside its signing budget unless a test explicitly makes it overspend.
  seller.books!.openingIncome = npcWageBill(w, seller).toString();
  return p;
}
/**
 * The pull market bids for unlisted players too (→WORLD-16): the seller's own keepers announce
 * their retirement, which keeps them off the market, so the keepers a case names are its only ones.
 */
function onlyOfferedKeepers(w: World, seller: Club, ...offered: { id: string }[]) {
  for (const q of w.squads![seller.id]!)
    if (q.position === 'GK' && !offered.some((o) => o.id === q.id)) q.retiring = w.year;
}
function missingKeeper(w: World, c: Club) {
  w.squads![c.id] = w.squads![c.id]!.filter((p) => p.position !== 'GK');
  invalidateNpcSquad(w, c.id);
}
const locations = (w: World, id: string) =>
  Object.entries(w.squads ?? {})
    .filter(([, ps]) => ps.some((p) => p.id === id))
    .map(([club]) => club);

describe('isolated NPC transfer windows', () => {
  it('keeps one settlement rating per slot object, main OVR apart, and a slot outside the formations', () => {
    const { w, seller } = fixture();
    const [p, q] = w.squads![seller.id]!;
    const slots = Object.values(FORMATIONS).flatMap((formation) => formation.slots);
    // Two distinct formation slot objects that rate this player equally.
    const [a, b] = slots.flatMap((x, i) =>
      slots.slice(i + 1).flatMap((y) => (slotOvr(p!, x) === slotOvr(p!, y) ? [[x, y]] : [])),
    )[0]!;
    expect(a).not.toBe(b);
    const outside = { ...a! };
    // A single row's room makes the second player grow the rows.
    const ratings = new SettlementRatings(1);
    const before = { a: slotOvr(p!, a!), main: mainOvr(p!), q: slotOvr(q!, b!) };
    expect(ratings.of(p!, a)).toBe(before.a);
    expect(ratings.of(p!)).toBe(before.main);
    expect(ratings.of(q!, b)).toBe(before.q);
    for (const attr of ATTRIBUTES) p!.attrs[attr] = 30;
    // Read places keep their value; unread ones (another slot object, a slot outside) read afresh.
    expect(ratings.of(p!, a)).toBe(before.a);
    expect(ratings.of(p!)).toBe(before.main);
    expect(ratings.of(p!, b)).toBe(slotOvr(p!, b!));
    expect(ratings.of(p!, outside)).toBe(slotOvr(p!, outside));
    expect(ratings.of(p!, b)).not.toBe(before.a);
    expect(ratings.of(q!, b)).toBe(before.q);
    for (const attr of ATTRIBUTES) p!.attrs[attr] = 80;
    expect(ratings.of(p!, outside)).not.toBe(slotOvr(p!, outside));
    ratings.forget(p!);
    expect(ratings.of(p!, a)).toBe(slotOvr(p!, a!));
    expect(ratings.of(p!, outside)).toBe(slotOvr(p!, outside));
    expect(ratings.of(p!)).toBe(mainOvr(p!));
    expect(ratings.of(q!, b)).toBe(before.q);
    // No rating outlives its settlement.
    for (const attr of ATTRIBUTES) q!.attrs[attr] = 20;
    expect(new SettlementRatings().of(q!, b)).toBe(slotOvr(q!, b!));
  });

  it('reads slot ratings through an open settlement and afresh once it closes, a throw included', () => {
    const { w, seller } = fixture();
    const p = w.squads![seller.id]!.find((q) => q.position !== 'GK')!;
    const slots = Object.values(FORMATIONS).flatMap((formation) => formation.slots);
    const slot = slots[0]!;
    const open = new SettlementRatings(1);
    withSlotRatings(open, () => {
      // Inside, every read equals the unscoped computation bit for bit.
      for (const s of slots) expect(Object.is(slotOvr(p, s), freshSlotOvr(p, s))).toBe(true);
      const read = slotOvr(p, slot);
      for (const a of ATTRIBUTES) p.attrs[a] = 30;
      // The settlement's value stands; another multiplier is never cached.
      expect(slotOvr(p, slot, 1)).toBe(read);
      expect(slotOvr(p, slot, 0.9)).toBe(freshSlotOvr(p, slot, 0.9));
      expect(freshSlotOvr(p, slot)).not.toBe(read);
    });
    expect(slotOvr(p, slot)).toBe(freshSlotOvr(p, slot));
    const thrown = new SettlementRatings(1);
    expect(() =>
      withSlotRatings(thrown, () => {
        slotOvr(p, slot);
        throw new Error('settlement failed');
      }),
    ).toThrow('settlement failed');
    for (const a of ATTRIBUTES) p.attrs[a] = 70;
    expect(slotOvr(p, slot)).toBe(freshSlotOvr(p, slot));
    expect(thrown.of(p, slot)).not.toBe(slotOvr(p, slot));
    // A market day closes its settlement however it ends.
    npcMarket(w);
    for (const a of ATTRIBUTES) p.attrs[a] = 55;
    expect(slotOvr(p, slot)).toBe(freshSlotOvr(p, slot));
  });

  it('refreshes ratings between settlements and between independent quote mutations', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    const alternative = { ...structuredClone(p), id: 'alternative-keeper' };
    for (const a of ATTRIBUTES) {
      p.attrs[a] = 10;
      alternative.attrs[a] = 80;
      for (const keeper of w.squads![buyer.id]!.filter((q) => q.position === 'GK'))
        keeper.attrs[a] = 85;
    }
    w.squads![seller.id]!.push(alternative);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([seller.id]);
    expect(locations(w, alternative.id)).toEqual([seller.id]);
    for (const a of ATTRIBUTES) {
      p.attrs[a] = 90;
      for (const keeper of w.squads![buyer.id]!.filter((q) => q.position === 'GK'))
        keeper.attrs[a] = 65;
    }
    expect(npcOffer(w, buyer, p, seller, '0')).toBeDefined();
    for (const a of ATTRIBUTES) p.attrs[a] = 10;
    expect(npcOffer(w, buyer, p, seller, '0')).toBeUndefined();
    for (const a of ATTRIBUTES) p.attrs[a] = 90;
    w.calendar!.day = npcMarketDays(w.year)[0]![1]!;
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([buyer.id]);
    expect(locations(w, alternative.id)).toEqual([seller.id]);
  });

  it('settles equal-rated listings in their settlement tie order, not id order', () => {
    const { w, seller, buyer } = fixture();
    const day = currentDay(w);
    const tie = (id: string) => random(`${w.seed}:npc-market:${w.year}:${day}:${id}`)();
    // Two ids whose seeded tie order disagrees with their id order.
    const ids = ['tie-a', 'tie-b', 'tie-c', 'tie-d', 'tie-e', 'tie-f'];
    const first = ids.find((a) => ids.some((b) => compareIds(a, b) < 0 && tie(a) > tie(b)))!;
    const second = ids.find((b) => compareIds(first, b) < 0 && tie(first) > tie(b))!;
    expect(tie(second)).toBeLessThan(tie(first));
    const [a, b] = [first, second].map((id) => ({
      ...structuredClone(listedKeeper(w, seller)),
      id,
    }));
    // listedKeeper pushed one extra keeper; replace it by the two equal ones.
    w.squads![seller.id] = [
      ...w.squads![seller.id]!.filter((p) => p.id !== 'listed-keeper'),
      a!,
      b!,
    ];
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    // The buyer lacks exactly one keeper, so one move settles the need.
    const own = w.squads![buyer.id]!.find((p) => p.position === 'GK')!;
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.position !== 'GK' || p === own);
    invalidateNpcSquad(w, buyer.id);
    npcMarket(w);
    expect(locations(w, second)).toEqual([buyer.id]);
    expect(locations(w, first)).toEqual([seller.id]);
  });

  it('fills an upgrade need from a listing exactly at the threshold and not one point below', () => {
    const { w, seller, buyer } = fixture();
    const slot = formationOf(clubStyle(buyer)).find((s) => s.position === 'GK')!;
    for (const k of w.squads![buyer.id]!.filter((p) => p.position === 'GK'))
      for (const a of ATTRIBUTES) k.attrs[a] = 40;
    invalidateNpcSquad(w, buyer.id);
    const best = Math.max(
      ...w.squads![buyer.id]!.filter((p) => p.position === 'GK').map((p) => slotOvr(p, slot)),
    );
    const keeperRated = (id: string, target: number) => {
      const p = { ...structuredClone(listedKeeper(w, seller)), id };
      for (let v = 1; v <= 99; v++) {
        for (const a of ATTRIBUTES) p.attrs[a] = v;
        if (slotOvr(p, slot) === target) break;
      }
      expect(slotOvr(p, slot)).toBe(target);
      return p;
    };
    const exact = keeperRated('threshold-exact', best + NPC_MARKET.upgrade);
    const below = keeperRated('threshold-below', best + NPC_MARKET.upgrade - 1);
    w.squads![seller.id] = [
      ...w.squads![seller.id]!.filter((p) => p.id !== 'listed-keeper'),
      exact,
      below,
    ];
    onlyOfferedKeepers(w, seller, exact, below);
    onlyOfferedKeepers(w, w.clubs[3]!);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    npcMarket(w);
    expect(locations(w, exact.id)).toEqual([buyer.id]);
    expect(locations(w, below.id)).toEqual([seller.id]);
  });

  it('buys a needed keeper at its accepted bid, settles both books and preserves one live identity', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    const before = structuredClone(p),
      untouched = w.squads![other.id];
    missingKeeper(w, buyer);
    const fee = marketValueAt('ENG', w.year, seller.tier, p);
    buyer.books!.openingIncome = '0';
    buyer.books!.cash = (
      npcWageBill(w, buyer) +
      BigInt(marketWageAt('ENG', w.year, buyer.tier, p)) +
      BigInt(fee) +
      BigInt(operatingExpensesAt(buyer.country, w.year, buyer.tier))
    ).toString();
    npcMarket(w);
    // Not rich enough to bid the asking fee itself: the bid is its drawn share, accepted.
    const value = fee;
    const paid = npcBidFee(value, false, answerDraws.bid);
    expect(BigInt(paid)).toBeLessThan(BigInt(value));
    expect(locations(w, p.id)).toEqual([buyer.id]);
    const live = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(live.attrs).toEqual(before.attrs);
    expect(live.name).toBe(before.name);
    expect(live.born).toBe(before.born);
    expect(live.until).toBeGreaterThan(w.year);
    expect(live.wage).toBe(marketWageAt('ENG', w.year, buyer.tier, live));
    expect(seller.books!.transfersReceived).toBe(paid);
    expect(buyer.books!.transfersPaid).toBe(paid);
    expect(w.playerRecords![p.id]!.moves).toEqual([
      { year: w.year, day: currentDay(w), from: seller.id, to: buyer.id, fee: paid },
    ]);
    expect(w.squads![other.id]).toBe(untouched);
    expect(w.events).toEqual([]);
  });

  it('an over-limit club cannot buy and sells whom it can best spare without selling below eighteen', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    seller.books!.openingIncome = '0';
    seller.books!.cash = (
      npcWageBill(w, seller) + BigInt(operatingExpensesAt(seller.country, w.year, seller.tier))
    ).toString();
    p.wage = (BigInt(p.wage) * 100n).toString();
    missingKeeper(w, buyer);
    expect(npcOffer(w, seller, w.squads![buyer.id]![0]!, buyer, '1')).toBeUndefined();
    npcMarket(w);
    expect(w.playerRecords![p.id]!.moves[0]!.to).toBe(buyer.id);
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
    expect(
      Object.values(w.playerRecords!)
        .flatMap((r) => r.moves)
        .some((m) => m.to === seller.id),
    ).toBe(false);
    w.squads![seller.id] = w.squads![seller.id]!.slice(0, NPC_MARKET.minimum);
    expect(w.squads![seller.id]!.every((q) => !npcCanSell(w, seller, q))).toBe(true);
  });

  it('protects each line minimum and the last goalkeeper', () => {
    const { w, seller } = fixture();
    const keepers = w.squads![seller.id]!.filter((p) => p.position === 'GK');
    w.squads![seller.id] = w.squads![seller.id]!.filter(
      (p) => p.position !== 'GK' || p === keepers[0],
    );
    expect(npcCanSell(w, seller, keepers[0]!)).toBe(false);
  });

  it('stops forced sales when the first fee and wage relief restore the envelope', () => {
    const { w, seller, buyer } = fixture();
    const first = listedKeeper(w, seller);
    const second = structuredClone(first);
    second.id = 'second-forced-keeper';
    first.wage = (BigInt(first.wage) * 100n).toString();
    second.wage = (BigInt(first.wage) / 2n).toString();
    for (const a of ATTRIBUTES) second.attrs[a] = 74;
    w.squads![seller.id]!.push(second);
    const bill = npcWageBill(w, seller);
    seller.books = {
      seasons: [],
      openingIncome: '0',
      cash: (
        bill -
        BigInt(first.wage) -
        1n +
        BigInt(operatingExpensesAt(seller.country, w.year, seller.tier))
      ).toString(),
      debt: '0',
    };
    missingKeeper(w, buyer);
    npcMarket(w);
    expect(locations(w, first.id)).toEqual([buyer.id]);
    expect(locations(w, second.id)).toEqual([seller.id]);
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
  });

  it('awards a contested player by stature even when the stronger club appears later', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    missingKeeper(w, other);
    other.books!.cash = '999999999999';
    const expected = stature(w.seed, buyer.id) > stature(w.seed, other.id) ? buyer : other;
    expect(stature(w.seed, buyer.id)).not.toBe(stature(w.seed, other.id));
    w.clubs.reverse();
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([expected.id]);
  });

  it('skips a sold-out best listing and settles the next keeper in rank for a later buyer', () => {
    const { w, seller, buyer, other } = fixture(1950, 4);
    const holder = w.clubs[4]!;
    other.books!.cash = '999999999999';
    const [first, later] =
      stature(w.seed, buyer.id) > stature(w.seed, other.id) ? [buyer, other] : [other, buyer];
    const best = listedKeeper(w, seller);
    const refused = { ...structuredClone(best), id: 'refused-keeper' };
    for (const a of ATTRIBUTES) {
      best.attrs[a] = 80;
      refused.attrs[a] = 78;
    }
    // One keeper above the line minimum: after the first sale the seller refuses the second.
    const kept = w.squads![seller.id]!.find((p) => p.position === 'GK')!;
    w.squads![seller.id] = [
      ...w.squads![seller.id]!.filter((p) => p.position !== 'GK' || p === kept || p === best),
      refused,
    ];
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    const lower = { ...listedKeeper(w, holder), id: 'lower-keeper' };
    w.squads![holder.id] = [...w.squads![holder.id]!.slice(0, -1), lower];
    // The holder only sells: its envelope carries its own wages and running costs.
    holder.books!.openingIncome = '0';
    holder.books!.cash = (
      npcWageBill(w, holder) + BigInt(operatingExpensesAt(holder.country, w.year, holder.tier))
    ).toString();
    // The first buyer lacks one keeper, the later one both; both rank the same keeper order.
    const own = w.squads![first.id]!.find((p) => p.position === 'GK')!;
    w.squads![first.id] = w.squads![first.id]!.filter((p) => p.position !== 'GK' || p === own);
    invalidateNpcSquad(w, first.id);
    missingKeeper(w, later);
    npcMarket(w);
    expect(locations(w, best.id)).toEqual([first.id]);
    expect(npcCanSell(w, seller, refused)).toBe(false);
    expect(locations(w, refused.id)).toEqual([seller.id]);
    expect(locations(w, lower.id)).toEqual([later.id]);
  });

  it('runs only on configured window days, once across reloads and identically for one seed', () => {
    const a = fixture(),
      b = fixture();
    for (const { w, seller, buyer } of [a, b]) {
      listedKeeper(w, seller);
      missingKeeper(w, buyer);
    }
    a.w.calendar!.day++;
    npcMarket(a.w);
    expect(a.w.playerRecords).toBeUndefined();
    a.w.calendar!.day--;
    npcMarket(a.w);
    npcMarket(b.w);
    expect(a.w.playerRecords).toEqual(b.w.playerRecords);
    const loaded = JSON.parse(JSON.stringify(a.w)) as World;
    const before = JSON.stringify(loaded);
    npcMarket(loaded);
    expect(JSON.stringify(loaded)).toBe(before);
    expect(npcMarketDays(a.w.year).map((days) => days.length)).toEqual([3, 3]);
  });

  it('uses the higher offered wage when stature is equal', () => {
    const { w, seller, buyer, other } = fixture();
    const p = listedKeeper(w, seller);
    other.books!.cash = '999999999999';
    for (const [c, id] of [
      [buyer, 'bidder-a'],
      [other, 'bidder-b'],
    ] as const) {
      const players = w.squads![c.id]!;
      delete w.squads![c.id];
      c.id = id;
      w.squads![id] = players;
      missingKeeper(w, c);
    }
    w.clubs = [...w.clubs];
    buyer.tier = 1;
    expect(stature(w.seed, buyer.id)).toBe(stature(w.seed, other.id));
    expect(BigInt(marketWageAt('ENG', w.year, other.tier, p))).toBeGreaterThan(
      BigInt(marketWageAt('ENG', w.year, buyer.tier, p)),
    );
    npcMarket(w);
    expect(locations(w, p.id)).toEqual([other.id]);
  });

  it('leaves the walk moves when a buyer is refused every listing on its own facts', () => {
    for (const closed of ['wage', 'registration', 'books'] as const) {
      const { w, seller, buyer, other } = fixture(2024);
      const p = listedKeeper(w, seller);
      missingKeeper(w, buyer);
      missingKeeper(w, other);
      other.books!.openingIncome = '999999999999999';
      if (closed === 'wage') {
        buyer.books!.openingIncome = '0';
        buyer.books!.cash = '0';
      } else if (closed === 'registration') {
        const players = w.squads![buyer.id]!;
        const { ceiling } = clubRegistration(buyer, w.year, players);
        expect(Number.isFinite(ceiling)).toBe(true);
        while (players.length < ceiling) {
          const q = structuredClone(players[0]!);
          q.id = `ceiling:${players.length}`;
          q.wage = '0';
          players.push(q);
        }
        buyer.books!.openingIncome = '999999999999999';
        invalidateNpcSquad(w, buyer.id);
      } else delete buyer.books;
      // The walk could not settle anything for this buyer: every listing's offer is refused.
      for (const c of w.clubs.slice(1))
        for (const q of c === buyer ? [] : w.squads![c.id]!)
          expect(npcOffer(w, buyer, q, c, '1')).toBeUndefined();
      const decided: string[] = [];
      NPC_WAGE_DECISIONS.observe = (club) => decided.push(club.id);
      try {
        npcMarket(w);
      } finally {
        delete NPC_WAGE_DECISIONS.observe;
      }
      expect(locations(w, p.id)).toEqual([other.id]);
      expect(decided).not.toContain(buyer.id);
      const moves = Object.values(w.playerRecords!).flatMap((r) => r.moves);
      expect(moves.some((m) => m.to === other.id)).toBe(true);
      expect(moves.filter((m) => m.to === buyer.id)).toEqual([]);
    }
  });

  it('refuses counted signings at the registration limit and permits the same signing with room', () => {
    const { w, seller, buyer } = fixture(2024);
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    const players = w.squads![buyer.id]!;
    while (players.length < 25) {
      const q = structuredClone(players[0]!);
      q.id = `counted:${players.length}`;
      q.wage = '0';
      players.push(q);
    }
    buyer.books!.openingIncome = '999999999999999';
    expect(clubRegistration(buyer, w.year, players).counted).toBe(25);
    expect(npcOffer(w, buyer, p, seller, '1')).toBeUndefined();
    players.pop();
    expect(npcOffer(w, buyer, p, seller, '1')).toBeDefined();
    expect(npcOffer(w, buyer, p, seller, '-1')).toBeUndefined();
  });

  it('ranks the best affordable listing first and does not double-spend fee commitments', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    const stronger = structuredClone(p);
    stronger.id = 'stronger-keeper';
    for (const a of ATTRIBUTES) stronger.attrs[a] = 76;
    w.squads![seller.id]!.push(stronger);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    missingKeeper(w, buyer);
    buyer.books!.openingIncome = (
      npcWageBill(w, buyer) + BigInt(marketWageAt('ENG', w.year, buyer.tier, stronger))
    ).toString();
    expect(npcOffer(w, buyer, stronger, seller, '1')).toBeDefined();
    npcMarket(w);
    expect(w.playerRecords![stronger.id]!.moves[0]!.to).toBe(buyer.id);
    buyer.books!.cash = '0';
    buyer.books!.transfersPaid = '999999999999999999999999';
    expect(npcOffer(w, buyer, p, seller, '1')).toBeUndefined();
  });

  it('rechecks the wage bill and registration after the first of two competing arrivals', () => {
    for (const constraint of ['wage', 'registration'] as const) {
      const { w, seller, buyer } = fixture(2024);
      const first = listedKeeper(w, seller);
      const second = structuredClone(first);
      second.id = `second-keeper:${constraint}`;
      for (const a of ATTRIBUTES) second.attrs[a] = 74;
      w.squads![seller.id]!.push(second);
      seller.books!.openingIncome = npcWageBill(w, seller).toString();
      missingKeeper(w, buyer);
      if (constraint === 'registration') {
        const players = w.squads![buyer.id]!;
        while (players.length < 24) {
          const filler = structuredClone(players[0]!);
          filler.id = `filler:${players.length}`;
          filler.wage = '0';
          players.push(filler);
        }
        buyer.books!.openingIncome = '999999999999999';
      } else {
        buyer.books!.openingIncome = '0';
        buyer.books!.cash = (
          npcWageBill(w, buyer) +
          BigInt(marketWageAt('ENG', w.year, buyer.tier, first)) +
          BigInt(marketValueAt('ENG', w.year, seller.tier, first)) +
          BigInt(operatingExpensesAt(buyer.country, w.year, buyer.tier))
        ).toString();
      }
      const replay = structuredClone(w);
      npcMarket(w);
      npcMarket(replay);
      expect(w).toEqual(replay);
      expect(locations(w, first.id)).toEqual([buyer.id]);
      expect(locations(w, second.id)).toEqual([seller.id]);
      expect(npcOffer(w, buyer, second, seller, '1')).toBeUndefined();
    }
  });

  it('shares one exact envelope between existing wages, a fee and a new wage', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    const wage = BigInt(marketWageAt('ENG', w.year, buyer.tier, p));
    const bill = npcWageBill(w, buyer);
    buyer.books = {
      seasons: [],
      cash: (
        bill +
        wage +
        10n +
        BigInt(operatingExpensesAt(buyer.country, w.year, buyer.tier))
      ).toString(),
      debt: '0',
      openingIncome: '0',
    };
    expect(npcOffer(w, buyer, p, seller, '10')).toBeDefined();
    expect(npcOffer(w, buyer, p, seller, '11')).toBeUndefined();
    buyer.books.transfersPaid = '1';
    expect(npcOffer(w, buyer, p, seller, '10')).toBeUndefined();
    buyer.books.transfersReceived = '1';
    expect(npcOffer(w, buyer, p, seller, '10')).toBeDefined();
  });

  it('reserves registration room at a loan parent until the player returns', () => {
    const { w, seller, buyer, other } = fixture(2024);
    const p = listedKeeper(w, seller, 23);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    onlyOfferedKeepers(w, seller, p);
    onlyOfferedKeepers(w, w.clubs[3]!);
    missingKeeper(w, buyer);
    npcMarket(w);
    expect(w.playerRecords![p.id]!.loan).toBeDefined();
    missingKeeper(w, seller);
    const players = w.squads![seller.id]!;
    while (players.length < 24) {
      const filler = structuredClone(players[0]!);
      filler.id = `reserved:${players.length}`;
      filler.wage = '0';
      players.push(filler);
    }
    seller.books!.openingIncome = '999999999999999';
    const candidate = w.squads![other.id]!.find((p) => p.position === 'GK')!;
    expect(npcOffer(w, seller, candidate, other, '1')).toBeUndefined();
    const loan = w.playerRecords![p.id]!.loan!;
    delete w.playerRecords![p.id]!.loan;
    expect(npcOffer(w, seller, candidate, other, '1')).toBeDefined();
    w.playerRecords![p.id]!.loan = loan;
    expect(npcOffer(w, seller, candidate, other, '1')).toBeUndefined();
    const withoutLoan = structuredClone(w);
    delete withoutLoan.playerRecords![p.id]!.loan;
    expect(
      npcOffer(withoutLoan, withoutLoan.clubs[1]!, candidate, withoutLoan.clubs[3]!, '1'),
    ).toBeDefined();
  });

  it('returns a young blocked loan before renewing contracts at the shared close', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller, 19);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    p.until = w.year + 4;
    p.graduate = true;
    p.joined = w.year - 2;
    onlyOfferedKeepers(w, seller, p);
    onlyOfferedKeepers(w, w.clubs[3]!);
    const terms = { wage: p.wage, until: p.until };
    missingKeeper(w, buyer);
    npcMarket(w);
    expect(w.playerRecords![p.id]!.moves[0]!.loan).toBe(true);
    expect(locations(w, p.id)).toEqual([buyer.id]);
    expect(w.playerRecords![p.id]!.loan!.contractUntil).toBe(terms.until);
    const automatic = structuredClone(w);
    automatic.calendar = { day: SEASON_END_DAY + 1 };
    closeNpcSummer(automatic);
    expect(locations(automatic, p.id)).toEqual([seller.id]);
    expect(automatic.playerRecords![p.id]!.loan).toBeUndefined();
    expect(automatic.playerRecords![p.id]!.moves.at(-1)).toMatchObject({
      from: buyer.id,
      to: seller.id,
      fee: '0',
    });
    w.calendar = { day: SEASON_END_DAY + 1 };
    returnNpcLoans(w);
    expect(locations(w, p.id)).toEqual([seller.id]);
    const returned = w.squads![seller.id]!.find((q) => q.id === p.id)!;
    expect(returned.wage).toBe(terms.wage);
    expect(returned.until).toBe(terms.until);
    expect(returned.loanUntil).toBeUndefined();
    expect(returned.graduate).toBe(true);
    expect(returned.joined).toBe(w.year - 2);
    expect(w.playerRecords![p.id]!.loan).toBeUndefined();
    expect(w.playerRecords![p.id]!.moves.at(-1)).toMatchObject({
      from: buyer.id,
      to: seller.id,
      fee: '0',
    });
    closeNpcSummer(w);
    expect(locations(w, p.id)).toEqual([seller.id]);
  });

  it('moves registered employment with the same person and club contract', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    p.personality.professionalism = 5;
    p.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    enrollSquadPlayer(w, seller, p);
    missingKeeper(w, buyer);
    npcMarket(w);
    const person = w.people![p.id]!;
    expect(person.club).toBe(buyer.id);
    expect(person.employment.filter((job) => job.role === 'player').map((job) => job.club)).toEqual(
      [seller.id, buyer.id],
    );
    expect(person.employment.at(-1)!.contractUntil!.year).toBe(
      w.squads![buyer.id]!.find((q) => q.id === p.id)!.until,
    );
  });

  it('keeps winter contributions under the same ID, separated by the two real clubs', () => {
    const { w, seller, buyer } = fixture();
    const p = listedKeeper(w, seller);
    missingKeeper(w, buyer);
    w.npcSeason = {
      year: w.year,
      model: MATCH_MODEL_REVISION,
      trackedFrom: { year: w.year, day: 0, round: 0 },
      competitions: [],
    };
    const settle = (club: Club) => {
      const metrics = zeroMetrics();
      metrics[M.minutes] = 90;
      metrics[M.goals] = 1;
      const playback: MatchPlayback = {
        record: {
          id: `synthetic-winter:${club.id}`,
          year: w.year,
          round: w.round,
          kind: 'league',
          country: club.country,
          groupKey: 'synthetic',
          home: club.id,
          away: 'own',
          score: { home: 1, away: 0 },
          incidents: [],
          lineCounts: [1, 0],
          players: [{ id: p.id, metrics }],
          metrics: [metrics, zeroMetrics()],
          tactics: ['balanced', 'balanced'],
          highlights: [],
        },
        frames: [],
        squads: [[p], []],
      };
      settleNpcSeason(w, playback, true);
    };
    settle(seller);
    w.calendar!.day = npcMarketDays(w.year)[1]![0]!;
    npcMarket(w);
    settle(buyer);
    const row = w.npcSeason.competitions[0]!.players.find((row) => row.id === p.id)!;
    expect(row.clubs.map((part) => part.club)).toEqual([seller.id, buyer.id]);
    expect(row.clubs.map((part) => part.metrics[M.goals])).toEqual([1, 1]);
    expect(row.clubs.map((part) => part.cleanSheets)).toEqual([1, 1]);
    expect(playerTotals(row).metrics[M.goals]).toBe(2);
  });

  it('refills on summer last day without reusing an unregistered transferred youngster ID', () => {
    const { w, seller, buyer } = fixture();
    intakeNpcYouth(w, seller, w.year);
    const young = w.squads![seller.id]!.find(
      (p) => p.id.includes(':y:') && (coachingGrade(p) ?? 0) < 4,
    )!;
    expect(young).toBeDefined();
    expect(w.people?.[young.id]).toBeUndefined();
    w.squads![seller.id] = w.squads![seller.id]!.filter((p) => p.id !== young.id);
    w.squads![buyer.id]!.push(young);
    const day = npcMarketDays(w.year)[0]!.at(-1)!;
    w.squads![seller.id] = w.squads![seller.id]!.filter((p) => p.position !== 'GK').slice(0, 12);
    w.calendar!.day = day - 1;
    closeNpcWindow(w);
    expect(w.squads![seller.id]).toHaveLength(12);
    w.calendar!.day = day;
    closeNpcWindow(w);
    expect(locations(w, young.id)).toEqual([buyer.id]);
    expect(w.squads![seller.id]!.length).toBeGreaterThanOrEqual(22);
    expect(w.squads![seller.id]!.some((p) => p.position === 'GK')).toBe(true);
    const ids = Object.values(w.squads!).flatMap((ps) => ps.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    const state = clubRegistration(seller, w.year, w.squads![seller.id]!);
    expect(state.counted).toBeLessThanOrEqual(state.allowed);
    // A retained move also reserves the identity after its live row has left football.
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.id !== young.id);
    w.playerRecords = {
      [young.id]: { moves: [{ year: w.year, day, from: seller.id, to: buyer.id, fee: '0' }] },
    };
    intakeNpcYouth(w, seller, w.year);
    expect(locations(w, young.id)).toEqual([]);
  });

  it('incoming offers require a real need and enough money for their actual fee and wage', () => {
    const { w, buyer } = fixture();
    const p = w.players.find((p) => p.position === 'GK')!;
    for (const a of ATTRIBUTES) p.attrs[a] = 65;
    p.potential = 65;
    expect(suitorFor(w, p, () => 0, '1')).toBeUndefined();
    missingKeeper(w, buyer);
    expect(suitorFor(w, p, () => 0, '1')?.id).toBe(buyer.id);
    buyer.books!.cash = '0';
    buyer.books!.debt = buyer.books!.openingIncome!;
    expect(suitorFor(w, p, () => 0, '999999999999999')).toBeUndefined();
    buyer.books!.openingIncome = '0';
    expect(suitorFor(w, p, () => 0, '1')).toBeUndefined();
  });

  it('keeps an expired own player on the same need and books gate with a new contract and recorded fee', () => {
    const { w, buyer } = fixture();
    const p = w.players.find((p) => p.position === 'GK')!;
    for (const a of ATTRIBUTES) p.attrs[a] = 65;
    p.potential = 65;
    p.until = w.year;
    missingKeeper(w, buyer);
    expireContracts(w);
    const live = w.squads![buyer.id]!.find((q) => q.id === p.id)!;
    expect(live).toBeDefined();
    expect(live.until).toBeGreaterThan(w.year);
    expect(live.wage).toBe(marketWageAt('ENG', w.year, buyer.tier, live));
    expect(w.playerRecords![p.id]!.moves).toHaveLength(1);
    expect(w.playerRecords![p.id]!.moves[0]).toMatchObject({ from: 'own', to: buyer.id });
    expect(buyer.books!.transfersPaid).toBe(w.playerRecords![p.id]!.moves[0]!.fee);
  });

  it('extends the loan end with the parent contract through the skipped summers', () => {
    const { w, seller, buyer } = fixture();
    w.year = 1938;
    const p = listedKeeper(w, seller, 19);
    for (const a of ATTRIBUTES) p.attrs[a] = 40;
    p.until = 1950;
    onlyOfferedKeepers(w, seller, p);
    onlyOfferedKeepers(w, w.clubs[3]!);
    missingKeeper(w, buyer);
    npcMarket(w);
    const record = w.playerRecords![p.id]!;
    expect(record.loan).toBeDefined();
    const until = record.loan!.until,
      contract = record.loan!.contractUntil;
    const books = structuredClone(w.clubs.map((club) => club.books));
    w.year = 1946;
    crossWar(w, 1938);
    expect(record.loan!.until).toBe(until + 7);
    expect(record.loan!.contractUntil).toBe(contract + 7);
    expect(record.moves).toHaveLength(1);
    expect(w.clubs.map((club) => club.books)).toEqual(books);
  });
});
