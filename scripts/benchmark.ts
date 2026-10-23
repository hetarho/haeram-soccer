import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import { join } from 'node:path';
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
  managerHireCost,
  managerPayoff,
  sponsorSlots,
} from '../packages/engine/src/index';
import { COUNTRIES, LOAD_CATALOG } from '../packages/catalogs/src/index';
import { canonical, validateWorld, type World } from '../packages/contracts/src/index';
import { managerHistoryDateKey } from '../packages/contracts/src/manager-history';
import type { ManagerHistoryPage } from '../packages/contracts/src/manager-history-view';
import {
  encode,
  decode,
  CHECKPOINT_LIMIT,
  TOTAL_LIMIT,
} from '../apps/web/src/adapters/persistence';
import { Host } from '../apps/web/src/runtime/host';
import { retainedWorkload } from '../tests/fixtures/retained-workload';
import {
  appearanceSummary,
  assertConsumedChoice,
  assertPendingChoice,
  identityWorkload,
  type IdentityWorkloadEvidence,
  type IdentityWorkloadState,
  type WorkloadKitChoice,
} from '../tests/fixtures/identity-workload';
import { payloadBytes } from '../apps/web/src/adapters/compression';
import { pack } from '../apps/web/src/adapters/packing';

/**
 * The storage benchmark in phases (T308): `pnpm run benchmark` runs every phase in one process,
 * `pnpm run benchmark --phase <name>` runs one, so a session whose commands stop after ten minutes
 * runs the same benchmark command by command. A phase keeps its results and the worlds a later
 * phase measures under `.tmp/benchmark/<source fingerprint>/`, so phases of different sources
 * never mix, and `report` assembles them and fails unless every phase ran on this source.
 * `--smoke` runs two seasons a profile into a directory of its own and writes no report.
 */
const PHASES = [
  'retained',
  'baseline-1',
  'baseline-2',
  'baseline-checkpoints',
  'active-management-1',
  'active-management-2',
  'active-management-checkpoints',
  'era-1',
  'era-2',
  'report',
] as const;
type Phase = (typeof PHASES)[number];
const VARIANTS = ['baseline', 'active-management'] as const;
type Variant = (typeof VARIANTS)[number];
const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const named =
  args.find((arg) => arg.startsWith('--phase='))?.slice('--phase='.length) ??
  (args.includes('--phase') ? args[args.indexOf('--phase') + 1] : undefined);
if (named !== undefined && !PHASES.includes(named as Phase))
  throw new Error(`Unknown phase ${named}; the phases are ${PHASES.join(', ')}`);
const SEASONS = smoke ? 2 : 100;
/** A profile's first phase plays the seasons before this one, its second the rest. */
const HALF = SEASONS / 2;
/** The season after whose close the mid-career branch plays its active round. */
const MID_SEASON = HALF - 1;
const ERA_END = smoke ? FOUNDING_YEAR + 2 : 2025;
const ERA_HALF = smoke ? FOUNDING_YEAR + 1 : 1988;

