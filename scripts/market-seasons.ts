/**
 * Market-season harness: lives ownerless worlds for a few seasons on the results-only path, many
 * seeds in parallel, and reports transfer counts by type, window and reason, tier flows, season-start
 * XI losses and each division's strength, so the market and level work can be tuned by measurement.
 * Scripts only: it reads the engine through its exported observers and changes no engine source.
 *
 *   pnpm exec tsx scripts/market-seasons.ts --start fresh:1951 --burn-in 2 --seasons 2 \
 *     --seeds 0..1 --jobs 2 --out <scratch>/smoke.json
 *   pnpm exec tsx scripts/market-seasons.ts --merge a.json b.json --out merged.json
 *
 * Options: --start fresh:<year> (a fresh world; --burn-in of at least 2) | lived:<year> (lived from
 * 1930, its first day stored under .tmp/market-seasons/) | file:<path> (a stored snapshot);
 * --burn-in N (default 2 fresh, 0 otherwise); --seasons N (default 5); --seeds 0..7;
 * --seed-prefix (default market-); --lucks K (K reruns per seed: luck 0 is the released draw, the
 * others redraw every season's results); --config file.json (tunables merged over the defaults, a
 * lived or file start applies them after the start world is built); --jobs N (child processes, each
 * loading the engine once; default 7); --out file.json; --owner <club id> (an owner takes the club
 * over on the start world's first day, every business responsibility delegated, and his club
 * plays on the full model, about 27 s a season; used sparingly) with --owner-tier <wealth tier>
 * (default oil). Measurement reads the clubs nobody owns. Wrap long runs in `caffeinate -ims`.
 */
import { execFileSync, fork } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currency } from '../packages/catalogs/src/index';
import { careerEnded, WEALTH_TIER_IDS, type WealthTier } from '../packages/contracts/src/owner';
import type { Player, World } from '../packages/contracts/src/types';
import * as bookEngine from '../packages/engine/src/books';
import * as careerEngine from '../packages/engine/src/npc-careers';
import { currentDay, SEASON_END_DAY } from '../packages/engine/src/calendar';
import { FREE_AGENT_FLOW } from '../packages/engine/src/free-agents';
import { historyWorld, liveHistory } from '../packages/engine/src/history';
import { MATCH_MODEL_RELEASE } from '../packages/engine/src/match-model-release';
import { inPounds } from '../packages/engine/src/club-value';
import { npcWageBill, npcWageLimit } from '../packages/engine/src/books';
import { groupKey, ranked } from '../packages/engine/src/league-fixtures';
import { NPC_BID_FLOW, NPC_MARKET, PLAYER_MOVE_FLOW } from '../packages/engine/src/npc-market';
import { LINE_MINIMUM, lineOf, mainOvr } from '../packages/engine/src/player';
import { overall } from '../packages/engine/src/player-state';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import { RESULTS_LUCK } from '../packages/engine/src/results-only';
import { advanceDays } from '../packages/engine/src/season';
import { takeOver } from '../packages/engine/src/takeover';
import { transferWindowDays } from '../packages/engine/src/transfer-window';
import { clubById, NPC_SQUAD, squad } from '../packages/engine/src/world';
import { measurementIdentity } from './lib/measurement-identity';
import { fingerprintFiles } from './lib/source-graph';
import { setTunables } from './lib/market-tunables';
import { toolMessage } from './lib/tool-messages';
import { transferValues } from './lib/market-values';
import {
  FRESH_MIN_BURN_IN,
  inferReason,
  luckSalt,
  mergeRuns,
  parseSeeds,
  parseStart,
  partitionBySeed,
  runJobs,
  seasonStats,
  seedName,
  usageError,
  windowOf,
  type ClubRef,
  type EndBook,
  type BidFact,
  type RenewalFact,
  type DistressFact,
  type MoveFact,
  type MoveKind,
  type RunJob,
  type RunResult,
  type StartClub,
  type StartSpec,
  type SeasonStats,
} from './lib/market-seasons';
import {
  START_WORLD_DIR,
  loadStartWorld,
  loadStartWorldFile,
  saveStartWorld,
} from './lib/start-worlds';

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : (args[index + 1] ?? fallback);
};
const SELF = fileURLToPath(import.meta.url);

