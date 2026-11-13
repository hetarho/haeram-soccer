import type { ClubSeasonBook } from '../../packages/contracts/src/owner';

/** Pure summaries for the calibration probe; no simulation or presentation dependencies. */
export function fundingFacts(
  book: ClubSeasonBook,
  opening?: { cash: string; debt: string; allowance: string },
) {
  const components = book.incomeComponents;
  const known =
    components !== undefined &&
    book.ownerCapital !== undefined &&
    book.transfersPaid !== undefined &&
    book.transfersReceived !== undefined &&
    opening !== undefined;
  if (!known) return { status: 'unknown' as const };
  const income = BigInt(book.income),
    capital = BigInt(book.ownerCapital!);
  const componentSum = Object.values(components!).reduce((n, value) => n + BigInt(value), 0n);
  const result =
    income +
    BigInt(book.transfersReceived!) -
    BigInt(book.wages) -
    BigInt(book.costs) -
    BigInt(book.transfersPaid!);
  const beforeSupport = BigInt(opening!.cash) - BigInt(opening!.debt) + result;
  const shortfall = beforeSupport < 0n ? -beforeSupport : 0n;
  const allowance = BigInt(opening!.allowance);
  const expectedCapital = shortfall < allowance ? shortfall : allowance;
  return {
    status: 'known' as const,
    incomeComponentsReconcile: componentSum === income,
    resultReconciles: result === BigInt(book.result),
    capitalReconciles: capital === expectedCapital,
    expectedCapital: String(expectedCapital),
    allowance: String(allowance),
    exhausted: shortfall > 0n && capital === allowance,
    unsupportedShortfall: String(shortfall > capital ? shortfall - capital : 0n),
    balanceBeforeBounds: String(beforeSupport + capital),
  };
}
export function distribution(xs: number[]) {
  const sorted = xs.toSorted((a, b) => a - b);
  return {
    n: xs.length,
    mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
    min: sorted[0] ?? null,
    median: sorted[Math.floor(sorted.length / 2)] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

export interface PeakObservation {
  firstAge: number;
  born: number;
  last: number;
  n: number;
  peakAge: number;
  tier: number;
  country: string;
  outfield: boolean;
}

interface ObservationWindow {
  until?: number;
  complete?: boolean;
  measured?: boolean;
}

/** A shorter completed request is not a completed core window. */
export function completeWorldWindow(run: ObservationWindow, end: number) {
  return (
    run.until === end &&
    (run.complete === true || (run.complete === undefined && run.measured === true))
  );
}

/** Partial aggregates can include active careers whose last observation precedes the requested end. */
export function completedPeakRows<T>(
  run: ObservationWindow & { peakAges?: T[] },
  end: number,
): T[] {
  return completeWorldWindow(run, end) ? (run.peakAges ?? []) : [];
}

/** Excludes founding adults, short observations and cohorts censored at the core end. */
export function peakFacts(peaks: PeakObservation[], country: string, tier: number, end: number) {
  const cohort = peaks.filter(
    (p) =>
      p.country === country &&
      p.tier === tier &&
      p.firstAge <= 18 &&
      p.born >= 1930 &&
      p.n >= 10 &&
      p.last < end,
  );
  const summarize = (xs: PeakObservation[]) => distribution(xs.map((p) => p.peakAge));
  return {
    observedAnnualPeaks: summarize(cohort.filter((p) => p.outfield)),
    goalkeeperObservedAnnualPeaks: summarize(cohort.filter((p) => !p.outfield)),
    allPlayerObservedAnnualPeaks: summarize(cohort),
  };
}

/** Thirty actual titles are required before comparing the champions target. */
export function completeChampions(seasons: { year: number; club?: string }[]) {
  return (
    seasons.length === 30 &&
    new Set(seasons.map((s) => s.year)).size === 30 &&
    seasons.every((s) => s.year >= 1980 && s.year <= 2009 && !!s.club)
  );
}
