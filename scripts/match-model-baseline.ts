/**
 * Match-model baseline measurement (→ARCH-31, MATCH-28, docs/MATCH-MODEL-CONTRACT.md).
 *
 * On fixed worlds it times fixture preparation, isolated grid and legacy-summary fixtures,
 * observation, record settlement, complete seasons of both century workload profiles and the
 * checkpoint codec separately, then plays a pilot sample of the core condition on both paths through
 * the registry's coverage, target, invariant and equivalence reports (scripts/lib/match-parity.ts).
 * It reads the public engine API only: it never changes the production dispatch or a candidate
 * release switch, and it measures a candidate aggregate path only when the engine exports one.
 *
 *   pnpm exec tsx scripts/match-model-baseline.ts --smoke
 *   pnpm exec tsx scripts/match-model-baseline.ts --fixtures 200 --seasons 100 --out FILE
 *   options: --out FILE (default docs/benchmarks/match-model-baseline.json), --fixtures N (timed
 *            fixtures per path), --seasons N (per century profile), --pilot N (pilot matches per path)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { dirname } from 'node:path';
import type {
  Fixture,
  Founding,
  MatchPlayback,
  MatchRecord,
  World,
} from '../packages/contracts/src/types';
import * as engine from '../packages/engine/src/index';
import {
  advanceRound,
  clubOf,
  createWorld,
  isScoringFixture,
  managerCandidates,
  nextWork,
  operate,
  operatingCost,
  OWN_LEAGUE_ENGINE,
  prepareMatch,
  quote,
  rating,
  recordMatch,
  simulateMatch,
  simulateSeason,
  sponsorSlots,
} from '../packages/engine/src/index';
import { playGrid, type GridResult } from '../packages/engine/src/grid/engine';
import { buildFrames } from '../packages/engine/src/grid/playback';
import { buildGridSetup } from '../packages/engine/src/grid/setup';
import { decode, encode } from '../apps/web/src/adapters/persistence';
import { SLOT } from '../apps/web/src/adapters/repository';
import {
  buildParityReport,
  buildPerformanceReport,
  CORPUS_CONFIG,
  corpusFixtureId,
  MATCH_PARITY_VERSION,
  median,
  METRIC_REGISTRY,
  PARITY_CONFIG,
  PERFORMANCE_CONFIG,
  TARGET_BANDS,
  type MatchSample,
  type PerformanceComponent,
  type Provenance,
  type TimingInput,
} from './lib/match-parity';

const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
function count(name: string, fallback: number) {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`--${name} takes a positive count`);
  return value;
}
const out = args.includes('--out')
  ? args[args.indexOf('--out') + 1]!
  : 'docs/benchmarks/match-model-baseline.json';
const settings = {
  mode: smoke ? 'smoke' : 'full',
  fixtures: count(
    'fixtures',
    smoke ? PERFORMANCE_CONFIG.fixtures.smoke : PERFORMANCE_CONFIG.fixtures.default,
  ),
  warmup: smoke ? PERFORMANCE_CONFIG.fixtures.smokeWarmup : PERFORMANCE_CONFIG.fixtures.warmup,
  repetitions: smoke
    ? PERFORMANCE_CONFIG.fixtures.smokeRepetitions
    : PERFORMANCE_CONFIG.fixtures.repetitions,
  seasons: count(
    'seasons',
    smoke ? PERFORMANCE_CONFIG.seasons.smoke : PERFORMANCE_CONFIG.seasons.release,
  ),
  pilot: count(
    'pilot',
    smoke ? CORPUS_CONFIG.smokePerCondition : CORPUS_CONFIG.calibrationPerCondition,
  ),
};

// ---- Provenance -----------------------------------------------------------------------------------
/** What the timings depend on: the engine, contracts, catalogs, codec adapters, tooling and lockfile. */
const SOURCE_SCOPE = [
  'packages',
  'apps/web/src/adapters',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
];
function sourceFingerprint() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_SCOPE],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((file) => file && existsSync(file))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update('\0').update(readFileSync(file));
  return {
    algorithm: 'sha256' as const,
    sha256: hash.digest('hex'),
    files: files.length,
    scope: SOURCE_SCOPE,
  };
}
const versionOf = (name: string) =>
  JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version as string;