/** The defaults with `config` over them (scripts/lib/market-tunables.ts). */
const setConfig = (config: Record<string, unknown>) => setTunables(config);

// ---------------------------------------------------------------------------------------------
// Observation

interface Collector {
  moves: MoveFact[];
  releases: number;
  bids: BidFact[];
  renewalAnswers?: RenewalFact[];
  distress?: DistressFact[];
}
let collector: Collector = { moves: [], releases: 0, bids: [] };

/**
 * The engine may expose these hooks after the corresponding game rules are implemented.
 */
function optionalObserver<T>(module: object, name: string, observe: (fact: T) => void) {
  const flow: unknown = (module as Record<string, unknown>)[name];
  if (!flow || typeof flow !== 'object') return false;
  (flow as { observe?: (fact: T) => void }).observe = observe;
  return true;
}
const observed = {
  renewals: optionalObserver<RenewalFact>(careerEngine, 'NPC_RENEWAL_FLOW', (fact) =>
    collector.renewalAnswers?.push(fact),
  ),
  distress: optionalObserver<DistressFact>(bookEngine, 'DISTRESS_FLOW', (fact) =>
    collector.distress?.push(fact),
  ),
};
const ref = (c: { id: string; country: string; tier: number }): ClubRef => ({
  id: c.id,
  country: c.country,
  tier: c.tier,
});

function observeMove(
  w: World,
  id: string,
  move: { year: number; day: number; from: string; to: string; fee: string; loan?: boolean },
  given?: unknown,
) {
  const to = clubById(w, move.to);
  if (!to || to.representative) return;
  const from = clubById(w, move.from);
  const days = transferWindowDays(move.year);
  const window = windowOf(move.day, {
    summerClose: days.summerClose,
    winterOpen: days.winterOpen,
    winterClose: days.winterClose,
    closeFrom: SEASON_END_DAY,
  });
  const returning = w.playerRecords?.[id]?.loan?.club === move.to && !move.loan;
  const kind: MoveKind = returning
    ? 'loan-return'
    : move.loan
      ? 'loan'
      : move.fee === '0'
        ? 'free'
        : 'paid';
  const sellerSquad = from ? (w.squads?.[from.id] ?? []) : [];
  const buyerSquad = w.squads?.[to.id] ?? [];
  const p = sellerSquad.find((q) => q.id === id);
  const line = p ? lineOf(p.position) : undefined;
  const limit = from ? npcWageLimit(w, from) : undefined;
  const reason = {
    ...(typeof given === 'string' ? { given } : {}),
    ...inferReason({
      kind,
      sellerOverLimit: !!from && limit !== undefined && npcWageBill(w, from) > limit,
      expiring: !!p && p.until <= w.year,
      blocked:
        !!p &&
        !!line &&
        sellerSquad.filter(
          (q) => lineOf(q.position) === line && mainOvr(q) >= mainOvr(p) + NPC_MARKET.blocked,
        ).length >= LINE_MINIMUM[line],
      surplus: sellerSquad.length > NPC_SQUAD.size,
      buyerShortLine:
        !!line && buyerSquad.filter((q) => lineOf(q.position) === line).length < LINE_MINIMUM[line],
      buyerBelowSize: buyerSquad.length < NPC_SQUAD.size,
    }),
  };
  collector.moves.push({
    kind,
    window,
    ...(from && !from.representative ? { from: ref(from) } : {}),
    to: ref(to),
    playerId: id,
    reason,
  });
}
PLAYER_MOVE_FLOW.observe = observeMove;
NPC_BID_FLOW.observe = (fact) => {
  collector.bids.push(fact);
};
FREE_AGENT_FLOW.observe = (kind) => {
  if (kind === 'release') collector.releases++;
};

