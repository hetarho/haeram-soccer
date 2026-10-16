import { expect, it } from 'vitest';
import { COUNTRIES, priceIndex, currency } from './index';
import { SPONSOR_SLOTS, broadcastingIndex, footballIndex, sponsorSlotOpens } from './index';
import { footballData } from './index';
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
it('keeps broadcasting money with prices before television and above the football index from the 2000s', () => {
  for (let year = 1901; year <= 1964; year++)
    expect(broadcastingIndex('ENG', year).real).toBeCloseTo(1, 6);
  for (let year = 2000; year <= 2025; year++)
    expect(broadcastingIndex('ENG', year).real).toBeGreaterThan(footballIndex('ENG', year).real);
  // England's anchors: each era's multiple against prices.
  expect(broadcastingIndex('ENG', 1979).real).toBeCloseTo(1.2, 6);
  expect(broadcastingIndex('ENG', 1992).real).toBeCloseTo(2, 6);
  expect(broadcastingIndex('ENG', 2005).real).toBeCloseTo(36, 6);
  const multiple = broadcastingIndex('ENG', 2005).value / priceIndex('ENG', 2005).value;
  expect(multiple).toBeCloseTo(36, 6);
  // Every country starts with prices; England leads the boom.
  for (const c of COUNTRIES) {
    expect(broadcastingIndex(c.code, 1955).real).toBeCloseTo(1, 6);
    expect(broadcastingIndex(c.code, 2005).real).toBeGreaterThan(footballIndex(c.code, 2005).real);
    expect(broadcastingIndex(c.code, 2020).real).toBeLessThanOrEqual(
      broadcastingIndex('ENG', 2020).real,
    );
  }
});
it('labels every broadcasting era estimated with a source, projects after coverage and caches', () => {
  const eras = footballData.broadcasting.eras;
  for (const c of COUNTRIES)
    eras.forEach((era, index) => {
      const year = index === 0 ? footballData.from : eras[index - 1].to + 1;
      for (const point of [broadcastingIndex(c.code, year), broadcastingIndex(c.code, era.to)]) {
        expect(point.status).toBe('estimated');
        expect(point.source).toContain('https://');
        expect(point.source).toContain(era.note);
      }
    });
  const last = eras.at(-1)!.to;
  expect(broadcastingIndex('ENG', last + 1).status).toBe('projected');
  expect(broadcastingIndex('ENG', 2030).real).toBe(broadcastingIndex('ENG', last).real);
  expect(broadcastingIndex('ENG', 2030).value).toBeGreaterThan(
    broadcastingIndex('ENG', 2026).value,
  );
  expect(broadcastingIndex('ITA', 2005)).toBe(broadcastingIndex('ITA', 2005));
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

it('selects the approved sourced squad registration eras and ceiling-only fallbacks', async () => {
  const { registrationRule, squadRulesData } = await import('./index');
  expect(squadRulesData.rules).toHaveLength(12);
  expect(registrationRule('ENG', 0, 2009)).toMatchObject({ max: 40, ceiling: 40 });
  expect(registrationRule('ENG', 0, 2009).exempt).toBeUndefined();
  expect(registrationRule('ENG', 0, 2010)).toMatchObject({
    max: 25,
    exempt: { ageAtMost: 21 },
    status: 'observed',
  });
  expect(registrationRule('ENG', 1, 2020)).toMatchObject({
    max: 25,
    exempt: { ageAtMost: 21, loansCount: true },
  });
  for (const tier of [2, 3])
    expect(registrationRule('ENG', tier, 2020)).toMatchObject({
      max: 22,
      exempt: { ageAtMost: 21, goalkeepers: true },
    });
  expect(registrationRule('ESP', 0, 2000)).toMatchObject({
    max: 25,
    exempt: { graduatesAgeAtMost: 22 },
    status: 'estimated',
  });
  expect(registrationRule('ITA', 0, 2018).exempt!.ageAtMost).toBe(21);
  expect(registrationRule('ITA', 0, 2019)).toMatchObject({
    max: 25,
    exempt: { ageAtMost: 22 },
    status: 'estimated',
  });
  expect(registrationRule('ITA', 1, 2017)).toMatchObject({
    max: 18,
    bandiera: { extra: 2, seasons: 4 },
  });
  expect(registrationRule('ITA', 2, 2020)).toMatchObject({ max: 24 });
  expect(registrationRule('ITA', 2, 2020).exempt).toBeUndefined();
  expect(registrationRule('POR', 0, 2017).max).toBe(27);
  expect(registrationRule('POR', 1, 2018).max).toBe(30);
  expect(registrationRule('BEL', 0, 2012).exempt!.ageAtMost).toBe(20);
  for (const code of ['GER', 'FRA', 'NED']) expect(registrationRule(code, 0, 2025).max).toBe(40);
  expect(registrationRule('ENG', 4, 2025).max).toBe(40);
});
it('rejects unsupported registration countries, tiers, ranges, provenance and oversized limits', async () => {
  const { squadRulesData, validateRegistrationCatalog } = await import('./index');
  type Data = Parameters<typeof validateRegistrationCatalog>[0];
  type Catalog = import('./index').RegistrationCatalog;
  validateRegistrationCatalog(squadRulesData);
  for (const mutate of [
    (d: Catalog) => {
      d.rules[0].country = 'unknown';
    },
    (d: Catalog) => {
      d.rules[0].tiers = [4];
    },
    (d: Catalog) => {
      d.rules.push({ ...d.rules[0] });
    },
    (d: Catalog) => {
      d.rules[0].sources = [];
    },
    (d: Catalog) => {
      d.rules[0].status = 'projected' as never;
    },
    (d: Catalog) => {
      d.rules[0].max = 41;
    },
    (d: Catalog) => {
      d.rules[0].to = d.rules[0].from - 1;
    },
  ]) {
    const data = structuredClone(squadRulesData) as Catalog;
    mutate(data);
    expect(() => validateRegistrationCatalog(data as Data)).toThrow();
  }
});
