import { describe, expect, it } from 'vitest';
import type { World } from '../../contracts/src/types';
import { COUNTRIES } from '../../catalogs/src/index';
import { broadcastQuote } from './quotes';
import { DISTRIBUTION_CONFIG, leagueMerit, leagueShare, parachutePayment } from './finance';
import { roundShare } from './finance-read';

/** Only the fields these pure financial reads need; no generated world or season advancement. */
const view = (year: number, country = 'ENG', tier = 0) =>
  ({
    year,
    playerClub: 'own',
    clubs: [{ id: 'own', country, tier }],
    history: [],
  }) as unknown as World;

const releasedShare = (w: World, tier = w.clubs[0].tier) => {
  const code = w.clubs[0].country,
    table = DISTRIBUTION_CONFIG.share[code];
  return broadcastQuote(code, w.year, table[Math.min(tier, table.length - 1)]);
};
const observedFactor = (year: number) =>
  Number(leagueShare(view(year))) / Number(releasedShare(view(year)));
const abs = (n: bigint) => (n < 0n ? -n : n);

describe('English top-flight central package (ECON-28)', () => {
  it.each([
    // 2018/19 official total; 2024/25 components were published rounded to £0.1m.
    { year: 2018, pot: 245_600_834_600n },
    { year: 2024, pot: 283_360_000_000n },
  ])(
    'matches the $year official central pot over all 20 ranks to minor-unit rounding',
    ({ year, pot }) => {
      const w = view(year),
        share = BigInt(leagueShare(w)),
        totals = Array.from({ length: 20 }, (_, i) => share + BigInt(leagueMerit(w, i + 1, 20))),
        total = totals.reduce((sum, amount) => sum + amount, 0n);
      expect(abs(total - pot)).toBeLessThanOrEqual(20n);
      expect(totals[19]).toBe(share);
      expect(Number(totals[0]) / Number(totals[19])).toBeCloseTo(1.6, 9);
      for (let rank = 1; rank < totals.length; rank++)
        expect(totals[rank]).toBeLessThan(totals[rank - 1]);
    },
  );

  it('uses the approved anchors, geometric interpolation and flat ends', () => {
    expect(observedFactor(1992)).toBe(1);
    expect(observedFactor(2018)).toBeCloseTo(0.8520865440307794, 10);
    expect(observedFactor(2024)).toBeCloseTo(0.6580851783905154, 10);
    expect(observedFactor(2030)).toBeCloseTo(observedFactor(2024), 10);
    expect(observedFactor(2005)).toBeCloseTo(Math.sqrt(0.8520865440307794), 9);
    expect(observedFactor(2021)).toBeCloseTo(Math.sqrt(0.8520865440307794 * 0.6580851783905154), 9);
    for (const year of [1992, 2018, 2024]) {
      expect(observedFactor(year - 1e-6)).toBeCloseTo(observedFactor(year), 6);
      expect(observedFactor(year + 1e-6)).toBeCloseTo(observedFactor(year), 6);
    }
  });

  it('returns every pre-1993 sampled amount exactly, without factor rounding', () => {
    for (let year = 1901; year <= 1992; year++) {
      const w = view(year);
      expect(leagueShare(w), String(year)).toBe(releasedShare(w));
    }
  });

  it('keeps every other country and English lower division on the original broadcast quote', () => {
    for (const country of COUNTRIES)
      for (let tier = 0; tier < country.groups.length; tier++) {
        if (country.code === 'ENG' && tier === 0) continue;
        for (const year of [1950, 2018, 2024, 2030]) {
          const w = view(year, country.code, tier);
          expect(leagueShare(w)).toBe(releasedShare(w));
        }
      }
    const lower = view(2024, 'ENG', 1),
      bottom = BigInt(leagueShare(lower));
    expect(Number(bottom + BigInt(leagueMerit(lower, 1, 24))) / Number(bottom)).toBeCloseTo(1.3, 9);
    // The shared quote itself is untouched; only leagueShare applies its targeted factor.
    expect(broadcastQuote('ENG', 2024, 12700)).toBe('16560867645');
  });

  it('keeps exact installment totals and reads the same normalized source for relegation', () => {
    const w = view(2024),
      share = leagueShare(w),
      before = structuredClone(w);
    expect(
      Array.from({ length: 46 }, (_, i) => BigInt(roundShare(share, i + 1))).reduce(
        (sum, amount) => sum + amount,
        0n,
      ),
    ).toBe(BigInt(share));
    expect(w).toEqual(before);
    const relegated = view(2024, 'ENG', 1);
    relegated.history = [{ year: 2023, tier: 0 } as World['history'][number]];
    // £108,984,615.38 minimum package less the unchanged £11,736,047.94 second-tier share.
    expect(leagueShare(relegated, 0)).toBe('10898461538');
    expect(leagueShare(relegated)).toBe('1173604794');
    expect(parachutePayment(relegated)).toBe('4862428372');
    expect(BigInt(parachutePayment(relegated)) * 2n).toBe(
      BigInt(leagueShare(relegated, 0)) - BigInt(leagueShare(relegated)),
    );
    relegated.year++;
    expect(parachutePayment(relegated)).toBe('0');
  });
});