// ---------------------------------------------------------------------------------------------
// Worlds and seasons

const ownerless = (w: World) =>
  w.clubs.filter((c) => c.id !== w.playerClub && !c.representative && w.squads?.[c.id]);
const poundsOf = (country: string, year: number, amount: string) =>
  Number(inPounds(country, year, amount)) / currency('ENG', year).units;

/**
 * Lives `days` days; an owner world whose career ended or that a critical alert holds would stand
 * still, so it stops the run instead of looping.
 */
function advance(w: World, days: number) {
  if (days < 1) return;
  advanceDays(w, days, undefined, false);
  if (w.critical || careerEnded(w))
    throw new Error(toolMessage('marketSeasons.ownerStopped', { year: String(w.year) }));
}

function playSeason(w: World, salt: string): SeasonStats {
  const year = w.year;
  const values = transferValues(w);
  const clubs = ownerless(w);
  const startClubs: StartClub[] = clubs.map((c) => ({
    ...ref(c),
    strength: c.strength,
    academy: c.levels?.academy ?? 0,
  }));
  const xiStart: Record<string, string[]> = {};
  const topThree: Record<string, string> = {};
  const divisionCandidates = new Map<string, { player: Player; club: string }[]>();
  const bestFirst = (a: Player, b: Player) => overall(b) - overall(a) || a.id.localeCompare(b.id);
  // Retain references as well as IDs so players retiring at this close remain in the cohort.
  const ageingStart = new Map<string, { player: Player; age: number; ovr: number }>();
  for (const c of clubs) {
    for (const p of w.squads![c.id]!) {
      const age = year + 1 - p.born;
      if (age >= 24 && age <= 38) ageingStart.set(p.id, { player: p, age, ovr: overall(p) });
    }
    xiStart[c.id] = squad(w, c)
      .slice(0, 11)
      .map((p) => p.id);
    if (c.tier > 0) {
      const division = `${c.country}:${c.tier}`;
      const candidates = divisionCandidates.get(division) ?? [];
      for (const p of [...w.squads![c.id]!].sort(bestFirst).slice(0, 3)) {
        topThree[p.id] = c.id;
        candidates.push({ player: p, club: c.id });
      }
      divisionCandidates.set(division, candidates);
    }
  }
  const divisionTopThree = Object.fromEntries(
    [...divisionCandidates.values()].flatMap((candidates) =>
      candidates
        .sort((a, b) => bestFirst(a.player, b.player))
        .slice(0, 3)
        .map(({ player, club }) => [player.id, club]),
    ),
  );
  collector = {
    moves: [],
    releases: 0,
    bids: [],
    ...(observed.renewals ? { renewalAnswers: [] } : {}),
    ...(observed.distress ? { distress: [] } : {}),
  };
  RESULTS_LUCK.salt = salt;
  RESULTS_LUCK.season = year;
  advance(w, SEASON_END_DAY - currentDay(w));

  // Rank each final league group separately, including an owned club in its group's size.
  const groups = new Map<string, typeof w.clubs>();
  for (const c of w.clubs.filter((c) => !c.representative)) {
    const key = groupKey(c);
    const group = groups.get(key) ?? [];
    group.push(c);
    groups.set(key, group);
  }
  const finishes = new Map<string, { rank: number; groupSize: number }>();
  for (const group of groups.values())
    ranked(w, group).forEach((c, index) =>
      finishes.set(c.id, { rank: index + 1, groupSize: group.length }),
    );

  const before = new Set([
    ...clubs.flatMap((c) => w.squads![c.id]!.map((p) => p.id)),
    ...(w.freeAgents ?? []).map((p) => p.id),
  ]);
  const expiring = new Map<string, string>();
  for (const c of clubs)
    for (const p of w.squads![c.id]!) if (p.until <= year && !p.loanUntil) expiring.set(p.id, c.id);

  // Exactly to the close (→LEAGUE-9), as liveHistory lives a season.
  while (w.year === year) advance(w, SEASON_END_DAY + 1 - currentDay(w));

  // The season-start XI read after the close, so a starter who retires, is released or goes
  // back from a loan at it counts as lost to the club he started the season at.
  const heldNow = new Map<string, string>();
  for (const c of clubs) for (const p of w.squads![c.id]!) heldNow.set(p.id, c.id);
  const xiLost = clubs.flatMap((c) =>
    xiStart[c.id]!.filter((id) => heldNow.get(id) !== c.id).map((id) => ({
      club: c.id,
      player: id,
    })),
  );

  const after = new Map<string, { club: string; tier: number; until: number; potential: number }>();
  for (const c of clubs)
    for (const p of w.squads![c.id]!)
      after.set(p.id, { club: c.id, tier: c.tier, until: p.until, potential: p.potential });
  const free = new Set((w.freeAgents ?? []).map((p) => p.id));
  let renewals = 0;
  for (const [id, club] of expiring) {
    const row = after.get(id);
    if (row && row.club === club && row.until > year) renewals++;
  }
  const retirements = [...before].filter((id) => !after.has(id) && !free.has(id)).length;
  const intake = [...after]
    .filter(([id]) => !before.has(id))
    .map(([, row]) => ({ tier: row.tier, potential: row.potential }));
  // Read c.books.seasons[0] after settlement. Historical flows keep the closing season's
  // currency; live cash/debt have already been converted into the following season's currency.
  const books: EndBook[] = clubs.flatMap((c) => {
    const book = c.books?.seasons[0];
    if (!book || book.year !== year) return [];
    return [
      {
        id: c.id,
        country: c.country,
        tier: startClubs.find((s) => s.id === c.id)!.tier,
        wages: poundsOf(c.country, year, book.wages),
        income: poundsOf(c.country, year, book.income),
        costs: poundsOf(c.country, year, book.costs),
        ...(book.transfersReceived === undefined
          ? {}
          : { transfersReceived: poundsOf(c.country, year, book.transfersReceived) }),
        ...(book.transfersPaid === undefined
          ? {}
          : { transfersPaid: poundsOf(c.country, year, book.transfersPaid) }),
        cash: poundsOf(c.country, w.year, c.books!.cash),
        debt: poundsOf(c.country, w.year, c.books!.debt),
        ...finishes.get(c.id),
        nextTier: c.tier,
      },
    ];
  });
  const playersNow = new Map(
    [...Object.values(w.squads ?? {}).flat(), ...(w.freeAgents ?? [])].map((p) => [p.id, p]),
  );
  return seasonStats({
    year,
    transferValues: values,
    clubs: startClubs,
    moves: collector.moves,
    xiStart,
    xiLost,
    topThree,
    divisionTopThree,
    contracts: { releases: collector.releases, renewals, expiring: expiring.size },
    retirements,
    intake,
    books,
    bids: collector.bids,
    renewalAnswers: collector.renewalAnswers,
    distress: collector.distress,
    ageing: [...ageingStart].map(([id, start]) => ({
      age: start.age,
      change: overall(playersNow.get(id) ?? start.player) - start.ovr,
    })),
  });
}

