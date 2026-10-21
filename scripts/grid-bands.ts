/**
 * Grid-engine distribution check (MATCH-23, T215, docs/CALIBRATION.md) and the candidate model's
 * calibration report (T278, MATCH-28, docs/MATCH-MODEL-CONTRACT.md).
 *
 * Band check: grid matches between equal-strength top-tier sides of ENG/ESP/GER/ITA (ratings within
 * 2 points, the four tactics mixed, modern-era rules); prints every MATCH-23 row with its band, the
 * measured value and pass/fail, plus added time and ball in play.
 *
 *   pnpm exec tsx scripts/grid-bands.ts             600 matches, pre-feature model
 *   pnpm exec tsx scripts/grid-bands.ts --quick     150 matches
 *   options: --matches N, --year Y (default 2024), --candidate (MATCH_MODEL_REVISION, explicitly)
 *
 * Calibration report: the candidate model (requested explicitly; the release switch stays off)
 * across CORPUS_CONFIG's core, tactic-pairing, gap, tier, era and knockout conditions, through the
 * shared target, outcome-curve and invariant reports, written with its source fingerprint.
 *
 *   pnpm exec tsx scripts/grid-bands.ts --report [--partition calibration|validation] [--round N]
 *     [--scale S] [--only core,tactics,gap,tier,era,knockout | --conditions id,…] [--jobs N]
 *     [--out FILE]
 *   default: calibration partition, round 0, scale 1 (CORPUS_CONFIG.calibrationPerCondition each),
 *   output docs/benchmarks/detailed-model-calibration.json
 */
import { execFileSync, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TD } from '../packages/contracts/src/detail';
import {
  MATCH_MODEL_REVISION,
  type MatchModelRevision,
} from '../packages/contracts/src/match-model';
import type {
  Club,
  Fixture,
  Founding,
  MatchRecord,
  Tactic,
  World,
} from '../packages/contracts/src/types';
import { createWorld, integer, random, rating } from '../packages/engine/src/index';
import { validateFullMatchRecord } from '../packages/engine/src/match-model';
import { playGrid, type GridResult } from '../packages/engine/src/grid/engine';
import { GRID_BALL_CONFIG, GRID_MOVEMENT_CONFIG } from '../packages/engine/src/grid/movement';
import { M } from '../packages/engine/src/grid/record';
import { buildGridSetup, type DecideRule } from '../packages/engine/src/grid/setup';
import {
  buildInvariantReport,
  buildOutcomeTargetReport,
  buildTargetReport,
  calibrationSize,
  conditionOf,
  CORPUS_CONFIG,
  corpusFixtureId,
  MATCH_PARITY_VERSION,
  type MatchSample,
  type Partition,
} from './lib/match-parity';

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const matches = option('matches', args.includes('--quick') ? 150 : 600);
const year = option('year', 2024);
const bandModel: MatchModelRevision | undefined = args.includes('--candidate')
  ? MATCH_MODEL_REVISION
  : undefined;
const TACTICS: Tactic[] = ['possession', 'press', 'counter', 'balanced'];
const COUNTRIES = ['ENG', 'ESP', 'GER', 'ITA'];

/** Equal pairs from four worlds: top-tier clubs of one country whose ratings differ by at most 2. */
function pairs(): { w: World; home: Club; away: Club }[] {
  const out: { w: World; home: Club; away: Club }[] = [];
  for (let k = 1; k <= 4; k++) {
    const w = createWorld({
      country: 'ENG',
      name: 'Grid Bands',
      color: '#2a5d8f',
      seed: `grid-bands-${k}`,
      level: 'normal',
    });
    for (const country of COUNTRIES) {
      const clubs = w.clubs
        .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
        .map((c) => ({ c, r: rating(w, c) }));
      for (let i = 0; i < clubs.length; i++)
        for (let j = i + 1; j < clubs.length; j++)
          if (Math.abs(clubs[i]!.r - clubs[j]!.r) <= 2)
            out.push({ w, home: clubs[i]!.c, away: clubs[j]!.c });
    }
  }
  return out;
}

