import { describe, expect, it } from 'vitest';
import type { CareerEmployment } from '../../contracts/src/types';
import { employmentWageInBuyerCurrency } from './employment-money';

describe('fixed-period employment wages', () => {
  it.each([
    ['FRA', 'FRF', '655957', 1999, 'EUR', '100000'],
    ['ENG', 'GBP-LSD', '2400', 1971, 'GBP', '1000'],
    ['GER', 'MARK', '1000', 1950, 'DEM', '100'],
    ['FRA', 'FRF-OLD', '10000', 1960, 'FRF', '100'],
    ['POR', 'REIS', '1000', 1911, 'PTE', '100'],
  ] as const)(
    'converts %s %s by fixed parity',
    (country, currency, wage, year, buyer, expected) => {
      const job: CareerEmployment = {
        role: 'assistant',
        club: 'synthetic-employer',
        // Intentionally misleading: the explicit salary currency, not this date, is authoritative.
        from: { year, day: 0 },
        wage,
        currency,
      };
      const before = structuredClone(job);
      expect(employmentWageInBuyerCurrency(job, country, year, buyer)).toBe(expected);
      expect(job).toEqual(before);
    },
  );

  it.each([
    ['6', '2'],
    ['18', '8'],
    ['30', '12'],
  ])('rounds %s old pence to %s new pence, half to even', (wage, expected) => {
    expect(employmentWageInBuyerCurrency({ wage, currency: 'GBP-LSD' }, 'ENG', 1971, 'GBP')).toBe(
      expected,
    );
  });

  it('keeps a current-currency wage nominal across years and country price levels', () => {
    const job = { wage: '101', currency: 'EUR' };
    for (const country of ['FRA', 'ITA', 'GER'])
      for (const year of [1999, 2025, 2040])
        expect(employmentWageInBuyerCurrency(job, country, year, 'EUR')).toBe('101');
  });

  it('keeps a new-year euro wage recorded at the previous season close in euros', () => {
    const job = {
      wage: '100000',
      currency: 'EUR',
      from: { year: 1998, day: 323 },
    };
    expect(employmentWageInBuyerCurrency(job, 'FRA', 1999, 'EUR')).toBe('100000');
  });

  it.each([
    [{ wage: '101', currency: 'unknown' }, 'FRA', 1999, 'EUR'],
    [{ wage: '101' }, 'FRA', 1999, 'EUR'],
    [{ currency: 'FRF' }, 'FRA', 1999, 'EUR'],
    [{}, 'FRA', 1999, 'EUR'],
    [{ wage: '101', currency: 'FRF' }, undefined, 1999, 'EUR'],
    [{ wage: '101', currency: 'FRF' }, 'unknown', 1999, 'EUR'],
    [{ wage: '101', currency: 'FRF' }, 'ENG', 1999, 'GBP'],
    [{ wage: '101', currency: 'GBP' }, 'ENG', 1999, 'EUR'],
    [{ wage: '101', currency: 'EUR' }, 'FRA', 1999, 'GBP'],
    [{ wage: '101', currency: 'FRF' }, 'FRA', 1999, 'GBP'],
    [{ wage: '101', currency: 'EUR' }, 'FRA', 1998, 'FRF'],
    [{ wage: '101', currency: 'GBP' }, 'ENG', 1970, 'GBP-LSD'],
  ] as const)('keeps unresolved metadata/FX case %# compatible', (job, country, year, buyer) => {
    expect(employmentWageInBuyerCurrency(job, country, year, buyer)).toBe(
      'wage' in job ? job.wage : undefined,
    );
  });
});
