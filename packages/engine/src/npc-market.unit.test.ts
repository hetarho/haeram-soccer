import { describe, expect, it, vi } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Club, Player, PlayerMove, SeasonArchive, World } from '../../contracts/src/types';
import {
  bidsOnDay,
  compareSellDown,
  npcBidDay,
  npcBidFee,
  npcMarket,
  npcMarketDays,
  PLAYER_MOVE_FLOW,
  recordPlayerMove,
  returnNpcLoans,
  withMoveReason,
  type MoveReason,
  type SellDownRow,
} from './npc-market';
import { foundSquads } from './persisted-squads';
import { lineOf } from './player';
import { formationOf, slotOvr } from './player-state';
import { clubStyle } from './tactics';
import { generatedPlayer, invalidateNpcSquad, NPC_SQUAD, startingSquad, tierLevel } from './world';
import { worldMarketFixture } from './world-market.testkit';
import { marketValueAt, marketWageAt } from './market-prices';
import { npcWageBill, npcWageLimit } from './books';
import { operatingExpensesAt } from './finance';
import { npcSaleContext, saleShare } from './sale-answer';
import { npcTermsContext, termsChance } from './personal-terms';
import { NPC_MARKET_ERA, npcMarketCaps } from './transfer-policy';
import { SEASON_END_DAY } from './calendar';

/**
 * The bid share, the seller's answer and the player's answer are seeded draws keyed by the bid
 * (→CLUB-52/53); each case sets them, and every key the market reads is recorded.
 */
const draws = vi.hoisted(() => ({
  sale: 0,
  terms: 0,
  bid: 1,
  day: 0 as number | ((key: string) => number),
  keys: [] as string[],
}));
vi.mock('./primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./primitives')>();
  return {
    ...actual,
    random(seed: string) {
      draws.keys.push(seed);
      if (seed.includes(':npc-sale:')) return () => draws.sale;
      if (seed.includes(':npc-terms:')) return () => draws.terms;
      if (seed.includes(':npc-bid:')) return () => draws.bid;
      if (seed.includes(':npc-bid-day:')) {
        const day = draws.day;
        return () => (typeof day === 'number' ? day : day(seed));
      }
      return actual.random(seed);
    },
  };
});