const source = sourceFingerprint();
const core = CORPUS_CONFIG.conditions[0]!;
const provenance: Provenance = {
  date: new Date().toISOString(),
  source: {
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    gitDirty: !!execFileSync('git', ['status', '--porcelain', '--', ...SOURCE_SCOPE], {
      encoding: 'utf8',
    }).trim(),
    fingerprint: source,
  },
  toolchain: {
    node: process.version,
    pnpm: JSON.parse(readFileSync('package.json', 'utf8')).packageManager,
    typescript: versionOf('typescript'),
    tsx: versionOf('tsx'),
  },
  machine: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
  },
  seeds: {
    profiles: PERFORMANCE_CONFIG.profiles,
    timingWorld: PERFORMANCE_CONFIG.profiles.baseline,
    pilotWorlds: core.params.worldSeeds,
  },
  conditions: [core.id],
  partitions: { pilot: 'calibration', calibration: CORPUS_CONFIG.partitions.calibration.prefix },
};

// ---- Measurement helpers ----------------------------------------------------------------------------
const timings = new Map<PerformanceComponent, TimingInput>();
/** Adds one sample; components timed once per item without warm-up keep the defaults. */
function record(id: PerformanceComponent, ms: number, warmup = 0, repetitions = 1) {
  const entry = timings.get(id) ?? { id, samplesMs: [], warmup, repetitions };
  timings.set(id, { ...entry, samplesMs: [...entry.samplesMs, ms] });
}
function timed<T>(work: () => T): [T, number] {
  const start = performance.now();
  const value = work();
  return [value, performance.now() - start];
}
async function timedAsync<T>(work: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await work();
  return [value, performance.now() - start];
}
const memory = { peakHeapBytes: 0, peakRssBytes: 0 };
function sampleMemory() {
  const m = process.memoryUsage();
  memory.peakHeapBytes = Math.max(memory.peakHeapBytes, m.heapUsed);
  memory.peakRssBytes = Math.max(memory.peakRssBytes, m.rss);
}
/** Exact checks; null when the run had nothing to compare. */
const checks: { repeatsIdentical: boolean | null; observedMatchesUnobserved: boolean | null } = {
  repeatsIdentical: settings.repetitions > 1 ? true : null,
  observedMatchesUnobserved: null,
};
/** A record without the post-match material, for comparing settled results. */
const resultOf = (r: MatchRecord) => JSON.stringify({ ...r, material: undefined });

/**
 * Times `work` on each fixture after warm-up: each sample is the median of the repetitions. With
 * `recordOf`, a repetition that settles a different record breaks determinism (→ARCH-5).
 */
function measure<T>(
  id: PerformanceComponent,
  fixtures: readonly Fixture[],
  work: (f: Fixture) => T,
  recordOf?: (value: T) => MatchRecord,
): T[] {
  for (const f of fixtures.slice(0, settings.warmup)) work(f);
  return fixtures.map((f) => {
    const runs = Array.from({ length: settings.repetitions }, () => timed(() => work(f)));
    if (recordOf) {
      const first = resultOf(recordOf(runs[0]![0]));
      if (runs.some(([value]) => resultOf(recordOf(value)) !== first))
        checks.repeatsIdentical = false;
    }
    record(id, median(runs.map(([, ms]) => ms)), settings.warmup, settings.repetitions);
    return runs[0]![0];
  });
}

const started = performance.now();
console.error(`match-model baseline (${settings.mode}): source ${source.sha256.slice(0, 12)}`);

