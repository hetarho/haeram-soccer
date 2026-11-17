import { describe, expect, it } from 'vitest';
import { message } from '../../contracts/src/messages';
import { careerWorld } from './career.testkit';
import { activePlayers, overall } from './player-state';
import { compareIds } from './primitives';
import {
  SALE_FACTORS,
  SALE_SHARE,
  saleAnswer,
  saleContext,
  saleOutlook,
  saleShare,
  type AnswerFactor,
  type SaleContext,
} from './sale-answer';
import { startingSquad } from './world';

/** A neutral bid: no factor but his place moves the share. */
function ctx(over: Partial<SaleContext> = {}): SaleContext {
  return {
    fee: '800000',
    asking: '1000000',
    ownSeller: false,
    place: 'starter',
    contractSeasons: 3,
    age: 26,
    prospect: false,
    cashCrisis: false,
    runway: 999,
    wageLine: 0,
    wageShare: 0,
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
  ctx({ place: 'core', prospect: true }),
  ctx({ place: 'outside', contractSeasons: 1, age: 34, cashCrisis: true, sellingDown: true }),
  ctx({
    ownSeller: true,
    value: '900000',
    place: 'outside',
    contractSeasons: 1,
    age: 33,
    stance: 'listed',
    wageLine: 2,
    wageShare: 80,
  }),
  ctx({ director: { vacant: false, name: 'D', ability: 90, negotiator: true }, windowDaysLeft: 1 }),
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

  it('names every factor with a message whose parameters it supplies', () => {
    const lines = VARIANTS.flatMap((c) => saleShare(c).lines);
    expect(new Set(lines.map((l) => l.factor))).toEqual(new Set(SALE_FACTORS.map((f) => f.id)));
    for (const l of lines) expect(message(l.message, l.params)).not.toMatch(/\{/);
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

  it('is undefined for a player the seller does not hold', () => {
    expect(saleContext(w, { playerId: 'nobody', sellerId: seller.id, fee: '1' })).toBeUndefined();
  });
});
