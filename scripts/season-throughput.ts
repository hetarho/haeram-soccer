/**
 * Seconds per simulated season on the century benchmark's worlds (T224, T285, →MATCH-22, ARCH-31).
 *
 *   pnpm exec tsx scripts/season-throughput.ts [--seasons N] [--own-league summary|grid]
 *     [--profile baseline|active-management] [--candidate]
 *   pnpm exec tsx scripts/season-throughput.ts --stages N [--reps R]
 *   pnpm exec tsx scripts/season-throughput.ts --ab name=repo[:candidate] ... [--seasons N] [--reps R]
 *
 * Also runs unchanged on older trees (copy it there, as T224 did): the own-league switch, the
 * candidate model and the aggregate stages are loaded only when asked for.
 * - `--profile active-management` plays the runner's owner actions each season
 *   (scripts/match-model-baseline.ts `manage`); the default is the baseline world.
 * - `--candidate` activates the candidate match model from founding (tests/fixtures/worlds.ts).
 * - `--stages N` times the aggregate fixture's stages on the baseline world's first N non-own
 *   fixtures instead of seasons (trees with the aggregate path): per stage, the median over
 *   fixtures of each fixture's median of R repetitions.
 * - `--ab` interleaves named trees, each a checkout holding this same script: per repetition, the
 *   stage probe on the `:candidate` trees, then each profile's seasons, the tree order rotated
 *   every repetition. It prints per-tree medians and the ratios of the sums of per-season medians
 *   (T285's interleaved A/B). Output names trees by the given names, never by their paths.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from '../packages/engine/src/index';
import type { World } from '../packages/contracts/src/types';
import * as match from '../packages/engine/src/match';

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const count = (name: string, fallback: number) => {
  const n = Number(arg(name) ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} takes a count`);
  return n;
};
const PROFILES = {
  baseline: { seed: 'release-century-baseline', name: 'Century Athletic' },
  'active-management': { seed: 'release-century-active-management', name: 'Century Cooperative' },
} as const;
type Profile = keyof typeof PROFILES;
const r3 = (x: number) => Number(x.toFixed(3));
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const load1 = () => Number(loadavg()[0]!.toFixed(2));

function world(profile: Profile) {
  return createWorld({
    country: 'ENG',
    name: PROFILES[profile].name,
    color: '#284e35',
    seed: PROFILES[profile].seed,
    level: 'easy',
  });
}

/** The active-management century workload's owner actions, as the runner plays them. */
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

async function seasons() {
  const seasonCount = count('--seasons', 5);
  const profile = (arg('--profile') ?? 'baseline') as Profile;
  if (!(profile in PROFILES)) throw new Error('--profile takes baseline or active-management');
  const ownLeague = arg('--own-league');
  if (ownLeague !== undefined) {
    if (ownLeague !== 'grid' && ownLeague !== 'summary')
      throw new Error('--own-league takes grid or summary');
    const set = (match as { setOwnLeagueEngine?: (engine: 'grid' | 'summary') => void })
      .setOwnLeagueEngine;
    if (!set) throw new Error('this tree has no own-league switch');
    set(ownLeague);
  }
  const candidate = process.argv.includes('--candidate');
  const w = world(profile);
  if (candidate) (await import('../tests/fixtures/worlds')).withCandidateModel(w);
  const startLoad = load1();
  const times: number[] = [];
  for (let n = 0; n < seasonCount; n++) {
    const start = performance.now();
    if (profile === 'active-management') manage(w, n);
    simulateSeason(w);
    times.push((performance.now() - start) / 1000);
  }
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const memory = process.memoryUsage();
  return {
    kind: 'seasons',
    profile,
    candidate,
    ownLeague: ownLeague ?? 'default',
    seasons: seasonCount,
    secondsPerSeason: Number(mean.toFixed(2)),
    perSeason: times.map(r3),
    year: w.year,
    heapMB: Math.round(memory.heapUsed / 2 ** 20),
    rssMB: Math.round(memory.rss / 2 ** 20),
    load1: startLoad,
    node: process.version,
  };
}

