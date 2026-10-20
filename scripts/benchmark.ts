import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import {
  activeTrainingFocus,
  createWorld,
  nextWork,
  simulateSeason,
  advanceRound,
  operate,
  quote,
  clubOf,
  operatingCost,
  FOUNDING_YEAR,
  managerCandidates,
  sponsorSlots,
} from '../packages/engine/src/index';
import { COUNTRIES, LOAD_CATALOG } from '../packages/catalogs/src/index';
import { canonical, validateWorld, type World } from '../packages/contracts/src/index';
import {
  encode,
  decode,
  CHECKPOINT_LIMIT,
  TOTAL_LIMIT,
} from '../apps/web/src/adapters/persistence';
import { retainedWorkload } from '../tests/fixtures/retained-workload';
import {
  appearanceSummary,
  assertConsumedChoice,
  assertPendingChoice,
  identityWorkload,
  type IdentityWorkloadEvidence,
} from '../tests/fixtures/identity-workload';
import { payloadBytes } from '../apps/web/src/adapters/compression';
import { pack } from '../apps/web/src/adapters/packing';
const measurements: Record<string, unknown>[] = [];
const workloads: Record<string, unknown>[] = [];
/**
 * The packed checkpoint's streams (top-level keys, objects one level down) by canonical JSON size
 * and by their size compressed alone with the checkpoint's brotli settings (→SAVE-2). Streams
 * compress jointly in the real payload, so the alone sizes rank them; they do not add up to it.
 */
