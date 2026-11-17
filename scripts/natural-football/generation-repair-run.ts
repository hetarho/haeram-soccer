/**
 * T943: one T916 run, bundled by `generation-repair.mjs` from a fresh export of the historical
 * source with exactly one variant patch applied; it imports that export's engine, never this
 * checkout's. It makes its own fresh 1930 world, calls the original observer's initial
 * advanceRound once, then advanceDays(w, 1, undefined, false) until 1950's first day, and writes
 * one machine receipt: every first-day country/tier row, every strict-order failure, the potential
 * and value sums the variants are meant to move, all 1950 cells against the 1930 baseline and the
 * full canonical endpoint hash. It claims no model pass and no timing.
 *
 *   node <bundle> <variant> <receipt.json>
 */
import { writeFileSync } from 'node:fs';
import { COUNTRIES } from '../../packages/catalogs/src/index';
import type { World } from '../../packages/contracts/src/types';
import { historyWorld } from '../../packages/engine/src/history';
import { marketValueAt } from '../../packages/engine/src/market-prices';
import { advanceDays, advanceRound } from '../../packages/engine/src/season';
import {
  END_YEAR,
  ORACLE,
  SEED,
  START_YEAR,
  cellsAgainstBaseline,
  divisionRows,
  orderFailures,
  sha256,
  type DivisionRow,
} from './generation-repair-recipe';

const [variant, out] = process.argv.slice(2);
if (!variant || !out) throw new Error('generation-repair-run:arguments');
const countries = COUNTRIES.map((c) => ({ code: c.code, tiers: c.groups.length }));

/** Potential and value sums per country/tier: the differences C1 and C2 intend, read honestly. */
function squadSums(w: World) {
  return countries.flatMap((country) =>
    Array.from({ length: country.tiers }, (_, tier) => {
      let players = 0,
        potential = 0,
        wage = 0n,
        value = 0n;
      for (const club of w.clubs)
        if (!club.representative && club.country === country.code && club.tier === tier)
          for (const p of w.squads?.[club.id] ?? []) {
            players++;
            potential += p.potential;
            wage += BigInt(p.wage);
            value += BigInt(marketValueAt(club.country, w.year, tier, p));
          }
      return {
        country: country.code,
        tier,
        players,
        potential,
        wage: wage.toString(),
        value: value.toString(),
      };
    }),
  );
}

const w = historyWorld(SEED);
if (w.year !== START_YEAR) throw new Error('generation-repair-run:start-year');
const years: { year: number; day: number; round: number; rows: DivisionRow[]; sums: unknown }[] =
  [];
const failures: ReturnType<typeof orderFailures> = [];
const observe = () => {
  const rows = divisionRows(w.clubs, countries);
  years.push({ year: w.year, day: w.calendar!.day, round: w.round, rows, sums: squadSums(w) });
  failures.push(...orderFailures(w.year, rows));
};
observe();
advanceRound(w, undefined, false);
let calls = 0;
while (w.year < END_YEAR) {
  const year: number = w.year;
  advanceDays(w, 1, undefined, false);
  calls++;
  if (w.year !== year) observe();
}
const text = JSON.stringify(w);
const endpoint = {
  year: w.year,
  day: w.calendar!.day,
  round: w.round,
  bytes: Buffer.byteLength(text),
  sha256: sha256(text),
};
const baseline = years[0]!.rows,
  last = years.at(-1)!.rows;
writeFileSync(
  out,
  `${JSON.stringify(
    {
      variant,
      seed: SEED,
      initialAdvanceRound: 1,
      dailyCalls: calls,
      years,
      orderFailures: failures,
      cells1950: cellsAgainstBaseline(last, baseline),
      endpoint,
      oracle:
        variant === 'control'
          ? {
              expected: ORACLE.sha256,
              reproduced: endpoint.sha256 === ORACLE.sha256 && endpoint.bytes === ORACLE.bytes,
            }
          : undefined,
      modelPassClaimed: false,
      timingClaimed: false,
    },
    null,
    1,
  )}\n`,
);