let measurements: Record<string, unknown>[] = [];
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
const state = join('.tmp', 'benchmark', source.sha256.slice(0, 16) + (smoke ? '-smoke' : ''));
mkdirSync(state, { recursive: true });
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
let current: Phase = 'retained';
let peakObservedHeapBytes = 0;
let worst = { label: '', checkpointBytes: 0 };
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
    managerTenures: w.managerHistory?.tenures.length ?? 0,
    managerOutcomes: w.managerHistory?.outcomes.length ?? 0,
    container: JSON.parse(raw).schema,
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
    `${label}: ${checkpointBytes} checkpoint bytes, ${result.retainedPeople} people, ${result.promises} promises, ${result.managerTenures} tenures`,
  );
  if (checkpointBytes > worst.checkpointBytes) {
    worst = { label, checkpointBytes };
    writeFileSync(join(state, `worst-${current}.world.json`), worldCanonical);
    writeFileSync(join(state, `worst-${current}.haeram-save.json`), raw);
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

/** A world a later phase measures, as JSON, which keeps every world fact exactly. */
const saveWorld = (name: string, w: World) =>
  writeFileSync(join(state, `${name}.world.json`), JSON.stringify(w));
function loadWorld(name: string): World {
  const file = join(state, `${name}.world.json`);
  if (!existsSync(file)) throw new Error(`Run the phase that keeps ${name} on this source first`);
  return JSON.parse(readFileSync(file, 'utf8')) as World;
}
interface PhaseResult<T = unknown> {
  phase: Phase;
  date: string;
  elapsedMs: number;
  measurements: Record<string, unknown>[];
  peakObservedHeapBytes: number;
  worst: { label: string; checkpointBytes: number };
  data: T;
}
function loadPhase<T>(phase: Phase): PhaseResult<T> {
  const file = join(state, `${phase}.json`);
  if (!existsSync(file)) throw new Error(`Run --phase ${phase} on this source first`);
  return JSON.parse(readFileSync(file, 'utf8')) as PhaseResult<T>;
}

const profileWorld = (variant: Variant) =>
  createWorld({
    country: 'ENG',
    name: variant === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed: 'release-century-' + variant,
    level: 'easy',
  });
const checkpointLabel = (variant: Variant) =>
  variant === 'active-management'
    ? `${variant} century active round 23`
    : `${variant} century round 23`;

/**
 * T308: the owner appoints a free agent, replaces him with another the same day and then appoints
 * the first again: three tenures on one date, one manager holding two of them, each replaced one
 * paid off like any other (→HIST-18, STAFF-17). Every hire is made only while the club can pay it
 * and still cover its fixed costs.
 */
function reappointSameDay(w: World) {
  const affordable = (id: string) => {
    const offer = managerCandidates(w).find((candidate) => candidate.id === id);
    return (
      !!offer &&
      BigInt(w.cash) > managerHireCost(offer) + BigInt(managerPayoff(w)) + BigInt(operatingCost(w))
    );
  };
  const free = () => managerCandidates(w).filter((offer) => offer.source === 'free');
  const first = free()[0];
  if (!first || !affordable(first.id)) return false;
  operate(w, { type: 'hire', id: first.id });
  const second = free().find((offer) => offer.id !== first.id);
  if (!second || !affordable(second.id)) return false;
  operate(w, { type: 'hire', id: second.id });
  if (!affordable(first.id)) return false;
  operate(w, { type: 'hire', id: first.id });
  return true;
}

/** What a checkpoint's manager-history facts hold (→HIST-18/19, SAVE-24). */
function managerFacts(w: World) {
  const facts = w.managerHistory;
  if (!facts) throw new Error('A century profile carries no manager-history facts');
  const { tenures, outcomes } = facts;
  const per = new Map<string, number>(),
    played = new Map<string, number>();
  for (const tenure of tenures) per.set(tenure.manager, (per.get(tenure.manager) ?? 0) + 1);
  for (const match of w.ownMatches)
    if (match.managerTenure)
      played.set(match.managerTenure, (played.get(match.managerTenure) ?? 0) + 1);
  const tally = (values: string[]) =>
    Object.fromEntries(
      [...new Set(values)].sort().map((value) => [value, values.filter((v) => v === value).length]),
    );
  const section = pack(w).managerHistory,
    sectionText = canonical(section ?? null);
  return {
    coverage: facts.coverage,
    trackedFrom: facts.trackedFrom,
    serial: facts.serial,
    tenures: tenures.length,
    interimTenures: tenures.filter((tenure) => tenure.interim).length,
    zeroMatchTenures: tenures.filter((tenure) => !played.has(tenure.id)).length,
    repeatedManagers: [...per.values()].filter((count) => count > 1).length,
    sameDayAppointments: tenures.filter((tenure, index) => {
      const previous = tenures[index - 1]?.appointed;
      return (
        !!tenure.appointed &&
        !!previous &&
        managerHistoryDateKey(tenure.appointed) === managerHistoryDateKey(previous)
      );
    }).length,
    departures: tally(tenures.flatMap((tenure) => (tenure.departure ? [tenure.departure] : []))),
    outcomes: tally(outcomes.map((outcome) => outcome.source.kind)),
    attributedMatches: w.ownMatches.filter((match) => match.managerTenure).length,
    unattributedMatches: w.ownMatches.filter((match) => !match.managerTenure).length,
    packedSection: {
      canonicalBytes: Buffer.byteLength(sectionText, 'utf8'),
      brotliBytes: brotliCompressSync(Buffer.from(sectionText, 'utf8'), {
        params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_LGWIN]: 24 },
      }).length,
    },
  };
}
/** Facts, dates, sources and every record's link, the same after the checkpoint as before it. */
const sameManagerHistory = (a: World, b: World) =>
  canonical(a.managerHistory) === canonical(b.managerHistory) &&
  a.ownMatches.length === b.ownMatches.length &&
  a.ownMatches.every((match, index) => match.managerTenure === b.ownMatches[index]!.managerTenure);
