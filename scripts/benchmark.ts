import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createWorld, simulateSeason } from '../packages/engine/src/index';
import { canonical, validateWorld, type World } from '../packages/contracts/src/index';
import {
  encode,
  decode,
  CHECKPOINT_LIMIT,
  TOTAL_LIMIT,
} from '../apps/web/src/adapters/persistence';
const start = performance.now();
const corpus = process.argv.indexOf('--corpus');
const w: World =
  corpus >= 0
    ? JSON.parse(readFileSync(process.argv[corpus + 1], 'utf8'))
    : createWorld({
        country: 'ENG',
        name: 'Century Athletic',
        color: '#124533',
        seed: 'long-career-core',
        difficulty: 1,
      });
if (corpus < 0) for (let n = 0; n < 100; n++) simulateSeason(w);
validateWorld(w);
const simulationMs = performance.now() - start;
const t = performance.now();
const raw = await encode(w, 2, 1);
const encodingMs = performance.now() - t;
const restored = (await decode(raw)).world;
if (canonical(restored) !== canonical(w)) throw new Error('Lossless checkpoint replay failed');
const checkpointBytes = 2 * (raw.length + 20),
  totalBytes = checkpointBytes * 2 + 512;
const report = {
  phase: 'T004 domestic kernel; complete economy and continental benchmark is repeated in T010',
  date: new Date().toISOString(),
  node: process.version,
  engine: w.engine,
  catalog: w.catalog,
  seed: w.seed,
  seasons: w.history.length,
  year: w.year,
  ownedMatches: w.ownMatches.length,
  players: w.players.length,
  checkpointBytes,
  checkpointLimit: CHECKPOINT_LIMIT,
  totalBytes,
  totalLimit: TOTAL_LIMIT,
  simulationMs: Math.round(simulationMs),
  encodingMs: Math.round(encodingMs),
  heapBytes: process.memoryUsage().heapUsed,
  losslessRoundtrip: true,
  passed: checkpointBytes <= CHECKPOINT_LIMIT && totalBytes <= TOTAL_LIMIT,
};
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/T004-storage.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
if (!report.passed) process.exitCode = 1;