/** A seller and a buyer without keepers, both funded; no world or match progression. */
function fixture(year = 1950) {
  const w = worldMarketFixture();
  w.year = year;
  w.calendar = { day: npcMarketDays(w.year)[0]![0]! };
  w.clubs = [
    w.clubs[0]!,
    ...[0, 1].map((n): Club => ({
      ...w.clubs[1]!,
      id: `ENG:0:0:${n}`,
      country: 'ENG',
      strength: 65,
    })),
  ];
  foundSquads(w);
  w.people = {};
  for (const club of w.clubs.slice(1)) {
    for (const p of w.squads![club.id]!) {
      p.born = w.year - 24;
      p.until = w.year + 3;
      p.potential = 65;
      for (const a of ATTRIBUTES) p.attrs[a] = 65;
      p.wage = marketWageAt('ENG', w.year, club.tier, p);
    }
    // Exactly the standing size: no surplus listing unless a case adds one.
    w.squads![club.id] = w.squads![club.id]!.slice(0, NPC_SQUAD.size);
    club.books = {
      seasons: [],
      cash: '999999999999',
      debt: '0',
      openingIncome: npcWageBill(w, club).toString(),
    };
    invalidateNpcSquad(w, club.id);
  }
  const seller = w.clubs[1]!,
    buyer = w.clubs[2]!;
  w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.position !== 'GK');
  invalidateNpcSquad(w, buyer.id);
  draws.sale = 0;
  draws.terms = 0;
  draws.bid = 1;
  draws.day = 0;
  return { w, seller, buyer };
}
/** The seller's one keeper on offer: its own keepers announce retirement, which keeps them off it. */
function target(w: World, seller: Club, over: Partial<Player> = {}, ability = 75) {
  for (const q of w.squads![seller.id]!) if (q.position === 'GK') q.retiring = w.year;
  const p = generatedPlayer('ENG', w.seed, 'target-keeper', w.year, ability, 'GK', 24, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  p.potential = ability;
  p.until = w.year + 3;
  p.wage = marketWageAt('ENG', w.year, seller.tier, p);
  Object.assign(p, over);
  w.squads![seller.id]!.push(p);
  seller.books!.openingIncome = npcWageBill(w, seller).toString();
  invalidateNpcSquad(w, seller.id);
  return p;
}
/** A buyer that can pay the asking fee and his wage but holds less than three times the fee. */
function modestBuyer(w: World, buyer: Club, p: Player, seller: Club) {
  const asking = BigInt(marketValueAt('ENG', w.year, seller.tier, p));
  buyer.books!.openingIncome = (
    npcWageBill(w, buyer) + BigInt(marketWageAt('ENG', w.year, buyer.tier, p))
  ).toString();
  buyer.books!.cash = (asking + BigInt(operatingExpensesAt('ENG', w.year, buyer.tier))).toString();
  expect(npcWageLimit(w, buyer)! - npcWageBill(w, buyer)).toBeLessThan(asking * 3n);
  return asking;
}
const at = (w: World, id: string) =>
  Object.entries(w.squads ?? {})
    .filter(([, ps]) => ps.some((p) => p.id === id))
    .map(([club]) => club);
function observe(act: () => void) {
  const seen: { id: string; move: PlayerMove; reason: MoveReason }[] = [];
  const before = PLAYER_MOVE_FLOW.observe;
  PLAYER_MOVE_FLOW.observe = (_w, id, move, reason) => seen.push({ id, move, reason });
  try {
    act();
  } finally {
    PLAYER_MOVE_FLOW.observe = before;
  }
  return seen;
}

describe('the pull market (→WORLD-16)', () => {
  it('buys an unlisted starter at a bid that reaches the reservation, and not below it', () => {
    for (const [bid, sale, moves] of [
      [1, 1, true], // a bid of the asking fee: always accepted
      [0, 1, false], // half the asking fee against a reservation at the asking fee: refused
    ] as const) {
      const { w, seller, buyer } = fixture();
      const p = target(w, seller);
      const asking = modestBuyer(w, buyer, p, seller);
      expect(startingSquad(w, seller)).toContain(p);
      draws.bid = bid;
      draws.sale = sale;
      const seen = observe(() => npcMarket(w));
      expect(at(w, p.id)).toEqual([moves ? buyer.id : seller.id]);
      if (moves) {
        expect(seen).toEqual([
          { id: p.id, move: expect.objectContaining({ fee: asking.toString() }), reason: 'pull' },
        ]);
      } else {
        expect(seen).toEqual([]);
        expect(BigInt(npcBidFee(asking.toString(), false, 0))).toBeLessThan(
          asking - (asking * 25n) / 100n,
        );
      }
    }
  });

  it('settles a counter at the reservation when the buyer can pay it', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    const asking = modestBuyer(w, buyer, p, seller);
    draws.bid = 0.6; // 80% of the asking fee, within a quarter of a reservation at the fee
    draws.sale = 1;
    const seen = observe(() => npcMarket(w));
    expect(at(w, p.id)).toEqual([buyer.id]);
    expect(seen[0]!.move.fee).toBe(asking.toString());
  });

  it('lets the player refuse by his CLUB-53 draw, and then nothing moves', () => {
    const { w, seller, buyer } = fixture();
    seller.tier = 1;
    seller.reputation = 70;
    buyer.reputation = 40;
    const p = target(w, seller);
    const read = termsChance(
      npcTermsContext(w, {
        buyer,
        seller,
        player: p,
        wage: marketWageAt('ENG', w.year, buyer.tier, p),
        wouldStart: true,
        startsNow: true,
      }),
    );
    expect(read.lines.map((l) => l.factor)).toEqual(['reputation', 'playingTime']);
    expect(read.chance).toBeGreaterThan(0);
    expect(read.chance).toBeLessThan(1);
    draws.terms = 0.999999;
    const refused = structuredClone(w);
    expect(observe(() => npcMarket(refused))).toEqual([]);
    expect(at(refused, p.id)).toEqual([seller.id]);
    expect(refused.clubs[1]!.books!.transfersReceived).toBeUndefined();
    draws.terms = 0;
    npcMarket(w);
    expect(at(w, p.id)).toEqual([buyer.id]);
  });

  it("reads a relegated seller's starter and a player above his division with the NPC rows", () => {
    const { w, seller, buyer } = fixture();
    seller.tier = 1;
    const p = target(w, seller, {}, tierLevel(1) + 5);
    const archive = { year: w.year - 1, standings: [[w.clubs.indexOf(seller), 0]] };
    w.history = [archive as unknown as SeasonArchive];
    const read = (b: Club) =>
      saleShare(
        npcSaleContext(w, {
          seller,
          buyer: b,
          player: p,
          fee: '1',
          asking: '1',
          sellingDown: false,
        }),
      ).lines.filter((l) => l.factor === 'relegated' || l.factor === 'aboveDivision');
    expect(startingSquad(w, seller)).toContain(p);
    expect(read(buyer)).toEqual([
      expect.objectContaining({ factor: 'relegated', delta: -0.1 }),
      expect.objectContaining({ factor: 'aboveDivision', delta: -0.1 }),
    ]);
    // A buyer from the same division, and a seller that was not relegated, read neither row.
    expect(read({ ...buyer, tier: 1 })).toEqual([expect.objectContaining({ factor: 'relegated' })]);
    archive.standings = [[w.clubs.indexOf(seller), 1]];
    expect(read({ ...buyer, tier: 1 })).toEqual([]);
    // One point short of five above the division's level is not above it.
    for (const a of ATTRIBUTES) p.attrs[a] = tierLevel(1) + 4;
    expect(read(buyer)).toEqual([]);
  });

  it('keeps each window to the era table: bids spread over its days, buys capped', () => {
    expect(npcMarketCaps(1930)).toEqual({ bids: 3, buys: 2, sales: 2 });
    expect(npcMarketCaps(1950)).toEqual(NPC_MARKET_ERA.anchors[0]![1]);
    expect(npcMarketCaps(1995)).toEqual({ bids: 6, buys: 4, sales: 4 });
    expect(npcMarketCaps(2002)).toEqual({ bids: 7, buys: 4, sales: 4 });
    expect(npcMarketCaps(2030)).toEqual({ bids: 8, buys: 5, sales: 5 });
    for (const bids of [3, 4, 5, 8])
      expect([0, 1, 2].reduce((n, i) => n + bidsOnDay(bids, i, 3), 0)).toBe(bids);
    // A buyer needing a keeper every day of the window: two buys at most in 1950, three bids.
    const { w, seller, buyer } = fixture();
    const first = target(w, seller);
    for (let n = 0; n < 3; n++)
      w.squads![seller.id]!.push({ ...structuredClone(first), id: `keeper:${n}` });
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    invalidateNpcSquad(w, seller.id);
    const window = npcMarketDays(w.year)[0]!;
    // The buyer meets the first keeper on the window's first day and each other on a later one.
    draws.day = (key) => (key.endsWith(`:${first.id}`) ? 0 : Number(key.at(-1)) / 3 + 0.1);
    draws.keys.length = 0;
    const seen = observe(() => {
      for (const day of window) {
        w.calendar!.day = day;
        // Sell the keeper he bought on: the need stays open every day.
        w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.position !== 'GK');
        invalidateNpcSquad(w, buyer.id);
        npcMarket(w);
      }
    });
    expect(seen.filter((s) => s.move.to === buyer.id)).toHaveLength(npcMarketCaps(1950).buys);
    const bids = draws.keys.filter((k) => k.includes(':npc-sale:') && k.includes(`:${buyer.id}:`));
    expect(bids.length).toBeLessThanOrEqual(npcMarketCaps(1950).bids);
  });

  it('lets no club that cannot sell take a place of the bounded search', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    // A third club holds more keepers rated far above him than the search reads, every one
    // unsellable this window: it has already made its era's sales.
    const holder: Club = { ...seller, id: 'ENG:0:0:9' };
    w.clubs.push(holder);
    w.squads![holder.id] = Array.from({ length: 30 }, (_, n) => {
      const q = generatedPlayer('ENG', w.seed, `holder-keeper:${n}`, w.year, 90, 'GK', 24, 0);
      for (const a of ATTRIBUTES) q.attrs[a] = 90;
      q.potential = 90;
      q.until = w.year + 3;
      q.wage = marketWageAt('ENG', w.year, holder.tier, q);
      return q;
    });
    holder.books = { seasons: [], cash: '999999999999', debt: '0', openingIncome: '0' };
    holder.books.openingIncome = npcWageBill(w, holder).toString();
    for (let n = 0; n < npcMarketCaps(w.year).sales; n++)
      recordPlayerMove(w, `holder-sold:${n}`, {
        year: w.year,
        day: w.calendar!.day,
        from: holder.id,
        to: seller.id,
        fee: '1',
      });
    invalidateNpcSquad(w, holder.id);
    npcMarket(w);
    expect(at(w, p.id)).toEqual([buyer.id]);
    // None of the holder's keepers was sold.
    expect(w.squads![holder.id]!.filter((q) => q.id.includes('holder-keeper'))).toHaveLength(30);
  });

  it('reaches an affordable veteran above what a regular of his rating would cost', () => {
    // Past the maximum-wage years a rating's wage keeps rising past 80; a fourth-division seller
    // asks little, so the buyer's headroom is mostly his wage.
    const { w, seller, buyer } = fixture(1975);
    seller.tier = 3;
    const p = target(w, seller, { born: w.year - 40 }, 88);
    // The buyer can pay this veteran's wage and fee, and no more: a 27-year-old six points below
    // him would ask a wage above its headroom.
    const wage = BigInt(marketWageAt('ENG', w.year, buyer.tier, p)),
      asking = BigInt(marketValueAt('ENG', w.year, seller.tier, p));
    const short = npcWageBill(w, buyer) + wage + asking - npcWageLimit(w, buyer)!;
    buyer.books!.cash = (BigInt(buyer.books!.cash) + short).toString();
    expect(npcWageLimit(w, buyer)! - npcWageBill(w, buyer)).toBe(wage + asking);
    const regular = { ...p, born: w.year - 27, potential: 0 };
    expect(BigInt(marketWageAt('ENG', w.year, buyer.tier, regular, 88 - 6))).toBeGreaterThan(
      wage + asking,
    );
    npcMarket(w);
    expect(at(w, p.id)).toEqual([buyer.id]);
  });

  it('ranks by the slot, reading past any number of abler players who fit it worse', () => {
    const { w, seller, buyer } = fixture();
    // The buyer keeps its keepers; its first outfield slot is its weakest by far.
    for (const keeper of w.squads![seller.id]!.filter((q) => q.position === 'GK'))
      w.squads![buyer.id]!.push({ ...structuredClone(keeper), id: `buyer-${keeper.id}` });
    const slot = formationOf(clubStyle(buyer)).find((s) => s.position !== 'GK')!;
    for (const q of w.squads![buyer.id]!)
      if (q.position === slot.position) for (const a of ATTRIBUTES) q.attrs[a] = 40;
    buyer.books!.openingIncome = npcWageBill(w, buyer).toString();
    invalidateNpcSquad(w, buyer.id);
    const other = (
      ['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'ST', 'LW', 'RW'] as const
    ).find((pos) => pos !== slot.position && lineOf(pos) === lineOf(slot.position))!;
    // A third club offers many abler players of another position of the line.
    const holder: Club = { ...seller, id: 'ENG:0:0:9' };
    w.clubs.push(holder);
    w.squads![holder.id] = Array.from({ length: 30 }, (_, n) => {
      const q = generatedPlayer('ENG', w.seed, `abler:${n}`, w.year, 85, other, 24, 0);
      for (const a of ATTRIBUTES) q.attrs[a] = 85;
      q.potential = 85;
      q.until = w.year + 3;
      q.wage = marketWageAt('ENG', w.year, holder.tier, q);
      return q;
    });
    holder.books = { seasons: [], cash: '999999999999', debt: '0', openingIncome: '0' };
    holder.books.openingIncome = npcWageBill(w, holder).toString();
    invalidateNpcSquad(w, holder.id);
    // The seller's player of the slot's own position rates below them by main OVR, above at it.
    const fit = generatedPlayer('ENG', w.seed, 'slot-fit', w.year, 82, slot.position, 24, 0);
    for (const a of ATTRIBUTES) fit.attrs[a] = 82;
    fit.potential = 82;
    fit.until = w.year + 3;
    fit.wage = marketWageAt('ENG', w.year, seller.tier, fit);
    w.squads![seller.id]!.push(fit);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    invalidateNpcSquad(w, seller.id);
    expect(slotOvr(fit, slot)).toBeGreaterThan(
      Math.max(...w.squads![holder.id]!.map((q) => slotOvr(q, slot))),
    );
    npcMarket(w);
    expect(at(w, fit.id)).toEqual([buyer.id]);
  });

  it('sells down by the lowest value for his wage, then 30+, then final season, then highest wage', () => {
    const row = (id: string, value: number, wage: number, age = 25, finalSeason = false) =>
      ({ id, value: BigInt(value), wage: BigInt(wage), age, finalSeason }) satisfies SellDownRow;
    const rows = [
      row('unpaid', 100, 0),
      row('dear', 100, 50), // value 2 per wage unit
      row('cheap-young', 100, 100), // 1 per unit
      row('cheap-veteran', 100, 100, 31),
      row('cheap-expiring', 100, 100, 25, true),
      row('cheap-highest', 200, 200), // 1 per unit, the highest wage
      row('worst', 50, 100), // 0.5 per unit
    ];
    expect(rows.sort(compareSellDown).map((r) => r.id)).toEqual([
      'worst',
      'cheap-veteran',
      'cheap-expiring',
      'cheap-highest',
      'cheap-young',
      'dear',
      'unpaid',
    ]);
  });
});

