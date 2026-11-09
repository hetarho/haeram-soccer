import type { World } from '../../contracts/src/types';
import { ratio } from './primitives';
import { currency } from '../../catalogs/src/index';
import { clubOf, lastOwnSeason } from './player-state';
import { eventsInSeason } from './season-index';

/** Current-season result excluding the owner's transfers; no simulation or settlement imports. */
export function seasonResult(w: World): string {
  let owner = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const event = w.events[i];
    if (event.year < w.year) break;
    if (event.year !== w.year || event.currency !== w.currency || !event.amount) continue;
    if (event.kind === 'owner-injection') owner -= BigInt(event.amount);
    else if (event.kind === 'owner-dividend') owner += BigInt(event.amount);
  }
  return (BigInt(w.income) - BigInt(w.expense) + owner).toString();
}

/** One exact share of an annual amount, retaining the remainder across round boundaries. */
export function roundShare(annual: string, round: number, count = 46) {
  if (round <= 0 || count <= 0) return '0';
  return (
    BigInt(ratio(annual, BigInt(round), BigInt(count))) -
    BigInt(ratio(annual, BigInt(round - 1), BigInt(count)))
  ).toString();
}

/** Income that is not turnover (→ECON-30, OWNER-9). */
const NOT_TURNOVER = new Set(['transfer-out', 'free-transfer-compensation', 'owner-injection']);

/**
 * This season's turnover so far, excluding player sales, leaver compensation and owner capital.
 * Events are only appended, so the scan stops at the first older one.
 */
export function seasonTurnover(w: World) {
  let notTurnover = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = w.events[i];
    if (e.year < w.year) break;
    if (e.year === w.year && e.currency === w.currency && e.amount && NOT_TURNOVER.has(e.kind))
      notTurnover += BigInt(e.amount);
  }
  return BigInt(w.income) - notTurnover;
}

/**
 * The last owned season's turnover, carried into this season's currency (→ECON-30/6).
 * Archived income retains unexplained legacy ledger income; subtract only the recorded
 * non-turnover lines, just as the ledger's named lines plus its residual do.
 */
export function lastSeasonTurnover(w: World): string | undefined {
  const season = lastOwnSeason(w);
  if (!season || season.year !== w.year - 1) return undefined;
  const notTurnover = eventsInSeason(w, season.year)
    .filter(
      (event) =>
        event.currency === season.currency &&
        event.amount !== undefined &&
        NOT_TURNOVER.has(event.kind),
    )
    .reduce((sum, event) => sum + BigInt(event.amount!), 0n);
  const turnover = BigInt(season.income) - notTurnover;
  const amount = turnover > 0n ? turnover.toString() : '0';
  if (season.currency === w.currency) return amount;
  const code = clubOf(w).country,
    before = currency(code, season.year),
    after = currency(code, w.year);
  if (before.code !== season.currency || after.code !== w.currency) return undefined;
  return ratio(
    amount,
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  );
}
