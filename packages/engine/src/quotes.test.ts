import { describe, expect, it } from 'vitest';
import { COUNTRIES, country } from '../../catalogs/src/index';
import { broadcastQuote, footballQuote, quote } from './quotes';

/** Each country's money per £ before ECON-35's levels: its 1901 parity, carried by UK prices. */
const PARITY: Record<string, number> = {
  ENG: 1,
  ESP: 25,
  GER: 20,
  ITA: 25,
  FRA: 25,
  POR: 4500,
  NED: 12,
  BEL: 25,
};
const all = (code: string, year: number, units: number) => [
  quote(code, year, units),
  footballQuote(code, year, units),
  broadcastQuote(code, year, units),
];

// Exact outputs captured from world.ts before extraction, at the 1901 parities; these use only
// catalog data.
const cases = [
  ['ENG', 1901, 120, '28800', '28800', '28800'],
  ['ENG', 1970, 120, '228713', '228713', '246016'],
  ['ENG', 1971, 120, '104298', '104298', '113560'],
  ['ENG', 2020, 123.456, '1268822', '12688221', '126882211'],
  ['FRA', 1959, 120, '1584783', '1584783', '1584783'],
  ['FRA', 1960, 120, '16011', '16011', '16011'],
  ['FRA', 1999, 120, '19417', '45963', '112660'],
  ['GER', 1999, 120, '224487', '644587', '1640285'],
  ['ITA', 2005, 120, '18136', '81611', '462464'],
  ['ESP', 2030, 120, '501785', '4014284', '37031766'],
  ['POR', 2005, -12.5, '-11617', '-29043', '-133598'],
  ['NED', 2020, 0, '0', '0', '0'],
  ['BEL', 2020, 0.125, '313', '1016', '8053'],
] as const;

describe('indexed quotes', () => {
  it.each(cases)(
    '%s %i: %s base units move from their parity amounts by the level alone',
    (code, year, units, ...parity) => {
      // One constant per country moves every amount alike: England's exactly, the others within
      // the rounding of one parity minor unit (→ECON-35).
      const level = country(code).scale / PARITY[code];
      all(code, year, units).forEach((amount, i) => {
        if (level === 1) expect(amount).toBe(parity[i]);
        else
          expect(Math.abs(Number(amount) - Number(parity[i]) * level)).toBeLessThanOrEqual(
            level / 2 + 1,
          );
      });
    },
  );

  it('retains exact amounts on repeat calls interleaved across indices and cache keys', () => {
    const first = new Map(
      cases.map(([code, year, units]) => [`${code}:${year}:${units}`, all(code, year, units)]),
    );
    for (const rows of [cases, [...cases].reverse(), cases]) {
      for (const [code, year, units] of rows) {
        const [price, football, broadcast] = first.get(`${code}:${year}:${units}`)!;
        expect(broadcastQuote(code, year, units)).toBe(broadcast);
        expect(quote(code, year, units)).toBe(price);
        expect(footballQuote(code, year, units)).toBe(football);
      }
    }
  });
});

describe('country money levels (ECON-35)', () => {
  it("converts every euro country's 1999 money at the real €1.518 per £", () => {
    const pence = Number(quote('ENG', 1999, 1000));
    for (const c of COUNTRIES.filter((c) => c.code !== 'ENG'))
      expect(
        Math.abs(Number(quote(c.code, 1999, 1000)) / pence / 1.51805 - 1),
        c.code,
      ).toBeLessThan(0.001);
  });
});
