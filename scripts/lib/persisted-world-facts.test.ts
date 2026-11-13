import { expect, it } from 'vitest';
import {
  completeChampions,
  completedPeakRows,
  completeWorldWindow,
  distribution,
  fundingFacts,
  peakFacts,
  type PeakObservation,
} from './persisted-world-facts';
import type { ClubSeasonBook } from '../../packages/contracts/src/owner';

it('distinguishes funded losses, exhausted support, duplicated capital and missing history', () => {
  const book: ClubSeasonBook = {
    year: 1930,
    income: '100',
    wages: '130',
    costs: '10',
    transfersReceived: '0',
    transfersPaid: '0',
    result: '-40',
    ownerCapital: '30',
    incomeComponents: { distribution: '25', gate: '25', commercial: '25', competitions: '25' },
  };
  const opening = { cash: '10', debt: '0', allowance: '40' };
  expect(fundingFacts(book, opening)).toMatchObject({
    status: 'known',
    capitalReconciles: true,
    incomeComponentsReconcile: true,
    resultReconciles: true,
    unsupportedShortfall: '0',
    exhausted: false,
  });
  expect(
    fundingFacts({ ...book, ownerCapital: '20' }, { ...opening, allowance: '20' }),
  ).toMatchObject({ capitalReconciles: true, exhausted: true, unsupportedShortfall: '10' });
  expect(fundingFacts({ ...book, income: '130', result: '-10' }, opening)).toMatchObject({
    incomeComponentsReconcile: false,
    capitalReconciles: false,
  });
  expect(fundingFacts({ ...book, ownerCapital: undefined }, opening)).toEqual({
    status: 'unknown',
  });
  expect(fundingFacts(book)).toEqual({ status: 'unknown' });
});

it('keeps empty populations explicit and summarizes actual observations', () => {
  expect(distribution([])).toEqual({ n: 0, mean: null, min: null, median: null, max: null });
  expect(distribution([29, 25, 27])).toEqual({ n: 3, mean: 27, min: 25, median: 27, max: 29 });
});

it('separates outfield, keeper and all-player peaks and excludes censored cohorts', () => {
  const player: PeakObservation = {
    firstAge: 17,
    born: 1950,
    last: 1985,
    n: 19,
    peakAge: 27,
    tier: 1,
    country: 'ENG',
    outfield: true,
  };
  const rows = [
    player,
    { ...player, outfield: false, peakAge: 31 },
    { ...player, firstAge: 25 },
    { ...player, born: 1929 },
    { ...player, last: 2010 },
    { ...player, n: 9 },
    { ...player, country: 'FRA' },
    { ...player, tier: 0 },
  ];
  const result = peakFacts(rows, 'ENG', 1, 2010);
  expect(result.observedAnnualPeaks).toMatchObject({ n: 1, mean: 27 });
  expect(result.goalkeeperObservedAnnualPeaks).toMatchObject({ n: 1, mean: 31 });
  expect(result.allPlayerObservedAnnualPeaks).toMatchObject({ n: 2, mean: 29 });
});

it('does not count partial, duplicate or boundary-shifted title windows as complete evidence', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ year: 1980 + i, club: `club:${i % 5}` }));
  expect(completeChampions(rows)).toBe(true);
  expect(completeChampions(rows.slice(0, 29))).toBe(false);
  expect(completeChampions([...rows.slice(1), rows[1]!])).toBe(false);
  expect(completeChampions(rows.map((r) => ({ ...r, year: r.year + 1 })))).toBe(false);
  expect(completeChampions(rows.map((r) => ({ ...r, club: undefined })))).toBe(false);
});

it('requires the requested core end even when a shorter run completed', () => {
  expect(completeWorldWindow({ until: 2010, complete: true }, 2010)).toBe(true);
  expect(completeWorldWindow({ until: 2010, measured: true }, 2010)).toBe(true);
  expect(completeWorldWindow({ until: 2010, complete: false }, 2010)).toBe(false);
  expect(completeWorldWindow({ until: 2010, complete: false, measured: true }, 2010)).toBe(false);
  expect(completeWorldWindow({ until: 1980, complete: true }, 2010)).toBe(false);
  expect(completeWorldWindow({ complete: true }, 2010)).toBe(false);
});

it('excludes incomplete peak aggregates without discarding the retained raw observations', () => {
  const rows = [{ country: 'ENG', tier: 1, observedAnnualPeaks: { n: 2, mean: 25 } }];
  const retainedRows = structuredClone(rows);
  const partial = { until: 2010, complete: false, peakAges: rows };
  expect(completedPeakRows(partial, 2010)).toEqual([]);
  expect(partial.peakAges).toEqual(retainedRows);
  expect(completedPeakRows({ until: 1980, complete: true, peakAges: rows }, 2010)).toEqual([]);
  expect(completedPeakRows({ until: 1980, complete: true, peakAges: rows }, 1980)).toEqual(rows);
  expect(completedPeakRows({ until: 2010, measured: true, peakAges: rows }, 2010)).toEqual(rows);
  expect(completedPeakRows({ until: 2010, complete: true }, 2010)).toEqual([]);
});
