import { currency } from '../../packages/catalogs/src/index';
import type { World } from '../../packages/contracts/src/types';
import { marketValueAt } from '../../packages/engine/src/market-prices';
import { clubPlayers } from '../../packages/engine/src/world';
import { ANCHOR_YEARS, standingRecord } from './transfer-reference';

const publishedFees = new Map(ANCHOR_YEARS);

export function transferValues(w: World) {
  if (w.year < 1950) return;
  const units = currency('ENG', w.year).units;
  const values = w.clubs
    .filter((club) => club.country === 'ENG' && club.tier === 0 && !club.representative)
    .flatMap((club) => clubPlayers(w, club))
    .map((player) => Number(marketValueAt('ENG', w.year, 0, player)) / units);
  if (!values.length) return;
  const record = standingRecord(w.year);
  const publishedMean = publishedFees.get(w.year);
  const dearest = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    players: values.length,
    dearest,
    mean,
    record,
    dearestToRecord: dearest / record,
    ...(publishedMean === undefined
      ? {}
      : { publishedMean, meanToPublishedFee: mean / publishedMean }),
  };
}
