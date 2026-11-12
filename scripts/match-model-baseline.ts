import { measurementIdentity } from './lib/measurement-identity';
/**
 * Match-model measurement (→ARCH-31, MATCH-28, spec/ssot/MATCH.md) on the released model.
 *
 * On fixed worlds it times the result path's fixtures without the own club and their stages, own
 * fixtures (record, script and post-match material), record settlement, complete seasons of both
 * century workload profiles and the checkpoint codec separately, then plays a pilot sample of the
 * core condition on the result path through the registry's coverage, target, outcome-curve and
 * invariant reports (scripts/lib/match-parity.ts). Throughput has no absolute budget: a run is
 * compared with the previous release's run of this runner on the same machine (`--paired-with`,
 * →comparePerformance, ARCH-34). T844 removed the grid and pre-feature stages.
 *
 *   pnpm exec tsx scripts/match-model-baseline.ts --smoke
 *   pnpm exec tsx scripts/match-model-baseline.ts --fixtures 200 --seasons 100 --out FILE
 *   pnpm exec tsx scripts/match-model-baseline.ts --seasons 10 --paired-with PREVIOUS.json --out FILE
 *   options: --out FILE (default artifacts/benchmarks/match-model-baseline.json), --fixtures N (timed
 *            fixtures), --seasons N (per century profile), --pilot N (pilot matches), --paired-with
 *            FILE (the previous release's report of this runner: the paired ratios against it)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, loadavg, platform, totalmem } from 'node:os';
import { dirname } from 'node:path';
import type { Fixture, MatchRecord, World } from '../packages/contracts/src/types';
import { careerWorld, type CareerInput } from '../packages/engine/src/career.testkit';
import {
  advanceRound,
  clubOf,
  managerCandidates,
  nextWork,
  debit,
  startFacilityWork,
  operate,
  operatingCost,
  policyOf,
  prepareMatch,
  quote,
  rating,
  recordMatch,
  simulateMatch,
  simulateSeason,
  sponsorSlots,
  transferOffers,
} from '../packages/engine/src/index';
import { decode, encode } from '../apps/web/src/adapters/persistence';
import { ACTIVE } from '../apps/web/src/adapters/repository';
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
import { eraRules } from '../packages/engine/src/match/rules';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import {
  buildParityReport,
  buildPerformanceReport,
  calibrationSize,
  comparePerformance,
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
  : 'artifacts/benchmarks/match-model-baseline.json';
const pairedWith = args.includes('--paired-with')
  ? args[args.indexOf('--paired-with') + 1]!
  : undefined;
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
  /** The stage-by-stage replay settles each fixture's own `simulateAggregate` record. */
  candidateStagesMatchWhole: boolean | null;
} = {
  repeatsIdentical: settings.repetitions > 1 ? true : null,
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
const world = careerWorld({ country: 'ENG', seed: PERFORMANCE_CONFIG.profiles.baseline });
const ordered = [...world.fixtures].sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1));
const isOwn = (f: Fixture) => f.home === world.playerClub || f.away === world.playerClub;
const ownFixtures = ordered.filter(isOwn);
const n = settings.fixtures;
/** Fixtures without the own club: the result path's fixtures every club plays (→MATCH-22). */
const npcSet = ordered.filter((f) => !isOwn(f)).slice(0, n);
const ownSet = ownFixtures.slice(0, n);
// A club's generated squad and lineup are cached once a season (world.ts `squad`, `startingSquad`);
// that cost belongs to the season timings, so every timed fixture is prepared once untimed and
// each component measures the steady state.
for (const f of [...npcSet, ...ownSet]) prepareMatch(world, f);
sampleMemory();

const playbackRecord = (p: { record: MatchRecord }) => p.record;
const npcPlaybacks = measure(
  'fixture.candidate',
  npcSet,
  (f) => simulateAggregate(world, f),
  playbackRecord,
);

// ---- The fixture's stages, own fixtures and settlement (T285) -------------------------------------
/**
 * `playAggregate`'s regulation path stage by stage on the same fixtures (none of them is a
 * knockout): preparation (prepareMatch and the matchday rosters), generation (participation plan,
 * team facts and the red-card search), attribution (player lines) and the validated record. A
 * fixture that needs a retry stream is left out of the stage samples; every replayed record must
 * equal the fixture's own `simulateAggregate` record.
 */