const identityOf = (entry: string) => measurementIdentity(entry).sha256;

/** The start world of a run, never the shared world caches. */
function startWorld(spec: StartSpec, seed: string, config: Record<string, unknown>): World {
  if (spec.kind === 'file') {
    const w = loadStartWorldFile<World>(spec.path);
    setConfig(config);
    return w;
  }
  if (spec.kind === 'fresh') {
    setConfig(config);
    return historyWorld(seed, MATCH_MODEL_RELEASE, spec.year);
  }
  const key = {
    identity: identityOf('packages/engine/src/history.ts'),
    seed,
    year: spec.year,
  };
  let w = loadStartWorld<World>(START_WORLD_DIR, key);
  if (!w) {
    setConfig({});
    w = liveHistory(historyWorld(seed), spec.year);
    saveStartWorld(START_WORLD_DIR, key, w);
    console.error(toolMessage('marketSeasons.stored', { seed, year: String(spec.year) }));
  }
  setConfig(config);
  return w;
}

interface Plan {
  start: string;
  burnIn: number;
  seasons: number;
  config: Record<string, unknown>;
  owner?: { club: string; tier: WealthTier };
}

/** The owner takes his club over, leaving every business responsibility to his staff. */
function takeOwnerClub(w: World, owner: NonNullable<Plan['owner']>) {
  takeOver(w, owner.club, { tier: owner.tier, traits: [] });
  w.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
}