export function playBands(
  n: number,
  matchYear = year,
  model: MatchModelRevision | undefined = bandModel,
): GridResult[] {
  const all = pairs();
  const results: GridResult[] = [];
  for (let i = 0; i < n; i++) {
    const { w, home, away } = all[i % all.length]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      id: `bands:${i}`,
      year: matchYear,
      home: home.id,
      away: away.id,
    };
    const tactics: [Tactic, Tactic] = [TACTICS[i % 4]!, TACTICS[Math.floor(i / 4) % 4]!];
    results.push(
      playGrid(
        buildGridSetup(w, f, {
          observe: false,
          recordPlayers: true,
          tactics,
          ...(model ? { model } : {}),
        }),
      ),
    );
  }
  return results;
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};
const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);

/** Every MATCH-23 row: label, band [lo, hi] and measured value. */
export function measure(
  results: GridResult[],
): { label: string; band: [number, number]; value: number }[] {
  const n = results.length;
  const teams = 2 * n;
  const sum = (f: (r: GridResult, side: 0 | 1) => number) =>
    results.reduce((acc, r) => acc + f(r, 0) + f(r, 1), 0);
  const metric = (m: number) => sum((r, side) => r.record.metrics[side]![m]!);
  const td = (k: number) => sum((r, side) => r.record.detail![side]![k]!);
  const passes = metric(M.passes);
  const directions = [0, 1, 2].map((d) => sum((r, side) => r.diagnostics.directions[side]![d]!));
  const dirTotal = directions[0]! + directions[1]! + directions[2]!;
  const spells = results.flatMap((r) => r.diagnostics.possessions);
  const shots = results.flatMap((r) => r.diagnostics.shots);
  const goals = shots.filter((s) => s.goal);
  const distance = (s: { x: number; y: number }) => Math.hypot(105 - s.x, 34 - s.y);
  const inGoalArea = (s: { x: number; y: number }) => s.x >= 99.5 && Math.abs(s.y - 34) <= 9.16;
  const inBox = (s: { x: number; y: number }) => s.x >= 88.5 && Math.abs(s.y - 34) <= 20.16;
  const yellows = td(TD.yellowCards);
  const reds = td(TD.redCards);
  const ballInPlay = results.reduce((a, r) => a + r.diagnostics.ballInPlay, 0) / 60 / n;
  return [
    { label: 'passes attempted (team)', band: [430, 520], value: passes / teams },
    { label: 'pass completion %', band: [76, 84], value: pct(metric(M.completed), passes) },
    { label: 'pass forward %', band: [30, 40], value: pct(directions[0]!, dirTotal) },
    { label: 'pass lateral %', band: [45, 55], value: pct(directions[1]!, dirTotal) },
    { label: 'pass back %', band: [12, 18], value: pct(directions[2]!, dirTotal) },
    { label: 'possessions (team)', band: [85, 105], value: spells.length / teams },
    {
      label: 'median passes per possession',
      band: [2, 4],
      value: median(spells.map((p) => p.passes)),
    },
    {
      label: 'possessions ending in a shot %',
      band: [10, 15],
      value: pct(spells.filter((p) => p.shot).length, spells.length),
    },
    { label: 'shots (team)', band: [11, 14], value: metric(M.shots) / teams },
    { label: 'on target %', band: [30, 37], value: pct(metric(M.onTarget), metric(M.shots)) },
    {
      label: 'xG per shot',
      band: [0.09, 0.12],
      value: shots.reduce((a, s) => a + s.xg, 0) / Math.max(1, shots.length),
    },
    {
      label: 'shots from goal area %',
      band: [6, 9],
      value: pct(shots.filter(inGoalArea).length, shots.length),
    },
    {
      label: 'shots from rest of box %',
      band: [48, 58],
      value: pct(shots.filter((s) => inBox(s) && !inGoalArea(s)).length, shots.length),
    },
    {
      label: 'shots from outside %',
      band: [32, 42],
      value: pct(shots.filter((s) => !inBox(s)).length, shots.length),
    },
    {
      label: 'mean shot distance m',
      band: [15, 18],
      value: shots.reduce((a, s) => a + distance(s), 0) / Math.max(1, shots.length),
    },
    {
      label: 'shots from 30 m+ %',
      band: [0, 10],
      value: pct(shots.filter((s) => distance(s) >= 30).length, shots.length),
    },
    {
      label: 'shots from own half %',
      band: [0, 0.5],
      value: pct(shots.filter((s) => s.x < 52.5).length, shots.length),
    },
    { label: 'crosses (team)', band: [13, 20], value: td(TD.crosses) / teams },
    {
      label: 'cross completion %',
      band: [20, 30],
      value: pct(td(TD.crossesCompleted), td(TD.crosses)),
    },
    { label: 'take-ons (team)', band: [14, 20], value: td(TD.takeOns) / teams },
    { label: 'take-on success %', band: [40, 60], value: pct(metric(M.dribbles), td(TD.takeOns)) },
    {
      label: 'tackles + interceptions (team)',
      band: [22, 30],
      value: (metric(M.tackles) + metric(M.interceptions)) / teams,
    },
    { label: 'throw-ins (team)', band: [17, 23], value: td(TD.throwIns) / teams },
    { label: 'corners (team)', band: [4, 6], value: td(TD.corners) / teams },
    { label: 'goal kicks (team)', band: [7, 9], value: td(TD.goalKicks) / teams },
    { label: 'fouls (team)', band: [10, 13], value: td(TD.fouls) / teams },
    { label: 'offsides (team)', band: [1.5, 2.5], value: td(TD.offsides) / teams },
    { label: 'yellow cards (match)', band: [3.3, 4.3], value: yellows / n },
    { label: 'red cards (match)', band: [0.08, 0.15], value: reds / n },
    { label: 'goals (match)', band: [2.6, 2.9], value: goals.length / n },
    {
      label: 'set-piece goals (no pens) %',
      band: [20, 28],
      value: pct(goals.filter((g) => g.setPiece).length, goals.length),
    },
    {
      label: 'penalty goals %',
      band: [6, 9],
      value: pct(goals.filter((g) => g.penalty).length, goals.length),
    },
    {
      label: 'headed goals %',
      band: [14, 20],
      value: pct(goals.filter((g) => g.header).length, goals.length),
    },
    {
      label: 'goals by FW %',
      band: [50, 60],
      value: pct(goals.filter((g) => g.line === 'FW').length, goals.length),
    },
    {
      label: 'goals by MF %',
      band: [27, 37],
      value: pct(goals.filter((g) => g.line === 'MF').length, goals.length),
    },
    {
      label: 'goals by DF %',
      band: [8, 15],
      value: pct(goals.filter((g) => g.line === 'DF').length, goals.length),
    },
    { label: 'ball in play (min)', band: [54, 58], value: ballInPlay },
  ];
}

