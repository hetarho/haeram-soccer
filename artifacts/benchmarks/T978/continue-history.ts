import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { loadStartWorldFile } from '../../../scripts/lib/start-worlds';
import { liveHistory } from '../../../packages/engine/src/history';
import type { World } from '../../../packages/contracts/src/types';
import { transferValues } from '../../../scripts/lib/market-values';

const [snapshot, output] = process.argv.slice(2);
assert(snapshot && output);
const world = loadStartWorldFile<World>(snapshot);
assert.equal(world.year, 1995);
assert.equal(world.round, 0);
const transferQuotes = [{ year: world.year, values: transferValues(world) }];
liveHistory(world, 2025, (year, start) => {
  transferQuotes.push({ year, values: transferValues(start) });
});

const titles = world.history
  .filter((season) => season.year >= 1980 && season.year <= 2009)
  .sort((a, b) => a.year - b.year)
  .map((season) => ({
    year: season.year,
    champions: Object.fromEntries(season.champions.map(({ country, club }) => [country, club])),
  }));
assert.equal(titles.length, 30);
assert(titles.every((row, index) => row.year === 1980 + index));
writeFileSync(output, JSON.stringify({ snapshot, seed: world.seed, titles, transferQuotes }, null, 2) + '\n');
