import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { historyWorld, liveHistory } from '../../../packages/engine/src/history';
import { measurementIdentity } from '../../../scripts/lib/measurement-identity';
import { START_WORLD_DIR, saveStartWorld } from '../../../scripts/lib/start-worlds';
import { transferValues } from '../../../scripts/lib/market-values';

const [seed, output] = process.argv.slice(2);
assert(seed && output);
const snapshotDir = process.env.MARKET_SEASONS_START_DIR ?? START_WORLD_DIR;
const identity = measurementIdentity('packages/engine/src/history.ts').sha256;
const values: { year: number; values: ReturnType<typeof transferValues> }[] = [];
const snapshots: { year: number; path: string }[] = [];

liveHistory(historyWorld(seed), 1995, (year, world) => {
  if (year >= 1950) values.push({ year, values: transferValues(world) });
  if (year === 1951 || year === 1995) {
    const path = saveStartWorld(snapshotDir, { identity, seed, year }, world);
    snapshots.push({ year, path });
    process.stderr.write(`${seed} ${year} ${path}\n`);
  }
});
writeFileSync(output, JSON.stringify({ seed, identity, values, snapshots }, null, 2) + '\n');
