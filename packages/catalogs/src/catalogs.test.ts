import { expect, it } from 'vitest';
import { COUNTRIES, priceIndex, currency } from './index';
import { SPONSOR_SLOTS, footballIndex, sponsorSlotOpens } from './index';
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
it('tracks prices until commercialisation and then grows in real terms', () => {
  for (const year of [1901, 1950, 1979]) expect(footballIndex('ENG', year).real).toBe(1);
  expect(footballIndex('ENG', 1950).value).toBe(priceIndex('ENG', 1950).value);
  expect(footballIndex('ENG', 1992).real).toBeCloseTo(2, 6);
  expect(footballIndex('ENG', 2005).real).toBeCloseTo(6, 6);
  expect(footballIndex('ENG', 2020).real).toBeCloseTo(10, 6);
  const between = footballIndex('ENG', 1986).real;
  expect(between).toBeGreaterThan(1);
  expect(between).toBeLessThan(2);
  const multiple = footballIndex('ENG', 2020).value / priceIndex('ENG', 2020).value;
  expect(multiple).toBeCloseTo(10, 6);
});
it("gives every other country its share of England's real growth", () => {
  const english = footballIndex('ENG', 2020).real - 1;
  expect((footballIndex('ESP', 2020).real - 1) / english).toBeCloseTo(0.7, 6);
  expect((footballIndex('GER', 2020).real - 1) / english).toBeCloseTo(0.7, 6);
  expect((footballIndex('FRA', 2020).real - 1) / english).toBeCloseTo(0.5, 6);
  expect((footballIndex('NED', 2020).real - 1) / english).toBeCloseTo(0.35, 6);
  expect((footballIndex('BEL', 2020).real - 1) / english).toBeCloseTo(0.25, 6);
});
it('labels football figures estimated, projects after coverage and caches each lookup', () => {
  expect(footballIndex('ENG', 1950).status).toBe('estimated');
  expect(footballIndex('ENG', 2005).status).toBe('estimated');
  expect(footballIndex('ENG', 2005).source).toContain('https://');
  expect(footballIndex('ENG', 2030).status).toBe('projected');
  expect(footballIndex('ENG', 2030).real).toBe(footballIndex('ENG', 2026).real);
  expect(footballIndex('ENG', 2030).value).toBeGreaterThan(footballIndex('ENG', 2026).value);
  expect(footballIndex('ITA', 2005)).toBe(footballIndex('ITA', 2005));
});
it('opens sponsor slots by country and year with their provenance', () => {
  expect(SPONSOR_SLOTS).toEqual(['local', 'kit', 'shirt', 'stadium', 'sleeve']);
  expect(SPONSOR_SLOTS.map((slot) => sponsorSlotOpens('ENG', slot).year)).toEqual([
    1901, 1970, 1979, 1997, 2017,
  ]);
  expect(sponsorSlotOpens('ENG', 'shirt').status).toBe('observed');
  expect(sponsorSlotOpens('GER', 'shirt').year).toBe(1973);
  expect(sponsorSlotOpens('POR', 'shirt').status).toBe('estimated');
  expect(sponsorSlotOpens('POR', 'shirt').source).toContain('https://');
  for (const c of COUNTRIES) expect(sponsorSlotOpens(c.code, 'local').year).toBe(1901);
});
it('uses historical unit boundaries and fixed euro factors', () => {
  expect(currency('ENG', 1970).units).toBe(240);
  expect(currency('ENG', 1971).units).toBe(100);
  expect(currency('FRA', 1999).code).toBe('EUR');
  expect(currency('GER', 1999).num).toBe(100000n);
  expect(currency('GER', 1999).den).toBe(1955830n);
});