// ---- Candidate calibration report (T278) ---------------------------------------------------------

/** Families the report plays; fatigue, rare and season conditions are listed as not measured. */
const REPORT_FAMILIES = ['core', 'tactics', 'gap', 'tier', 'era', 'knockout'] as const;
const NOT_MEASURED: Record<string, string> = {
  fatigue:
    'not measured: clubs nobody owns carry fixed squad fatigue (MATCH-2), so a pre-match fatigue condition needs a fixture-level input this runner does not set',
  rare: 'not measured: rare-event conditions need 10,000 matches each (CORPUS_CONFIG.rarePerCondition); measured conditions report card, penalty and extra-time rates instead',
  season: 'not measured: season distributions belong to T284 (scripts/calibrate.ts --only seasons)',
};
/** Base strengths of the pool clubs a gap condition draws around (scripts/calibrate.ts). */
const GAP_BASES = [77, 66, 55, 44, 86];
const POOL = 8;

interface Job {
  condition: string;
  count: number;
  partition: Partition;
  round: number;
}

let calibrationWorld: World | undefined;
const pools = new Map<number, Club[]>();
/** A pool club of a strength in a synthetic world, as scripts/calibrate.ts draws them. */
function poolClub(strength: number, u: number): { w: World; club: Club } {
  calibrationWorld ??= createWorld({
    country: 'ENG',
    name: 'Calibration',
    color: '#335577',
    seed: 'calibration',
    level: 'normal',
  });
  const w = calibrationWorld;
  const s = Math.max(15, Math.min(99, Math.round(strength)));
  let pool = pools.get(s);
  if (!pool) {
    pool = Array.from({ length: POOL }, (_, k) => {
      const club: Club = {
        id: `CAL:0:0:${s}:${k}`,
        name: `Calibration ${s}/${k}`,
        short: 'CAL',
        country: 'ENG',
        tier: 0,
        group: 0,
        strength: s,
        reputation: 50,
        fans: 10000,
        color: '#335577',
      };
      w.clubs.push(club);
      return club;
    });
    pools.set(s, pool);
  }
  return { w, club: pool[Math.floor(u * pool.length)]! };
}

