// T450: plays the candidate model's century baseline profile (the world scripts/match-model-baseline.ts
// founds for `season.baseline`) season by season, logs each season's engine time and keeps the world
// JSON at the season starts asked for, so a single early or late season can be profiled on its own.
// usage: pnpm exec tsx docs/benchmarks/t450/build-worlds.mts <seasons> <outDir> [keep,keep,…]
//   keep: season indices (0 = the founding world) whose start is written to <outDir>/season-<i>.world.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorld, simulateSeason } from '../../../packages/engine/src/index';
import { withCandidateModel } from '../../../tests/fixtures/worlds';
import { PERFORMANCE_CONFIG } from '../../../scripts/lib/match-parity';

const [seasonsArg = '60', outDir = '.tmp/t450', keepArg = '0,60'] = process.argv.slice(2);
const seasons = Number(seasonsArg);
const keep = new Set(keepArg.split(',').map(Number));
mkdirSync(outDir, { recursive: true });
const w = withCandidateModel(
  createWorld({
    country: 'ENG',
    name: 'Century Athletic',
    color: '#284e35',
    seed: PERFORMANCE_CONFIG.profiles.baseline,
    level: 'easy',
  }),
);
for (let season = 0; season <= seasons; season++) {
  if (keep.has(season)) {
    const file = join(outDir, `season-${season}.world.json`);
    writeFileSync(file, JSON.stringify(w));
    console.log(JSON.stringify({ kept: file, season, year: w.year, history: w.history.length }));
  }
  if (season === seasons) break;
  const t = performance.now();
  simulateSeason(w);
  const ms = performance.now() - t;
  console.log(JSON.stringify({ season, year: w.year, ms: Math.round(ms) }));
}
