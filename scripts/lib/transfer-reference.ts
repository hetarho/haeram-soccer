/** British record fees as they were set: [year, pounds] (Progression of the British record). */
const RECORDS: [number, number][] = [
  [1950, 30_000],
  [1951, 34_500],
  [1955, 35_000],
  [1957, 65_000],
  [1961, 99_999],
  [1962, 115_000],
  [1968, 150_000],
  [1969, 165_000],
  [1970, 200_000],
  [1971, 220_000],
  [1972, 225_000],
  [1974, 350_000],
  [1977, 500_000],
  [1979, 1_469_000],
  [1981, 1_500_000],
  [1986, 2_300_000],
  [1987, 3_200_000],
  [1989, 4_250_000],
  [1991, 5_500_000],
  [1995, 8_500_000],
  [1996, 15_000_000],
  [1999, 22_500_000],
  [2001, 28_100_000],
  [2002, 29_100_000],
  [2006, 30_800_000],
  [2008, 32_500_000],
  [2009, 80_000_000],
  [2013, 85_300_000],
  [2016, 89_000_000],
  [2018, 105_000_000],
  [2023, 106_800_000],
  [2025, 125_000_000],
];
export const standingRecord = (year: number) =>
  RECORDS.filter(([y]) => y <= year).at(-1)?.[1] ?? RECORDS[0][1];
/**
 * Years compared with the real market: every half-decade, with the Premier League's average fee
 * (Transfer Price Index, free transfers excluded) where one is published.
 */
export const ANCHOR_YEARS: [number, number | undefined][] = [
  [1952, undefined],
  [1957, undefined],
  [1962, undefined],
  [1967, undefined],
  [1972, undefined],
  [1977, undefined],
  [1982, undefined],
  [1987, undefined],
  [1993, 594_000],
  [1997, undefined],
  [2003, 2_400_000],
  [2008, undefined],
  [2013, 5_600_000],
  [2018, undefined],
  [2025, 24_000_000],
];