describe('move reasons reach the observer and nothing else', () => {
  it('names every kind of move', () => {
    const reasons = new Set<MoveReason>();
    const run = (setup: (f: ReturnType<typeof fixture>) => Player) => {
      const f = fixture();
      const p = setup(f);
      const seen = observe(() => npcMarket(f.w));
      expect(seen.map((s) => s.id)).toEqual([p.id]);
      reasons.add(seen[0]!.reason);
      return { ...f, p };
    };
    // An unlisted player, pulled.
    run(({ w, seller }) => target(w, seller));
    // A player in his final contract season.
    run(({ w, seller }) => target(w, seller, { until: 1950 }));
    // Blocked by two keepers four or more above him, aged 24: listed, not loaned.
    run(({ w, seller }) => target(w, seller, {}, 40));
    // The same at 19: loaned.
    const loan = run(({ w, seller }) => target(w, seller, { born: 1931 }, 40));
    // One over the standing size, the least able of a squad whose keepers stand level with him.
    run(({ w, seller }) => {
      for (const q of w.squads![seller.id]!)
        if (q.position === 'GK') for (const a of ATTRIBUTES) q.attrs[a] = 40;
      const p = target(w, seller, {}, 40);
      expect(w.squads![seller.id]!.length).toBe(NPC_SQUAD.size + 1);
      return p;
    });
    // A seller over its funded envelope.
    run(({ w, seller }) => {
      const p = target(w, seller);
      p.wage = (BigInt(p.wage) * 100n).toString();
      seller.books!.openingIncome = '0';
      seller.books!.cash = (
        npcWageBill(w, seller) -
        1n +
        BigInt(operatingExpensesAt('ENG', w.year, seller.tier))
      ).toString();
      expect(npcWageBill(w, seller)).toBeGreaterThan(npcWageLimit(w, seller)!);
      return p;
    });
    // The loan's return at the close.
    loan.w.calendar = { day: SEASON_END_DAY + 1 };
    const returned = observe(() => returnNpcLoans(loan.w));
    expect(returned.map((s) => s.reason)).toEqual(['loan-return']);
    // A free agent's signing: its path names it, and a fee-free move reads as one by default.
    const { w, seller, buyer } = fixture();
    const free = observe(() => {
      withMoveReason('free-signing', () =>
        recordPlayerMove(w, 'free-agent', {
          year: 1950,
          day: 0,
          from: seller.id,
          to: buyer.id,
          fee: '0',
        }),
      );
      recordPlayerMove(w, 'other-free', {
        year: 1950,
        day: 0,
        from: seller.id,
        to: buyer.id,
        fee: '0',
      });
    });
    expect(free.map((s) => s.reason)).toEqual(['free-signing', 'free-signing']);
    expect([...new Set([...reasons, 'loan-return', 'free-signing'])].sort()).toEqual([
      'blocked',
      'final-season',
      'free-signing',
      'loan',
      'loan-return',
      'pull',
      'sell-down',
      'surplus',
    ]);
  });

  it('stores only the move itself when no observer is installed', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    expect(PLAYER_MOVE_FLOW.observe).toBeUndefined();
    npcMarket(w);
    expect(at(w, p.id)).toEqual([buyer.id]);
    const record = w.playerRecords![p.id]!;
    expect(record).not.toHaveProperty('reason');
    expect(record.moves.map((m) => Object.keys(m).sort())).toEqual([
      ['day', 'fee', 'from', 'to', 'year'],
    ]);
    expect(JSON.stringify(w)).not.toContain('"reason"');
  });

  it('bids for a target once a window, on its seeded day, with the same draws in both windows', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    draws.terms = 0.999999; // the player refuses: the buyer may not ask again in this window
    draws.keys.length = 0;
    const [summer, winter] = npcMarketDays(w.year);
    for (const day of summer!) {
      w.calendar!.day = day;
      npcMarket(w);
    }
    for (const day of winter!) {
      w.calendar!.day = day;
      npcMarket(w);
    }
    const pair = `${buyer.id}:${p.id}`;
    const asked = (kind: string) =>
      draws.keys.filter((k) => k.includes(`:${kind}:`) && k.endsWith(pair));
    for (const kind of ['npc-sale', 'npc-terms'])
      expect(asked(kind)).toEqual([
        `${w.seed}:${kind}:${w.year}:summer:${pair}`,
        `${w.seed}:${kind}:${w.year}:winter:${pair}`,
      ]);
    expect(at(w, p.id)).toEqual([seller.id]);
  });

  it('meets a target on one open settlement day of the window', () => {
    expect(npcBidDay(0, [0, 1, 2])).toBe(0);
    expect(npcBidDay(0.5, [0, 1, 2])).toBe(1);
    expect(npcBidDay(0.999999, [0, 1, 2])).toBe(2);
    expect(npcBidDay(0.7, [1, 2])).toBe(2);
    expect(npcBidDay(0.3, [])).toBe(-1);
  });
});