/** The aggregate fixture's stages, replayed the way `playAggregate` runs its first attempt. */
async function stages() {
  const fixtureCount = count('--stages', 300);
  const reps = count('--reps', 3);
  const { prepareMatch } = await import('../packages/engine/src/index');
  const agg = await import('../packages/engine/src/aggregate/engine');
  const { buildAggregateInput } = await import('../packages/engine/src/aggregate/input');
  const { aggregateStreams, generateTeamFacts } =
    await import('../packages/engine/src/aggregate/team');
  const { planParticipation } = await import('../packages/engine/src/aggregate/participation');
  const { attributePlayerFacts } = await import('../packages/engine/src/aggregate/players');
  const { eraRules } = await import('../packages/engine/src/grid/setup');
  // Older trees have no UNPLANNED export; the input never reads skills before participation.
  const unplanned = { skill: () => 0, finishing: () => 0, targetChance: () => 0 };
  const w = world('baseline');
  const own = (f: { home: string; away: string }) =>
    f.home === w.playerClub || f.away === w.playerClub;
  const fixtures = w.fixtures
    .filter((f) => !own(f))
    .sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1))
    .slice(0, fixtureCount);
  for (const f of fixtures) prepareMatch(w, f); // squads cached, as the runner does
  const startLoad = load1();
  const times = new Map<string, number[]>();
  let at = performance.now();
  const lap = (stage: string) => {
    const now = performance.now();
    let list = times.get(stage);
    if (!list) times.set(stage, (list = []));
    list.push(now - at);
    at = now;
  };
  for (let rep = 0; rep < reps; rep++)
    for (const f of fixtures) {
      at = performance.now();
      const era = eraRules(f.year);
      const prepared = prepareMatch(w, f);
      const rosters = agg.matchdayRosters(w, f, prepared, era);
      lap('prepare');
      const plan = agg.aggregatePlan(w, prepared, rosters, era);
      const base = buildAggregateInput(prepared, unplanned, rosters);
      lap('plan+input');
      const streams = aggregateStreams(w.seed, f.id);
      const participation = planParticipation(base, plan, streams, 90, new Map());
      lap('participation');
      const input = { ...base, access: agg.aggregateSkillAccess(prepared, rosters, participation) };
      lap('access');
      const facts = generateTeamFacts(input, streams, participation);
      lap('teamFacts');
      const players = attributePlayerFacts(input, plan, participation, facts, streams);
      lap('attribution');
      const decisions = new Map();
      agg.aggregateRecord(f, rosters, {
        input,
        participation,
        facts,
        decisions,
        plan,
        players,
        retry: 0,
      });
      lap('record+validate');
      agg.simulateAggregate(w, f);
      lap('simulateAggregate');
    }
  const medianMs: Record<string, number> = {};
  for (const [stage, list] of times) {
    const perFixture = fixtures.map((_, i) =>
      median(Array.from({ length: reps }, (_, rep) => list[rep * fixtures.length + i]!)),
    );
    medianMs[stage] = Number(median(perFixture).toFixed(4));
  }
  return { kind: 'stages', fixtures: fixtures.length, reps, medianMs, load1: startLoad };
}

interface StageRow {
  tree: string;
  rep: number;
  medianMs: Record<string, number>;
  load1: number;
}
interface SeasonRow {
  tree: string;
  rep: number;
  profile: Profile;
  perSeason: number[];
  heapMB: number;
  rssMB: number;
  load1: number;
}

