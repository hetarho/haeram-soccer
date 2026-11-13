/** Pure summaries for the calibration probe; no simulation or presentation dependencies. */
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
