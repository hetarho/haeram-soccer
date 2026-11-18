import { describe, expect, it } from 'vitest';
import { message } from '../../contracts/src/messages';
import type { ClubBooks, ClubSeasonBook } from '../../contracts/src/owner';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { Club, SeasonArchive, World } from '../../contracts/src/types';
import { currencyChange } from './books';
import { SEASON_ROUNDS } from './calendar';
import { SAFETY_ROUNDS } from './delegation-info';
import { operatingExpensesAt } from './finance';
import { fixedCostRunway } from './investment';
import { careerWorld } from './career.testkit';
import { activePlayers, overall } from './player-state';
import { compareIds } from './primitives';
import {
  npcSaleContext,
  SALE_FACTORS,
  saleAnswer,
  saleContext,
  saleOutlook,
  saleShare,
  type AnswerFactor,
  type SaleContext,
} from './sale-answer';
import { SALE_SHARE } from './transfer-policy';
import { invalidateNpcSquad, startingSquad, tierLevel } from './world';

/** A neutral bid: no factor but his place moves the share. */
function ctx(over: Partial<SaleContext> = {}): SaleContext {
  return {
    fee: '800000',
    asking: '1000000',
    ownSeller: false,
    stature: 0,
    place: 'starter',
    contractSeasons: 3,
    age: 26,
    prospect: false,
    cashCrisis: false,
    runway: 999,
    sellingDown: false,
    stance: 'open',
    transferRequest: false,
    unhappy: false,
    ...over,
  };
}
/** Contexts that push the share far up, far down, and our own club's floor. */
const VARIANTS: SaleContext[] = [
  ctx(),
  ctx({ place: 'core', prospect: true, stature: 13 }),
  ctx({ place: 'outside', contractSeasons: 1, age: 34, cashCrisis: true, sellingDown: true }),
  ctx({
    ownSeller: true,
    value: '900000',
    place: 'outside',
    contractSeasons: 1,
    age: 33,
    stance: 'listed',
    distress: 2,
  }),
  ctx({ director: { vacant: false, name: 'D', ability: 90, negotiator: true }, windowDaysLeft: 1 }),
  ctx({ contractSeasons: 2, year: 1960, npc: { relegatedStarter: true, aboveDivision: true } }),
];
const draws = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

