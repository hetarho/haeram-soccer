import { measurementIdentity } from './lib/measurement-identity';
/**
 * Match-model baseline measurement (→ARCH-31, MATCH-28, spec/ssot/MATCH.md).
 *
 * On fixed worlds it times fixture preparation, isolated grid and legacy-summary fixtures,
 * observation, record settlement, complete seasons of both century workload profiles and the
 * checkpoint codec separately, then plays a pilot sample of the core condition on both paths through
 * the registry's coverage, target, invariant and equivalence reports (scripts/lib/match-parity.ts).
 * It reads the public engine API only and never reads or writes the release switch: every world is
 * founded with an explicit release — the isolated fixtures and the pilot on the pre-feature path
 * careers founded before the release keep, the century seasons on the full model with
 * `--model candidate` — and it measures a candidate aggregate path only when the engine exports one.
 * A candidate run reports ARCH-31's absolute release gates (→releaseGates); `--release` marks the
 * full 100-season run on the reference machine whose quiet result is release evidence (T286).
 *
 *   pnpm exec tsx scripts/match-model-baseline.ts --smoke
 *   pnpm exec tsx scripts/match-model-baseline.ts --fixtures 200 --seasons 100 --out FILE
 *   pnpm exec tsx scripts/match-model-baseline.ts --model candidate --seasons 10 \
 *     --paired-with BASELINE.json --out FILE
 *   pnpm exec tsx scripts/match-model-baseline.ts --model candidate --release \
 *     --paired-with BASELINE.json --out artifacts/benchmarks/t286/candidate-100.json
 *   options: --out FILE (default artifacts/benchmarks/match-model-baseline.json), --fixtures N (timed
 *            fixtures per path), --seasons N (per century profile), --pilot N (pilot matches per path),
 *            --model candidate (T285: the century seasons, own fixtures and settlement run on worlds
 *            with the candidate model and its complete statistics; the codec is measured at the
 *            last season's final round, while the season's ledger is full), --paired-with FILE (a
 *            baseline report of this runner: the paired ratios against it, context only,
 *            →comparePerformance), --release (a release run: candidate model, full mode, the
 *            release season count and the default fixtures; not provisional, →releaseGates)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, loadavg, platform, totalmem } from 'node:os';
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
  aggregatePlan,
  aggregateRecord,
  aggregateSkillAccess,
  matchdayRosters,
  settleParticipation,
  simulateAggregate,
  UNPLANNED,
} from '../packages/engine/src/aggregate/engine';
import { buildAggregateInput } from '../packages/engine/src/aggregate/input';
import { attributePlayerFacts } from '../packages/engine/src/aggregate/players';
import { aggregateStreams } from '../packages/engine/src/aggregate/team';
import { eraRules } from '../packages/engine/src/grid/setup';
import { DISABLED_RELEASE, ENABLED_RELEASE } from '../tests/fixtures/releases';
import { withCandidateModel } from '../tests/fixtures/worlds';
import {
  buildParityReport,
  buildPerformanceReport,
  calibrationSize,
  comparePerformance,
  conditionValidationSize,
  CORPUS_CONFIG,
  corpusFixtureId,
  pilotNeeds,
  MATCH_PARITY_VERSION,
  median,
  METRIC_REGISTRY,
  PARITY_CONFIG,
  PERFORMANCE_CONFIG,
  releaseGates,
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
  : 'artifacts/benchmarks/match-model-baseline.json';
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'production';
if (model !== 'production' && model !== 'candidate')
  throw new Error('--model takes production or candidate');
const candidateModel = model === 'candidate';
const pairedWith = args.includes('--paired-with')
  ? args[args.indexOf('--paired-with') + 1]!
  : undefined;
if (pairedWith && !candidateModel)
  throw new Error('--paired-with pairs a candidate run: add --model candidate');
const releaseRun = args.includes('--release');
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
    smoke ? CORPUS_CONFIG.smokePerCondition : calibrationSize(CORPUS_CONFIG.conditions[0]!),
  ),
};
if (
  releaseRun &&
  (!candidateModel ||
    smoke ||
    settings.seasons !== PERFORMANCE_CONFIG.seasons.release ||
    settings.fixtures !== PERFORMANCE_CONFIG.fixtures.default)
)
  throw new Error(
    `--release measures the candidate model in full mode over ${PERFORMANCE_CONFIG.seasons.release} seasons and ${PERFORMANCE_CONFIG.fixtures.default} fixtures`,
  );

// ---- Provenance -----------------------------------------------------------------------------------
/** What the timings depend on: the engine, contracts, catalogs, codec adapters, tooling and lockfile. */
const SOURCE_SCOPE = [
  'packages',
  'apps/web/src/adapters',
  'scripts',
  'tests/fixtures/worlds.ts',
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
const computation = measurementIdentity('scripts/match-model-baseline.ts');
const core = CORPUS_CONFIG.conditions[0]!;
const provenance: Provenance = {
  date: new Date().toISOString(),
  source: {
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    gitDirty: !!execFileSync('git', ['status', '--porcelain', '--', ...SOURCE_SCOPE], {
      encoding: 'utf8',
    }).trim(),
    fingerprint: source,
    computationFingerprint: computation,
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
/** The 1-minute load average at each memory sample: whether the run had the machine to itself. */
const loads: number[] = [];
function sampleMemory() {
  const m = process.memoryUsage();
  memory.peakHeapBytes = Math.max(memory.peakHeapBytes, m.heapUsed);
  memory.peakRssBytes = Math.max(memory.peakRssBytes, m.rss);
  loads.push(loadavg()[0]!);
}
/** Exact checks; null when the run had nothing to compare. */
const checks: {
  repeatsIdentical: boolean | null;
  observedMatchesUnobserved: boolean | null;
  /** The stage-by-stage replay settles each fixture's own `simulateAggregate` record. */
  candidateStagesMatchWhole: boolean | null;
} = {
  repeatsIdentical: settings.repetitions > 1 ? true : null,
  observedMatchesUnobserved: null,
  candidateStagesMatchWhole: null,
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
// The pre-feature path careers founded before the release keep; the candidate path is measured
// on the same world through `simulateAggregate` and on a copy carrying the model.
const world = createWorld(
  {
    country: 'ENG',
    name: 'Century Athletic',
    color: '#284e35',
    seed: PERFORMANCE_CONFIG.profiles.baseline,
    level: 'easy',
  },
  DISABLED_RELEASE,
);
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
  typeof adapter === 'function' ? (adapter as (w: World, f: Fixture) => MatchPlayback) : undefined;
const revisionModule = '../packages/contracts/src/match-model.ts';
const revision = await import(revisionModule).then(
  (m: { MATCH_MODEL_REVISION?: string }) => m.MATCH_MODEL_REVISION ?? null,
  () => null,
);
const candidatePlaybacks = candidateFn
  ? measure('fixture.candidate', summarySet, (f) => candidateFn(world, f), playbackRecord)
  : [];

// ---- The candidate fixture's stages, own fixtures and settlement (T285) ---------------------------
/**
 * `playAggregate`'s regulation path stage by stage on the same fixtures (none of them is a
 * knockout): preparation (prepareMatch and the matchday rosters), generation (participation plan,
 * team facts and the red-card search), attribution (player lines) and the validated record. A
 * fixture that needs a retry stream is left out of the stage samples; every replayed record must
 * equal the fixture's own `simulateAggregate` record.
 */
let stageRetries = 0;
if (candidateModel) {
  const stage = new Map<PerformanceComponent, number[]>();
  for (const f of summarySet.slice(0, settings.warmup)) simulateAggregate(world, f);
  summarySet.forEach((f, i) => {
    const runs = Array.from({ length: settings.repetitions }, () => {
      const [prep, prepMs] = timed(() => {
        const prepared = prepareMatch(world, f);
        return { prepared, rosters: matchdayRosters(world, f, prepared, eraRules(f.year)) };
      });
      const { prepared, rosters } = prep;
      const [generated, genMs] = timed(() => {
        const base = buildAggregateInput(prepared, UNPLANNED, rosters);
        const plan = aggregatePlan(world, prepared, rosters, eraRules(f.year));
        const match = settleParticipation(
          base,
          plan,
          aggregateStreams(world.seed, f.id),
          90,
          (participation) => aggregateSkillAccess(prepared, rosters, participation),
        );
        return { plan, match };
      });
      const { plan, match } = generated;
      if (!match) return undefined;
      const streams = aggregateStreams(world.seed, f.id);
      // Attribution reads its own stream families, so fresh streams draw what playAggregate's did.
      const [players, attrMs] = timed(() =>
        attributePlayerFacts(match.input, plan, match.participation, match.facts, streams),
      );
      const [settled, recordMs] = timed(() =>
        aggregateRecord(f, rosters, { ...match, plan, players, retry: 0 }),
      );
      return { settled, ms: [prepMs, genMs, attrMs, recordMs] };
    });
    if (runs.some((run) => !run)) {
      stageRetries++;
      return;
    }
    const same = resultOf(runs[0]!.settled) === resultOf(candidatePlaybacks[i]!.record);
    checks.candidateStagesMatchWhole = (checks.candidateStagesMatchWhole ?? true) && same;
    (
      [
        'candidate.preparation',
        'candidate.generation',
        'candidate.attribution',
        'candidate.record',
      ] as const
    ).forEach((id, k) =>
      stage.set(id, [...(stage.get(id) ?? []), median(runs.map((run) => run!.ms[k]!))]),
    );
  });
  for (const [id, samplesMs] of stage)
    timings.set(id, { id, samplesMs, warmup: settings.warmup, repetitions: settings.repetitions });
  sampleMemory();

  // Own fixtures through the candidate dispatch, on a copy that carries the candidate model.
  const candidateWorld = withCandidateModel(structuredClone(world));
  const ownSet = ownFixtures.slice(0, n);
  for (const f of ownSet) prepareMatch(candidateWorld, f);
  measure(
    'fixture.own-candidate',
    ownSet,
    (f) => simulateMatch(candidateWorld, f, false, true),
    playbackRecord,
  );
  // Each aggregate record settles once on the candidate world, ledger included (→MATCH-27).
  for (const p of candidatePlaybacks)
    record('settlement.candidate', timed(() => recordMatch(candidateWorld, p, true))[1]);
  sampleMemory();
}

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
  const founded = createWorld(
    {
      country: 'ENG',
      name: profile === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
      color: '#284e35',
      seed,
      level: 'easy',
    },
    candidateModel ? ENABLED_RELEASE : DISABLED_RELEASE,
  );
  // The candidate model from founding: complete statistics tracked from the first day.
  const w = candidateModel ? withCandidateModel(founded, 'founding') : founded;
  let raw: string | undefined;
  for (let season = 0; season < settings.seasons; season++) {
    const last = season === settings.seasons - 1;
    const [, ms] = timed(() => {
      if (profile === 'active-management') manage(w, season);
      // A candidate run stops the last season at its final round for the codec: the season's
      // ledger is then at its fullest. simulateSeason plays the same rounds, then closes.
      if (candidateModel && last)
        while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
    });
    if (candidateModel && last) {
      const [encoded, encodeMs] = await timedAsync(() => encode(w, 2, 1));
      const [, decodeMs] = await timedAsync(() => decode(encoded));
      record('codec.encode', encodeMs);
      record('codec.decode', decodeMs);
      raw = encoded;
    }
    const closeMs = timed(() => simulateSeason(w))[1];
    record(`season.${profile}` as PerformanceComponent, ms + closeMs);
    sampleMemory();
    if ((season + 1) % 10 === 0)
      console.error(`${profile}: ${season + 1}/${settings.seasons} seasons`);
  }
  if (!raw) {
    const [encoded, encodeMs] = await timedAsync(() => encode(w, 2, 1));
    const [, decodeMs] = await timedAsync(() => decode(encoded));
    record('codec.encode', encodeMs);
    record('codec.decode', decodeMs);
    raw = encoded;
  }
  // Conservative UTF-16 size of the active slot, as scripts/benchmark.ts counts it (→SAVE-4).
  const checkpointBytes = 2 * (raw.length + SLOT[0]!.length);
  seasons.push({
    profile,
    seed,
    model,
    seasons: w.history.length,
    year: w.year,
    checkpointAt: candidateModel
      ? 'final round of the last season, before its close'
      : 'after the close',
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
  const w = createWorld({ ...params.world, seed }, DISABLED_RELEASE);
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
  condition: core.id,
  reference: { path: 'grid (buildGridSetup + playGrid)', engine: 'detailed', samples: reference },
  candidate: { path: legacyPath, engine: 'aggregate', samples: legacy },
});
const candidateParity = candidateFn
  ? buildParityReport({
      provenance,
      partition: 'calibration',
      condition: core.id,
      reference: {
        path: 'grid (buildGridSetup + playGrid)',
        engine: 'detailed',
        samples: reference,
      },
      candidate: { path: 'simulateAggregate', engine: 'aggregate', samples: candidate },
    })
  : null;
// The validation size the reference pilot implies for every metric this condition judges.
const pilotSizing = conditionValidationSize(pilotNeeds(reference, core));

// ---- Report -----------------------------------------------------------------------------------------
if (measurementIdentity('scripts/match-model-baseline.ts').sha256 !== computation.sha256)
  throw new Error('Source changed during the measurement; rerun after edits settle');
const components = [...timings.values()];
const performanceReport = buildPerformanceReport({ components, provisional: !releaseRun });
const sortedLoads = [...loads].sort((a, b) => a - b);
const load = {
  samples: loads.length,
  load1Median: loads.length ? Number(median(sortedLoads).toFixed(2)) : null,
  load1Max: loads.length ? Number(sortedLoads.at(-1)!.toFixed(2)) : null,
};
/** ARCH-31's absolute release gates on this run (a candidate run only). */
const gates = candidateModel
  ? releaseGates({ provenance, report: performanceReport, maxLoad: load.load1Max ?? undefined })
  : null;
/** The paired ratios to a baseline report of this runner, when one is named: context only. */
const pairedComparison = pairedWith
  ? (() => {
      const baseline = JSON.parse(readFileSync(pairedWith, 'utf8')) as {
        provenance: Provenance;
        performance: Parameters<typeof comparePerformance>[0]['report'];
        settings: Partial<typeof settings>;
      };
      // `paired` covers machine, toolchain and worlds; the workloads are compared here, so a
      // baseline of other seasons, fixtures or repetitions is marked as not like for like (the
      // pilot sizes the accuracy sample, not the timings).
      const settingsDiffer = (['mode', 'fixtures', 'warmup', 'repetitions', 'seasons'] as const)
        .filter((key) => baseline.settings[key] !== settings[key])
        .map((key) => `${key} ${baseline.settings[key]} v ${settings[key]}`);
      // The baseline is named by its source and settings, never by a local file path.
      return {
        baseline: {
          gitHead: baseline.provenance.source.gitHead,
          fingerprint: baseline.provenance.source.fingerprint.sha256,
          settings: baseline.settings,
        },
        settingsMatch: settingsDiffer.length === 0,
        settingsDiffer,
        ...comparePerformance(
          { provenance: baseline.provenance, report: baseline.performance },
          { provenance, report: performanceReport },
        ),
      };
    })()
  : null;
const report = {
  kind: 'match-model-baseline',
  version: MATCH_PARITY_VERSION,
  mode: settings.mode,
  model,
  provisional: !releaseRun,
  provisionalReason: releaseRun
    ? null
    : candidateModel
      ? 'A candidate run outside --release (fewer seasons, smoke or other fixtures): its gate results guide work and are not release evidence (→ARCH-31).'
      : 'A baseline-path run of this source. T273 recorded the release baseline at 9f69553 (post-T255, before the match-model football changes); paired runs re-run that source on the measuring machine (→ARCH-31).',
  releaseGates: gates,
  releaseEvidence: gates?.releaseEvidence ?? false,
  load,
  pairedComparison,
  pairedNote: pairedWith
    ? 'Ratios pair this run with the named baseline report only when machine, toolchain and worlds match, and settingsMatch says whether both ran the same seasons, fixtures, warm-up and repetitions; ARCH-31 reports them as context, never as the release gate.'
    : 'No paired baseline named (--paired-with); the historic timings under context come from other machines and are never a paired result (→ARCH-31).',
  context: [
    {
      source: 'artifacts/benchmarks/CALIBRATION.md T224',
      machine: 'Intel Xeon Silver 4214, Node v24.12.0',
      secondsPerSeason: { baselineWorld: 8.43 },
      contextOnly: true,
    },
    {
      source: 'artifacts/benchmarks/CALIBRATION.md T232 century benchmark',
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
    releaseSwitch: 'not read or written: every world names its release',
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
    /** Candidate stage samples left out because the fixture settled on a retry stream. */
    candidateStageRetries: stageRetries,
  },
  checks,
  performance: performanceReport,
  memory,
  seasons,
  parity,
  pilotSizing,
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
    `candidate ms: fixture ${by('fixture.candidate')?.toFixed(3)} (preparation ${by('candidate.preparation')?.toFixed(3)}, generation ${by('candidate.generation')?.toFixed(3)}, attribution ${by('candidate.attribution')?.toFixed(3)}, record ${by('candidate.record')?.toFixed(3)}), own ${by('fixture.own-candidate')?.toFixed(1)}, settlement ${by('settlement.candidate')?.toFixed(3)}`,
    `release gates: ${gates ? JSON.stringify(gates.gates.map((g) => [g.id, g.status, g.medianMs === undefined ? null : Number(g.medianMs.toFixed(3))])) : 'none'}; evidence ${gates?.releaseEvidence ?? false}${gates?.reasons.length ? ` (${gates.reasons.join('; ')})` : ''}; load median ${load.load1Median}, max ${load.load1Max}`,
    `paired ratios: ${pairedComparison ? JSON.stringify(pairedComparison.ratios.map((r) => [r.id, r.status, r.ratio === undefined ? null : Number(r.ratio.toFixed(3))])) : 'none'}`,
    `season s: baseline ${((by('season.baseline') ?? NaN) / 1000).toFixed(2)}, active ${((by('season.active-management') ?? NaN) / 1000).toFixed(2)}`,
    `pilot ${settings.pilot} matches: ${JSON.stringify(statuses)}, constants ${parity.equivalence.constants.join(' ')}, blocking ${parity.equivalence.blocking.length}`,
    `checks: ${JSON.stringify(checks)}`,
  ].join('\n'),
);