/** The records room's whole read of `w`, page by page through the worker host (T307). */
async function managerRead(w: World) {
  const host = new Host(),
    before = canonical(w);
  host.world = w;
  const pages: ManagerHistoryPage[] = [];
  let cursor: string | undefined,
    firstPageMs = 0,
    largestReplyBytes = 0;
  const started = performance.now();
  do {
    const reply = await host.handle({
      protocol: 1,
      session: 'benchmark',
      requestId: `manager-history-${pages.length}`,
      expectedRevision: -1,
      generation: 1,
      parentGeneration: 0,
      body: { type: 'manager-history', world: w.id, ...(cursor ? { cursor } : {}) },
    });
    if (!reply.ok || !reply.managerHistory)
      throw new Error('Manager-history read failed: ' + reply.error);
    if (!pages.length) firstPageMs = performance.now() - started;
    largestReplyBytes = Math.max(largestReplyBytes, JSON.stringify(reply.managerHistory).length);
    pages.push(reply.managerHistory);
    cursor = reply.managerHistory.nextCursor ?? undefined;
  } while (cursor);
  const allPagesMs = performance.now() - started;
  const rows = pages.flatMap((page) => page.rows);
  const tenureRows = rows.filter((row) => row.kind === 'tenure');
  if (rows.length !== pages[0]!.total || new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error('Manager-history pages do not cover their rows exactly once');
  if (canonical(w) !== before) throw new Error('A manager-history read changed the world');
  return {
    pages: pages.length,
    pageSize: pages[0]!.pageSize,
    rows: rows.length,
    tenureRows: tenureRows.length,
    legacyRows: rows.length - tenureRows.length,
    recordedMatches: tenureRows.reduce((sum, row) => sum + (row.summary?.record.played ?? 0), 0),
    honours: tenureRows.reduce((sum, row) => sum + (row.summary?.honours.length ?? 0), 0),
    firstPageMs: Math.round(firstPageMs),
    allPagesMs: Math.round(allPagesMs),
    largestReplyBytes,
  };
}
type ManagerEvidence = ReturnType<typeof managerFacts> & {
  read: Awaited<ReturnType<typeof managerRead>>;
  roundTrip: boolean;
};
/** The facts a century profile must hold, read back exactly and in full. */
async function managerEvidence(variant: Variant, w: World, restored: World) {
  const evidence: ManagerEvidence = {
    ...managerFacts(w),
    read: await managerRead(restored),
    roundTrip: sameManagerHistory(w, restored),
  };
  const failures = [
    evidence.roundTrip || 'facts or links changed through the checkpoint',
    evidence.coverage === 'founding' || 'not tracked from the founding',
    evidence.unattributedMatches === 0 || 'own matches without a tenure',
    evidence.outcomes['league-finish'] === w.history.length || 'a closed season without its finish',
    evidence.read.tenureRows === evidence.tenures || 'the read misses tenures',
    evidence.read.recordedMatches === evidence.attributedMatches || 'the read misses matches',
    evidence.interimTenures > 0 || 'no interim tenure',
    variant === 'baseline' ||
      smoke ||
      (evidence.repeatedManagers > 0 && evidence.sameDayAppointments >= 2) ||
      'no repeated same-day appointment',
  ].filter((check) => check !== true);
  if (failures.length && !smoke)
    throw new Error(`${variant} manager history: ${failures.join('; ')}`);
  return evidence;
}

interface ProfileData {
  variant: Variant;
  seed: string;
  trainingSelections: number;
  simulationMs: number;
  ownedMatches: number;
  identityEdits: number;
  /** Days the owner appointed, replaced and reappointed a manager (T308). */
  sameDayReappointments: number;
  ownerHires: number;
  identity?: IdentityWorkloadEvidence & {
    choice: WorkloadKitChoice;
    checkpointAppearances: ReturnType<typeof appearanceSummary>;
  };
}
/** What a profile's first half hands its second, with the world it left. */
interface HalfData {
  trainingSelections: number;
  simulationMs: number;
  sameDayReappointments: number;
  ownerHires: number;
  identity?: IdentityWorkloadState;
}
/**
 * Seasons `from` up to `to` of a profile with its owner workload, the counters in `tally`. Engine
 * time counts the seasons alone; the mid-career branch's active round is kept for the
 * checkpoints phase.
 */
function playSeasons(
  variant: Variant,
  w: World,
  from: number,
  to: number,
  tally: HalfData,
  identity: ReturnType<typeof identityWorkload> | undefined,
) {
  for (let n = from; n < to; n++) {
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
        if (candidate) {
          operate(w, { type: 'hire', id: candidate.id });
          tally.ownerHires++;
        }
      }
      // T308: a repeated appointment, three tenures on one day, four times a century.
      if (n % 25 === 5 && reappointSameDay(w)) tally.sameDayReappointments++;
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      tally.trainingSelections++;
      for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
      tally.trainingSelections++;
    }
    simulateSeason(w);
    tally.simulationMs += performance.now() - seasonStart;
    assertRetained(w, before);
    if (w.history.length !== n + 1) throw new Error('Missing completed season archive');
    if ((n + 1) % 10 === 0)
      console.error(
        `${variant}: ${n + 1}/${SEASONS} seasons, ${Object.keys(w.people ?? {}).length} retained people, ${w.managerHistory?.tenures.length} tenures`,
      );
    if (n === MID_SEASON) {
      const mid = structuredClone(w);
      if (variant === 'active-management')
        operate(mid, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
      for (let i = 0; i < 23; i++) advanceRound(mid, undefined, false);
      saveWorld(`${variant}-mid`, mid);
    }
  }
}
/** T255's identity workload: in the active profile only. */
const workloadFor = (variant: Variant, state?: IdentityWorkloadState) =>
  // The owner's own design at each active-management season's start and a shirt for the fixture
  // after the century checkpoint, through the real club-identity and match-kit commands. Cosmetic
  // only (KIT-13); it adds to the business and training actions, never replaces them.
  variant === 'active-management' ? identityWorkload(state) : undefined;