function runOne(plan: Plan, job: RunJob): RunResult {
  const spec = parseStart(plan.start, plan.burnIn);
  const w = startWorld(spec, job.seed, plan.config);
  if (plan.owner) takeOwnerClub(w, plan.owner);
  const salt = luckSalt(job.luck);
  const burnIn: SeasonStats[] = [],
    seasons: SeasonStats[] = [];
  const t0 = performance.now();
  for (let n = 0; n < plan.burnIn + plan.seasons; n++) {
    (n < plan.burnIn ? burnIn : seasons).push(playSeason(w, salt));
    console.error(
      toolMessage('marketSeasons.progress', {
        seed: job.seed,
        luck: job.luck,
        season: n + 1,
        seasons: plan.burnIn + plan.seasons,
        seconds: Math.round((performance.now() - t0) / 1000),
      }),
    );
  }
  RESULTS_LUCK.salt = '';
  return { seed: job.seed, luck: job.luck, start: plan.start, burnIn, seasons };
}

// ---------------------------------------------------------------------------------------------
// Entry

const readConfig = (file: string): Record<string, unknown> =>
  file ? JSON.parse(readFileSync(file, 'utf8')) : {};
const writeOut = (file: string, value: unknown) => {
  if (!file) throw usageError();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  console.error(toolMessage('marketSeasons.wrote', { path: file }));
};

