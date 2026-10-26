import { describe, expect, it } from 'vitest';
import { broadcastQuote, footballQuote, quote } from './quotes';

// Exact outputs captured from world.ts before extraction; these use only catalog data.
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
    '%s %i: %s base units retain exact price, football and broadcast amounts',
    (code, year, units, price, football, broadcast) => {
      expect(quote(code, year, units)).toBe(price);
      expect(footballQuote(code, year, units)).toBe(football);
      expect(broadcastQuote(code, year, units)).toBe(broadcast);
    },
  );

  it('retains exact amounts on repeat calls interleaved across indices and cache keys', () => {
    for (const rows of [cases, [...cases].reverse(), cases]) {
      for (const [code, year, units, price, football, broadcast] of rows) {
        expect(broadcastQuote(code, year, units)).toBe(broadcast);
        expect(quote(code, year, units)).toBe(price);
        expect(footballQuote(code, year, units)).toBe(football);
      }
    }
  });
});
