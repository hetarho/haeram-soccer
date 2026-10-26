// T450: plays a candidate-model century profile (the worlds scripts/match-model-baseline.ts founds
// for `season.baseline` and `season.active-management`) season by season, logs each season's
// engine time as that runner counts it (the owner's actions, then the season) and keeps the world
// JSON at the season starts asked for, so a single early or late season can be profiled on its own.
// usage: pnpm exec tsx artifacts/benchmarks/t450/build-worlds.mts <seasons> <outDir> [keep,keep,…] [profile]
//   keep: season indices (0 = the founding world) whose start is written to <outDir>/season-<i>.world.json
//   profile: baseline (default) or active-management
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { World } from '../../../packages/contracts/src/types';
import {
  advanceRound,
  clubOf,
  createWorld,
  managerCandidates,
  nextWork,
  operate,
  operatingCost,
  quote,
  simulateSeason,
  sponsorSlots,
} from '../../../packages/engine/src/index';
import { withCandidateModel } from '../../../tests/fixtures/worlds';
import { PERFORMANCE_CONFIG } from '../../../scripts/lib/match-parity';

const [seasonsArg = '60', outDir = '.tmp/t450', keepArg = '0,60', profile = 'baseline'] =
  process.argv.slice(2);
if (profile !== 'baseline' && profile !== 'active-management')
  throw new Error('profile is baseline or active-management');
const seasons = Number(seasonsArg);
const keep = new Set(keepArg.split(',').map(Number));
mkdirSync(outDir, { recursive: true });

/** The active-management workload's owner actions: scripts/match-model-baseline.ts `manage`, copied. */
function manage(w: World, season: number) {
  const code = clubOf(w).country;
  const available = (cost: string) => BigInt(w.cash) > BigInt(cost) + BigInt(operatingCost(w));
  for (const view of sponsorSlots(w))
    if (view.offers.length)
      operate(w, {
        type: 'sign-sponsor',
        slot: view.slot,
        offer: season % 4 === 0 ? view.offers.length - 1 : 0,
      });
  if (season === 0) operate(w, { type: 'policy', key: 'localInvest', level: 2 });
  if (season % 10 === 0 && w.players.filter((p) => p.status === 'active').length < 26)
    operate(w, { type: 'recruit', candidate: 0, loan: true });
  const stand = nextWork(w, 'stadium');
  if (season % 15 === 0 && stand && !w.facilityWorks?.stadium && available(stand.cost))
    operate(w, { type: 'facility', part: 'stadium' });
  if (season % 10 === 0 && available(quote(code, w.year, 400))) {
    const candidate = managerCandidates(w).find((offer) => offer.source === 'free');
    if (candidate) operate(w, { type: 'hire', id: candidate.id });
  }
  operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
  for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
  operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
}

const w = withCandidateModel(
  createWorld({
    country: 'ENG',
    name: profile === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed: PERFORMANCE_CONFIG.profiles[profile],
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
  if (profile === 'active-management') manage(w, season);
  simulateSeason(w);
  const ms = performance.now() - t;
  console.log(JSON.stringify({ season, year: w.year, ms: Math.round(ms) }));
}