/** A profile's founding checkpoint and its first half, the world kept for the second. */
async function firstHalf(variant: Variant): Promise<HalfData> {
  const tally: HalfData = {
    trainingSelections: 0,
    simulationMs: 0,
    sameDayReappointments: 0,
    ownerHires: 0,
  };
  const identity = workloadFor(variant);
  const w = profileWorld(variant);
  await measure(w, variant + ' founding');
  playSeasons(variant, w, 0, HALF, tally, identity);
  saveWorld(`${variant}-half`, w);
  return { ...tally, ...(identity ? { identity: identity.state() } : {}) };
}
/**
 * A profile's second half from the world and workload the first kept: the century, its archive
 * checks and the settled round after it, both kept for `<variant>-checkpoints`.
 */
async function secondHalf(variant: Variant): Promise<ProfileData> {
  const { identity: state, ...counted } = loadPhase<HalfData>(`${variant}-1`).data;
  const tally: HalfData = { ...counted };
  const identity = workloadFor(variant, state);
  const w = loadWorld(`${variant}-half`);
  playSeasons(variant, w, HALF, SEASONS, tally, identity);
  const { trainingSelections, simulationMs, sameDayReappointments, ownerHires } = tally;
  const leagueTiers = (index: number) =>
    COUNTRIES.find((country) => country.code === w.clubs[index].country)!.groups.length;
  const leagueClubs = w.clubs.filter(
    (club, index) => !club.representative && club.tier < leagueTiers(index),
  ).length;
  const ownIndex = w.clubs.findIndex((club) => club.id === w.playerClub);
  if (
    w.history.length !== SEASONS ||
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
  saveWorld(`${variant}-century`, w);
  // The season after the century, settled to round 23 (T308 adds it to the baseline as well).
  const before = retainedFacts(w);
  if (identity) {
    // The 101st season starts like the others: the season's design first.
    identity.edit(w, SEASONS);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
    for (let round = 0; round < 12; round++) advanceRound(w, undefined, false);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
    for (let round = 12; round < 23; round++) advanceRound(w, undefined, false);
  } else for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
  assertRetained(w, before);
  if (
    w.history.length !== SEASONS ||
    w.round !== 23 ||
    (identity && w.trainingAt !== `${w.year}:23`)
  )
    throw new Error('Century active checkpoint was not settled at round 23');
  // The active checkpoint carries a pending own-shirt choice for the real next own fixture (SAVE-20).
  const choice = identity?.chooseKit(w);
  const checkpointAppearances = identity && appearanceSummary(w);
  saveWorld(`${variant}-round23`, w);
  return {
    variant,
    seed: w.seed,
    trainingSelections,
    simulationMs: Math.round(simulationMs),
    ownedMatches: w.ownMatches.length,
    identityEdits: identity?.evidence().edits ?? 0,
    sameDayReappointments,
    ownerHires,
    ...(identity && choice && checkpointAppearances
      ? { identity: { ...identity.evidence(), choice, checkpointAppearances } }
      : {}),
  };
}

interface CheckpointData {
  centuryCheckpointSha256?: string;
  manager: { century: ManagerEvidence; round23: ManagerEvidence };
}
/**
 * A profile's kept worlds measured and resumed: the mid-career active round and the round after
 * the century each settle the rest of their season identically from the checkpoint, the century
 * checkpoint and the round after it keep every manager fact, and the active profile's pending
 * shirt is worn and used up on both paths.
 */
async function checkpoints(variant: Variant): Promise<CheckpointData> {
  const played = loadPhase<ProfileData>(`${variant}-2`).data;
  const mid = loadWorld(`${variant}-mid`);
  const { restored: resumed } = await measure(mid, variant + ' mid-career active round');
  simulateSeason(mid);
  simulateSeason(resumed);
  if (loadedCanonical(mid) !== loadedCanonical(resumed))
    throw new Error('Resumed season differs from uninterrupted engine');
  const century = loadWorld(`${variant}-century`);
  const { raw, restored } = await measure(century, variant + ' century');
  const atCentury = await managerEvidence(variant, century, restored);
  let centuryCheckpointSha256: string | undefined;
  if (variant === 'baseline') {
    writeFileSync('.tmp/release-century.haeram-save.json', raw);
    centuryCheckpointSha256 = sha256(raw);
  }
  const active = loadWorld(`${variant}-round23`);
  const { restored: back } = await measure(active, checkpointLabel(variant));
  const atRound = await managerEvidence(variant, active, back);
  if (played.identity) assertPendingChoice(back, played.identity.choice);
  const continued = structuredClone(active);
  simulateSeason(continued);
  simulateSeason(back);
  if (loadedCanonical(continued) !== loadedCanonical(back))
    throw new Error('Resumed century active checkpoint differs from uninterrupted engine');
  // Both resumed careers wear the chosen shirt in that fixture and use the choice up there.
  if (played.identity) {
    assertConsumedChoice(continued, played.identity.choice);
    assertConsumedChoice(back, played.identity.choice);
  }
  return {
    ...(centuryCheckpointSha256 ? { centuryCheckpointSha256 } : {}),
    manager: { century: atCentury, round23: atRound },
  };
}

async function retained() {
  const workload = retainedWorkload();
  const focused = workload.w;
  const first = await measure(focused, 'marked synthetic retained career and cross-season promise');
  for (const id of [workload.playing, workload.former])
    if (canonical(first.restored.people![id]) !== canonical(focused.people![id]))
      throw Error('Retained identity changed');
  if (
    !focused.people![workload.former].management ||
    focused.manager.person !== workload.former ||
    focused.playingCoachProposals![workload.playing].status !== 'accepted' ||
    !focused.promises?.some((p) => p.status === 'pending' && p.deadline.year > focused.year)
  )
    throw Error(
      'Feature workload did not exercise actual contracts, qualification, appointment and cross-season commitments',
    );
  simulateSeason(focused);
  const crossed = await measure(focused, 'retained workload after actual season close');
  if (!crossed.restored.promises?.some((p) => p.status === 'pending'))
    throw Error('Cross-season promise was lost');
  return {};
}

// Separate era probe crosses the 2024 transition after a century without claiming an unbounded
// storage guarantee: up to ERA_HALF in its first phase, then on from the world it kept.
function eraFirst() {
  const era = createWorld({
    country: 'FRA',
    name: 'Era Laboratory',
    color: '#3f5566',
    seed: 'era-probe',
    level: 'easy',
  });
  for (let year = FOUNDING_YEAR; year < ERA_HALF; year++) simulateSeason(era);
  saveWorld('era-half', era);
  return {};
}
function eraProbe() {
  const era = loadWorld('era-half');
  for (let year = ERA_HALF; year < ERA_END; year++) simulateSeason(era);
  validateWorld(era, LOAD_CATALOG);
  if (
    !smoke &&
    !era.history
      .find((h) => h.year === 2024)
      ?.europe.some((e) => e.kind === 'uecl' && e.field === 36)
  )
    throw new Error('2024 era archival gate failed');
  return {
    eraProbe: { seasons: ERA_END - FOUNDING_YEAR, year: era.year, passed: true },
    engine: era.engine,
    catalog: era.catalog,
    catalogHash: era.catalogHash,
  };
}

async function run(phase: Phase): Promise<unknown> {
  switch (phase) {
    case 'retained':
      return retained();
    case 'baseline-1':
      return firstHalf('baseline');
    case 'baseline-2':
      return secondHalf('baseline');
    case 'active-management-1':
      return firstHalf('active-management');
    case 'active-management-2':
      return secondHalf('active-management');
    case 'baseline-checkpoints':
      return checkpoints('baseline');
    case 'active-management-checkpoints':
      return checkpoints('active-management');
    case 'era-1':
      return eraFirst();
    case 'era-2':
      return eraProbe();
    case 'report':
      return report();
  }
}

function report() {
  const results = Object.fromEntries(
    PHASES.filter((phase) => phase !== 'report').map((phase) => [phase, loadPhase(phase)]),
  ) as Record<Exclude<Phase, 'report'>, PhaseResult>;
  const all = Object.values(results);
  const profiles = Object.fromEntries(
    VARIANTS.map((variant) => [
      variant,
      {
        started: results[`${variant}-1`],
        played: results[`${variant}-2`] as PhaseResult<ProfileData>,
        checked: results[`${variant}-checkpoints`] as PhaseResult<CheckpointData>,
      },
    ]),
  ) as Record<
    Variant,
    { started: PhaseResult; played: PhaseResult<ProfileData>; checked: PhaseResult<CheckpointData> }
  >;
  const era = results['era-2'].data as ReturnType<typeof eraProbe>;
  const worstPhase = all.reduce((a, b) =>
    b.worst.checkpointBytes > a.worst.checkpointBytes ? b : a,
  );
  const worstWorld = readFileSync(join(state, `worst-${worstPhase.phase}.world.json`), 'utf8');
  writeFileSync('.tmp/release-storage-worst-world.json', worstWorld);
  writeFileSync(
    '.tmp/release-storage-worst.haeram-save.json',
    readFileSync(join(state, `worst-${worstPhase.phase}.haeram-save.json`), 'utf8'),
  );
  const workloads = VARIANTS.map((variant) => {
    const { started, played, checked } = profiles[variant];
    const elapsedMs = started.elapsedMs + played.elapsedMs + checked.elapsedMs;
    return {
      variant,
      seed: played.data.seed,
      completedSeasons: SEASONS,
      careerDomesticRoundSettlements: SEASONS * 46 + 23,
      completeSeasonTrainingSelections: played.data.trainingSelections,
      identityEdits: played.data.identityEdits,
      centuryActiveCheckpointTrainingSelections: variant === 'active-management' ? 2 : 0,
      trainingCycle:
        variant === 'active-management'
          ? '23 youth rounds then 23 recovery rounds each season; century checkpoint adds 12 youth and 11 recovery rounds'
          : 'balanced; century checkpoint adds 23 rounds',
      ownerManagerHires: played.data.ownerHires,
      sameDayReappointments: played.data.sameDayReappointments,
      elapsedMs,
      completedSeasonsPerSecond: Math.round((SEASONS * 100000) / elapsedMs) / 100,
      simulationMs: played.data.simulationMs,
      simulationSecondsPerSeason: Math.round(played.data.simulationMs / SEASONS) / 1000,
      ownedMatches: played.data.ownedMatches,
      ownedMatchesPerSecond: Math.round((played.data.ownedMatches * 100000) / elapsedMs) / 100,
      allRetainedFactsPreserved: true,
      managerHistory: checked.data.manager,
    };
  });
  const active = profiles['active-management'].played.data.identity!;
  const { choice, ...activeEvidence } = active;
  void choice;
  const identityEvidence = {
    profile: 'active-management',
    seed: profiles['active-management'].played.data.seed,
    ...activeEvidence,
    checkpointLabel: checkpointLabel('active-management'),
    pendingChoiceDecoded: true,
    resumedSettlementConsumed: { uninterrupted: true, restored: true },
  };
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const gitDirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  const centuryCheckpointSha256 = profiles.baseline.checked.data.centuryCheckpointSha256!;
  const report = {
    phase:
      'T232 rules 4.0.0 (grid own matches, discipline, post-match material, season heat) on the T010 workloads: money/personnel/commercial operations and all continental summaries; T255 adds the deterministic club-identity workload and a pending next-fixture shirt to the active-management profile; T308 adds own-manager tracking from the founding (container 4), a same-day appointment, replacement and reappointment four times in the active-management century and a settled round after the century in the baseline too',
    task: 'T308',
    feature:
      'Own-manager tenures and attributed results (HIST-18/19, SAVE-24) carried and read on the century profiles',
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
    run: {
      mode: named
        ? 'phased: one `pnpm run benchmark --phase <name>` command per phase'
        : 'one process',
      phases: all.map(({ phase, date, elapsedMs }) => ({ phase, date, elapsedMs })),
    },
    engine: era.engine,
    catalog: era.catalog,
    catalogHash: era.catalogHash,
    checkpointLimit: CHECKPOINT_LIMIT,
    totalLimit: TOTAL_LIMIT,
    measurements: all.flatMap((result) => result.measurements),
    worstCheckpoint: {
      label: worstPhase.worst.label,
      checkpointBytes: worstPhase.worst.checkpointBytes,
      streams: streamSizes(JSON.parse(worstWorld)),
    },
    workloads,
    centuryCheckpointSha256,
    eraProbe: era.eraProbe,
    identityWorkload: identityEvidence,
    elapsedMs: all.reduce((sum, result) => sum + result.elapsedMs, 0),
    heapBytes: process.memoryUsage().heapUsed,
    peakObservedHeapBytes: Math.max(...all.map((result) => result.peakObservedHeapBytes)),
    losslessRoundtrip: true,
    resumedSeasonReplay: true,
    managerHistoryRoundTrip: true,
    passed: true,
    scope: `Two representative ${SEASONS}-season workloads, with real youth/recovery round training in the active profile, a settled round-23 checkpoint after the century in both profiles, an own design applied through the club-identity command at each active season start (${identityEvidence.edits} edits) and a pending match-kit choice in the active round-23 checkpoint that both resumed careers wear and use up, recorded appearances compared before and after every such command, eight-country archive/capacity checks and a separate ${FOUNDING_YEAR}–${ERA_END} era probe. Both careers track their own managers from the founding; the active one also hires a free manager every tenth season and four times a century appoints, replaces and reappoints on one day, beside the interims contract ends leave. At the century and the round after it, every tenure, outcome source, date and record link round-trips the checkpoint exactly, and the records room's paged manager-history read covers every tenure and attributed match. Every checkpoint must round-trip the complete canonical world without loss; save limits and history retention remain unchanged. Throughput includes codec/replay checks; peak heap is sampled at checkpoints. No claim that all seeds/actions fit indefinitely. Direct engine harness records but does not stop at UI warnings.`,
  };
  if (smoke) {
    console.log(JSON.stringify(report, null, 2));
    return {};
  }
  mkdirSync('docs/benchmarks', { recursive: true });
  writeFileSync('docs/benchmarks/manager-history.json', JSON.stringify(report, null, 2) + '\n');
  // The one-process run (the Benchmark workflow) also refreshes the reports first-play.mjs reads;
  // a phased run writes only this feature's report.
  if (!named) {
    writeFileSync('docs/benchmarks/T010-storage.json', JSON.stringify(report, null, 2) + '\n');
    writeFileSync(
      'docs/benchmarks/T232-rules4-storage.json',
      JSON.stringify(report, null, 2) + '\n',
    );
    // T255 feature evidence: this run's storage facts and identity workload on the same source
    // fingerprint. `storagePassed` covers this script only; `pnpm run benchmark:browser` fills
    // `browser` from its own measurements, and `null` there means it has not run on this source.
    const { passed: storagePassed, ...storage } = report;
    writeFileSync(
      'docs/benchmarks/club-identity-final.json',
      JSON.stringify(
        {
          ...storage,
          task: 'T255',
          feature: 'Club identity and kits (KIT r2, SAVE-20–22) on the final combined source',
          storagePassed,
          storageReport: 'docs/benchmarks/T010-storage.json',
          browser: null,
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(JSON.stringify(report, null, 2));
  return {};
}

for (const phase of named ? [named as Phase] : PHASES) {
  current = phase;
  measurements = [];
  peakObservedHeapBytes = 0;
  worst = { label: '', checkpointBytes: 0 };
  const started = performance.now();
  const data = await run(phase);
  if (sourceFingerprint().sha256 !== source.sha256)
    throw new Error('Source changed during storage verification; rerun after edits settle');
  if (phase === 'report') continue;
  const result: PhaseResult = {
    phase,
    date: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    measurements,
    peakObservedHeapBytes,
    worst,
    data,
  };
  writeFileSync(join(state, `${phase}.json`), JSON.stringify(result, null, 2) + '\n');
  console.error(`${phase}: done in ${Math.round(result.elapsedMs / 1000)} s`);
}