let stageRetries = 0;
{
  const stage = new Map<PerformanceComponent, number[]>();
  for (const f of npcSet.slice(0, settings.warmup)) simulateAggregate(world, f);
  npcSet.forEach((f, i) => {
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
    const same = resultOf(runs[0]!.settled) === resultOf(npcPlaybacks[i]!.record);
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

  // Own fixtures through the dispatch: record, script and post-match material (→MATCH-38).
  const ownPlaybacks = measure(
    'fixture.own-candidate',
    ownSet,
    (f) => simulateMatch(world, f, false),
    playbackRecord,
  );
  // Every record settles once, on a copy, ledger included (→MATCH-27).
  const settled = structuredClone(world);
  for (const p of [...npcPlaybacks, ...ownPlaybacks])
    record('settlement.candidate', timed(() => recordMatch(settled, p, true))[1]);
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
  // The town's investment row, held from the first season as a founded club holds its rows.
  if (season === 0) w.policy = { ...policyOf(w), localInvest: 2 };
  // A loan bid for the scout's first club player: free agents list first and are never loaned.
  const loanable = transferOffers(w).findIndex(
    (offer) => offer.source.kind === 'club' && offer.available,
  );
  if (
    season % 10 === 0 &&
    loanable >= 0 &&
    w.players.filter((p) => p.status === 'active').length < 26
  )
    operate(w, { type: 'recruit', candidate: loanable, loan: true });
  const stand = nextWork(w, 'stadium');
  if (season % 15 === 0 && stand && !w.facilityWorks?.stadium && available(stand.cost))
    startFacilityWork(w, 'stadium', (fee) => debit(w, fee));
  if (season % 10 === 0 && available(quote(code, w.year, 400))) {
    const candidate = managerCandidates(w).find((offer) => offer.source === 'free');
    if (candidate) operate(w, { type: 'hire', id: candidate.id });
  }
  // Half the season round by round, the rest at once; the coaches set training.
  for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
}
const seasons: Record<string, unknown>[] = [];
for (const [profile, seed] of Object.entries(PERFORMANCE_CONFIG.profiles)) {
  // The released model from the takeover: complete statistics tracked from the first day.
  const w = careerWorld({ country: 'ENG', seed });
  let raw: string | undefined;
  for (let season = 0; season < settings.seasons; season++) {
    const last = season === settings.seasons - 1;
    const [, ms] = timed(() => {
      if (profile === 'active-management') manage(w, season);
      // The last season stops at its final round for the codec: the season's ledger is then at
      // its fullest. simulateSeason plays the same rounds, then closes.
      if (last) while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
    });
    if (last) {
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
  const checkpointBytes = 2 * (raw.length + ACTIVE.length);
  seasons.push({
    profile,
    seed,
    model: MATCH_MODEL_REVISION,
    seasons: w.history.length,
    year: w.year,
    checkpointAt: 'final round of the last season, before its close',
    checkpointChars: raw.length,
    checkpointBytes,
    withinCheckpointLimit: checkpointBytes <= PERFORMANCE_CONFIG.storage.checkpointBytes,
  });
  sampleMemory();
}

// ---- Pilot parity sample of the core condition --------------------------------------------------------
const params = core.params as {
  worldSeeds: string[];
  world: Omit<CareerInput, 'seed'>;
  countries: string[];
  maxRatingGap: number;
  pairing: string;
  tactics: string;
  fixture: { year: number; round: number; kind: Fixture['kind'] };
};
if (params.pairing !== 'world-country-roster' || params.tactics !== 'club')
  throw new Error(`the runner builds only world-country-roster pairs playing their clubs' tactics`);
const pairs = params.worldSeeds.flatMap((seed) => {
  const w = careerWorld({ ...params.world, seed });
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
const pilot: MatchSample[] = [];
for (let i = 0; i < settings.pilot; i++) {
  const { w, home, away } = pairs[i % pairs.length]!;
  const f: Fixture = {
    ...w.fixtures[0]!,
    ...params.fixture,
    id: corpusFixtureId('calibration', core.id, i),
    home: home.id,
    away: away.id,
  };
  // Match strength of two clubs nobody owns: XI ratings and home ground (their manager terms cancel).
  const gap = rating(w, home, f) + 3 - rating(w, away, f);
  pilot.push({
    incidentsTracked: true,
    condition: core.id,
    gap,
    record: simulateAggregate(w, f).record,
  });
}
sampleMemory();
const parity = buildParityReport({
  provenance,
  partition: 'calibration',
  condition: core.id,
  path: 'simulateAggregate (the result path)',
  samples: pilot,
});

// ---- Report -----------------------------------------------------------------------------------------
if (measurementIdentity('scripts/match-model-baseline.ts').sha256 !== computation.sha256)
  throw new Error('Source changed during the measurement; rerun after edits settle');
const components = [...timings.values()];
const performanceReport = buildPerformanceReport({ components, provisional: smoke });
const sortedLoads = [...loads].sort((a, b) => a - b);
const load = {
  samples: loads.length,
  load1Median: loads.length ? Number(median(sortedLoads).toFixed(2)) : null,
  load1Max: loads.length ? Number(sortedLoads.at(-1)!.toFixed(2)) : null,
};
/** The paired ratios to the previous release's report of this runner, when one is named (→ARCH-31). */
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
  model: MATCH_MODEL_REVISION,
  provisional: smoke,
  load,
  pairedComparison,
  pairedNote: pairedWith
    ? 'Ratios pair this run with the named baseline report only when machine, toolchain and worlds match, and settingsMatch says whether both ran the same seasons, fixtures, warm-up and repetitions; ARCH-31 reports them with the release, never as a gate.'
    : 'No paired baseline named (--paired-with); the historic timings under context come from other machines and are never a paired result (→ARCH-31).',
  context: [
    {
      source: 'artifacts/benchmarks/calibration-results.json T224',
      machine: 'Intel Xeon Silver 4214, Node v24.12.0',
      secondsPerSeason: { baselineWorld: 8.43 },
      contextOnly: true,
    },
    {
      source: 'artifacts/benchmarks/calibration-results.json T232 century benchmark',
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
  fixtureSets: {
    world: PERFORMANCE_CONFIG.profiles.baseline,
    npc: npcSet.length,
    own: ownSet.length,
    seasonFixtures: world.fixtures.length,
    /** Stage samples left out because the fixture settled on a retry stream. */
    candidateStageRetries: stageRetries,
  },
  checks,
  performance: performanceReport,
  memory,
  seasons,
  parity,
  elapsedMs: Math.round(performance.now() - started),
};
mkdirSync(dirname(out), { recursive: true });
// Six significant digits keep the report readable without changing any decision it records.
const rounded = (_key: string, value: unknown) =>
  typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(6)) : value;
writeFileSync(out, JSON.stringify(report, rounded, 2) + '\n');

const by = (id: string) => report.performance.components.find((c) => c.id === id)?.medianMs;
const inside = parity.targets.filter((t) => t.status === 'inside').length;
console.log(
  [
    `wrote ${out} (${settings.mode}, ${report.elapsedMs} ms)`,
    `median ms: fixture ${by('fixture.candidate')?.toFixed(3)} (preparation ${by('candidate.preparation')?.toFixed(3)}, generation ${by('candidate.generation')?.toFixed(3)}, attribution ${by('candidate.attribution')?.toFixed(3)}, record ${by('candidate.record')?.toFixed(3)}), own ${by('fixture.own-candidate')?.toFixed(1)}, settlement ${by('settlement.candidate')?.toFixed(3)}; load median ${load.load1Median}, max ${load.load1Max}`,
    `paired ratios: ${pairedComparison ? JSON.stringify(pairedComparison.ratios.map((r) => [r.id, r.status, r.ratio === undefined ? null : Number(r.ratio.toFixed(3))])) : 'none'}`,
    `season s: baseline ${((by('season.baseline') ?? NaN) / 1000).toFixed(2)}, active ${((by('season.active-management') ?? NaN) / 1000).toFixed(2)}`,
    `pilot ${settings.pilot} matches: targets inside ${inside}/${parity.targets.length}, invariant failures ${parity.invariants.filter((x) => x.failed).length}`,
    `checks: ${JSON.stringify(checks)}`,
  ].join('\n'),
);
