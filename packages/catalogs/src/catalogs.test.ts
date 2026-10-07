import { expect, it } from 'vitest';
import { COUNTRIES, priceIndex, currency } from './index';
it('contains sourced eight-country group structures and an odd group', () => {
  expect(COUNTRIES).toHaveLength(8);
  expect(COUNTRIES.find((c) => c.code === 'ITA')!.groups[2]).toEqual([20, 20, 20]);
  expect(COUNTRIES.find((c) => c.code === 'BEL')!.groups[1]).toEqual([15]);
  for (const c of COUNTRIES) {
    expect(c.source).toMatch(/^https:/);
    expect(c.moves.length).toBe(c.groups.length - 1);
  }
});
it('distinguishes history, proxy and future projection', () => {
  expect(priceIndex('ENG', 1901).status).toBe('observed');
  expect(priceIndex('ITA', 1901).status).toBe('estimated');
  expect(priceIndex('FRA', 2000).status).toBe('observed');
  expect(priceIndex('NED', 2030).status).toBe('projected');
  expect(priceIndex('ENG', 1921).value).toBeLessThan(priceIndex('ENG', 1920).value);
});
it('uses historical unit boundaries and fixed euro factors', () => {
  expect(currency('ENG', 1970).units).toBe(240);
  expect(currency('ENG', 1971).units).toBe(100);
  expect(currency('FRA', 1999).code).toBe('EUR');
  expect(currency('GER', 1999).num).toBe(100000n);
  expect(currency('GER', 1999).den).toBe(1955830n);
});