function streamSizes(w: World) {
  const streams: { stream: string; bytes: number; brotliBytes: number }[] = [];
  const add = (stream: string, value: unknown) => {
    const bytes = Buffer.from(canonical(value), 'utf8');
    streams.push({
      stream,
      bytes: bytes.length,
      brotliBytes: brotliCompressSync(bytes, {
        params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_LGWIN]: 24 },
      }).length,
    });
  };
  for (const [key, value] of Object.entries(pack(w)))
    if (value && typeof value === 'object' && !Array.isArray(value))
      for (const [sub, inner] of Object.entries(value)) {
        if (inner !== undefined) add(`${key}.${sub}`, inner);
      }
    else if (value !== undefined) add(key, value);
  return streams.sort((a, b) => b.brotliBytes - a.brotliBytes).slice(0, 15);
}
function sourceFingerprint() {
  const paths = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'apps/web/src',
      'apps/web/index.html',
      'apps/web/public',
      'packages',
      'scripts',
      'patches',
      'tests/fixtures/retained-workload.ts',
      'tests/fixtures/identity-workload.ts',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'apps/web/vite.config.ts',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const file of paths) hash.update(file).update('\0').update(readFileSync(file));
  return { algorithm: 'sha256', sha256: hash.digest('hex'), files: paths.length };
}
const source = sourceFingerprint();
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const gitDirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
let peakObservedHeapBytes = 0;
let worstCheckpointBytes = 0;
let worst = { label: '', world: '' };
/** The world as a load reads it (→SAVE-10); these rules sign by slot, so a load changes nothing. */
const loadedCanonical = (w: World) => canonical(validateWorld(w, LOAD_CATALOG));
async function measure(w: World, label: string) {
  let worldCanonical: string;
  try {
    worldCanonical = loadedCanonical(w);
  } catch (error) {
    writeFileSync('.tmp/release-validation-failure-world.json', canonical(w));
    console.error(`Checkpoint validation failed: ${label}, year ${w.year}, round ${w.round}`);
    throw error;
  }
  for (const cp of COUNTRIES)
    cp.groups.forEach((groups, tier) =>
      groups.forEach((count, group) => {
        if (
          w.clubs.filter(
            (c) =>
              c.country === cp.code && c.tier === tier && c.group === group && !c.representative,
          ).length !== count
        )
          throw new Error('Domestic capacity drift');
      }),
    );
  const t = performance.now(),
    raw = await encode(w, 2, 1),
    encodingMs = performance.now() - t,
    restored = (await decode(raw)).world,
    decodingMs = performance.now() - t - encodingMs;
  if (canonical(restored) !== worldCanonical) throw new Error('Lossless checkpoint failed');
  // Only the active copy lives in localStorage; its previous copy is in IndexedDB (→SAVE-3).
  const checkpointBytes = 2 * (raw.length + 'haeram-soccor:slot:a'.length),
    totalBytes = checkpointBytes + 512;
  const heapBytes = process.memoryUsage().heapUsed;
  peakObservedHeapBytes = Math.max(peakObservedHeapBytes, heapBytes);
  const result = {
    label,
    seasons: w.history.length,
    year: w.year,
    round: w.round,
    ownedMatches: w.ownMatches.length,
    players: w.players.length,
    events: w.events.length,
    seed: w.seed,
    canonicalBytes: Buffer.byteLength(worldCanonical, 'utf8'),
    canonicalUtf16Bytes: worldCanonical.length * 2,
    retainedPeople: Object.keys(w.people ?? {}).length,
    employmentSpells: Object.values(w.people ?? {}).reduce(
      (sum, p) => sum + p.employment.length,
      0,
    ),
    mentorSpells: Object.values(w.people ?? {}).reduce((sum, p) => sum + p.mentors.length, 0),
    coachingProfiles: Object.values(w.people ?? {}).filter((p) => p.coaching).length,
    managerProfiles: Object.values(w.people ?? {}).filter((p) => p.management).length,
    playingCoachProposals: Object.keys(w.playingCoachProposals ?? {}).length,
    mediations: w.mediations?.length ?? 0,
    promises: w.promises?.length ?? 0,
    pendingPromises: w.promises?.filter((p) => p.status === 'pending').length ?? 0,
    trainingFocus: activeTrainingFocus(w),
    trainingAt: w.trainingAt,
    trainingFocusEvents: w.events.filter((event) => event.kind === 'training-focus').length,
    compressedPayloadBytes: payloadBytes(JSON.parse(raw).codec, JSON.parse(raw).payload).length,
    checkpointBytes,
    totalBytes,
    heapBytes,
    encodingMs: Math.round(encodingMs),
    decodingMs: Math.round(decodingMs),
    passed: checkpointBytes <= CHECKPOINT_LIMIT && totalBytes <= TOTAL_LIMIT,
  };
  measurements.push(result);
  console.error(
    `${label}: ${checkpointBytes} checkpoint bytes, ${result.retainedPeople} people, ${result.promises} promises`,
  );
  if (checkpointBytes > worstCheckpointBytes) {
    worstCheckpointBytes = checkpointBytes;
    worst = { label, world: worldCanonical };
    writeFileSync('.tmp/release-storage-worst-world.json', worldCanonical);
    writeFileSync('.tmp/release-storage-worst.haeram-save.json', raw);
    writeFileSync(
      '.tmp/release-storage-worst-metrics.json',
      JSON.stringify({ ...result, sourceFingerprint: source }, null, 2) + '\n',
    );
  }
  if (!result.passed) {
    writeFileSync('.tmp/release-storage-failure-world.json', worldCanonical);
    writeFileSync('.tmp/release-storage-failure.haeram-save.json', raw);
    writeFileSync(
      '.tmp/release-storage-failure-metrics.json',
      JSON.stringify(
        { ...result, streams: streamSizes(JSON.parse(worldCanonical)), sourceFingerprint: source },
        null,
        2,
      ) + '\n',
    );
    throw new Error('Long-career storage budget failed: ' + JSON.stringify(result));
  }
  return { raw, restored };
}
function retainedFacts(w: World) {
  return { history: [...w.history], ownMatches: [...w.ownMatches], events: [...w.events] };
}
function assertRetained(w: World, before: ReturnType<typeof retainedFacts>) {
  for (const key of ['history', 'ownMatches', 'events'] as const)
    if (before[key].some((fact, index) => w[key][index] !== fact))
      throw new Error('History retention failed: ' + key);
}
const start = performance.now();
mkdirSync('.tmp', { recursive: true });
const retained = retainedWorkload();
const focused = retained.w;
const first = await measure(focused, 'marked synthetic retained career and cross-season promise');
for (const id of [retained.playing, retained.former])
  if (canonical(first.restored.people![id]) !== canonical(focused.people![id]))
    throw Error('Retained identity changed');