/** T285's interleaved A/B: rotated tree order, every tree running its own copy of this script. */
function ab() {
  // Every name=repo[:candidate] argument after --ab, up to the next flag.
  const specs: string[] = [];
  for (let i = process.argv.indexOf('--ab') + 1; i < process.argv.length; i++) {
    if (process.argv[i]!.startsWith('--')) break;
    specs.push(process.argv[i]!);
  }
  const trees = specs.map((spec) => {
    const eq = spec.indexOf('=');
    if (eq < 1) throw new Error(`--ab takes name=repo[:candidate], not ${spec}`);
    const rest = spec.slice(eq + 1);
    const candidate = rest.endsWith(':candidate');
    const repo = candidate ? rest.slice(0, -':candidate'.length) : rest;
    return { name: spec.slice(0, eq), repo, candidate };
  });
  if (trees.length < 2) throw new Error('--ab takes two or more name=repo[:candidate] trees');
  const reps = count('--reps', 3);
  const seasonCount = count('--seasons', 3);
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const t of trees)
    if (readFileSync(join(t.repo, 'scripts/season-throughput.ts'), 'utf8') !== self)
      throw new Error(`copy scripts/season-throughput.ts into tree ${t.name} first`);
  const run = <T>(repo: string, args: string[]) =>
    JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/season-throughput.ts', ...args], {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      })
        .trim()
        .split('\n')
        .at(-1)!,
    ) as T;
  const stageRows: StageRow[] = [];
  const seasonRows: SeasonRow[] = [];
  for (let rep = 0; rep < reps; rep++) {
    const order = trees.map((_, i) => trees[(i - rep + trees.length * reps) % trees.length]!);
    for (const t of order.filter((tree) => tree.candidate))
      stageRows.push({
        ...run<Omit<StageRow, 'tree' | 'rep'>>(t.repo, ['--stages', '300', '--reps', '3']),
        tree: t.name,
        rep,
      });
    for (const profile of Object.keys(PROFILES) as Profile[])
      for (const t of order) {
        const args = ['--profile', profile, '--seasons', String(seasonCount)];
        if (t.candidate) args.push('--candidate');
        seasonRows.push({
          ...run<Omit<SeasonRow, 'tree' | 'rep'>>(t.repo, args),
          tree: t.name,
          rep,
        });
      }
  }
  const out = {
    kind: 'ab',
    trees: trees.map((t) => ({ name: t.name, candidate: t.candidate })),
    reps,
    seasons: seasonCount,
    stages: {} as Record<string, Record<string, number>>,
    seasonsByProfile: {} as Record<string, Record<string, unknown>>,
    ratios: {} as Record<string, Record<string, number>>,
    load1: {
      stages: stageRows.map((r) => r.load1),
      seasons: seasonRows.map((r) => r.load1),
    },
  };
  const staged = trees.filter((tree) => tree.candidate);
  for (const t of staged) {
    const rows = stageRows.filter((r) => r.tree === t.name);
    out.stages[t.name] = Object.fromEntries(
      Object.keys(rows[0]!.medianMs).map((k) => [k, r3(median(rows.map((r) => r.medianMs[k]!)))]),
    );
  }
  // Each later staged tree over each earlier one, stage by stage.
  for (const [i, a] of staged.entries())
    for (const b of staged.slice(0, i))
      out.ratios[`stages ${a.name}/${b.name}`] = Object.fromEntries(
        Object.entries(out.stages[a.name]!).map(([k, ms]) => [k, r3(ms / out.stages[b.name]![k]!)]),
      );
  const totals: Record<string, Record<string, number>> = {};
  for (const profile of Object.keys(PROFILES) as Profile[]) {
    out.seasonsByProfile[profile] = {};
    totals[profile] = {};
    for (const t of trees) {
      const rows = seasonRows.filter((r) => r.tree === t.name && r.profile === profile);
      const perIndex = Array.from({ length: seasonCount }, (_, i) =>
        median(rows.map((r) => r.perSeason[i]!)),
      );
      const total = perIndex.reduce((a, b) => a + b, 0);
      totals[profile][t.name] = total;
      out.seasonsByProfile[profile][t.name] = {
        runs: rows.length,
        medianSeason: r3(median(rows.flatMap((r) => r.perSeason))),
        perSeasonMedian: perIndex.map(r3),
        totalOfMedians: r3(total),
        heapMB: Math.max(...rows.map((r) => r.heapMB)),
        rssMB: Math.max(...rows.map((r) => r.rssMB)),
      };
    }
    // Every later tree over every earlier one, by the sums of per-season medians.
    out.ratios[profile] = Object.fromEntries(
      trees.flatMap((a, i) =>
        trees
          .slice(0, i)
          .map((b) => [
            `${a.name}/${b.name}`,
            r3(totals[profile]![a.name]! / totals[profile]![b.name]!),
          ]),
      ),
    );
  }
  return out;
}

const result = process.argv.includes('--ab')
  ? ab()
  : process.argv.includes('--stages')
    ? await stages()
    : await seasons();
console.log(JSON.stringify(result));
