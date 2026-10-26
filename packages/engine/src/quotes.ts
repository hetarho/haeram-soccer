import {
  country,
  currency,
  broadcastingIndex,
  footballIndex,
  priceIndex,
} from '../../catalogs/src/index';
import { ratio } from './primitives';

type Index = (code: string, year: number) => { value: number };
/** What `indexed` scales by in a country and year, worked out once per index. */
const indexFactors = new Map<
  Index,
  Map<string, { scale: number; initial: number; num: bigint; den: bigint }>
>();
/**
 * `units` of 1901 money carried to `year` by an index, in that year's currency. The base is 1901
 * prices, so an index whose real multiple starts below 1 (broadcasting) pays less than prices.
 */
function indexed(code: string, year: number, units: number, index: Index) {
  let byYear = indexFactors.get(index);
  if (!byYear) indexFactors.set(index, (byYear = new Map()));
  const key = `${code}:${year}`;
  let f = byYear.get(key);
  if (!f) {
    const now = currency(code, year),
      initial = currency(code, 1901);
    const factor = BigInt(
      Math.round((index(code, year).value / priceIndex(code, 1901).value) * 1000000),
    );
    f = {
      scale: country(code).scale,
      initial: initial.units,
      num: factor * now.num * BigInt(now.units),
      den: 10000n * 1000000n * now.den * BigInt(initial.units),
    };
    if (byYear.size > 4096) byYear.clear();
    byYear.set(key, f);
  }
  const base = BigInt(Math.round(units * f.scale * f.initial * 10000));
  return ratio(base.toString(), f.num, f.den);
}
const quoteCache = new Map<string, string>();
export function quote(code: string, year: number, units: number): string {
  const key = `${code}:${year}:${units}`;
  const cached = quoteCache.get(key);
  if (cached !== undefined) return cached;
  const result = indexed(code, year, units, priceIndex);
  if (quoteCache.size > 4096) quoteCache.clear();
  quoteCache.set(key, result);
  return result;
}
/**
 * Like `quote`, carried by the football index instead of prices alone (→ECON-26): what football
 * pays and charges. Amounts are not cached, because market amounts are rarely quoted twice; the
 * country's and year's factors are.
 */
export function footballQuote(code: string, year: number, units: number): string {
  return indexed(code, year, units, footballIndex);
}
/**
 * Like `footballQuote`, carried by the broadcasting index (→ECON-31): what league distributions pay
 * (→ECON-28), a small fraction of prices before television and far above the football index from
 * the 1990s.
 */
export function broadcastQuote(code: string, year: number, units: number): string {
  return indexed(code, year, units, broadcastingIndex);
}