// ---- Isolated fixtures and settlement on the century baseline world --------------------------------
const world = createWorld({
  country: 'ENG',
  name: 'Century Athletic',
  color: '#284e35',
  seed: PERFORMANCE_CONFIG.profiles.baseline,
  level: 'easy',
});
const ordered = [...world.fixtures].sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1));
const isOwn = (f: Fixture) => f.home === world.playerClub || f.away === world.playerClub;
const ownFixtures = ordered.filter(isOwn);
const ownLeague = ordered.filter((f) => !isOwn(f) && isScoringFixture(world, f));
const others = ordered.filter((f) => !isOwn(f) && !isScoringFixture(world, f));
const n = settings.fixtures;
/** Grid fixtures: the own club's, then own-league fixtures played the way own matches are. */
const gridSet = [...ownFixtures, ...ownLeague].slice(0, n);
const summarySet = others.slice(0, n);
const linesSet = ownLeague.slice(0, n);
// A club's generated squad and lineup are cached once a season (world.ts `squad`, `startingSquad`);
// that cost belongs to the season timings, so every timed fixture is prepared once untimed and
// each component measures the steady state.
for (const f of [...gridSet, ...summarySet, ...linesSet]) prepareMatch(world, f);
sampleMemory();

const playbackRecord = (p: { record: MatchRecord }) => p.record;
measure('preparation.summary', summarySet, (f) => prepareMatch(world, f));
measure('preparation.grid', gridSet, (f) =>
  buildGridSetup(world, f, { observe: false, recordPlayers: true }),
);
const summaryPlaybacks = measure(
  'fixture.summary',
  summarySet,
  (f) => simulateMatch(world, f),
  playbackRecord,
);
const linePlaybacks = measure(
  'fixture.summary-lines',
  linesSet,
  (f) => simulateMatch(world, f, false, true),
  playbackRecord,
);
const gridPlaybacks = measure(
  'fixture.grid',
  gridSet,
  (f): MatchPlayback => {
    const setup = buildGridSetup(world, f, { observe: false, recordPlayers: true });
    return { record: playGrid(setup).record, frames: [], squads: setup.rosters };
  },
  playbackRecord,
);
const observedSet = gridSet.slice(0, Math.min(n, ownFixtures.length));
observedSet.forEach((f, i) => {
  const setup = buildGridSetup(world, f, { observe: true, recordPlayers: true });
  const [result, playMs] = timed(() => playGrid(setup));
  const [, framesMs] = timed(() => buildFrames(result, setup, world.seed));
  record('observation.grid', playMs);
  record('observation.frames', framesMs);
  // Observing adds frames only; the settled facts are those of the unobserved run (→MATCH-7).
  const same = resultOf(result.record) === resultOf(gridPlaybacks[i]!.record);
  checks.observedMatchesUnobserved = (checks.observedMatchesUnobserved ?? true) && same;
});
sampleMemory();

// Every fixture settles once, on a copy, so no settlement repeats a fixture (→MATCH-27).
const settled = structuredClone(world);
for (const p of [...summaryPlaybacks, ...linePlaybacks])
  record('settlement.npc', timed(() => recordMatch(settled, p, true))[1]);
for (const p of gridPlaybacks.slice(0, ownFixtures.length))
  record('settlement.own', timed(() => recordMatch(settled, p, true))[1]);
sampleMemory();

// ---- Optional candidate path ------------------------------------------------------------------------
/** A later aggregate path is measured when the engine exports it; nothing switches it on. */
const adapter = (engine as Record<string, unknown>).simulateAggregate;
const candidateFn =
  typeof adapter === 'function'
    ? (adapter as (w: World, f: Fixture) => { record: MatchRecord })
    : undefined;
const revisionModule = '../packages/contracts/src/match-model.ts';
const revision = await import(revisionModule).then(
  (m: { MATCH_MODEL_REVISION?: string }) => m.MATCH_MODEL_REVISION ?? null,
  () => null,
);
if (candidateFn)
  measure('fixture.candidate', summarySet, (f) => candidateFn(world, f), playbackRecord);