describe('the selling club answer (→CLUB-52)', () => {
  it('accepts a bid at or above the asking fee for every draw', () => {
    for (const c of VARIANTS)
      for (const fee of ['1000000', '1000001', '5000000'])
        for (const u of [...draws(200), 0, 0.999999])
          expect(saleAnswer({ ...c, fee }, u).kind).toBe('accept');
  });

  it('accepts at or above R, counters at R in [R − 0.25A, R) and refuses below', () => {
    for (const c of VARIANTS)
      for (const u of draws(97)) {
        const r = BigInt(saleAnswer(c, u).reservation),
          a = BigInt(c.asking),
          low = r - a / 4n;
        const at = (fee: bigint) => saleAnswer({ ...c, fee: fee.toString() }, u);
        expect(at(r).kind).toBe('accept');
        expect(at(r + 1n).kind).toBe('accept');
        for (const fee of [r - 1n, low]) {
          const answer = at(fee);
          expect(answer.kind).toBe('counter');
          expect(BigInt(answer.counter!)).toBe(r);
          expect(BigInt(answer.counter!)).toBeGreaterThanOrEqual(fee);
          expect(BigInt(answer.counter!)).toBeLessThanOrEqual(a);
        }
        expect(at(low - 1n).kind).toBe('refuse');
      }
  });

  it('keeps the share within 0.5–1 and our reservation never below 80% of value', () => {
    const own = VARIANTS[3]!;
    expect(saleShare(own).base).toBeLessThan(SALE_SHARE.min);
    for (const u of draws(50)) {
      const answer = saleAnswer(own, u);
      expect(answer.share).toBeGreaterThanOrEqual(SALE_SHARE.min);
      expect(BigInt(answer.reservation)).toBeGreaterThanOrEqual(720000n);
    }
    for (const u of draws(50)) expect(saleAnswer(VARIANTS[1]!, u).share).toBeLessThanOrEqual(1);
  });

  it('states exact chances that match the answers over a fine grid of draws', () => {
    const grid = draws(20000);
    for (const c of VARIANTS)
      for (const fee of ['300000', '600000', '700000', '800000', '880000', '950000']) {
        const bid = { ...c, fee },
          outlook = saleOutlook(bid),
          kinds = grid.map((u) => saleAnswer(bid, u).kind);
        const share = (kind: string) => kinds.filter((k) => k === kind).length / grid.length;
        expect(Math.abs(share('accept') - outlook.accept)).toBeLessThan(2e-3);
        expect(Math.abs(share('counter') - outlook.counter)).toBeLessThan(2e-3);
      }
  });

  it('states the chances on the integer fees the answers use, small amounts included', () => {
    const grid = draws(4000);
    expect(saleOutlook(ctx({ asking: '3', fee: '2', place: 'outside' }))).toMatchObject({
      accept: 0,
      counter: 0,
    });
    expect(saleAnswer(ctx({ asking: '3', fee: '2', place: 'outside' }), 0.999).kind).toBe('refuse');
    for (const c of [ctx({ place: 'outside' }), ctx({ place: 'core' }), VARIANTS[2]!])
      for (let asking = 1; asking <= 16; asking++)
        for (let fee = 0; fee <= asking; fee++) {
          const bid = { ...c, asking: String(asking), fee: String(fee) },
            outlook = saleOutlook(bid),
            kinds = grid.map((u) => saleAnswer(bid, u).kind);
          const share = (kind: string) => kinds.filter((k) => k === kind).length / grid.length;
          expect(Math.abs(share('accept') - outlook.accept)).toBeLessThanOrEqual(2 / grid.length);
          expect(Math.abs(share('counter') - outlook.counter)).toBeLessThanOrEqual(2 / grid.length);
        }
    const own = { ...VARIANTS[3]!, asking: '11', value: '10' };
    for (let fee = 0; fee <= 11; fee++) {
      const bid = { ...own, fee: String(fee) },
        outlook = saleOutlook(bid),
        kinds = grid.map((u) => saleAnswer(bid, u).kind);
      const share = (kind: string) => kinds.filter((k) => k === kind).length / grid.length;
      expect(Math.abs(share('accept') - outlook.accept)).toBeLessThanOrEqual(2 / grid.length);
      expect(Math.abs(share('counter') - outlook.counter)).toBeLessThanOrEqual(2 / grid.length);
    }
  });

  it('is monotone in the fee', () => {
    for (const c of VARIANTS) {
      let last = 0;
      for (let fee = 300000; fee <= 1000000; fee += 10000) {
        const chance = saleOutlook({ ...c, fee: String(fee) }).accept;
        expect(chance).toBeGreaterThanOrEqual(last);
        last = chance;
      }
      for (const u of draws(40)) {
        let accepted = false;
        for (let fee = 300000; fee <= 1000000; fee += 10000) {
          const accept = saleAnswer({ ...c, fee: String(fee) }, u).kind === 'accept';
          if (accepted) expect(accept).toBe(true);
          accepted ||= accept;
        }
      }
    }
  });

  it('takes a test-only factor into the share and never into the draw', () => {
    const extra: AnswerFactor<SaleContext> = {
      id: 'prestige',
      read: () => ({
        factor: 'prestige',
        delta: -0.1,
        message: 'market.sale.prospect',
        params: {},
      }),
    };
    const c = ctx();
    for (const u of draws(20)) {
      const before = saleAnswer(c, u),
        after = saleAnswer(c, u, [...SALE_FACTORS, extra]);
      expect(after.spread).toBe(before.spread);
      expect(after.share).toBeCloseTo(before.share - 0.1, 10);
      expect(after.lines.map((l) => l.factor)).toEqual([
        ...before.lines.map((l) => l.factor),
        'prestige',
      ]);
    }
  });

  it('counts the contract rows half before 1995 for every seller', () => {
    const contract = (over: Partial<SaleContext>) =>
      saleShare(ctx(over)).lines.find((l) => l.factor === 'contract')?.delta;
    for (const ownSeller of [false, true]) {
      expect(contract({ ownSeller, contractSeasons: 1, year: 1994 })).toBeCloseTo(-0.075, 10);
      expect(contract({ ownSeller, contractSeasons: 2, year: 1994 })).toBeCloseTo(-0.025, 10);
      expect(contract({ ownSeller, contractSeasons: 1, year: 1995 })).toBeCloseTo(-0.15, 10);
      expect(contract({ ownSeller, contractSeasons: 2, year: 2010 })).toBeCloseTo(-0.05, 10);
    }
  });

  it('adds the NPC rows to the share and never to the draw', () => {
    const plain = ctx({ year: 2000, npc: { relegatedStarter: false, aboveDivision: false } }),
      both = ctx({ year: 2000, npc: { relegatedStarter: true, aboveDivision: true } });
    for (const u of draws(20)) {
      const before = saleAnswer(plain, u),
        after = saleAnswer(both, u);
      expect(after.spread).toBe(before.spread);
      expect(after.lines.map((l) => [l.factor, l.delta])).toEqual([
        ...before.lines.map((l) => [l.factor, l.delta]),
        ['relegated', -0.1],
        ['aboveDivision', -0.1],
      ]);
    }
  });

  it('names every factor with a message whose parameters it supplies', () => {
    const lines = VARIANTS.flatMap((c) => saleShare(c).lines);
    expect(new Set(lines.map((l) => l.factor))).toEqual(new Set(SALE_FACTORS.map((f) => f.id)));
    for (const l of lines) expect(message(l.message, l.params)).not.toMatch(/\{/);
  });

  it('reads the actual distress stage for every seller without moving the draw', () => {
    for (const ownSeller of [false, true]) {
      const row = (distress?: 1 | 2 | 3) => saleShare(ctx({ ownSeller, value: '900000', distress })).lines.find(l => l.factor === 'distress');
      expect(row()).toBeUndefined();
      expect(row(1)).toMatchObject({ delta: -0.05, message: 'market.sale.distress.warning' });
      for (const stage of [2, 3] as const) expect(row(stage)).toMatchObject({ delta: -0.25, message: 'market.sale.distress.forced' });
    }
  });
});

describe('saleContext reads a bid from a world', () => {
  const w = careerWorld({ seed: 'answer-models' });
  const seller = w.clubs.find((c) => c.country === 'ENG' && c.tier === 0)!;
  const xi = startingSquad(w, seller),
    ranked = [...xi].sort((a, b) => overall(b) - overall(a) || compareIds(a.id, b.id)),
    core = ranked[0]!,
    starter = ranked[3]!,
    outside = w.squads![seller.id]!.find((p) => !xi.includes(p))!;

  it("reads his place in the seller's XI, his contract and our 단장", () => {
    const read = (id: string) => saleContext(w, { playerId: id, sellerId: seller.id, fee: '1' })!;
    expect(read(core.id).place).toBe('core');
    expect(read(starter.id).place).toBe('starter');
    expect(read(outside.id).place).toBe('outside');
    const c = read(core.id);
    expect(c.contractSeasons).toBe(core.until - w.year);
    expect(c.ownSeller).toBe(false);
    expect(BigInt(c.asking)).toBeGreaterThan(0n);
    expect(c.director).toBeDefined();
    expect(c.windowDaysLeft).toBeGreaterThanOrEqual(0);
  });

  it('reads the contract factor from the world', () => {
    const p = structuredClone(core);
    p.until = w.year + 1;
    const lw = {
      ...w,
      squads: { ...w.squads, [seller.id]: [p, ...w.squads![seller.id]!.slice(1)] },
    };
    const c = saleContext(lw, { playerId: p.id, sellerId: seller.id, fee: '1' })!;
    expect(c.contractSeasons).toBe(1);
    expect(saleShare(c).lines.some((l) => l.message === 'copy.transfers.53f9e38caf')).toBe(true);
  });

  it('reads the relegated-starter and above-division rows of a seller nobody owns for our bid too', () => {
    const world = structuredClone(w);
    const own = world.clubs.find((c) => c.id === world.playerClub)!;
    const club = world.clubs.find(
      (c) => c.country === 'ENG' && c.tier === 1 && c.id !== own.id && world.squads?.[c.id],
    )!;
    // Our club plays a division above the seller, which went down at the last close.
    own.tier = 0;
    const archive = { year: world.year - 1, standings: [[world.clubs.indexOf(club), 0]] };
    world.history = [...world.history, archive as unknown as SeasonArchive];
    // One of its starters rates 5 above its division's level.
    const p = startingSquad(world, club)[0]!;
    for (const a of ATTRIBUTES) p.attrs[a] = tierLevel(club.tier) + 5;
    invalidateNpcSquad(world, club.id);
    expect(startingSquad(world, club)).toContain(p);
    const rows = (c: SaleContext) =>
      saleShare(c)
        .lines.filter((l) => l.factor === 'relegated' || l.factor === 'aboveDivision')
        .map((l) => [l.factor, l.delta]);
    const ours = saleContext(world, { playerId: p.id, sellerId: club.id, fee: '1' })!;
    expect(ours.npc).toEqual({ relegatedStarter: true, aboveDivision: true });
    expect(rows(ours)).toEqual([
      ['relegated', -0.1],
      ['aboveDivision', -0.1],
    ]);
    // The same rows another club of our division would meet.
    const npc = npcSaleContext(world, {
      seller: club,
      buyer: own,
      player: p,
      fee: '1',
      asking: ours.asking,
      sellingDown: false,
    });
    expect(npc.npc).toEqual(ours.npc);
    // From the seller's own division only the relegated row stays.
    own.tier = club.tier;
    expect(rows(saleContext(world, { playerId: p.id, sellerId: club.id, fee: '1' })!)).toEqual([
      ['relegated', -0.1],
    ]);
    // Our own sales read neither row.
    const mine = activePlayers(world)[0]!;
    const sale = saleContext(world, { playerId: mine.id, sellerId: world.playerClub, fee: '1' })!;
    expect(sale.npc).toBeUndefined();
    expect(rows(sale)).toEqual([]);
  });

  it('reads our own player with his stance and our asking bar of value', () => {
    const own = structuredClone(w);
    const p = activePlayers(own)[0]!;
    p.stance = 'listed';
    const c = saleContext(own, { playerId: p.id, sellerId: own.playerClub, fee: '1' })!;
    expect(c.ownSeller).toBe(true);
    expect(c.stance).toBe('listed');
    expect(c.director).toBeUndefined();
    expect(BigInt(c.asking)).toBeGreaterThan(BigInt(c.value!));
    expect(saleShare(c).lines.some((l) => l.factor === 'stance')).toBe(true);
  });

  describe("a club nobody owns: this season's fixed costs in this season's money", () => {
    const bill = (club: Club) =>
      (w.squads![club.id] ?? []).reduce((sum, p) => sum + BigInt(p.wage), 0n);
    const withBooks = (year: number, books: ClubBooks): World => {
      const world = structuredClone(w);
      world.year = year;
      world.clubs.find((c) => c.id === seller.id)!.books = books;
      return world;
    };
    const book = (year: number, money: string): ClubSeasonBook => ({
      year,
      income: '0',
      wages: money,
      costs: money,
      result: '0',
    });
    const read = (world: World) =>
      saleContext(world, { playerId: core.id, sellerId: seller.id, fee: '1' })!;

    it('reads a first season without a closed book from its wages and costs', () => {
      const first = read(withBooks(w.year, { seasons: [], cash: '0', debt: '0' }));
      expect(first.cashCrisis).toBe(true);
      expect(first.runway).toBe(0);
      expect(saleShare(first).lines.some((l) => l.factor === 'cash')).toBe(true);
      const annual = bill(seller) + BigInt(operatingExpensesAt('ENG', w.year, seller.tier));
      const cash = (
        (annual * BigInt(SAFETY_ROUNDS) + BigInt(SEASON_ROUNDS) - 1n) /
        BigInt(SEASON_ROUNDS)
      ).toString();
      expect(read(withBooks(w.year, { seasons: [], cash, debt: '0' })).cashCrisis).toBe(false);
    });

    it("counts this season's fees received and paid beside the cash", () => {
      const annual = bill(seller) + BigInt(operatingExpensesAt('ENG', w.year, seller.tier));
      const rounds = BigInt(SEASON_ROUNDS);
      const enough = (annual * BigInt(SAFETY_ROUNDS) + rounds - 1n) / rounds,
        short = (annual * BigInt(SAFETY_ROUNDS - 1)) / rounds,
        gap = (enough - short).toString();
      const at = (cash: bigint, fees: Partial<ClubBooks>) =>
        read(withBooks(w.year, { seasons: [], cash: cash.toString(), debt: '0', ...fees }));
      expect(at(short, {}).cashCrisis).toBe(true);
      expect(at(short, { transfersReceived: gap }).cashCrisis).toBe(false);
      expect(at(enough, {}).cashCrisis).toBe(false);
      expect(at(enough, { transfersPaid: gap }).cashCrisis).toBe(true);
      const spent = at(enough, { transfersPaid: (enough + 1n).toString() });
      expect(spent).toMatchObject({ cashCrisis: true, runway: 0 });
      expect(at(enough, { debt: (enough * 2n).toString() })).toMatchObject({ runway: 0 });
    });

    it('keeps cash and costs in one money across a currency change', () => {
      const fra = careerWorld({ seed: 'answer-models', country: 'FRA' });
      const club = fra.clubs.find(
        (c) => c.country === 'FRA' && c.tier === 1 && fra.squads?.[c.id],
      )!;
      const player = startingSquad(fra, club)[0]!;
      const at = (year: number, books: ClubBooks) => {
        const world = structuredClone(fra);
        world.year = year;
        world.clubs.find((c) => c.id === club.id)!.books = books;
        return saleContext(world, { playerId: player.id, sellerId: club.id, fee: '1' })!;
      };
      const annual = (year: number) =>
        bill(club) + BigInt(operatingExpensesAt('FRA', year, club.tier));
      // A 1999 season after a franc book: last season's francs are never set against euros.
      const euros = ((annual(1999) * 10n) / BigInt(SEASON_ROUNDS)).toString();
      const after = at(1999, { seasons: [book(1998, '999999999999999')], cash: euros, debt: '0' });
      expect(after.runway).toBe(fixedCostRunway(euros, annual(1999).toString()));
      // Closed but not yet turned: the carried euros are read back in the season's francs.
      const toFrancs = currencyChange('FRA', 1999, 1998)!;
      const carried = at(1998, { seasons: [book(1998, '1')], cash: euros, debt: '0' });
      expect(toFrancs).toBeDefined();
      expect(carried.runway).toBe(fixedCostRunway(toFrancs(euros), annual(1998).toString()));
      expect(carried.runway).not.toBe(fixedCostRunway(euros, annual(1998).toString()));
    });
  });

  it('is undefined for a player the seller does not hold', () => {
    expect(saleContext(w, { playerId: 'nobody', sellerId: seller.id, fee: '1' })).toBeUndefined();
  });
});