if (args.includes('--child')) {
  process.on('message', (m: { plan: Plan; jobs: RunJob[] } | false) => {
    if (!m) process.exit(0);
    try {
      for (const job of m.jobs) process.send!({ result: runOne(m.plan, job) });
      process.send!({ done: true });
    } catch (error) {
      process.send!({ error: error instanceof Error ? error.message : String(error) });
    }
  });
} else if (args.includes('--merge')) {
  const at = args.indexOf('--merge') + 1;
  const files: string[] = [];
  for (let i = at; i < args.length && !args[i]!.startsWith('--'); i++) files.push(args[i]!);
  if (!files.length) throw usageError();
  const sources = files.map((file) => ({ file, data: JSON.parse(readFileSync(file, 'utf8')) }));
  const runs: RunResult[] = sources.flatMap(({ data }) => data.runs ?? []);
  writeOut(option('out', ''), {
    meta: { merged: files, sources: sources.map(({ file, data }) => ({ file, meta: data.meta })) },
    runs,
    merged: mergeRuns(runs),
  });
} else {
  const ownerClub = option('owner', ''),
    ownerTier = option('owner-tier', 'oil');
  if (args.includes('--owner') && (!ownerClub || ownerClub.startsWith('--'))) throw usageError();
  if (!(WEALTH_TIER_IDS as readonly string[]).includes(ownerTier))
    throw usageError(
      toolMessage('marketSeasons.badOwnerTier', {
        tier: ownerTier,
        tiers: WEALTH_TIER_IDS.join(', '),
      }),
    );
  const start = option('start', '');
  if (!start) throw usageError();
  const kind = start.split(':')[0];
  const burnIn = Number(option('burn-in', kind === 'fresh' ? String(FRESH_MIN_BURN_IN) : '0'));
  parseStart(start, burnIn);
  const seasons = Number(option('seasons', '5'));
  const lucks = Number(option('lucks', '1'));
  const jobsWanted = Number(option('jobs', '7'));
  if (
    ![burnIn, seasons, lucks, jobsWanted].every((n) => Number.isInteger(n) && n >= 0) ||
    lucks < 1
  )
    throw usageError(toolMessage('marketSeasons.badOptions'));
  const configFile = option('config', '');
  const plan: Plan = {
    start,
    burnIn,
    seasons,
    config: readConfig(configFile),
    ...(ownerClub ? { owner: { club: ownerClub, tier: ownerTier as WealthTier } } : {}),
  };
  // Validated and echoed before any world is built; each run sets them again in its own process.
  const inForce = setTunables(plan.config);
  setTunables({});
  const prefix = option('seed-prefix', 'market-');
  const seeds = parseSeeds(option('seeds', '0..7')).map((n) => seedName(prefix, n));
  const jobs = runJobs(seeds, lucks);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const results: RunResult[] = [];
  const parts = partitionBySeed(jobs, Math.min(jobsWanted, jobs.length));
  if (parts.length <= 1) for (const job of jobs) results.push(runOne(plan, job));
  else
    await Promise.all(
      parts.map(
        (part) =>
          new Promise<void>((resolve, reject) => {
            const child = fork(SELF, [...args, '--child'], {
              stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            });
            child.on('message', (m: { result?: RunResult; done?: true; error?: string }) => {
              if (m.error) {
                reject(new Error(m.error));
                child.kill();
              } else if (m.result) results.push(m.result);
              else if (m.done) child.send(false);
            });
            child.on('exit', (code) =>
              code
                ? reject(
                    new Error(toolMessage('marketSeasons.childFailed', { code: String(code) })),
                  )
                : resolve(),
            );
            child.on('error', reject);
            child.send({ plan, jobs: part });
          }),
      ),
    );
  results.sort((a, b) => a.seed.localeCompare(b.seed, 'en', { numeric: true }) || a.luck - b.luck);
  writeOut(option('out', ''), {
    meta: {
      command: ['pnpm exec tsx scripts/market-seasons.ts', ...args].join(' '),
      startedAt,
      seconds: (performance.now() - t0) / 1000,
      identity: measurementIdentity('scripts/market-seasons.ts'),
      source: {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
        fingerprint: fingerprintFiles(
          process.cwd(),
          execFileSync(
            'git',
            [
              'ls-files',
              '-z',
              '--cached',
              '--others',
              '--exclude-standard',
              '--',
              'apps/web/src',
              'apps/web/public',
              'apps/web/index.html',
              'packages',
              'scripts',
              'patches',
              'package.json',
              'pnpm-lock.yaml',
              'pnpm-workspace.yaml',
              'tsconfig.json',
              'apps/web/vite.config.ts',
            ],
            { encoding: 'utf8' },
          )
            .split('\0')
            .filter(Boolean),
        ),
      },
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      observers: observed,
      reads: {
        books: 'closed-book-after-settlement',
        thirds: 'one-based-rank-divided-by-group-size',
        netFees: 'received-minus-paid',
        fixedCosts: 'wages-plus-operating-costs',
        ageing: 'opening-squad-cohort-by-age-at-annual-close-including-retirees',
      },
      start,
      burnIn,
      seasons,
      seeds,
      lucks,
      owner: plan.owner ?? null,
      appliedConfig: plan.config,
      tunablesInForce: inForce,
      reasons:
        'reason.given is the engine-reported reason (absent until the market reports one); seller and buyer reasons are inferred from facts with exported reads and are labelled inferred',
      units: 'money in pounds of the season; tiers are 0 for the top flight',
    },
    runs: results,
    merged: mergeRuns(results),
  });
}