let corePairs: { w: World; home: Club; away: Club }[] | undefined;
/** The core condition's world-country-roster pairs, each club on its own tactic. */
function coreFixturePairs() {
  if (corePairs) return corePairs;
  const p = CORPUS_CONFIG.conditions[0]!.params as {
    worldSeeds: string[];
    world: Omit<Founding, 'seed'>;
    countries: string[];
    maxRatingGap: number;
  };
  corePairs = p.worldSeeds.flatMap((seed) => {
    const w = createWorld({ ...p.world, seed });
    return p.countries.flatMap((country) => {
      const clubs = w.clubs
        .filter((c) => c.country === country && c.tier === 0 && c.id !== w.playerClub)
        .map((c) => ({ c, r: rating(w, c) }));
      return clubs.flatMap((a, i) =>
        clubs
          .slice(i + 1)
          .filter((b) => Math.abs(a.r - b.r) <= p.maxRatingGap)
          .map((b) => ({ w, home: a.c, away: b.c })),
      );
    });
  });
  return corePairs;
}

/** One condition's fixtures on the candidate model, as samples the shared reports read. */
function playCondition(job: Job): { samples: MatchSample[]; ms: number } {
  const c = conditionOf(job.condition);
  const params = c.params as {
    home?: Tactic;
    away?: Tactic;
    bucket?: number;
    low?: number;
    high?: number;
    year?: number;
    decide?: DecideRule;
    fixture?: { year: number; round: number; kind: Fixture['kind'] };
  };
  const prefix = CORPUS_CONFIG.partitions[job.partition].prefix;
  const r = random(`${prefix}:r${job.round}:${c.id}:clubs`);
  const samples: MatchSample[] = [];
  const started = performance.now();
  for (let i = 0; i < job.count; i++) {
    let w: World, home: Club, away: Club;
    if (c.family === 'gap' || c.family === 'tier') {
      let hs: number, as: number;
      if (c.family === 'gap') {
        // Strengths around a tier base whose home-minus-away gap (home +3) aims at the bucket.
        const base = GAP_BASES[i % GAP_BASES.length]! + (r() - 0.5) * 6;
        const spread = params.bucket! - 3 + (r() - 0.5) * 5;
        hs = base + spread / 2;
        as = base - spread / 2;
      } else {
        hs = integer(r, params.low!, params.high!);
        as = integer(r, params.low!, params.high!);
      }
      const h = poolClub(hs, r()),
        a = poolClub(as, r());
      w = h.w;
      home = h.club;
      away = a.club === h.club ? pools.get(a.club.strength)!.find((x) => x !== h.club)! : a.club;
    } else {
      const pairs = coreFixturePairs();
      ({ w, home, away } = pairs[i % pairs.length]!);
    }
    const f: Fixture = {
      ...w.fixtures[0]!,
      ...(params.fixture ?? { year: 2024, round: 1, kind: 'league' as const }),
      ...(params.year ? { year: params.year } : {}),
      id: corpusFixtureId(job.partition, c.id, i, job.round),
      home: home.id,
      away: away.id,
    };
    const result = playGrid(
      buildGridSetup(w, f, {
        observe: false,
        recordPlayers: true,
        model: MATCH_MODEL_REVISION,
        ...(c.family === 'tactics' ? { tactics: [params.home!, params.away!] } : {}),
        ...(params.decide ? { decide: params.decide } : {}),
      }),
    );
    samples.push({
      record: result.record,
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: c.id,
      // Match strength of two clubs nobody owns: XI ratings and home ground (MATCH-2).
      gap: rating(w, home, f) + 3 - rating(w, away, f),
    });
  }
  return { samples, ms: (performance.now() - started) / Math.max(1, job.count) };
}

