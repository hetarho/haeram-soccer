import { describe, expect, it, vi } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Club, Player, PlayerMove, SeasonArchive, World } from '../../contracts/src/types';
import {
  affordableLevel,
  bidsOnDay,
  compareSellDown,
  NPC_BID_FLOW,
  NPC_MARKET,
  npcBidFee,
  npcMarket,
  npcMarketDays,
  npcValueScore,
  PLAYER_MOVE_FLOW,
  recordPlayerMove,
  returnNpcLoans,
  withMoveReason,
  type MoveReason,
  type SellDownRow,
} from './npc-market';
import { foundSquads } from './persisted-squads';
import { returnLoan } from './npc-continuity';
import { retainPerson } from './person-careers';
import { lineOf } from './player';
import { formationOf, slotOvr } from './player-state';
import { clubStyle } from './tactics';
import {
  generatedPlayer,
  invalidateNpcSquad,
  NPC_SQUAD,
  startingSquad,
  stature,
  tierLevel,
} from './world';
import { worldMarketFixture } from './world-market.testkit';
import { marketValueAt, marketWageAt } from './market-prices';
import * as marketPrices from './market-prices';
import { npcFixedCosts, npcWageBill, npcWageBudget, npcWageLimit } from './books';
import { operatingExpensesAt } from './finance';
import { npcSaleContext, saleShare } from './sale-answer';
import { npcTermsContext, termsChance } from './personal-terms';
import { NPC_MARKET_ERA, npcMarketCaps } from './transfer-policy';
import { SEASON_END_DAY } from './calendar';

/** A case's draw: one value for every key of its kind, or a value read from the key. */
type Draw = number | ((key: string) => number);
type Answered = { draw: number; answer: unknown }[];
/**
 * The bid share, the seller's answer and the player's answer are seeded draws keyed by the pair
 * and window (→CLUB-52/53); each case sets them, and every key the market reads is recorded, with
 * every answer and the draw it read.
 */