if (
  !focused.people![retained.former].management ||
  focused.manager.person !== retained.former ||
  focused.playingCoachProposals![retained.playing].status !== 'accepted' ||
  !focused.promises?.some((p) => p.status === 'pending' && p.deadline.year > focused.year)
)
  throw Error(
    'Feature workload did not exercise actual contracts, qualification, appointment and cross-season commitments',
  );
simulateSeason(focused);
const crossed = await measure(focused, 'retained workload after actual season close');
if (!crossed.restored.promises?.some((p) => p.status === 'pending'))
  throw Error('Cross-season promise was lost');

/** What the active-management career's identity workload did and what its final checkpoint kept. */
let identityEvidence:
  | (IdentityWorkloadEvidence & {
      profile: string;
      seed: string;
      checkpointLabel: string;
      checkpointAppearances: ReturnType<typeof appearanceSummary>;
      pendingChoiceDecoded: boolean;
      resumedSettlementConsumed: { uninterrupted: boolean; restored: boolean };
    })
  | undefined;
for (const variant of ['baseline', 'active-management']) {
  const workloadStart = performance.now();
  let trainingSelections = 0;
  // T255: the owner's own design at each active-management season's start and a shirt for the
  // fixture after the century checkpoint, through the real club-identity and match-kit commands.
  // Cosmetic only (KIT-13); it adds to the business and training actions, never replaces them.
  const identity = variant === 'active-management' ? identityWorkload() : undefined;
  // Engine time of the career's seasons alone: no checkpoint codec, replay check or mid-career branch.
  let simulationMs = 0;
  const w = createWorld({
    country: 'ENG',
    name: variant === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed: 'release-century-' + variant,
    level: 'easy',
  });
  await measure(w, variant + ' founding');
  for (let n = 0; n < 100; n++) {
    const before = retainedFacts(w);
    // Before the season's business and training; its recorded-appearance checks stay out of the
    // engine time below.
    identity?.edit(w, n);
    const seasonStart = performance.now();
    if (variant === 'active-management') {
      const code = clubOf(w).country;
      const available = (cost: string) => BigInt(w.cash) > BigInt(cost) + BigInt(operatingCost(w));
      // Every open, empty sponsor slot: the inflation-linked offer (listed last) every fourth season.
      for (const view of sponsorSlots(w))
        if (view.offers.length)
          operate(w, {
            type: 'sign-sponsor',
            slot: view.slot,
            offer: n % 4 === 0 ? view.offers.length - 1 : 0,
          });
      // The town's investment row in place of the outreach campaigns (→ECON-7).
      if (n === 0) operate(w, { type: 'policy', key: 'localInvest', level: 2 });
      if (n % 10 === 0 && w.players.filter((p) => p.status === 'active').length < 26)
        operate(w, { type: 'recruit', candidate: 0, loan: true });
      const stand = nextWork(w, 'stadium');
      if (n % 15 === 0 && stand && !w.facilityWorks?.stadium && available(stand.cost))
        operate(w, { type: 'facility', part: 'stadium' });
      if (n % 10 === 0 && available(quote(code, w.year, 400))) {
        const candidate = managerCandidates(w).find((offer) => offer.source === 'free');
        if (candidate) operate(w, { type: 'hire', id: candidate.id });
      }
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      trainingSelections++;
      for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
      trainingSelections++;
    }
    simulateSeason(w);
    simulationMs += performance.now() - seasonStart;
    assertRetained(w, before);
    if (w.history.length !== n + 1) throw new Error('Missing completed season archive');
    if ((n + 1) % 10 === 0)
      console.error(
        `${variant}: ${n + 1}/100 seasons, ${Object.keys(w.people ?? {}).length} retained people`,
      );
    if (n === 49) {
      const mid = structuredClone(w);
      if (variant === 'active-management')
        operate(mid, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      for (let i = 0; i < 23; i++) advanceRound(mid, undefined, false);
      const { restored } = await measure(mid, variant + ' mid-career active round');
      simulateSeason(mid);
      simulateSeason(restored);
      if (loadedCanonical(mid) !== loadedCanonical(restored))
        throw new Error('Resumed season differs from uninterrupted engine');
    }
  }
  const { raw } = await measure(w, variant + ' century');
  if (variant === 'baseline') writeFileSync('.tmp/release-century.haeram-save.json', raw);
  const leagueTiers = (index: number) =>
    COUNTRIES.find((country) => country.code === w.clubs[index].country)!.groups.length;
  const leagueClubs = w.clubs.filter(
    (club, index) => !club.representative && club.tier < leagueTiers(index),
  ).length;
  const ownIndex = w.clubs.findIndex((club) => club.id === w.playerClub);
  if (
    w.history.length !== 100 ||
    w.history.some(
      (season, index) =>
        season.year !== FOUNDING_YEAR + index ||
        season.champions.length !== COUNTRIES.length ||
        // Every league club once, plus the own club in a season it spent in the amateur league.
        season.standings.filter((row) => row[1] < leagueTiers(row[0])).length !== leagueClubs ||
        season.standings.some((row) => row[1] >= leagueTiers(row[0]) && row[0] !== ownIndex),
    ) ||
    !w.ownMatches.some((match) => match.year === FOUNDING_YEAR) ||
    !w.events.some((event) => event.kind === 'founding')
  )
    throw new Error('Century own-club/global archival coverage failed');
  if (variant === 'active-management') {
    const before = retainedFacts(w);
    // The 101st season starts like the others: the season's design first.
    identity!.edit(w, 100);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
    for (let round = 0; round < 12; round++) advanceRound(w, undefined, false);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
    for (let round = 12; round < 23; round++) advanceRound(w, undefined, false);
    assertRetained(w, before);
    if (w.history.length !== 100 || w.round !== 23 || w.trainingAt !== `${w.year}:23`)
      throw new Error('Century active checkpoint was not settled at round 23');
    // The checkpoint carries a pending own-shirt choice for the real next own fixture (SAVE-20).
    const choice = identity!.chooseKit(w);
    const checkpointLabel = variant + ' century active round 23';
    const checkpointAppearances = appearanceSummary(w);
    const { restored } = await measure(w, checkpointLabel);
    assertPendingChoice(restored, choice);
    const continued = structuredClone(w);
    simulateSeason(continued);
    simulateSeason(restored);
    if (loadedCanonical(continued) !== loadedCanonical(restored))
      throw new Error('Resumed century active checkpoint differs from uninterrupted engine');
    // Both resumed careers wear the chosen shirt in that fixture and use the choice up there.
    assertConsumedChoice(continued, choice);
    assertConsumedChoice(restored, choice);
    identityEvidence = {
      profile: variant,
      seed: w.seed,
      ...identity!.evidence(),
      checkpointLabel,
      checkpointAppearances,
      pendingChoiceDecoded: true,
      resumedSettlementConsumed: { uninterrupted: true, restored: true },
    };
  }
  const elapsedMs = performance.now() - workloadStart;
  workloads.push({
    variant,
    seed: w.seed,
    completedSeasons: 100,
    careerDomesticRoundSettlements: variant === 'active-management' ? 4623 : 4600,
    completeSeasonTrainingSelections: trainingSelections,
    identityEdits: identity?.evidence().edits ?? 0,
    centuryActiveCheckpointTrainingSelections: variant === 'active-management' ? 2 : 0,
    trainingCycle:
      variant === 'active-management'
        ? '23 youth rounds then 23 recovery rounds each season; century checkpoint adds 12 youth and 11 recovery rounds'
        : 'balanced',
    elapsedMs: Math.round(elapsedMs),
    completedSeasonsPerSecond: Math.round((100000 / elapsedMs) * 100) / 100,
    simulationMs: Math.round(simulationMs),
    simulationSecondsPerSeason: Math.round(simulationMs / 100) / 1000,
    ownedMatches: w.ownMatches.length,
    ownedMatchesPerSecond: Math.round((w.ownMatches.length * 100000) / elapsedMs) / 100,
    allRetainedFactsPreserved: true,
  });
}
// Separate era probe crosses the 2024 transition after a century without claiming an unbounded storage guarantee.
const era = createWorld({
  country: 'FRA',
  name: 'Era Laboratory',
  color: '#3f5566',
  seed: 'era-probe',
  level: 'easy',
});
for (let year = FOUNDING_YEAR; year < 2025; year++) simulateSeason(era);
validateWorld(era, LOAD_CATALOG);
if (
  !era.history.find((h) => h.year === 2024)?.europe.some((e) => e.kind === 'uecl' && e.field === 36)
)
  throw new Error('2024 era archival gate failed');
if (!identityEvidence) throw new Error('Active-management identity workload did not run');
if (sourceFingerprint().sha256 !== source.sha256)
  throw new Error('Source changed during storage verification; rerun after edits settle');
const report = {
  phase:
    'T232 rules 4.0.0 (grid own matches, discipline, post-match material, season heat) on the T010 workloads: money/personnel/commercial operations and all continental summaries; T255 adds the deterministic club-identity workload and a pending next-fixture shirt to the active-management profile',
  synthetic: true,
  date: new Date().toISOString(),
  node: process.version,
  toolchain: {
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    typescript: JSON.parse(readFileSync('node_modules/typescript/package.json', 'utf8')).version,
    tsx: JSON.parse(readFileSync('node_modules/tsx/package.json', 'utf8')).version,
  },
  host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  gitHead,
  gitDirty,
  currentHeadVerified: !gitDirty,
  verifiedSource: gitDirty ? 'uncommitted working tree' : 'committed HEAD',
  sourceFingerprint: source,
  engine: era.engine,
  catalog: era.catalog,
  catalogHash: era.catalogHash,
  checkpointLimit: CHECKPOINT_LIMIT,
  totalLimit: TOTAL_LIMIT,
  measurements,
  worstCheckpoint: {
    label: worst.label,
    checkpointBytes: worstCheckpointBytes,
    streams: streamSizes(JSON.parse(worst.world)),
  },
  workloads,
  centuryCheckpointSha256: createHash('sha256')
    .update(readFileSync('.tmp/release-century.haeram-save.json'))
    .digest('hex'),
  eraProbe: { seasons: 2025 - FOUNDING_YEAR, year: era.year, passed: true },
  identityWorkload: identityEvidence,
  elapsedMs: Math.round(performance.now() - start),
  heapBytes: process.memoryUsage().heapUsed,
  peakObservedHeapBytes,
  losslessRoundtrip: true,
  resumedSeasonReplay: true,
  passed: true,
  scope: `Two representative 100-season workloads, with real youth/recovery round training in the active profile, a settled round-23 checkpoint after 100 seasons, an own design applied through the club-identity command at each active season start (${identityEvidence.edits} edits) and a pending match-kit choice in the round-23 checkpoint that both resumed careers wear and use up, recorded appearances compared before and after every such command, eight-country archive/capacity checks and a separate 1950–2025 era probe. Every checkpoint must round-trip the complete canonical world without loss; save limits and history retention remain unchanged. Throughput includes codec/replay checks; peak heap is sampled at checkpoints. No claim that all seeds/actions fit indefinitely. Direct engine harness records but does not stop at UI warnings.`,
};
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/T010-storage.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync('docs/benchmarks/T232-rules4-storage.json', JSON.stringify(report, null, 2) + '\n');
// T255 feature evidence: this run's storage facts and identity workload on the same source
// fingerprint. `storagePassed` covers this script only; `pnpm run benchmark:browser` fills
// `browser` from its own measurements, and `null` there means it has not run on this source.
const { passed: storagePassed, ...storage } = report;
writeFileSync(
  'docs/benchmarks/club-identity-final.json',
  JSON.stringify(
    {
      task: 'T255',
      feature: 'Club identity and kits (KIT r2, SAVE-20–22) on the final combined source',
      ...storage,
      storagePassed,
      storageReport: 'docs/benchmarks/T010-storage.json',
      browser: null,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(report, null, 2));