const LINES = ['FW', 'MF', 'DF', 'GK'];
/** One side's per-match means: the press diagnosis reads where its shots come from and who takes them. */
function sideSummary(samples: readonly MatchSample[], side: 0 | 1) {
  const n = samples.length;
  const m = (k: number, of: 0 | 1 = side) =>
    samples.reduce((a, s) => a + s.record.metrics[of]![k]!, 0);
  const d = (k: number) => samples.reduce((a, s) => a + s.record.detail![side]![k]!, 0);
  const shots = samples.flatMap((s) => s.diagnostics!.shots.filter((x) => x.side === side));
  const byLine = (list: typeof shots) =>
    Object.fromEntries(LINES.map((l) => [l, list.filter((x) => x.line === l).length / n]));
  const inBox = (x: { x: number; y: number }) => x.x >= 88.5 && Math.abs(x.y - 34) <= 20.16;
  const held = m(M.possession),
    against = m(M.possession, side === 0 ? 1 : 0);
  return {
    goals: m(M.goals) / n,
    shots: m(M.shots) / n,
    xgPerShot: shots.reduce((a, x) => a + x.xg, 0) / Math.max(1, shots.length),
    boxShotShare: shots.filter(inBox).length / Math.max(1, shots.length),
    boxEntries: d(TD.boxEntries) / n,
    frontOfBoxEntries: d(TD.frontOfBoxEntries) / n,
    passes: m(M.passes) / n,
    completion: m(M.completed) / Math.max(1, m(M.passes)),
    possession: held / Math.max(1, held + against),
    pressActions: d(TD.pressActions) / n,
    highTurnovers: d(TD.highTurnovers) / n,
    tacklesInterceptions: (m(M.tackles) + m(M.interceptions)) / n,
    shotsByLine: byLine(shots),
    goalsByLine: byLine(shots.filter((x) => x.goal)),
  };
}

const Z = 1.959964;
/** 95% Wilson interval of a share. */
function wilson(p: number, n: number): [number, number] {
  const centre = (p + (Z * Z) / (2 * n)) / (1 + (Z * Z) / n);
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / (1 + (Z * Z) / n);
  return [centre - half, centre + half];
}
/** Mean and its 95% normal interval. */
function meanCi(xs: readonly number[]): { mean: number; ci: [number, number] } {
  const n = xs.length,
    mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const half = (Z * sd) / Math.sqrt(Math.max(1, n));
  return { mean, ci: [mean - half, mean + half] };
}

/**
 * Player scoring concentration: braces and hat-tricks per match, and per club with 20+ goals in the
 * sample its top scorer's share of the club's goals and his goals per 38 club matches.
 */
function concentration(samples: readonly MatchSample[]) {
  let braces = 0,
    hatTricks = 0;
  const clubs = new Map<string, { matches: number; goals: number; players: Map<string, number> }>();
  const clubEntry = (id: string) => {
    let entry = clubs.get(id);
    if (!entry) clubs.set(id, (entry = { matches: 0, goals: 0, players: new Map() }));
    return entry;
  };
  for (const s of samples) {
    const r = s.record;
    const homeLines = r.lineCounts?.[0] ?? 0;
    r.players.forEach((p, i) => {
      const g = p.metrics[M.goals]!;
      if (g >= 2) braces++;
      if (g >= 3) hatTricks++;
      const entry = clubEntry(i < homeLines ? r.home : r.away);
      if (g) entry.players.set(p.id, (entry.players.get(p.id) ?? 0) + g);
    });
    clubEntry(r.home).matches++;
    clubEntry(r.home).goals += r.score.home;
    clubEntry(r.away).matches++;
    clubEntry(r.away).goals += r.score.away;
  }
  const scored = [...clubs.values()].filter((c) => c.goals >= 20);
  const top = (c: (typeof scored)[number]) => Math.max(0, ...c.players.values());
  return {
    bracesPerMatch: braces / samples.length,
    hatTricksPerMatch: hatTricks / samples.length,
    clubsWith20Goals: scored.length,
    topScorerShare: meanCi(scored.map((c) => top(c) / c.goals)),
    topScorerGoalsPer38: meanCi(scored.map((c) => (38 * top(c)) / c.matches)),
  };
}