// ---- Complete seasons of both century profiles, then the codec --------------------------------------
/** The active-management century workload's owner actions, as scripts/benchmark.ts runs them. */
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
const seasons: Record<string, unknown>[] = [];
for (const [profile, seed] of Object.entries(PERFORMANCE_CONFIG.profiles)) {
  const w = createWorld({
    country: 'ENG',
    name: profile === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed,
    level: 'easy',
  });
  for (let season = 0; season < settings.seasons; season++) {
    const [, ms] = timed(() => {
      if (profile === 'active-management') manage(w, season);
      simulateSeason(w);
    });
    record(`season.${profile}` as PerformanceComponent, ms);
    sampleMemory();
    if ((season + 1) % 10 === 0)
      console.error(`${profile}: ${season + 1}/${settings.seasons} seasons`);
  }
  const [raw, encodeMs] = await timedAsync(() => encode(w, 2, 1));
  const [, decodeMs] = await timedAsync(() => decode(raw));
  record('codec.encode', encodeMs);
  record('codec.decode', decodeMs);
  // Conservative UTF-16 size of the active slot, as scripts/benchmark.ts counts it (→SAVE-4).
  const checkpointBytes = 2 * (raw.length + SLOT[0]!.length);
  seasons.push({
    profile,
    seed,
    seasons: w.history.length,
    year: w.year,
    checkpointChars: raw.length,
    checkpointBytes,
    withinCheckpointLimit: checkpointBytes <= PERFORMANCE_CONFIG.storage.checkpointBytes,
  });
  sampleMemory();
}

// ---- Pilot parity sample of the core condition --------------------------------------------------------
const params = core.params as {
  worldSeeds: string[];
  world: Omit<Founding, 'seed'>;
  countries: string[];
  maxRatingGap: number;
  pairing: string;
  tactics: string;
  fixture: { year: number; round: number; kind: Fixture['kind'] };
};
if (params.pairing !== 'world-country-roster' || params.tactics !== 'club')
  throw new Error(`the runner builds only world-country-roster pairs playing their clubs' tactics`);
const pairs = params.worldSeeds.flatMap((seed) => {
  const w = createWorld({ ...params.world, seed });
  return params.countries.flatMap((country) => {
    const clubs = w.clubs
      .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
      .map((c) => ({ c, r: rating(w, c) }));
    return clubs.flatMap((a, i) =>
      clubs
        .slice(i + 1)
        .filter((b) => Math.abs(a.r - b.r) <= params.maxRatingGap)
        .map((b) => ({ w, home: a.c, away: b.c })),
    );
  });
});
const reference: MatchSample[] = [],
  legacy: MatchSample[] = [],
  candidate: MatchSample[] = [];
for (let i = 0; i < settings.pilot; i++) {
  const { w, home, away } = pairs[i % pairs.length]!;
  const f: Fixture = {
    ...w.fixtures[0]!,
    ...params.fixture,
    id: corpusFixtureId('calibration', core.id, i),
    home: home.id,
    away: away.id,
  };
  const grid: GridResult = playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: true }));
  // Match strength of two clubs nobody owns: XI ratings and home ground (their manager terms cancel).
  const gap = rating(w, home, f) + 3 - rating(w, away, f);
  const base = { incidentsTracked: true, condition: core.id, gap };
  reference.push({ ...base, record: grid.record, diagnostics: grid.diagnostics });
  legacy.push({ ...base, record: simulateMatch(w, f, false, true).record });
  if (candidateFn) candidate.push({ ...base, record: candidateFn(w, f).record });
}
sampleMemory();
const legacyPath = `simulateMatch, own-league dispatch ${OWN_LEAGUE_ENGINE}`;
const parity = buildParityReport({
  provenance,
  partition: 'calibration',
  reference: { path: 'grid (buildGridSetup + playGrid)', samples: reference },
  candidate: { path: legacyPath, samples: legacy },
});
const candidateParity = candidateFn
  ? buildParityReport({
      provenance,
      partition: 'calibration',
      reference: { path: 'grid (buildGridSetup + playGrid)', samples: reference },
      candidate: { path: 'simulateAggregate', samples: candidate },
    })
  : null;

