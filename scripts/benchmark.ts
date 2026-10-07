import { mkdirSync, writeFileSync } from 'node:fs';
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
const measurements: Record<string, unknown>[] = [];
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
  if (canonical(restored) !== canonical(w)) throw new Error('Lossless checkpoint failed');
  const checkpointBytes = 2 * (raw.length + 'haeram-soccor:slot:a'.length),
    totalBytes = checkpointBytes * 2 + 512;
  const result = {
    label,
    seasons: w.history.length,
    year: w.year,
    round: w.round,
    ownedMatches: w.ownMatches.length,
    players: w.players.length,
    events: w.events.length,
    checkpointBytes,
    totalBytes,
    encodingMs: Math.round(encodingMs),
    passed: checkpointBytes <= CHECKPOINT_LIMIT && totalBytes <= TOTAL_LIMIT,
  };
  measurements.push(result);
  if (!result.passed)
    throw new Error('Long-career storage budget failed: ' + JSON.stringify(result));
  return { raw, restored };
}
const start = performance.now();
mkdirSync('.tmp', { recursive: true });
for (const variant of ['baseline', 'active-management']) {
  const w = createWorld({
    country: 'ENG',
    name: variant === 'baseline' ? 'Century Athletic' : 'Century Cooperative',
    color: '#284e35',
    seed: 'release-century-' + variant,
    difficulty: 2,
  });
  await measure(w, variant + ' founding');
  for (let n = 0; n < 100; n++) {
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
    }
    simulateSeason(w);
    if (n === 49) {
      const mid = structuredClone(w);
      for (let i = 0; i < 23; i++) advanceRound(mid);
      const { restored } = await measure(mid, variant + ' mid-career active round');
      simulateSeason(mid);
      simulateSeason(restored);
      if (canonical(mid) !== canonical(restored))
        throw new Error('Resumed season differs from uninterrupted engine');
    }
  }
  const { raw } = await measure(w, variant + ' century');
  if (variant === 'baseline') writeFileSync('.tmp/release-century.haeram-save.json', raw);
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
const report = {
  phase:
    'T010 complete engine, including money/personnel/commercial operations and all continental summaries',
  synthetic: true,
  date: new Date().toISOString(),
  node: process.version,
  engine: era.engine,
  catalog: era.catalog,
  catalogHash: era.catalogHash,
  checkpointLimit: CHECKPOINT_LIMIT,
  totalLimit: TOTAL_LIMIT,
  measurements,
  eraProbe: { seasons: 124, year: era.year, passed: true },
  elapsedMs: Math.round(performance.now() - start),
  heapBytes: process.memoryUsage().heapUsed,
  losslessRoundtrip: true,
  resumedSeasonReplay: true,
  passed: true,
  scope:
    'Two representative 100-season workloads, eight-country capacities and a separate 1901–2025 era probe. No claim that all seeds/actions fit indefinitely. Direct engine harness records but does not stop at UI warnings.',
};
mkdirSync('docs/benchmarks', { recursive: true });
writeFileSync('docs/benchmarks/T010-storage.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