/** One condition's measurements, compact enough to retain. */
function summarise(job: Job) {
  const { samples, ms } = playCondition(job);
  const c = conditionOf(job.condition);
  const n = samples.length;
  const ninety = samples.map((s) => s.record.regulation ?? s.record.score);
  const share = (f: (x: { home: number; away: number }) => boolean) => {
    const p = ninety.filter(f).length / n;
    return { share: p, ci: wilson(p, n) };
  };
  const full = samples.map((s) => validateFullMatchRecord(s.record)).filter((x) => x.length);
  const invariants = buildInvariantReport(samples);
  const cards = (k: number) =>
    samples.reduce((a, s) => a + s.record.detail![0]![k]! + s.record.detail![1]![k]!, 0) / n;
  return {
    condition: c.id,
    family: c.family,
    label: c.label,
    seeds: `${corpusFixtureId(job.partition, c.id, 0, job.round)} … ${n - 1}`,
    matches: n,
    belowCalibrationSize: n < calibrationSize(c),
    msPerMatch: ms,
    meanGap: meanCi(samples.map((s) => s.gap!)),
    outcome: {
      homeWin: share((x) => x.home > x.away),
      draw: share((x) => x.home === x.away),
      awayWin: share((x) => x.home < x.away),
    },
    goals: meanCi(samples.map((s) => s.record.score.home + s.record.score.away)),
    yellowsPerMatch: cards(TD.yellowCards),
    redsPerMatch: cards(TD.redCards),
    extraTime: samples.filter((s) => s.record.regulation).length / n,
    shootouts: samples.filter((s) => s.record.shootout).length / n,
    sides: [sideSummary(samples, 0), sideSummary(samples, 1)],
    concentration: concentration(samples),
    targets: buildTargetReport(samples).map((t) => ({
      id: t.id,
      band: t.band,
      status: t.status,
      value: t.value,
      interval: t.interval,
      error: t.error,
    })),
    invariants: {
      failed: invariants
        .filter((i) => i.failed)
        .map((i) => ({ id: i.id, failed: i.failed, examples: i.examples.slice(0, 2) })),
      unsupported: invariants.reduce((a, i) => a + i.unsupported, 0),
      fullRecordFailures: full.length,
      fullRecordExamples: full.slice(0, 2),
    },
    gapScores:
      c.family === 'gap'
        ? samples.map((s, i) => [s.gap!, ninety[i]!.home, ninety[i]!.away] as const)
        : undefined,
  };
}
type Summary = ReturnType<typeof summarise>;

/** What the measurements depend on: scripts/match-model-baseline.ts's scope and hash. */
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
  return { algorithm: 'sha256' as const, sha256: hash.digest('hex'), files: files.length };
}

function reportJobs(): Job[] {
  const partition = text('partition', 'calibration') as Partition;
  if (!(partition in CORPUS_CONFIG.partitions)) throw new Error(`unknown partition ${partition}`);
  const only = text('only', REPORT_FAMILIES.join(',')).split(',');
  for (const family of only)
    if (!(REPORT_FAMILIES as readonly string[]).includes(family))
      throw new Error(`unknown family ${family}`);
  const named = text('conditions', '').split(',').filter(Boolean);
  for (const id of named) conditionOf(id);
  return CORPUS_CONFIG.conditions
    .filter((c) => (named.length ? named.includes(c.id) : only.includes(c.family)))
    .map((c) => ({
      condition: c.id,
      count: Math.max(30, Math.round(calibrationSize(c) * option('scale', 1))),
      partition,
      round: option('round', 0),
    }));
}