// ---- Report -----------------------------------------------------------------------------------------
if (sourceFingerprint().sha256 !== source.sha256)
  throw new Error('Source changed during the measurement; rerun after edits settle');
const components = [...timings.values()];
const report = {
  kind: 'match-model-baseline',
  version: MATCH_PARITY_VERSION,
  mode: settings.mode,
  provisional: true,
  provisionalReason:
    'Measured before T255 closed the identity feature; T273 records the release baseline on the post-T255 source before new football changes.',
  releaseEvidence: false,
  pairedComparison: null,
  pairedNote:
    'No candidate run on this machine and toolchain exists yet; the historic timings under context come from other machines and are never a paired result (→ARCH-31).',
  context: [
    {
      source: 'docs/CALIBRATION.md T224',
      machine: 'Intel Xeon Silver 4214, Node v24.12.0',
      secondsPerSeason: { baselineWorld: 8.43 },
      contextOnly: true,
    },
    {
      source: 'docs/CALIBRATION.md T232 century benchmark',
      machine: 'Apple M1 Max, Node 26.8.1',
      secondsPerSeason: { baseline: 8.46, 'active-management': 8.24 },
      contextOnly: true,
    },
  ],
  provenance,
  settings,
  configs: {
    parity: PARITY_CONFIG,
    corpus: { ...CORPUS_CONFIG, conditions: CORPUS_CONFIG.conditions.length },
    performance: PERFORMANCE_CONFIG,
    registry: { metrics: METRIC_REGISTRY.length, targets: TARGET_BANDS.length },
  },
  productionDispatch: {
    ownLeagueEngine: OWN_LEAGUE_ENGINE,
    changedByRunner: false,
    candidateReleaseSwitch: 'not read or written',
  },
  candidate: {
    available: !!candidateFn,
    adapter: 'simulateAggregate(world, fixture) → { record } from packages/engine/src/index',
    matchModelRevision: revision,
  },
  fixtureSets: {
    world: PERFORMANCE_CONFIG.profiles.baseline,
    grid: gridSet.length,
    ownInGrid: Math.min(ownFixtures.length, gridSet.length),
    summary: summarySet.length,
    summaryLines: linesSet.length,
    observed: observedSet.length,
    seasonFixtures: world.fixtures.length,
  },
  checks,
  performance: buildPerformanceReport({ components, provisional: true }),
  memory,
  seasons,
  parity,
  candidateParity,
  elapsedMs: Math.round(performance.now() - started),
};
mkdirSync(dirname(out), { recursive: true });
// Six significant digits keep the report readable without changing any decision it records.
const rounded = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(6)) : value;
writeFileSync(out, JSON.stringify(report, rounded, 2) + '\n');

const by = (id: string) => report.performance.components.find((c) => c.id === id)?.medianMs;
const statuses = parity.equivalence.summary.metrics;
console.log(
  [
    `wrote ${out} (${settings.mode}, ${report.elapsedMs} ms)`,
    `median ms: summary ${by('fixture.summary')?.toFixed(3)}, grid ${by('fixture.grid')?.toFixed(1)}, settlement ${by('settlement.npc')?.toFixed(3)}`,
    `season s: baseline ${((by('season.baseline') ?? NaN) / 1000).toFixed(2)}, active ${((by('season.active-management') ?? NaN) / 1000).toFixed(2)}`,
    `pilot ${settings.pilot} matches: ${JSON.stringify(statuses)}`,
    `checks: ${JSON.stringify(checks)}`,
  ].join('\n'),
);
