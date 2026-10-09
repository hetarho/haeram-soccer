import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';
import {
  createWorld,
  simulateSeason,
  advanceRound,
  operate,
  quote,
  clubOf,
  operatingCost,
} from '../packages/engine/src/index';
import { COUNTRIES } from '../packages/catalogs/src/index';
import { canonical, validateWorld, type World } from '../packages/contracts/src/index';
import {
  encode,
  decode,
  CHECKPOINT_LIMIT,
  TOTAL_LIMIT,
} from '../apps/web/src/adapters/persistence';
import { denseBytes } from '../apps/web/src/adapters/dense';
const measurements: Record<string, unknown>[] = [];
const workloads: Record<string, unknown>[] = [];
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
async function measure(w: World, label: string) {
  validateWorld(w);
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
    restored = (await decode(raw)).world;
  const worldCanonical = canonical(w);
  if (canonical(restored) !== worldCanonical) throw new Error('Lossless checkpoint failed');
  const checkpointBytes = 2 * (raw.length + 'haeram-soccor:slot:a'.length),
    totalBytes = checkpointBytes * 2 + 512;
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
    trainingFocus: w.training || 'balanced',
    trainingAt: w.trainingAt,
    trainingFocusEvents: w.events.filter((event) => event.kind === 'training-focus').length,
    compressedPayloadBytes: denseBytes(JSON.parse(raw).payload).length,
    checkpointBytes,
    totalBytes,
    heapBytes,
    encodingMs: Math.round(encodingMs),
    passed: checkpointBytes <= CHECKPOINT_LIMIT && totalBytes <= TOTAL_LIMIT,
  };
  measurements.push(result);
  if (checkpointBytes > worstCheckpointBytes) {
    worstCheckpointBytes = checkpointBytes;
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
      JSON.stringify({ ...result, sourceFingerprint: source }, null, 2) + '\n',
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
for (const variant of ['baseline', 'active-management']) {
  const workloadStart = performance.now();
  let trainingSelections = 0;
  const w = createWorld({
    country: 'ENG',
    name: variant === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed: 'release-century-' + variant,
    difficulty: 2,
  });
  await measure(w, variant + ' founding');
  for (let n = 0; n < 100; n++) {
    const before = retainedFacts(w);
    if (variant === 'active-management') {
      const code = clubOf(w).country;
      const available = (cost: string) => BigInt(w.cash) > BigInt(cost) + BigInt(operatingCost(w));
      if (!w.sponsor) operate(w, { type: 'sponsor', kind: n % 4 === 0 ? 'indexed' : 'stable' });
      if (available(quote(code, w.year, 25))) operate(w, { type: 'campaign', kind: 'outreach' });
      if (n % 10 === 0 && w.players.filter((p) => p.status === 'active').length < 26)
        operate(w, { type: 'recruit', candidate: 0, loan: true });
      if (n % 15 === 0 && available(quote(code, w.year, 200 * (w.facilities + 1) ** 1.5)))
        operate(w, { type: 'facility' });
      if (n % 10 === 0 && available(quote(code, w.year, 400)))
        operate(w, { type: 'hire', candidate: 1 });
      operate(w, { type: 'training', focus: 'youth' });
      trainingSelections++;
      for (let round = 0; round < 23; round++) advanceRound(w, undefined, false);
      operate(w, { type: 'training', focus: 'recovery' });
      trainingSelections++;
    }
    simulateSeason(w);
    assertRetained(w, before);
    if (w.history.length !== n + 1) throw new Error('Missing completed season archive');
    if (n === 49) {
      const mid = structuredClone(w);
      if (variant === 'active-management') operate(mid, { type: 'training', focus: 'youth' });
      for (let i = 0; i < 23; i++) advanceRound(mid, undefined, false);
      const { restored } = await measure(mid, variant + ' mid-career active round');
      simulateSeason(mid);
      simulateSeason(restored);
      if (canonical(mid) !== canonical(restored))
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
        season.year !== 1901 + index ||
        season.champions.length !== COUNTRIES.length ||
        // Every league club once, plus the own club in a season it spent in the lower tier.
        season.standings.filter((row) => row[1] < leagueTiers(row[0])).length !== leagueClubs ||
        season.standings.some((row) => row[1] >= leagueTiers(row[0]) && row[0] !== ownIndex),
    ) ||
    !w.ownMatches.some((match) => match.year === 1901) ||
    !w.events.some((event) => event.kind === 'founding')
  )
    throw new Error('Century own-club/global archival coverage failed');
  if (variant === 'active-management') {
    const before = retainedFacts(w);
    operate(w, { type: 'training', focus: 'youth' });
    for (let round = 0; round < 12; round++) advanceRound(w, undefined, false);
    operate(w, { type: 'training', focus: 'recovery' });
    for (let round = 12; round < 23; round++) advanceRound(w, undefined, false);
    assertRetained(w, before);
    if (w.history.length !== 100 || w.round !== 23 || w.trainingAt !== `${w.year}:23`)
      throw new Error('Century active checkpoint was not settled at round 23');
    const { restored } = await measure(w, variant + ' century active round 23');
    const continued = structuredClone(w);
    simulateSeason(continued);
    simulateSeason(restored);
    if (canonical(continued) !== canonical(restored))
      throw new Error('Resumed century active checkpoint differs from uninterrupted engine');
  }
  const elapsedMs = performance.now() - workloadStart;
  workloads.push({
    variant,
    seed: w.seed,
    completedSeasons: 100,
    careerDomesticRoundSettlements: variant === 'active-management' ? 4623 : 4600,
    completeSeasonTrainingSelections: trainingSelections,
    centuryActiveCheckpointTrainingSelections: variant === 'active-management' ? 2 : 0,
    trainingCycle:
      variant === 'active-management'
        ? '23 youth rounds then 23 recovery rounds each season; century checkpoint adds 12 youth and 11 recovery rounds'
        : 'balanced',
    elapsedMs: Math.round(elapsedMs),
    completedSeasonsPerSecond: Math.round((100000 / elapsedMs) * 100) / 100,
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
  difficulty: 2,
});
for (let i = 0; i < 124; i++) simulateSeason(era);
validateWorld(era);
if (
  !era.history.find((h) => h.year === 2024)?.europe.some((e) => e.kind === 'uecl' && e.field === 36)
)
  throw new Error('2024 era archival gate failed');
if (sourceFingerprint().sha256 !== source.sha256)
  throw new Error('Source changed during storage verification; rerun after edits settle');
const report = {
  phase:
    'T010 complete engine, including money/personnel/commercial operations and all continental summaries',
  synthetic: true,
  date: new Date().toISOString(),
  node: process.version,
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
  workloads,
  centuryCheckpointSha256: createHash('sha256')
    .update(readFileSync('.tmp/release-century.haeram-save.json'))
    .digest('hex'),
  eraProbe: { seasons: 124, year: era.year, passed: true },
  elapsedMs: Math.round(performance.now() - start),
  heapBytes: process.memoryUsage().heapUsed,
  peakObservedHeapBytes,
  losslessRoundtrip: true,
  resumedSeasonReplay: true,
  passed: true,
  scope:
    'Two representative 100-season workloads, with real youth/recovery round training in the active profile, a settled round-23 checkpoint after 100 seasons, eight-country archive/capacity checks and a separate 1901–2025 era probe. Every checkpoint must round-trip the complete canonical world without loss; save limits and history retention remain unchanged. Throughput includes codec/replay checks; peak heap is sampled at checkpoints. No claim that all seeds/actions fit indefinitely. Direct engine harness records but does not stop at UI warnings.',
};
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/T010-storage.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
