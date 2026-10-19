import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CountryCode, TransferBid, World } from '../../contracts/src/types';
import { canonical } from '../../contracts/src/index';
import { currency } from '../../catalogs/src/index';
import { advanceEconomy, createWorld } from './index';
import { ratio } from './primitives';

/** One club the year before its currency changes, holding every kind of live amount. */
function beforeChange(country: CountryCode, year: number, amount: string) {
  const w = createWorld({
    country,
    name: 'Ledger Rovers',
    color: '#445566',
    seed: `economy:${country}`,
    level: 'normal' as const,
  });
  w.year = year - 1;
  w.currency = currency(country, year - 1).code;
  w.staff = [
    {
      id: 'coach:1',
      role: 'assistant',
      name: 'Coach One',
      ability: 60,
      wage: amount,
      since: w.year,
      until: w.year + 2,
    },
  ];
  w.managerMarket = {
    year: w.year,
    round: 0,
    free: [{ ...w.manager, id: 'free:1', wage: amount }],
    clubs: {},
    serial: 1,
  };
  w.academy = { players: [{ ...w.players[0], id: 'prospect:1', wage: amount }] };
  // An improved-contract talk the owner leaves open across the close (→CLUB-26).
  w.players[3].talk = {
    kind: 'improve',
    demand: (BigInt(amount) * 2n).toString(),
    floor: amount,
    year: w.year,
    day: 200,
  };
  const bid = (id: string, status: TransferBid['status'], counterFee?: string): TransferBid => ({
    id,
    direction: 'out',
    playerId: `market:${id}`,
    fee: amount,
    // The player and asking terms the bid was made for (rules 1.15.0).
    offer: {
      player: { ...w.players[2], id: `market:${id}`, wage: amount },
      fee: (BigInt(amount) * 2n).toString(),
      loanFee: amount,
    },
    year: w.year,
    day: 300,
    due: 303,
    status,
    ...(counterFee ? { counterFee } : {}),
  });
  w.bids = [
    bid('pending', 'pending'),
    bid('countered', 'countered', (BigInt(amount) * 2n).toString()),
    { ...bid('incoming', 'pending'), direction: 'in', playerId: w.players[1].id, club: 'rival' },
    bid('completed', 'completed'),
    bid('rejected', 'rejected', (BigInt(amount) * 2n).toString()),
  ];
  return w;
}

/** The catalog's conversion from the old money to the new, as `ratio` takes it. */
function conversion(country: CountryCode, year: number) {
  const before = currency(country, year - 1),
    after = currency(country, year);
  return [
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  ] as const;
}

function liveAmounts(w: World) {
  return {
    coach: w.staff![0].wage,
    free: w.managerMarket!.free[0].wage,
    prospect: w.academy!.players[0].wage,
    talk: [w.players[3].talk!.demand, w.players[3].talk!.floor],
    pending: w.bids![0].fee,
    countered: [w.bids![1].fee, w.bids![1].counterFee],
    incoming: w.bids![2].fee,
    offers: [0, 1].map((i) => {
      const offer = w.bids![i].offer!;
      return [offer.fee, offer.loanFee, offer.player.wage];
    }),
  };
}

const CHANGES = [
  // 6.55957 francs to the euro; centimes to cents.
  ['FRA', 1999, '655957', '100000'],
  // 240 old pence to the pound became 100 new pence.
  ['ENG', 1971, '2400', '1000'],
] as const;

const sign = (v: bigint) => (v > 0n ? 1 : v < 0n ? -1 : 0);

describe('currency change', () => {
  for (const [country, year, amount, converted] of CHANGES)
    it(`converts coaches, free agents, prospects, open talks, open bids and their offers once in ${country} ${year}`, () => {
      const w = beforeChange(country, year, amount);
      const [num, den] = conversion(country, year);
      const expected = ratio(amount, num, den);
      expect(expected).toBe(converted);
      const doubled = ratio((BigInt(amount) * 2n).toString(), num, den);
      w.year = year;
      advanceEconomy(w, year - 1);
      expect(w.currency).toBe(currency(country, year).code);
      expect(liveAmounts(w)).toEqual({
        coach: expected,
        free: expected,
        prospect: expected,
        talk: [doubled, expected],
        pending: expected,
        countered: [expected, doubled],
        incoming: expected,
        offers: [
          [doubled, expected, expected],
          [doubled, expected, expected],
        ],
      });
      // Settled bids keep the units they closed in, the terms they were made for too.
      expect(w.bids![3].fee).toBe(amount);
      const settled = w.bids![3].offer!;
      expect([settled.fee, settled.loanFee, settled.player.wage]).toEqual([
        (BigInt(amount) * 2n).toString(),
        amount,
        amount,
      ]);
      expect([w.bids![4].fee, w.bids![4].counterFee]).toEqual([
        amount,
        (BigInt(amount) * 2n).toString(),
      ]);
      // Exactly once: replaying the change or moving on in the same money converts nothing more.
      const after = canonical(w),
        live = liveAmounts(w);
      advanceEconomy(w, year - 1);
      expect(canonical(w)).toBe(after);
      w.year = year + 1;
      advanceEconomy(w, year);
      expect(liveAmounts(w)).toEqual(live);
    });
  for (const [country, year] of CHANGES)
    it(`a currency change converts cash monotonically and keeps its sign in ${country} ${year}`, () => {
      const base = beforeChange(country, year, '1000');
      base.year = year;
      const [num, den] = conversion(country, year);
      const convert = (cash: bigint) => {
        const w = structuredClone(base);
        w.cash = cash.toString();
        advanceEconomy(w, year - 1);
        return BigInt(w.cash);
      };
      // Small amounts too, where a change to larger units rounds part of a new unit away.
      const cash = fc.oneof(
        fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }),
        fc.bigInt({ min: -10000n, max: 10000n }),
      );
      fc.assert(
        fc.property(cash, cash, (a, b) => {
          const ca = convert(a),
            cb = convert(b);
          expect(ca.toString()).toBe(ratio(a.toString(), num, den));
          expect(cb.toString()).toBe(ratio(b.toString(), num, den));
          if (a <= b) expect(ca <= cb).toBe(true);
          if (b <= a) expect(cb <= ca).toBe(true);
          // An amount under half a new unit may become zero, never the opposite sign.
          expect([0, sign(a)]).toContain(sign(ca));
          if (a === 0n) expect(ca).toBe(0n);
        }),
        // Each run converts two fresh copies of a whole world.
        { numRuns: 50 },
      );
    });
});
