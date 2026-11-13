/** Aggregate the calibration's machine facts without running another world. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES } from '../packages/catalogs/src/index';
import {
  completeChampions,
  completedPeakRows,
  completeWorldWindow,
} from './lib/persisted-world-facts';
const args = process.argv.slice(2);
const at = args.indexOf('--in');
const files = args[at + 1]!.split(',');
interface Division {
  tier: number;
  mean: number;
  founding: number;
  change: number;
  xiSpan: { mean: number };
  xiAge: { mean: number };
  academy: { mean: number };
}
interface Run {
  seed: string;
  until?: number;
  complete?: boolean;
  measured?: boolean;
  playedSeasons: number;
  computation: { sha256: string };
  configs: unknown;
  rows: { country: string; year: number; divisions: Division[] }[];
  champions?: {
    country: string;
    different: number;
    most: number;
    seasons: { year: number; club?: string }[];
  }[];
  books: {
    year: number;
    country: string;
    clubSeasons: number;
    maxRatio: number;
    strongestMedian: number;
    breaches: unknown[];
  }[];
  summers: { year: number; country: string; clubSeasons: number; breaches: number }[];
  values: {
    year: number;
    max: number;
    mean: number;
    maxRatio: number;
    meanRatio?: number;
    extendedOwnerless: boolean;
  }[];
  affiliations: { year: number; bestClubs: number; bestAtStrongest: number }[];
  peakAges: unknown[];
}
const inputs = files.map((file) => {
  const raw = readFileSync(file, 'utf8');
  return {
    file,
    sha256: createHash('sha256').update(raw).digest('hex'),
    run: JSON.parse(raw) as Run,
  };
});
const runs = inputs.map((i) => i.run);
const coreEnd = 2010;
const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
const range = (ns: number[]) => ({
  n: ns.length,
  mean: ns.length ? mean(ns) : null,
  min: ns.length ? Math.min(...ns) : null,
  max: ns.length ? Math.max(...ns) : null,
});
const divisions = COUNTRIES.flatMap(({ code, groups }) =>
  groups.flatMap((_, tier) =>
    [...new Set(runs.flatMap((r) => r.rows.map((row) => Math.floor(row.year / 10) * 10)))]
      .sort()
      .map((year) => {
        const cells = runs.flatMap((r) => {
          const annual = r.rows
            .filter((row) => row.country === code && Math.floor(row.year / 10) * 10 === year)
            .flatMap((row) => row.divisions.filter((d) => d.tier === tier));
          if (!annual.length) return [];
          return [
            {
              seed: r.seed,
              years: annual.length,
              mean: mean(annual.map((d) => d.mean)),
              founding: annual[0]!.founding,
              change: mean(annual.map((d) => d.change)),
              xiSpan: { mean: mean(annual.map((d) => d.xiSpan.mean)) },
              xiAge: { mean: mean(annual.map((d) => d.xiAge.mean)) },
              academy: { mean: mean(annual.map((d) => d.academy.mean)) },
              annualOutside: annual.filter((d) => Math.abs(d.change) > 5).length,
            },
          ];
        });
        return {
          country: code,
          tier,
          year,
          n: cells.length,
          seeds: cells.map(({ xiSpan, xiAge, academy, ...row }) => ({
            ...row,
            xiSpan: xiSpan.mean,
            xiAge: xiAge.mean,
            academy: academy.mean,
          })),
          strength: range(cells.map((d) => d.mean)),
          founding: range(cells.map((d) => d.founding)),
          change: range(cells.map((d) => d.change)),
          outOfBand: year < 1950 ? null : cells.filter((d) => Math.abs(d.change!) > 5).length,
          xiSpan: range(cells.map((d) => d.xiSpan.mean!)),
          xiAge: range(cells.map((d) => d.xiAge.mean!)),
          academy: range(cells.map((d) => d.academy.mean!)),
        };
      }),
  ),
);
const champions = COUNTRIES.map(({ code }) => {
  const observed = runs.flatMap((r) => {
    const row = r.champions?.find((c) => c.country === code);
    return row ? [{ seed: r.seed, ...row, complete: completeChampions(row.seasons) }] : [];
  });
  const cells = observed.filter((c) => c.complete);
  return {
    country: code,
    completeSeeds: cells.length,
    missingSeeds: runs
      .filter((r) => !r.champions?.some((c) => c.country === code))
      .map((r) => r.seed),
    incompleteSeeds: observed
      .filter((c) => !c.complete)
      .map((c) => ({
        seed: c.seed,
        observedSeasons: c.seasons.length,
      })),
    different: range(cells.map((c) => c.different)),
    most: range(cells.map((c) => c.most)),
    outOfBand: cells.filter((c) => c.different < 4 || c.different > 9 || c.most < 7 || c.most > 17)
      .length,
    seeds: observed,
  };
});
const books = COUNTRIES.map(({ code }) => {
  const cells = runs.flatMap((r) =>
    r.books.filter((b) => b.country === code && b.year < Math.min(r.until ?? coreEnd, coreEnd)),
  );
  const summers = runs.flatMap((r) =>
    r.summers.filter((b) => b.country === code && b.year < Math.min(r.until ?? coreEnd, coreEnd)),
  );
  return {
    country: code,
    clubSeasons: cells.reduce((n, b) => n + b.clubSeasons, 0),
    breachedClubSeasons: cells.reduce((n, b) => n + b.breaches.length, 0),
    maxRatio: Math.max(...cells.map((b) => b.maxRatio)),
    strongestMedian: range(cells.map((b) => b.strongestMedian)),
    above70: cells.filter((b) => b.strongestMedian > 0.7).length,
    afterSummerClubSeasons: summers.reduce((n, b) => n + b.clubSeasons, 0),
    afterSummerBreaches: summers.reduce((n, b) => n + b.breaches, 0),
  };
});
const values = [...new Set(runs.flatMap((r) => r.values.map((v) => v.year)))].sort().map((year) => {
  const cells = runs.flatMap((r) => r.values.filter((v) => v.year === year));
  return {
    year,
    n: cells.length,
    max: range(cells.map((v) => v.max)),
    mean: range(cells.map((v) => v.mean)),
    maxRatio: range(cells.map((v) => v.maxRatio)),
    meanRatio: cells.some((v) => v.meanRatio !== undefined)
      ? range(cells.map((v) => v.meanRatio!))
      : null,
    maxOutside: cells.filter((v) => v.maxRatio < 0.5 || v.maxRatio > 1).length,
    meanOutside: cells.filter(
      (v) => v.meanRatio !== undefined && (v.meanRatio < 0.6 || v.meanRatio > 1.4),
    ).length,
    extendedOwnerless: cells.some((v) => v.extendedOwnerless),
  };
});
const result = {
  coreEnd,
  completeWorlds: runs.filter((r) => completeWorldWindow(r, coreEnd)).length,
  requestedWorlds: 5,
  inputs: inputs.map(({ run, ...i }) => ({
    ...i,
    seed: run.seed,
    computation: run.computation,
    configs: run.configs,
    playedSeasons: run.playedSeasons,
    complete: completeWorldWindow(run, coreEnd),
    observedFirstYear: Math.min(...run.rows.map((row) => row.year)),
    observedLastYear: Math.max(...run.rows.map((row) => row.year)),
    missingFields: ['configs', 'playedSeasons', 'champions', 'peakAges'].filter(
      (key) => !(key in run),
    ),
  })),
  divisions,
  champions,
  books,
  values,
  affiliations: runs.map((r) => ({ seed: r.seed, rows: r.affiliations })),
  peakAges: runs.map((r) => ({
    seed: r.seed,
    complete: completeWorldWindow(r, coreEnd),
    rows: completedPeakRows(r, coreEnd),
  })),
  divisionFailures: divisions.reduce((n, d) => n + (d.outOfBand ?? 0), 0),
  championFailures: champions.reduce((n, c) => n + c.outOfBand, 0),
};
const output = JSON.stringify(result, null, 2) + '\n';
const out = args.indexOf('--out');
if (out >= 0) writeFileSync(args[out + 1]!, output);
process.stdout.write(output);
