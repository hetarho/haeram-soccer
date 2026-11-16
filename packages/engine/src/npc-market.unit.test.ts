import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { canonical } from '../../contracts/src/index';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Club, World } from '../../contracts/src/types';
import {
  npcCanSell,
  npcMarket,
  npcMarketDays,
  npcOffer,
  NPC_MARKET,
  PLAYER_MOVE_FLOW,
  recordPlayerMove,
} from './npc-market';
import { foundSquads, moveSquadPlayer } from './persisted-squads';
import { generatedPlayer, invalidateNpcSquad } from './world';
import { worldMarketFixture } from './world-market.testkit';
import { marketWageAt } from './market-prices';
import { npcWageBill, npcWageLimit } from './books';
import { operatingExpensesAt } from './finance';

const draws = vi.hoisted(() => [] as [string, number][]);
vi.mock('./primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./primitives')>();
  return {
    ...actual,
    random(seed: string) {
      const r = actual.random(seed);
      return () => {
        const value = r();
        draws.push([seed, value]);
        return value;
      };
    },
  };
});

/** Four NPC clubs only; real eligibility/settlement APIs, no world or match progression. */
function fixture() {
  const w = worldMarketFixture();
  w.calendar = { day: npcMarketDays(w.year)[0]![0]! };
  w.clubs = [
    w.clubs[0]!,
    ...[0, 1, 2, 3].map((n): Club => ({
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
    club.books = {
      seasons: [],
      cash: '999999999999',
      debt: '0',
      openingIncome: npcWageBill(w, club).toString(),
    };
    invalidateNpcSquad(w, club.id);
  }
  const seller = w.clubs[1]!,
    buyers = w.clubs.slice(2);
  for (const buyer of buyers) {
    w.squads![buyer.id] = w.squads![buyer.id]!.filter((p) => p.position !== 'GK');
    invalidateNpcSquad(w, buyer.id);
  }
  return { w, seller, buyers };
}
function keeper(w: World, seller: Club, n: number, ability = 75) {
  const p = generatedPlayer('ENG', w.seed, `early-guard-keeper:${n}`, w.year, ability, 'GK', 24, 0);
  for (const a of ATTRIBUTES) p.attrs[a] = ability;
  p.until = w.year;
  p.wage = marketWageAt('ENG', w.year, 0, p);
  p.potential = ability;
  w.squads![seller.id]!.push(p);
  return p;
}
/** Three genuine earlier departures reach the ordinary quota without hidden counter access. */
function priorMoves(w: World, seller: Club) {
  let count = 0;
  for (const p of [...w.squads![seller.id]!]) {
    if (p.position === 'GK' || !npcCanSell(w, seller, p)) continue;
    recordPlayerMove(w, p.id, {
      year: w.year,
      day: w.calendar!.day,
      from: seller.id,
      to: w.playerClub,
      fee: '1',
    });
    moveSquadPlayer(w, p, w.playerClub, seller.id);
    if (++count === NPC_MARKET.moves) break;
  }
  expect(count).toBe(NPC_MARKET.moves);
}
const locations = (w: World, id: string) => [
  ...Object.entries(w.squads ?? {}).flatMap(([club, ps]) =>
    ps.filter((p) => p.id === id).map(() => club),
  ),
  ...w.players.filter((p) => p.id === id && p.status === 'active').map(() => w.playerClub),
];
// Captured from unchanged e434933f before moving the guards; complete worlds remain in raw evidence.
const BASELINE = {
  'ordinary-cap': {
    moves: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    draws: '82413babc53d4584c77519daaf2f9aa6639fcdfcba1cc3f262a040c844c92f74',
  },
  'over-cap': {
    moves: '2eb7f968b00f4e307a33cf0dee3269c84236912ecbedbaabbbf9a3823d380f8d',
    draws: '9b8b043a86aa41b0e8005631e9695d38a3c1bfc8a7a37cc021eaeac47e9a852a',
  },
  cured: {
    moves: 'ab7228aba803c978bbe48303360ce6df95b1283ee5999d73dc574b173a688617',
    draws: 'f99d085151a3981193ff322bf54dd916505a270204b529bb6879f1e03a86d2c1',
  },
} as const;
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function settle(w: World, label: string, audit?: () => void) {
  const observed: unknown[] = [];
  const previous = PLAYER_MOVE_FLOW.observe;
  PLAYER_MOVE_FLOW.observe = (_world, id, move) => {
    observed.push([id, structuredClone(move)]);
    const length = draws.length;
    audit?.();
    draws.length = length; // The oracle records the market's draws, not the audit's read queries.
  };
  draws.length = 0;
  try {
    npcMarket(w);
  } finally {
    PLAYER_MOVE_FLOW.observe = previous;
  }
  const expected = BASELINE[label as keyof typeof BASELINE];
  expect(digest(observed)).toBe(expected.moves);
  expect(digest(draws)).toBe(expected.draws);
  const all = [
    ...Object.values(w.squads ?? {})
      .flat()
      .map((p) => p.id),
    ...w.players.filter((p) => p.status === 'active').map((p) => p.id),
  ];
  expect(new Set(all).size).toBe(all.length);
  return observed;
}

describe('early seller eligibility through ordinary market APIs', () => {
  it('retains an eligible ordinary listing once its seller reaches the move cap', () => {
    const { w, seller, buyers } = fixture();
    const p = keeper(w, seller, 0);
    priorMoves(w, seller);
    seller.books!.openingIncome = npcWageBill(w, seller).toString();
    expect(npcCanSell(w, seller, p)).toBe(true);
    expect(npcOffer(w, buyers[0]!, p, seller, '1')).toBeDefined();
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
    const moves = settle(w, 'ordinary-cap');
    expect(moves).toHaveLength(0);
    expect(locations(w, p.id)).toEqual([seller.id]);
  });
  it('keeps the overspending exception after the seller already reached its ordinary cap', () => {
    const { w, seller } = fixture();
    const listed = Array.from({ length: 6 }, (_, i) => keeper(w, seller, i));
    for (const p of listed) p.wage = '1000000000000';
    priorMoves(w, seller);
    seller.books = {
      seasons: [],
      openingIncome: '0',
      cash: operatingExpensesAt('ENG', w.year, seller.tier),
      debt: '0',
    };
    expect(npcWageBill(w, seller)).toBeGreaterThan(npcWageLimit(w, seller)!);
    const moves = settle(w, 'over-cap', () => {
      expect(npcWageBill(w, seller)).toBeGreaterThan(npcWageLimit(w, seller)!);
    });
    expect(moves.length).toBeGreaterThan(NPC_MARKET.moves);
    expect(listed.filter((p) => locations(w, p.id)[0] !== seller.id).length).toBe(moves.length);
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
  });
  it('rejects the remaining sell-down listing once the first fee cures overspending', () => {
    const { w, seller, buyers } = fixture();
    const first = keeper(w, seller, 0),
      second = keeper(w, seller, 1, 74);
    first.wage = (BigInt(first.wage) * 100n).toString();
    second.wage = (BigInt(first.wage) / 2n).toString();
    seller.books = {
      seasons: [],
      openingIncome: '0',
      cash: (
        npcWageBill(w, seller) -
        BigInt(first.wage) -
        1n +
        BigInt(operatingExpensesAt('ENG', w.year, seller.tier))
      ).toString(),
      debt: '0',
    };
    expect(npcWageBill(w, seller)).toBeGreaterThan(npcWageLimit(w, seller)!);
    const moves = settle(w, 'cured');
    expect(moves).toHaveLength(1);
    expect(locations(w, first.id)).not.toEqual([seller.id]);
    expect(locations(w, second.id)).toEqual([seller.id]);
    expect(npcWageBill(w, seller)).toBeLessThanOrEqual(npcWageLimit(w, seller)!);
    expect(buyers.some((buyer) => npcOffer(w, buyer, second, seller, '1'))).toBe(true);
  });
});