async function runReport() {
  const out = text('out', 'docs/benchmarks/detailed-model-calibration.json');
  const jobs = reportJobs();
  const workers = Math.max(1, Math.min(option('jobs', cpus().length - 2), jobs.length));
  const source = sourceFingerprint();
  const started = performance.now();
  const queue = [...jobs];
  const done: Summary[] = [];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const child = fork(fileURLToPath(import.meta.url), ['--worker'], {
        execArgv: process.execArgv,
      });
      for (let job = queue.shift(); job; job = queue.shift()) {
        const next = job;
        const result = await new Promise<Summary>((resolve, reject) => {
          child.once('message', (m) => resolve(m as Summary));
          child.once('exit', (code) =>
            reject(new Error(`worker exited ${code} on ${next.condition}`)),
          );
          child.send(next);
        });
        child.removeAllListeners('exit');
        done.push(result);
        const o = result.outcome;
        console.log(
          `${result.condition}: ${result.matches} matches, goals ${result.goals.mean.toFixed(2)}, W/D/L ${(100 * o.homeWin.share).toFixed(1)}/${(100 * o.draw.share).toFixed(1)}/${(100 * o.awayWin.share).toFixed(1)}, ${result.msPerMatch.toFixed(0)} ms`,
        );
      }
      child.kill();
    }),
  );
  if (sourceFingerprint().sha256 !== source.sha256)
    throw new Error('Source changed during the measurement; rerun after edits settle');
  const order = new Map(CORPUS_CONFIG.conditions.map((c, i) => [c.id, i]));
  done.sort((a, b) => order.get(a.condition)! - order.get(b.condition)!);
  const gapSamples: MatchSample[] = done.flatMap((d) =>
    (d.gapScores ?? []).map(([gap, home, away]) => ({
      record: { score: { home, away } } as MatchRecord,
      incidentsTracked: true,
      condition: d.condition,
      gap,
    })),
  );
  const curve = gapSamples.length ? buildOutcomeTargetReport(gapSamples) : null;
  const measured = new Set(done.map((d) => d.condition));
  const report = {
    kind: 'detailed-model-calibration',
    version: MATCH_PARITY_VERSION,
    task: 'T278',
    model: MATCH_MODEL_REVISION,
    productionActivation:
      'off: the runner requests the candidate through buildGridSetup({ model })',
    releaseEvidence: false,
    provenance: {
      date: new Date().toISOString(),
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      gitDirty: !!execFileSync('git', ['status', '--porcelain', '--', ...SOURCE_SCOPE], {
        encoding: 'utf8',
      }).trim(),
      fingerprint: { ...source, scope: SOURCE_SCOPE },
      node: process.version,
      machine: {
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
      },
      command: `pnpm exec tsx scripts/grid-bands.ts ${args.join(' ')}`,
    },
    settings: {
      partition: jobs[0]?.partition,
      round: jobs[0]?.round,
      scale: option('scale', 1),
      calibrationPerCondition: CORPUS_CONFIG.calibrationPerCondition,
      workers,
      movement: GRID_MOVEMENT_CONFIG,
      ball: GRID_BALL_CONFIG,
    },
    coverage: CORPUS_CONFIG.conditions.map((c) => ({
      condition: c.id,
      status: measured.has(c.id) ? 'measured' : (NOT_MEASURED[c.family] ?? 'not selected'),
    })),
    speed: {
      note: 'Wall time on a shared, loaded machine: context for T285, never a football or release claim.',
      elapsedSeconds: (performance.now() - started) / 1000,
      msPerMatch: Object.fromEntries(done.map((d) => [d.condition, d.msPerMatch])),
    },
    outcomeCurve: curve,
    conditions: done.map((d) => ({ ...d, gapScores: undefined, msPerMatch: undefined })),
  };
  mkdirSync(dirname(out), { recursive: true });
  // Five significant digits keep the artifact readable without changing any reading it records.
  const rounded = (_key: string, value: unknown) =>
    typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(5)) : value;
  writeFileSync(out, JSON.stringify(report, rounded, 1) + '\n');
  console.log(
    `wrote ${out}: ${done.length} conditions in ${report.speed.elapsedSeconds.toFixed(0)} s, fingerprint ${source.sha256}`,
  );
  const core = done.find((d) => d.family === 'core');
  if (core)
    console.log(
      `core targets inside ${core.targets.filter((t) => t.status === 'inside').length}/${core.targets.length}; outside ${core.targets
        .filter((t) => t.status === 'outside')
        .map((t) => `${t.id}=${t.value?.toFixed(2)}`)
        .join(' ')}`,
    );
  if (curve) console.log(`outcome curve mean absolute error (−10…+40): ${curve.meanAbsoluteError}`);
}

if (args.includes('--worker')) {
  process.on('message', (job: Job) => process.send!(summarise(job)));
} else if (process.argv[1]?.endsWith('grid-bands.ts') && args.includes('--report')) {
  await runReport();
} else if (process.argv[1]?.endsWith('grid-bands.ts')) {
  const started = performance.now();
  const results = playBands(matches);
  const rows = measure(results);
  const added =
    results.reduce((a, r) => a + (r.record.added ?? []).reduce((x, y) => x + y, 0), 0) /
    results.length;
  const width = Math.max(...rows.map((r) => r.label.length));
  console.log(
    `grid bands: ${matches} matches, year ${year}, seeds grid-bands-1..4, model ${bandModel ?? 'pre-feature'}`,
  );
  console.log(`${'measure'.padEnd(width)}  band            value    ok`);
  for (const row of rows) {
    const ok = row.value >= row.band[0] && row.value <= row.band[1];
    const band = `${row.band[0]}–${row.band[1]}`.padEnd(14);
    console.log(
      `${row.label.padEnd(width)}  ${band}  ${row.value.toFixed(2).padStart(7)}  ${ok ? 'pass' : 'FAIL'}`,
    );
  }
  console.log(`added time per match ${added.toFixed(2)} min`);
  console.log(
    `passed ${rows.filter((r) => r.value >= r.band[0] && r.value <= r.band[1]).length}/${rows.length}`,
  );
  console.log(`${((performance.now() - started) / matches).toFixed(1)} ms a match`);
}