const draws = vi.hoisted(() => ({
  sale: 0 as Draw,
  terms: 0 as Draw,
  bid: 1 as Draw,
  keys: [] as string[],
  answers: { sale: [] as Answered, terms: [] as Answered },
}));
vi.mock('./primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./primitives')>();
  const of = (draw: Draw, seed: string) => () => (typeof draw === 'number' ? draw : draw(seed));
  return {
    ...actual,
    random(seed: string) {
      draws.keys.push(seed);
      if (seed.includes(':npc-sale:')) return of(draws.sale, seed);
      if (seed.includes(':npc-terms:')) return of(draws.terms, seed);
      if (seed.includes(':npc-bid:')) return of(draws.bid, seed);
      return actual.random(seed);
    },
  };
});
vi.mock('./sale-answer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sale-answer')>();
  return {
    ...actual,
    saleAnswer(...args: Parameters<typeof actual.saleAnswer>) {
      const answer = actual.saleAnswer(...args);
      draws.answers.sale.push({ draw: args[1], answer });
      return answer;
    },
  };
});
vi.mock('./personal-terms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./personal-terms')>();
  return {
    ...actual,
    termsAnswer(...args: Parameters<typeof actual.termsAnswer>) {
      const answer = actual.termsAnswer(...args);
      draws.answers.terms.push({ draw: args[1], answer });
      return answer;
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
  draws.answers.sale.length = 0;
  draws.answers.terms.length = 0;
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
/** The draw keys of one kind read for a buyer and a player, in order. */
const asked = (kind: string, buyer: Club, p: Player) =>
  draws.keys.filter((k) => k.includes(`:${kind}:`) && k.endsWith(`:${buyer.id}:${p.id}`));
/** Runs the market on each of `days`. */
function settle(w: World, days: readonly number[], before?: () => void) {
  for (const day of days) {
    w.calendar!.day = day;
    before?.();
    npcMarket(w);
  }
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

function observeBids(act: () => void) {
  const seen: Parameters<NonNullable<typeof NPC_BID_FLOW.observe>>[0][] = [];
  const before = NPC_BID_FLOW.observe;
  NPC_BID_FLOW.observe = (bid) => seen.push(bid);
  try {
    act();
  } finally {
    NPC_BID_FLOW.observe = before;
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
      let seen: ReturnType<typeof observe> = [];
      const bids = observeBids(() => {
        seen = observe(() => npcMarket(w));
      });
      expect(bids).toContainEqual({
        from: { id: seller.id, country: seller.country, tier: seller.tier },
        to: { id: buyer.id, country: buyer.country, tier: buyer.tier },
        playerId: p.id,
        outcome: moves ? 'completed' : 'seller-refused',
      });
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

  it('reports an unaffordable seller counter as the buyer refusing the counted bid', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    const asking = modestBuyer(w, buyer, p, seller);
    const wage = BigInt(marketWageAt('ENG', w.year, buyer.tier, p));
    const affordable = npcWageBill(w, buyer) + wage + (asking * 9n) / 10n;
    buyer.books!.debt = (npcWageLimit(w, buyer)! - affordable).toString();
    draws.bid = 0.6;
    draws.sale = 1;
    const bids = observeBids(() => npcMarket(w));
    expect(bids).toContainEqual(
      expect.objectContaining({
        playerId: p.id,
        outcome: 'buyer-refused',
      }),
    );
    expect(at(w, p.id)).toEqual([seller.id]);
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
    draws.keys.length = 0;
    const seen = observe(() =>
      settle(w, npcMarketDays(w.year)[0]!, () => {
        // Sell the keeper he bought on: the need stays open every day.
        w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.position !== 'GK');
        invalidateNpcSquad(w, buyer.id);
      }),
    );
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
});

describe('asking again in a window (→CLUB-52/53)', () => {
  it('bids for its best target on a later settlement day when its need opens then', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    // On the window's first day the buyer holds two keepers as able as him: no need, no bid.
    for (const id of ['own-keeper', 'other-keeper'])
      w.squads![buyer.id]!.push({ ...structuredClone(p), id });
    buyer.books!.openingIncome = npcWageBill(w, buyer).toString();
    invalidateNpcSquad(w, buyer.id);
    const [first, ...later] = npcMarketDays(w.year)[0]!;
    draws.keys.length = 0;
    settle(w, [first!]);
    expect(asked('npc-sale', buyer, p)).toEqual([]);
    // One of them is gone by the next settlement day: the need opens and reaches the player.
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((q) => q.id !== 'own-keeper');
    invalidateNpcSquad(w, buyer.id);
    settle(w, later.slice(0, 1));
    expect(asked('npc-sale', buyer, p)).toEqual([
      `${w.seed}:npc-sale:${w.year}:summer:${buyer.id}:${p.id}`,
    ]);
    expect(at(w, p.id)).toEqual([buyer.id]);
  });

  it("meets the same seller's and player's answers when it asks again on a later day", () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    modestBuyer(w, buyer, p, seller);
    const pair = `${buyer.id}:${p.id}`,
      summerKey = (kind: string) => `${w.seed}:${kind}:${w.year}:summer:${pair}`;
    // 80% of the asking fee; in the summer the seller counters at its fee and the player refuses.
    draws.bid = 0.6;
    draws.sale = (key) => (key === summerKey('npc-sale') ? 1 : 0);
    draws.terms = (key) => (key === summerKey('npc-terms') ? 0.999999 : 0);
    draws.keys.length = 0;
    const [summer, winter] = npcMarketDays(w.year);
    settle(w, summer!);
    // One bid a settlement day in 1950: the buyer asks again each day and meets the same draws.
    for (const kind of ['npc-bid', 'npc-sale', 'npc-terms'])
      expect(asked(kind, buyer, p)).toEqual(Array(summer!.length).fill(summerKey(kind)));
    const [sale, terms] = [draws.answers.sale, draws.answers.terms];
    expect(sale.map((a) => a.draw)).toEqual([1, 1, 1]);
    expect(sale[0]!.answer).toMatchObject({ kind: 'counter' });
    expect(terms.map((a) => (a.answer as { accept: boolean }).accept)).toEqual([
      false,
      false,
      false,
    ]);
    // With no factor changed, the second day's answers are the first day's.
    expect(sale[1]).toEqual(sale[0]);
    expect(terms[1]).toEqual(terms[0]);
    // The window's last day adds its deadline row, which moves the reservation, not the draw.
    expect(
      (sale[2]!.answer as { lines: { factor: string }[] }).lines.map((l) => l.factor),
    ).toContain('deadline');
    expect(at(w, p.id)).toEqual([seller.id]);
    // The next window draws afresh.
    settle(w, winter!.slice(0, 1));
    expect(asked('npc-terms', buyer, p).at(-1)).toBe(
      `${w.seed}:npc-terms:${w.year}:winter:${pair}`,
    );
    expect(at(w, p.id)).toEqual([buyer.id]);
  });

  it('lets the higher-stature club have a player two clubs want, whatever day they meet him', () => {
    const window = npcMarketDays(1950)[0]!;
    for (const from of window.keys())
      for (const rivalFirst of [false, true]) {
        const { w, seller, buyer } = fixture();
        const p = target(w, seller);
        // A second club without keepers, of another stature, listed before or after the buyer.
        const id = Array.from({ length: 18 }, (_, n) => `ENG:0:0:${n + 2}`).find(
          (one) => stature(w.seed, one) !== stature(w.seed, buyer.id),
        )!;
        const rival: Club = { ...buyer, id, books: { ...buyer.books! } };
        w.squads![rival.id] = w.squads![buyer.id]!.map((q) => ({
          ...structuredClone(q),
          id: `rival-${q.id}`,
        }));
        w.clubs.splice(rivalFirst ? 1 : w.clubs.length, 0, rival);
        rival.books!.openingIncome = npcWageBill(w, rival).toString();
        invalidateNpcSquad(w, rival.id);
        const [high, low] =
          stature(w.seed, rival.id) > stature(w.seed, buyer.id) ? [rival, buyer] : [buyer, rival];
        draws.keys.length = 0;
        settle(w, window.slice(from));
        expect(at(w, p.id)).toEqual([high.id]);
        expect(asked('npc-sale', low, p)).toEqual([]);
      }
  });

  it('bids blind on the first day, then skips a target who would refuse without spending a bid', () => {
    const { w, seller, buyer } = fixture();
    const best = target(w, seller, {}, 76);
    // A second keeper, a point below him.
    const next = { ...structuredClone(best), id: 'next-keeper' };
    for (const a of ATTRIBUTES) next.attrs[a] = 75;
    next.potential = 75;
    next.wage = marketWageAt('ENG', w.year, seller.tier, next);
    w.squads![seller.id]!.push(next);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    invalidateNpcSquad(w, seller.id);
    // The abler keeper refuses this buyer all summer.
    draws.terms = (key) => (key.endsWith(`:${buyer.id}:${best.id}`) ? 0.999999 : 0);
    draws.keys.length = 0;
    const [first, second] = npcMarketDays(w.year)[0]!;
    expect(bidsOnDay(npcMarketCaps(w.year).bids, 1, 3)).toBe(1);
    const bids = observeBids(() => {
      // The first day's one bid goes to him blind, and he refuses.
      settle(w, [first!]);
      expect(asked('npc-sale', buyer, best)).toHaveLength(1);
      expect(asked('npc-sale', buyer, next)).toEqual([]);
      expect(at(w, best.id)).toEqual([seller.id]);
      // The second day skips that refusal and spends its bid on the next keeper.
      settle(w, [second!]);
    });
    expect(
      bids.flatMap((bid) =>
        bid.to.id === buyer.id ? [[bid.from.id, bid.playerId, bid.outcome]] : [],
      ),
    ).toEqual([
      [seller.id, best.id, 'player-refused'],
      [seller.id, next.id, 'completed'],
    ]);
    // Only the counted first-day bid is stored. Previewing the refusal on day two adds no row.
    expect(best.renewalBids).toEqual([
      { club: seller.id, year: w.year, window: 'summer', reputation: buyer.reputation },
    ]);
    expect(next.renewalBids).toBeUndefined(); // The completed move begins a new stint.
    expect(asked('npc-sale', buyer, best)).toHaveLength(2);
    expect(asked('npc-sale', buyer, next)).toHaveLength(1);
    expect(at(w, best.id)).toEqual([seller.id]);
    expect(at(w, next.id)).toEqual([buyer.id]);
  });
});

/** A second seller of `tier`, a copy of the fixture's seller under its own ids and books. */
function secondSeller(w: World, seller: Club, tier: number) {
  const other: Club = { ...seller, id: `ENG:${tier}:0:7`, tier, books: { ...seller.books! } };
  w.squads![other.id] = w.squads![seller.id]!.map((q) => ({
    ...structuredClone(q),
    id: `other-${q.id}`,
  }));
  w.clubs.push(other);
  for (const q of w.squads![other.id]!) if (q.position === 'GK') q.retiring = w.year;
  other.books!.openingIncome = npcWageBill(w, other).toString();
  invalidateNpcSquad(w, other.id);
  return other;
}
/** A keeper of `ability` added to `club`, priced on its division. */
function keeperAt(w: World, club: Club, id: string, ability: number, over: Partial<Player> = {}) {
  const p = generatedPlayer('ENG', w.seed, id, w.year, ability, 'GK', 24, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  Object.assign(p, { potential: ability, until: w.year + 3 }, over);
  p.wage = marketWageAt('ENG', w.year, club.tier, p);
  w.squads![club.id]!.push(p);
  club.books!.openingIncome = npcWageBill(w, club).toString();
  invalidateNpcSquad(w, club.id);
  return p;
}

describe('targets by value, means from the wage budget, paid moves down (→WORLD-16)', () => {
  it('ranks a slot target by gain for what he would cost: the cheaper first on equal gain', () => {
    const { w, seller, buyer } = fixture();
    // The buyer keeps two weak keepers: a slot need, not a short line.
    for (const q of w.squads![seller.id]!.filter((q) => q.position === 'GK').slice(0, 2))
      w.squads![buyer.id]!.push({ ...structuredClone(q), id: `weak-${q.id}`, retiring: undefined });
    for (const q of w.squads![buyer.id]!)
      if (q.position === 'GK') for (const a of ATTRIBUTES) q.attrs[a] = 55;
    buyer.books!.openingIncome = npcWageBill(w, buyer).toString();
    invalidateNpcSquad(w, buyer.id);
    const lower = secondSeller(w, seller, 1);
    const dear = target(w, seller, {}, 75),
      cheap = keeperAt(w, lower, 'cheap-keeper', 75);
    expect(BigInt(marketValueAt('ENG', w.year, 1, cheap))).toBeLessThan(
      BigInt(marketValueAt('ENG', w.year, 0, dear)),
    );
    draws.keys.length = 0;
    // 1950: one bid on the first day; it goes to the cheaper keeper of equal gain, who joins.
    npcMarket(w);
    expect(asked('npc-sale', buyer, cheap)).toHaveLength(1);
    expect(asked('npc-sale', buyer, dear)).toEqual([]);
    expect(at(w, cheap.id)).toEqual([buyer.id]);
    expect(at(w, dear.id)).toEqual([seller.id]);
  });

  it('lets a cheaper target of slightly smaller gain outrank a dear one, by the weight', () => {
    const reference = 1000n;
    // A dear target costs twice the reference, a cheap one exactly it.
    expect(npcValueScore(10, 2000n, reference)).toBe(10 * (0.5 + 0.25));
    expect(npcValueScore(9, 1000n, reference)).toBe(9);
    expect(npcValueScore(9, 1000n, reference)).toBeGreaterThan(npcValueScore(10, 2000n, reference));
    const weight = NPC_MARKET.valueWeight;
    try {
      NPC_MARKET.valueWeight = 0;
      expect(npcValueScore(9, 1000n, reference)).toBeLessThan(npcValueScore(10, 2000n, reference));
    } finally {
      NPC_MARKET.valueWeight = weight;
    }
    // No budget or no cost reads the gain alone.
    expect(npcValueScore(7, 1000n, 0n)).toBe(7);
  });

  it('reads the affordable level from the season wage budget, not cash plus backing', () => {
    const { w, buyer } = fixture();
    const players = w.squads![buyer.id]!,
      regular = { ...players[0]!, born: w.year - NPC_MARKET.termAge, potential: 0 },
      wageAt = (ovr: number) => BigInt(marketWageAt('ENG', w.year, buyer.tier, regular, ovr)),
      size = BigInt(NPC_SQUAD.size);
    // A small club's income and a cash pile that would pay a squad of 99s for a season.
    buyer.books!.openingIncome = npcWageBill(w, buyer).toString();
    buyer.books!.cash = (
      wageAt(99) * size +
      BigInt(operatingExpensesAt('ENG', w.year, buyer.tier))
    ).toString();
    expect(npcWageLimit(w, buyer)! / size).toBeGreaterThanOrEqual(wageAt(99));
    const level = affordableLevel(w, buyer, players);
    expect(level).toBeLessThan(99);
    const budget = npcWageBudget(w, buyer, NPC_MARKET.cashRunway)!;
    expect(wageAt(level)).toBeLessThanOrEqual(budget / size);
    expect(wageAt(level + 1)).toBeGreaterThan(budget / size);
    // More income each season raises it; the same cash spread over more seasons lowers it.
    buyer.books!.openingIncome = (BigInt(buyer.books!.openingIncome) * 3n).toString();
    expect(affordableLevel(w, buyer, players)).toBeGreaterThan(level);
  });

  it("buys a higher division's listed player down for a fee, never an unlisted starter", () => {
    for (const listed of [true, false]) {
      const { w, seller, buyer } = fixture();
      buyer.tier = 1;
      // In his final season he is listed; with seasons left he is an unlisted starter.
      const p = target(w, seller, listed ? { until: w.year } : {});
      expect(startingSquad(w, seller)).toContain(p);
      draws.keys.length = 0;
      const seen = observe(() => npcMarket(w));
      if (listed) {
        expect(at(w, p.id)).toEqual([buyer.id]);
        const move = seen.find((s) => s.id === p.id)!;
        expect(move.reason).toBe('listed-down');
        expect(move.move.loan).toBeUndefined();
        expect(BigInt(move.move.fee)).toBeGreaterThan(0n);
      } else {
        expect(asked('npc-sale', buyer, p)).toEqual([]);
        expect(at(w, p.id)).toEqual([seller.id]);
      }
    }
  });
});

describe('loan returns preserve each club’s recorded origin', () => {
  it.each([true, false])(
    'keeps the borrower row when its own academy flag is %s',
    (ownGraduate) => {
      const { w, seller } = fixture(2000);
      const p = target(w, seller);
      w.squads![seller.id] = w.squads![seller.id]!.filter((q) => q.id !== p.id);
      p.joined = w.year;
      if (ownGraduate) p.graduate = true;
      p.loanUntil = w.year + 1;
      w.players.push(p);
      w.playerRecords = {
        [p.id]: {
          moves: [],
          loan: {
            club: seller.id,
            until: w.year + 1,
            wage: p.wage,
            contractUntil: w.year + 2,
            year: w.year,
            joined: w.year - 4,
            ...(!ownGraduate ? { graduate: true } : {}),
          },
        },
      };
      returnNpcLoans(w);
      expect(w.players.find((q) => q.id === p.id)).toMatchObject({
        status: 'sold',
        joined: w.year,
      });
      expect(p.graduate).toBe(ownGraduate ? true : undefined);
      const returned = w.squads![seller.id]!.find((q) => q.id === p.id)!;
      expect(returned.joined).toBe(w.year - 4);
      expect(returned.graduate).toBe(ownGraduate ? undefined : true);
    },
  );

  it.each(['recorded-graduate', 'recorded-stint', 'unknown', 'owned-parent'])(
    'rollover fallback restores only known parent facts: %s',
    (scenario) => {
      const { w, seller } = fixture();
      const ownedParent = scenario === 'owned-parent';
      const p = target(w, seller, { joined: w.year, graduate: true });
      const parent = ownedParent ? w.playerClub : seller.id;
      if (ownedParent) {
        w.players.push({ ...structuredClone(p), status: 'sold', joined: w.year - 5 });
        delete p.graduate;
      } else {
        w.squads![seller.id] = w.squads![seller.id]!.filter((q) => q.id !== p.id);
        w.players.push(p);
      }
      retainPerson(w, p, ownedParent ? seller.id : w.playerClub).loan = {
        club: parent,
        until: w.year + 1,
      };
      p.loanUntil = w.year + 1;
      if (scenario.startsWith('recorded'))
        w.playerRecords = {
          [p.id]: {
            moves: [],
            loan: {
              club: parent,
              until: w.year + 1,
              wage: p.wage,
              contractUntil: w.year + 2,
              year: w.year,
              joined: w.year - 4,
              ...(scenario === 'recorded-graduate' ? { graduate: true as const } : {}),
            },
          },
        };
      const identity = structuredClone({ id: p.id, name: p.name, born: p.born, attrs: p.attrs });
      returnLoan(w, p);
      const returned = ownedParent
        ? w.players.find((q) => q.id === p.id)!
        : w.squads![parent]!.find((q) => q.id === p.id)!;
      expect(returned).toMatchObject(identity);
      expect(returned.joined).toBe(
        ownedParent ? w.year - 5 : scenario === 'unknown' ? undefined : w.year - 4,
      );
      expect(returned.graduate).toBe(
        ownedParent || scenario === 'recorded-graduate' ? true : undefined,
      );
      if (!ownedParent) {
        expect(w.players.find((q) => q.id === p.id)).toBe(p);
        expect(p).toMatchObject({ ...identity, status: 'sold', joined: w.year, graduate: true });
        expect(returned).not.toBe(p);
      }
    },
  );

  it('resumes an owned parent’s recorded stint for an old loan without people or optional facts', () => {
    const { w, seller } = fixture();
    const p = target(w, seller, { joined: w.year, graduate: undefined });
    const prior = structuredClone(p);
    prior.status = 'sold';
    prior.joined = w.year - 5;
    prior.graduate = true;
    w.players.push(prior);
    delete w.people;
    w.playerRecords = {
      [p.id]: {
        moves: [],
        loan: {
          club: w.playerClub,
          until: w.year + 1,
          wage: p.wage,
          contractUntil: w.year + 2,
          year: w.year,
        },
      },
    };
    returnNpcLoans(w);
    expect(w.players.find((q) => q.id === p.id)).toMatchObject({
      status: 'active',
      joined: w.year - 5,
      graduate: true,
    });
    expect(w.squads![seller.id]!.some((q) => q.id === p.id)).toBe(false);
  });
});

describe('a young target’s expected gain (→WORLD-16)', () => {
  it.each([20, 25])(
    'ranks a lower-division player aged %i at equal current gain and cost',
    (age) => {
      const { w, seller, buyer } = fixture();
      for (const q of w.squads![seller.id]!.filter((q) => q.position === 'GK').slice(0, 2)) {
        const weak = { ...structuredClone(q), id: `weak-${q.id}` };
        for (const a of ATTRIBUTES) weak.attrs[a] = 55;
        w.squads![buyer.id]!.push(weak);
      }
      buyer.books!.openingIncome = npcWageBill(w, buyer).toString();
      buyer.levels = { academy: 3, ground: 3, coaching: 3 };
      invalidateNpcSquad(w, buyer.id);
      const lower = secondSeller(w, seller, 1);
      // Other clubs have no keeper upgrade to pursue; the buyer has a slot need, not a short line.
      target(w, seller, { retiring: w.year }, 90);
      const older = keeperAt(w, lower, 'a-older-keeper', 75, { born: w.year - 26 });
      const prospect = keeperAt(w, lower, 'z-prospect-keeper', 75, {
        born: w.year - age,
        potential: 95,
      });
      const ids = new Set([older.id, prospect.id]);
      const valueAt = marketPrices.marketValueAt,
        wageAt = marketPrices.marketWageAt;
      const value = vi
        .spyOn(marketPrices, 'marketValueAt')
        .mockImplementation((...args) => (ids.has(args[3].id) ? '1000' : valueAt(...args)));
      const wage = vi
        .spyOn(marketPrices, 'marketWageAt')
        .mockImplementation((...args) => (ids.has(args[3].id) ? '1000' : wageAt(...args)));
      try {
        const bids = observeBids(() => npcMarket(w)).filter((bid) => bid.to.id === buyer.id);
        expect(bids[0]).toMatchObject({
          playerId: age === 20 ? prospect.id : older.id,
          outcome: 'completed',
        });
      } finally {
        value.mockRestore();
        wage.mockRestore();
      }
    },
  );
});

describe('distress on the real NPC market path', () => {
  it('lists its most valuable player under forced sales even within the funded envelope', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller, {}, 90);
    seller.books!.distress = { stage: 2 };
    seller.books!.cash = '0';
    seller.books!.debt = (npcFixedCosts(w, seller) * 2n).toString();
    seller.books!.openingIncome = '999999999999';
    expect(npcWageBill(w, seller)).toBeLessThan(npcWageLimit(w, seller)!);
    const moves = observe(() => npcMarket(w));
    expect(at(w, p.id)).toEqual([buyer.id]);
    expect(moves.find((m) => m.id === p.id)?.reason).toBe('forced-sale');
  });
  it('places no fee or loan bids when its buyer enters stage 2', () => {
    const { w, seller, buyer } = fixture();
    const p = target(w, seller);
    buyer.books!.distress = { stage: 2 };
    const bids = observeBids(() => npcMarket(w));
    expect(bids.filter((b) => b.to.id === buyer.id)).toHaveLength(0);
    expect(at(w, p.id)).toEqual([seller.id]);
  });
});
