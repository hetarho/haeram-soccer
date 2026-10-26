import { measurementIdentity } from './lib/measurement-identity';
/**
 * Aggregate-path measurement (→MATCH-22/26/28/29, docs/MATCH-MODEL-CONTRACT.md, T284): the
 * candidate aggregate adapter's samples through the shared registry (scripts/lib/match-parity.ts),
 * on the same condition fixtures and seeds scripts/grid-bands.ts --report plays on the detailed
 * engine. It reads the engine's exported path and never changes the production dispatch.
 *
 *   pnpm exec tsx scripts/match-parity.ts --report [--partition calibration|validation]
 *     [--round N] [--scale S] [--only core,tactics,gap,tier,fatigue,era,knockout,rare]
 *     [--conditions id,…] [--reference id,…] [--reference-scale S] [--rare-scale S]
 *     [--seasons N] [--jobs N] [--out FILE] [--patch JSON] [--reference-cache DIR]
 *     [--sizes id=N,…]
 *   default: calibration partition, round 0, scale 1, every match family, output
 *   docs/benchmarks/aggregate-model-calibration.json; `--reference` also plays the named
 *   conditions on the candidate detailed engine (same fixtures) for the MATCH-28 equivalence
 *   report, kept apart from the intended-target errors; `--seasons N` also plays N founded worlds
 *   one season each through ordinary settlement (season:league-20; `--only season` plays only them);
 *   `--stress N` plays N core fixtures with the red-card settlement forced to its fallback;
 *   `--patch` overrides configs in this process and its workers (t328-counter-roles.ts's form) and
 *   `--reference-cache` keeps each condition's detailed samples for later screens (T400);
 *   `--sizes` plays the named conditions at their own sizes, both paths (T401's pilot sizes)
 *
 *   pnpm exec tsx scripts/match-parity.ts --tactics [--partition …] [--round N] [--matches N]
 *     [--out FILE]
 *   T320's reading: the core condition's pairs with each club on its own tactic (uneven venues).
 *
 * Conditioning (CORPUS_CONFIG): a tactics condition forces both tactics with each club's squad
 * built for its forced formation (grid-bands `forcedRosters`, as the detailed runner) and starts
 * both squads from NEUTRAL_SQUAD_FATIGUE, a fatigue condition sets every matchday player's
 * pre-match fatigue, both through `conditionedMatch`, which redoes prepareMatch's arithmetic for
 * the changed inputs.
 */
import { execFileSync, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TD } from '../packages/contracts/src/detail';
import { MATCH_MODEL_REVISION } from '../packages/contracts/src/match-model';
import type {
  Fixture,
  Founding,
  MatchRecord,
  Player,
  Tactic,
  World,
} from '../packages/contracts/src/types';
import {
  advanceRound,
  clamp,
  createWorld,
  effectiveGap,
  matchForm,
  prepareMatch,
  rating,
  tacticalProfile,
} from '../packages/engine/src/index';
import {
  AGGREGATE_CONFIG,
  AGGREGATE_PARTICIPATION_CONFIG,
} from '../packages/engine/src/aggregate/config';
import {
  aggregateRecord,
  matchdayRosters,
  playAggregate,
  type AggregateMatch,
  type AggregateRebalanceLimits,
} from '../packages/engine/src/aggregate/engine';
import { slotAt } from '../packages/engine/src/aggregate/participation';
import { inMatchFatigue } from '../packages/engine/src/grid/changes';
import { playGrid } from '../packages/engine/src/grid/engine';
import { cellBand } from '../packages/engine/src/grid/pitch';
import { M } from '../packages/engine/src/grid/record';
import { buildGridSetup, eraRules, type DecideRule } from '../packages/engine/src/grid/setup';
import type { Prepared } from '../packages/engine/src/match';
import { validateFullMatchRecord } from '../packages/engine/src/match-model';
import { lineOf } from '../packages/engine/src/player';
import { withCandidateModel } from '../tests/fixtures/worlds';
import { applyBehaviour, behaviourOf } from './t328-counter-roles-variants';
import {
  conditionClubs,
  conditionFixture,
  coreFixturePairs,
  forcedFatigueApplied,
  forcedGap,
  forcedRosters,
  forceTacticRosters,
  rosterRating,
  type ConditionParams,
} from './grid-bands';
import {
  ADVANCED_COUNTER_TARGET,
  advancedCounterVerdicts,
  buildEquivalenceReport,
  buildInvariantReport,
  buildOutcomeTargetReport,
  buildTargetReport,
  calibrationSize,
  conditionOf,
  conditionValidationSize,
  CORPUS_CONFIG,
  corpusFixtureId,
  describeAdvancedCounters,
  describeTacticPairingParity,
  describeTacticPairings,
  DETAILED_ONLY_REASON,
  MATCH_PARITY_VERSION,
  PARITY_CONFIG,
  hatTrickReading,
  pilotNeeds,
  rareComparisonPower,
  requiredRareEvents,
  SCORING_CONCENTRATION_TARGET,
  scoringConcentrationVerdicts,
  tacticPairingParity as tacticPairingParityReport,
  tacticPairingVerdicts,
  TARGET_BANDS,
  type LedgerDiagnostics,
  type MatchSample,
  type ParityCondition,
  type Partition,
} from './lib/match-parity';

/**
 * Each side's freshness at the final whistle (→MATCH-29): 100 minus the mean in-match fatigue the
 * aggregate planner holds for the lines then on the pitch — the shared rule (grid/changes.ts
 * `inMatchFatigue`) over the minutes since the line came on, as the planner
 * (aggregate/participation.ts `SidePlanner.fatigue`) counts them: a move to another slot does not
 * restart it, and a player who left never returns, so his first stint began his time on.
 */
export function aggregateFreshness(match: AggregateMatch): [number, number] {
  const { length, stints } = match.participation;
  const side = (s: 0 | 1) => {
    const plan = match.plan.sides[s];
    const on = new Set(stints[s].filter((x) => x.to === length).map((x) => x.line));
    const since = new Map<number, number>();
    for (const x of stints[s])
      if (on.has(x.line)) since.set(x.line, Math.min(since.get(x.line) ?? x.from, x.from));
    const fatigue = [...since].map(([line, from]) => {
      const c = plan.candidates[line]!;
      return inMatchFatigue(c.fatigue, c.stamina, length - from, plan.pressing, plan.drain);
    });
    return 100 - fatigue.reduce((a, b) => a + b, 0) / fatigue.length;
  };
  return [side(0), side(1)];
}

/**
 * The aggregate ledger's readings for the target rows its cells resolve: open-play pass attempts by
 * the band they end in against the band they start in, each shot's cell, kind and its shooter's
 * line at his slot then, and the seconds the ball was in play.
 */
export function ledgerDiagnostics(match: AggregateMatch): LedgerDiagnostics {
  const { facts, participation, input, players } = match;
  const directions: [number[], number[]] = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  let ballInPlay = 0;
  facts.ledger.sides.forEach((side, s) => {
    for (const m of side.moves) {
      if (m.setPiece || m.kind === 'carry' || m.kind === 'takeOn') continue;
      const d = cellBand(m.to) - cellBand(m.from);
      directions[s]![d > 0 ? 0 : d === 0 ? 1 : 2]! += m.attempts;
    }
    for (const held of side.held) ballInPlay += held;
  });
  const shooters = new Map(players.shots.map((c) => [`${c.side}:${c.shot}`, c.shooter]));
  const shots = facts.ledger.sides.flatMap((side, s) =>
    side.shots.map((shot, i) => {
      const shooter = shooters.get(`${s}:${i}`);
      const slot =
        shooter === undefined ? undefined : slotAt(participation, s as 0 | 1, shooter, shot.minute);
      return {
        side: s as 0 | 1,
        cell: shot.cell,
        header: shot.header,
        setPiece: shot.kind === 'corner' || shot.kind === 'freeKick',
        penalty: shot.kind === 'penalty',
        goal: shot.outcome === 'goal',
        line: slot === undefined ? 'unknown' : input.sides[s as 0 | 1].slots[slot]!.line,
      };
    }),
  );
  return { ballInPlay, directions, shots };
}

/** What a measurement changes about a fixture between clubs nobody owns. */
export interface Conditioning {
  /** Both tactics, instead of the clubs' own, each club's squad built for its forced formation (T321). */
  tactics?: readonly [Tactic, Tactic];
  /** Every matchday player's pre-match fatigue on both sides. */
  fatigue?: number;
}

/**
 * A fixture between clubs nobody owns prepared under a measurement's conditions: prepareMatch and
 * the matchday rosters as the aggregate path reads them, then — when a tactic or a squad fatigue is
 * set — prepareMatch's own arithmetic for two clubs nobody owns again on the changed inputs: the XI
 * rated at the formation it plays (as world.ts `rating` rates a club's own), home ground 3 and the
 * unmodelled manager's 4 on each side (MATCH-2), the gap's diminishing returns, the day's form,
 * then the profiles of the tactics played and the possession chance. `gap` is the home-minus-away
 * match strength before form for the outcome curve. Forced tactics field the detailed runner's
 * squads built for the forced formation (grid-bands `forcedRosters`, T321), so both engines measure
 * MATCH-29 on the same players; the club's own XI seated slot by slot stood out of position (T284
 * review: mean slot level 0.863 for balanced, 0.906–0.923 for the others).
 */
export function conditionedMatch(w: World, f: Fixture, conditioning: Conditioning = {}) {
  const prepared = prepareMatch(w, f);
  let rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const { tactics, fatigue } = conditioning;
  if (tactics === undefined && fatigue === undefined)
    return {
      prepared,
      rosters,
      gap: rating(w, prepared.teams[0], f) + 3 - rating(w, prepared.teams[1], f),
    };
  if (prepared.ownSide !== undefined) throw new Error('conditioning is for clubs nobody owns');
  if (tactics !== undefined)
    rosters = forcedRosters(
      w,
      f,
      prepared.teams,
      tactics,
      [rosters[0].length - 11, rosters[1].length - 11],
      fatigue,
    );
  else if (fatigue !== undefined)
    rosters = [
      rosters[0].map((p) => ({ ...p, fatigue })),
      rosters[1].map((p) => ({ ...p, fatigue })),
    ];
  const squads: [Player[], Player[]] = [rosters[0].slice(0, 11), rosters[1].slice(0, 11)];
  const played: [Tactic, Tactic] = tactics ? [tactics[0], tactics[1]] : prepared.tactics;
  // The XI rated at the formation it plays: grid-bands' `rosterRating`, so a forced pairing's gap
  // is the same in both runners (`forcedGap`, CORPUS_CONFIG v3).
  const rated = ([0, 1] as const).map((side) =>
    rosterRating(prepared.teams[side], squads[side], played[side]),
  );
  const context = [3 + 4, 4];
  const form = matchForm(w, f);
  const base = [rated[0]! + context[0]!, rated[1]! + context[1]!];
  const gap = base[0]! - base[1]!,
    ease = (effectiveGap(gap) - gap) / 2;
  const strength = [base[0]! + ease + form[0], base[1]! - ease + form[1]];
  const shift = [
    form[0] + (context[0]! - context[1]!) / 2 + ease,
    form[1] + (context[1]! - context[0]!) / 2 - ease,
  ];
  const profiles = [0, 1].map((side) =>
    tacticalProfile(squads[side]!, played[side]!, played[1 - side]!),
  );
  const conditioned: Prepared = {
    ...prepared,
    squads,
    tactics: played,
    strength,
    shift,
    profiles,
    possessionChance:
      clamp(
        50 + (strength[0]! - strength[1]!) / 2 + profiles[0]!.possession - profiles[1]!.possession,
        20,
        80,
      ) / 100,
  };
  return { prepared: conditioned, rosters, gap: rated[0]! + 3 - rated[1]! };
}

/** One fixture on the candidate aggregate path, as `simulateAggregate` plays it, with its match. */
export function aggregateRun(
  w: World,
  f: Fixture,
  condition: string,
  decide?: DecideRule,
  conditioning: Conditioning = {},
  limits?: AggregateRebalanceLimits,
): { sample: MatchSample; match: AggregateMatch } {
  const { prepared, rosters, gap } = conditionedMatch(w, f, conditioning);
  const match = playAggregate(w, f, prepared, rosters, decide, limits);
  return {
    match,
    sample: {
      record: aggregateRecord(f, rosters, match),
      incidentsTracked: true,
      condition,
      fixture: f.id,
      gap,
      // MATCH-29's freshness of a forced pairing only from its declared squad fatigue (T321).
      ...(conditioning.tactics === undefined || forcedFatigueApplied(rosters, conditioning.fatigue)
        ? { freshness: aggregateFreshness(match) }
        : {}),
      ledger: ledgerDiagnostics(match),
    },
  };
}

/** The aggregate adapter: one fixture on the candidate aggregate path as a report sample. */
export function aggregateSample(
  w: World,
  f: Fixture,
  condition: string,
  decide?: DecideRule,
  conditioning?: Conditioning,
): MatchSample {
  return aggregateRun(w, f, condition, decide, conditioning).sample;
}

/** The core condition's fixtures on the aggregate path, each club on its own tactic (T320). */
export function aggregateCoreSamples(partition: Partition, round: number, count: number) {
  const core = conditionOf('core:equal-top-tier');
  const { fixture } = core.params as {
    fixture: { year: number; round: number; kind: Fixture['kind'] };
  };
  const pairs = coreFixturePairs();
  return Array.from({ length: count }, (_, i) => {
    const { w, home, away } = pairs[i % pairs.length]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      ...fixture,
      id: corpusFixtureId(partition, core.id, i, round),
      home: home.id,
      away: away.id,
    };
    return aggregateSample(w, f, core.id);
  });
}

/** A condition's conditioning: forced tactics in the tactics family, its declared squad fatigue. */
export function conditioningOf(conditionId: string): Conditioning {
  const c = conditionOf(conditionId);
  const params = c.params as ConditionParams;
  return {
    ...(c.family === 'tactics' ? { tactics: [params.home!, params.away!] as const } : {}),
    ...(params.fatigue !== undefined ? { fatigue: params.fatigue } : {}),
  };
}

/** One condition's fixtures on the aggregate path, with each fixture's red-card settlement. */
export function aggregateCondition(
  conditionId: string,
  partition: Partition,
  round: number,
  count: number,
) {
  const c = conditionOf(conditionId);
  const params = c.params as ConditionParams;
  const conditioning = conditioningOf(conditionId);
  const r = conditionClubs(c, partition, round);
  const samples: MatchSample[] = [];
  const settlement: { retry: number; unreconciled: number }[] = [];
  for (let i = 0; i < count; i++) {
    const { w, f } = conditionFixture(c, partition, round, i, r);
    const { sample, match } = aggregateRun(w, f, c.id, params.decide, conditioning);
    samples.push(sample);
    settlement.push({ retry: match.retry, unreconciled: match.unreconciled?.length ?? 0 });
  }
  return { samples, settlement };
}

/**
 * The same fixtures on the candidate detailed engine (grid-bands' procedure), for the equivalence
 * report. A tactics condition forces both tactics on squads built for the forced formations from
 * the declared squad fatigue (grid-bands `forceTacticRosters`, as grid-bands and `conditionedMatch`
 * do), a fatigue condition sets every matchday player's pre-match fatigue as `conditionedMatch`
 * does (T323); seasons have no detailed reference here.
 */
export function referenceCondition(
  conditionId: string,
  partition: Partition,
  round: number,
  count: number,
) {
  const c = conditionOf(conditionId);
  if (c.family === 'season')
    throw new Error(`${c.id}: the detailed runner does not condition ${c.family} yet`);
  const params = c.params as ConditionParams;
  const r = conditionClubs(c, partition, round);
  const forced = c.family === 'tactics';
  return Array.from({ length: count }, (_, i): MatchSample => {
    const { w, home, away, f } = conditionFixture(c, partition, round, i, r);
    const setup = buildGridSetup(w, f, {
      observe: false,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      ...(forced ? { tactics: [params.home!, params.away!] } : {}),
      ...(params.decide ? { decide: params.decide } : {}),
    });
    const fatigue = params.fatigue;
    const applied = forced && forceTacticRosters(w, f, setup, [home, away], fatigue);
    if (!forced && fatigue !== undefined)
      setup.rosters = [
        setup.rosters[0].map((p) => ({ ...p, fatigue })),
        setup.rosters[1].map((p) => ({ ...p, fatigue })),
      ];
    const result = playGrid(setup);
    return {
      record: result.record,
      diagnostics: result.diagnostics,
      incidentsTracked: true,
      condition: c.id,
      fixture: f.id,
      gap: forced
        ? forcedGap([home, away], setup.rosters, setup.tactics)
        : rating(w, home, f) + 3 - rating(w, away, f),
      // MATCH-29's freshness of a forced pairing only from its declared squad fatigue (T321).
      ...(!forced || applied ? { freshness: result.diagnostics.freshness } : {}),
    };
  });
}

// ---- Summaries ------------------------------------------------------------------------------------

const Z = 1.959964;
function wilson(p: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const centre = (p + (Z * Z) / (2 * n)) / (1 + (Z * Z) / n);
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / (1 + (Z * Z) / n);
  return [centre - half, centre + half];
}
function meanCi(xs: readonly number[]): { mean: number; ci: [number, number]; n: number } {
  const n = xs.length,
    mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const half = (Z * sd) / Math.sqrt(Math.max(1, n));
  return { mean, ci: [mean - half, mean + half], n };
}
/** A Poisson count's rate per match with its 95% interval (log scale; zero events: rule of three). */
function rateCi(events: number, matches: number) {
  const rate = events / Math.max(1, matches);
  const ci: [number, number] =
    events > 0
      ? [rate * Math.exp(-Z / Math.sqrt(events)), rate * Math.exp(Z / Math.sqrt(events))]
      : [0, 3 / Math.max(1, matches)];
  return { events, matches, rate, ci };
}

const incidents = (r: MatchRecord) => r.incidents ?? [];
/**
 * Rare events of one sample set (→MATCH-28: a dedicated comparison with a 20% relative margin and
 * enough events to resolve it): counts and rates, and whether the events seen would let an equally
 * sized reference resolve the comparison (`power` at this count, `requiredEvents` for 80%).
 */
export function rareEvents(samples: readonly MatchSample[]) {
  const n = samples.length;
  const count = (f: (r: MatchRecord) => number) => samples.reduce((a, s) => a + f(s.record), 0);
  const td = (k: number) => (r: MatchRecord) => r.detail![0]![k]! + r.detail![1]![k]!;
  const goals = (r: MatchRecord) => r.score.home + r.score.away;
  const kinds = {
    redCards: count((r) => incidents(r).filter((x) => x.kind === 'red').length),
    secondYellows: count((r) => incidents(r).filter((x) => x.kind === 'secondYellow').length),
    penalties: count(td(TD.penalties)),
    penaltiesScored: count(td(TD.penaltiesScored)),
    injuries: count((r) => incidents(r).filter((x) => x.kind === 'injury').length),
    extraTime: count((r) => (r.regulation ? 1 : 0)),
    shootouts: count((r) => (r.shootout ? 1 : 0)),
    sixGoalMatches: count((r) => (goals(r) >= 6 ? 1 : 0)),
    fourGoalMargins: count((r) => (Math.abs(r.score.home - r.score.away) >= 4 ? 1 : 0)),
    hatTricks: count((r) => r.players.filter((p) => p.metrics[M.goals]! >= 3).length),
  };
  const required = requiredRareEvents();
  return Object.fromEntries(
    Object.entries(kinds).map(([k, events]) => [
      k,
      {
        ...rateCi(events, n),
        power: events > 0 ? rareComparisonPower(events) : 0,
        requiredEvents: required,
        resolvable: events >= required,
      },
    ]),
  );
}

/**
 * Player scoring concentration of a sample set: braces and hat-tricks a match (MATCH-23's hat-trick
 * row: a verdict on the core condition, context elsewhere, `hatTrickReading`), and for each club with 20+ goals in the sample its top scorer's share of
 * the club's goals and his goals per 38 club matches — context only, since MATCH-23 reads those
 * over whole seasons (`seasonsReport`).
 */
export function concentration(
  samples: readonly MatchSample[],
  condition: Pick<ParityCondition, 'family'>,
) {
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
  const n = Math.max(1, samples.length);
  return {
    bracesPerMatch: braces / n,
    hatTricksPerMatch: rateCi(hatTricks, samples.length),
    hatTricks: hatTrickReading(hatTricks, samples.length, condition),
    clubsWith20Goals: scored.length,
    topScorerShare: meanCi(scored.map((c) => top(c) / c.goals)),
    topScorerGoalsPer38: meanCi(scored.map((c) => (38 * top(c)) / c.matches)),
  };
}

/**
 * How T281's red-card settlement fell (→STAFF-45): fixtures settled on their own streams, on a
 * retry, or on the exhausted fallback with answers left `unreconciled`, and the retried fixtures'
 * goals, reds and draws beside the first-draw fixtures' (the re-draw's selection bias).
 */
export function settlementReport(
  samples: readonly MatchSample[],
  settlement: readonly { retry: number; unreconciled: number }[],
) {
  const retried = samples.filter((_, i) => settlement[i]!.retry > 0);
  const first = samples.filter((_, i) => settlement[i]!.retry === 0);
  const read = (list: readonly MatchSample[]) => ({
    matches: list.length,
    goals: meanCi(list.map((s) => s.record.score.home + s.record.score.away)),
    reds: meanCi(
      list.map(
        (s) =>
          incidents(s.record).filter(
            (x) => x.kind !== 'yellow' && x.kind !== 'sub' && x.kind !== 'injury',
          ).length,
      ),
    ),
    draws: (() => {
      const p =
        list.filter((s) => {
          const x = s.record.regulation ?? s.record.score;
          return x.home === x.away;
        }).length / Math.max(1, list.length);
      return { share: p, ci: wilson(p, list.length) };
    })(),
  });
  const histogram: Record<string, number> = {};
  for (const x of settlement) histogram[x.retry] = (histogram[x.retry] ?? 0) + 1;
  const fallback = settlement.filter((x) => x.unreconciled > 0).length;
  return {
    limits: {
      rebalanceSearches: AGGREGATE_PARTICIPATION_CONFIG.changes.rebalanceSearches,
      rebalanceRetries: AGGREGATE_PARTICIPATION_CONFIG.changes.rebalanceRetries,
    },
    retries: histogram,
    retried: rateCi(retried.length, samples.length),
    fallback: rateCi(fallback, samples.length),
    unreconciledAnswers: settlement.reduce((a, x) => a + x.unreconciled, 0),
    firstDraw: read(first),
    retriedDraw: read(retried),
  };
}

interface Job {
  condition: string;
  count: number;
  partition: Partition;
  round: number;
  /** Matches the detailed reference plays on the same fixtures (0: none). */
  reference: number;
}

const LINES = ['FW', 'MF', 'DF', 'GK'];
/**
 * A screen's detailed reference kept between runs (`--reference-cache <dir>`, T400): one
 * condition's grid samples, keyed by the condition, partition, round and count, the grid's source
 * (`gridFingerprint`) and the patch's settings outside
 * the aggregate path, so aggregate-only screens read one reference without replaying it.
 */
function referenceSamples(job: Job): MatchSample[] {
  const dir = text('reference-cache', '');
  if (!dir) return referenceCondition(job.condition, job.partition, job.round, job.reference);
  const grid = Object.fromEntries(
    behaviourOf('', patch).flatMap((p) =>
      Object.entries(p).filter(
        ([k]) => k !== 'aggregate' && k !== 'attribution' && k !== 'participation',
      ),
    ),
  );
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        gridFingerprint(),
        grid,
        job.condition,
        job.partition,
        job.round,
        job.reference,
      ]),
    )
    .digest('hex')
    .slice(0, 16);
  const file = `${dir}/${job.condition.replace(/[^\w-]/g, '_')}-${key}.json.gz`;
  if (existsSync(file))
    return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as MatchSample[];
  const samples = referenceCondition(job.condition, job.partition, job.round, job.reference);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, gzipSync(JSON.stringify(samples)));
  return samples;
}
/** One condition's measurements on the aggregate path, compact enough to retain. */
function summarise(job: Job) {
  const c = conditionOf(job.condition);
  const started = performance.now();
  const { samples, settlement } = aggregateCondition(
    job.condition,
    job.partition,
    job.round,
    job.count,
  );
  const ms = (performance.now() - started) / Math.max(1, job.count);
  const n = samples.length;
  const ninety = samples.map((s) => s.record.regulation ?? s.record.score);
  const share = (f: (x: { home: number; away: number }) => boolean) => {
    const p = ninety.filter(f).length / n;
    return { share: p, ci: wilson(p, n) };
  };
  const full = samples.map((s) => validateFullMatchRecord(s.record)).filter((x) => x.length);
  const invariants = buildInvariantReport(samples);
  const goalsByLine = Object.fromEntries(
    LINES.map((line) => [
      line,
      samples.reduce(
        (a, s) => a + s.ledger!.shots.filter((x) => x.goal && x.line === line).length,
        0,
      ) /
        Math.max(
          1,
          samples.reduce((a, s) => a + s.ledger!.shots.filter((x) => x.goal).length, 0),
        ),
    ]),
  );
  let reference: unknown;
  let referencePairing: MatchSample[] | undefined;
  if (job.reference > 0) {
    const refStarted = performance.now();
    const refSamples = referenceSamples(job);
    // MATCH-29 on the detailed reference too, so both paths' pairing verdicts compare (T372).
    if (c.family === 'tactics') referencePairing = refSamples.map(pairingSample);
    const refMs = (performance.now() - refStarted) / job.reference;
    const eq = buildEquivalenceReport({
      condition: c.id,
      reference: refSamples,
      candidate: samples.slice(0, job.reference),
    });
    // What the equivalence would need, from this reference as the pilot (MATCH-28's power rule).
    const needs = conditionValidationSize(pilotNeeds(refSamples, c));
    reference = {
      matches: job.reference,
      msPerMatch: refMs,
      pilotValidationSize: {
        size: needs.size,
        sufficient: needs.sufficient,
        limiting: needs.limiting,
        unsized: needs.unsized,
      },
      summary: eq.summary,
      constants: eq.constants,
      blocking: eq.blocking.length,
      passed: eq.passed,
      metrics: eq.metrics.map((m) => ({
        id: m.id,
        status: m.status,
        ...(m.difference && {
          difference: m.difference.estimate,
          interval: m.difference.interval,
          margin: m.difference.margin,
        }),
        ...(m.cdf && { cdf: m.cdf.distance, cdfStatus: m.cdf.status }),
        ...(m.rate && { rateRatio: m.rate.ratio, rateInterval: m.rate.interval }),
        ...(m.reason && { reason: m.reason }),
      })),
      relationships: eq.relationships,
      targets: buildTargetReport(refSamples).map((t) => ({
        id: t.id,
        status: t.status,
        value: t.value,
        interval: t.interval,
      })),
      invariantFailures: buildInvariantReport(refSamples).filter((i) => i.failed).length,
    };
  }
  return {
    condition: c.id,
    family: c.family,
    label: c.label,
    conditioning: conditioningOf(c.id),
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
    extraTime: samples.filter((s) => s.record.regulation).length / n,
    shootouts: samples.filter((s) => s.record.shootout).length / n,
    goalsByLine,
    rare: rareEvents(samples),
    concentration: concentration(samples, c),
    settlement: settlementReport(samples, settlement),
    targets: buildTargetReport(samples, 'aggregate').map((t) => ({
      id: t.id,
      band: t.band,
      status: t.status,
      value: t.value,
      interval: t.interval,
      error: t.error,
      ...(t.status === 'detailed-only' && { reason: DETAILED_ONLY_REASON }),
    })),
    advancedCounters: advancedCounterVerdicts(samples).map((a) => ({
      id: a.id,
      status: a.status,
      band: a.band,
      value: a.value,
      interval: a.interval,
      ...(a.matchTarget && { matchTarget: a.matchTarget }),
    })),
    invariants: {
      failed: invariants
        .filter((i) => i.failed)
        .map((i) => ({ id: i.id, failed: i.failed, examples: i.examples.slice(0, 2) })),
      unsupported: invariants.reduce((a, i) => a + i.unsupported, 0),
      checked: n,
      fullRecordFailures: full.length,
      fullRecordExamples: full.slice(0, 2),
    },
    reference,
    gapScores:
      c.family === 'gap'
        ? samples.map((s, i) => [s.gap!, ninety[i]!.home, ninety[i]!.away] as const)
        : undefined,
    pairingSamples: c.family === 'tactics' ? samples.map(pairingSample) : undefined,
    referencePairingSamples: referencePairing,
  };
}
type Summary = ReturnType<typeof summarise>;

/** What MATCH-29's pairing verdicts read of a match, compact enough to send to the parent. */
function pairingSample(s: MatchSample): MatchSample {
  return {
    record: {
      ...s.record,
      players: [],
      highlights: [],
      lineCounts: undefined,
      incidents: undefined,
    },
    incidentsTracked: false,
    condition: s.condition,
    fixture: s.fixture,
    freshness: s.freshness,
  };
}

// ---- Seasons --------------------------------------------------------------------------------------

/**
 * One whole season of a founded world on the candidate model through ordinary settlement
 * (`withCandidateModel`, then `advanceRound` to the last round, every fixture without the own club
 * on the aggregate path): per 20-club top division its table (champion and bottom points a match,
 * goals a match), its scoring leaders and role shares from the season ledger, transfers that span
 * clubs, bans and injuries carried into later fixtures, and the exact reconciliation of every
 * club's goals with its players' contributions in every competition.
 */
export function seasonSample(partition: Partition, round: number, index: number) {
  const season = conditionOf('season:league-20');
  const p = CORPUS_CONFIG.conditions[0]!.params as { world: Omit<Founding, 'seed'> };
  const seed = `${CORPUS_CONFIG.partitions[partition].prefix}:r${round}:${season.id}:${index}`;
  const w = withCandidateModel(createWorld({ ...p.world, seed }));
  while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
  const stats = w.npcSeason!;
  const leagues = stats.competitions.filter((c) => c.kind === 'league');
  const divisions = leagues.flatMap((c) => {
    const fixtures = w.fixtures.filter(
      (f) => f.kind === 'league' && f.groupKey === c.groupKey && f.score,
    );
    const clubs = new Set(fixtures.flatMap((f) => [f.home, f.away]));
    if (clubs.size !== 20) return [];
    const table = new Map([...clubs].map((id) => [id, { points: 0, gd: 0, played: 0 }]));
    let goals = 0;
    for (const f of fixtures) {
      const s = f.score!;
      const h = table.get(f.home)!,
        a = table.get(f.away)!;
      h.played++;
      a.played++;
      h.gd += s.home - s.away;
      a.gd += s.away - s.home;
      goals += s.home + s.away;
      if (s.home > s.away) h.points += 3;
      else if (s.home < s.away) a.points += 3;
      else {
        h.points++;
        a.points++;
      }
    }
    const order = [...table.values()].sort((x, y) => y.points - x.points || y.gd - x.gd);
    const scorers = c.players
      .map((pl) => ({
        position: pl.position,
        clubs: pl.clubs.length,
        goals: pl.clubs.reduce((g, x) => g + x.metrics[M.goals]!, 0),
      }))
      .sort((x, y) => y.goals - x.goals);
    const clubGoals = new Map(c.clubs.map((x) => [x.club, x.metrics[M.goals]!]));
    const topShare = [...clubGoals].map(([club, g]) => {
      const best = Math.max(
        0,
        ...c.players.map((pl) => pl.clubs.find((x) => x.club === club)?.metrics[M.goals] ?? 0),
      );
      return g > 0 ? best / g : 0;
    });
    const byLine: Record<string, number> = {};
    for (const s of scorers)
      byLine[lineOf(s.position)] = (byLine[lineOf(s.position)] ?? 0) + s.goals;
    const total = scorers.reduce((a, s) => a + s.goals, 0);
    return [
      {
        groupKey: c.groupKey,
        matches: fixtures.length,
        championPpg: order[0]!.points / order[0]!.played,
        bottomPpg: order.at(-1)!.points / order.at(-1)!.played,
        goalsPerMatch: goals / fixtures.length,
        topScorerGoals: scorers[0]?.goals ?? 0,
        clubTopScorerShare: topShare.reduce((a, b) => a + b, 0) / topShare.length,
        goalsByLine: Object.fromEntries(
          Object.entries(byLine).map(([k, v]) => [k, v / Math.max(1, total)]),
        ),
        multiClubPlayers: c.players.filter((pl) => pl.clubs.length > 1).length,
      },
    ];
  });
  // Exact: every club's goals in every competition equal its players' contributions there.
  let reconciled = 0,
    unreconciled = 0;
  for (const c of stats.competitions)
    for (const club of c.clubs) {
      const players = c.players.reduce(
        (a, pl) => a + (pl.clubs.find((x) => x.club === club.club)?.metrics[M.goals] ?? 0),
        0,
      );
      if (players === club.metrics[M.goals]) reconciled++;
      else unreconciled++;
    }
  const d = w.discipline;
  return {
    seed,
    divisions,
    reconciled,
    unreconciled,
    bans: d?.bans.length ?? 0,
    injuriesOut: d?.out.length ?? 0,
  };
}

/** The red-card settlement forced to its fallback on core fixtures (T281 limit 7, T284). */
interface StressJob {
  stress: number;
  partition: Partition;
  round: number;
}
/** One decision set and no retry: every disagreeing red-card answer settles on the fallback. */
export const FORCED_EXHAUSTION: AggregateRebalanceLimits = {
  rebalanceSearches: 1,
  rebalanceRetries: 0,
};

/**
 * How often the settlement's fallback would settle a fixture with a red-card answer against the
 * score if the search stopped at its first plan, and with what bias: the same core fixtures under
 * FORCED_EXHAUSTION and under the configured search, the fallback fixtures' scores beside their
 * configured settlement (paired), so the frequency and the shift the fallback would carry are
 * measured even though the configured search never reaches it.
 */
export function settlementStress(partition: Partition, round: number, count: number) {
  const core = conditionOf('core:equal-top-tier');
  const r = conditionClubs(core, partition, round);
  const paired: { forced: MatchRecord; configured: MatchRecord; answers: number }[] = [];
  let reds = 0;
  for (let i = 0; i < count; i++) {
    const { w, f } = conditionFixture(core, partition, round, i, r);
    const forced = aggregateRun(w, f, core.id, undefined, {}, FORCED_EXHAUSTION);
    const rec = forced.sample.record;
    if ((rec.incidents ?? []).some((x) => x.kind === 'red' || x.kind === 'secondYellow')) reds++;
    if (!forced.match.unreconciled) continue;
    const configured = aggregateRun(w, f, core.id).sample.record;
    paired.push({ forced: rec, configured, answers: forced.match.unreconciled.length });
  }
  const diff = (f: (x: MatchRecord) => number) =>
    meanCi(paired.map((p) => f(p.forced) - f(p.configured)));
  const homeWin = (x: MatchRecord) => (x.score.home > x.score.away ? 1 : 0);
  const draw = (x: MatchRecord) => (x.score.home === x.score.away ? 1 : 0);
  return {
    limits: FORCED_EXHAUSTION,
    matches: count,
    matchesWithRed: reds,
    fallback: rateCi(paired.length, count),
    fallbackAmongRedMatches: rateCi(paired.length, reds),
    unreconciledAnswers: paired.reduce((a, p) => a + p.answers, 0),
    pairedAgainstConfigured: {
      goals: diff((x) => x.score.home + x.score.away),
      goalDifference: diff((x) => x.score.home - x.score.away),
      homeWin: diff(homeWin),
      draw: diff(draw),
    },
  };
}
type StressSummary = ReturnType<typeof settlementStress>;

interface SeasonJob {
  season: number;
  partition: Partition;
  round: number;
}
type SeasonSummary = ReturnType<typeof seasonSample>;

/**
 * The season measures over every sampled 20-club top division, with MATCH-23's scoring
 * concentration verdicts on the club top scorers' share and the league top scorer's goals (the
 * hat-trick row is read per match, `concentration`). The intervals treat each division as one
 * observation (a world's divisions in one season are not clustered by world); bans and injuries
 * are per season of a whole world.
 */
export function seasonsReport(samples: readonly SeasonSummary[]) {
  const divisions = samples.flatMap((s) => s.divisions);
  const read = (f: (d: (typeof divisions)[number]) => number) => meanCi(divisions.map(f));
  const reading = (r: ReturnType<typeof meanCi>) => ({ value: r.mean, interval: r.ci, n: r.n });
  const lines = ['FW', 'MF', 'DF', 'GK'];
  return {
    seasons: samples.length,
    divisions: divisions.length,
    // Sorted: workers finish seasons in any order.
    seeds: samples.map((s) => s.seed).sort(),
    championPpg: read((d) => d.championPpg),
    bottomPpg: read((d) => d.bottomPpg),
    goalsPerMatch: read((d) => d.goalsPerMatch),
    topScorerGoals: read((d) => d.topScorerGoals),
    clubTopScorerShare: read((d) => d.clubTopScorerShare),
    goalsByLine: Object.fromEntries(lines.map((l) => [l, read((d) => d.goalsByLine[l] ?? 0)])),
    multiClubPlayersPerDivision: read((d) => d.multiClubPlayers),
    scoringConcentration: scoringConcentrationVerdicts({
      clubTopScorerShare: reading(read((d) => d.clubTopScorerShare)),
      leagueTopScorerGoals: reading(read((d) => d.topScorerGoals)),
    }).filter((v) => v.id !== 'hatTricksPerMatch'),
    reconciliation: {
      clubCompetitions: samples.reduce((a, s) => a + s.reconciled + s.unreconciled, 0),
      unreconciled: samples.reduce((a, s) => a + s.unreconciled, 0),
    },
    bansPerSeason: meanCi(samples.map((s) => s.bans)),
    npcInjuriesPerSeason: meanCi(samples.map((s) => s.injuriesOut)),
  };
}

// ---- Report -------------------------------------------------------------------------------------

/** The match families this runner plays; season conditions are measured by their own runner. */
const MATCH_FAMILIES = ['core', 'tactics', 'gap', 'tier', 'fatigue', 'era', 'knockout', 'rare'];
/** What the measurements depend on: scripts/match-model-baseline.ts's scope and hash. */
const SOURCE_SCOPE = [
  'packages',
  'apps/web/src/adapters',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  // The season runner's `withCandidateModel`.
  'tests/fixtures/worlds.ts',
];
/** Full runner included: reference-procedure edits invalidate automatically. */
let gridSource: string | undefined;
function gridFingerprint() {
  return (gridSource ??= measurementIdentity('scripts/match-parity.ts', process.cwd(), {
    referenceOnly: true,
  }).sha256);
}
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

const args = process.argv.slice(2);
// A measurement's config overrides (`--patch <json>`, as t328-counter-roles.ts takes them): the
// candidate configs patched in this process and in every worker it forks, never in the source.
const patchAt = args.indexOf('--patch');
const patch = patchAt >= 0 ? args[patchAt + 1] : undefined;
if (patch) for (const p of behaviourOf('', patch)) applyBehaviour(p);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const option = (name: string, fallback: number) => Number(text(name, String(fallback)));

function reportJobs(): Job[] {
  const partition = text('partition', 'calibration') as Partition;
  if (!(partition in CORPUS_CONFIG.partitions)) throw new Error(`unknown partition ${partition}`);
  const only = text('only', MATCH_FAMILIES.join(',')).split(',');
  for (const family of only)
    if (!MATCH_FAMILIES.includes(family) && family !== 'season')
      throw new Error(`unknown family ${family}`);
  const named = text('conditions', '').split(',').filter(Boolean);
  const references = text('reference', '').split(',').filter(Boolean);
  // Each condition's own size (`--sizes id=n,…`, T401: its pilot size), its reference the same.
  const sizes = new Map(
    text('sizes', '')
      .split(',')
      .filter(Boolean)
      .map((x) => {
        const [id, n] = x.split('=');
        if (!Number.isInteger(Number(n)) || Number(n) < 30) throw new Error(`bad size ${x}`);
        return [id!, Number(n)] as const;
      }),
  );
  for (const id of [...named, ...references, ...sizes.keys()]) conditionOf(id);
  return CORPUS_CONFIG.conditions
    .filter((c) =>
      named.length ? named.includes(c.id) : only.includes(c.family) && c.family !== 'season',
    )
    .map((c) => {
      const scale = c.rare ? option('rare-scale', option('scale', 1)) : option('scale', 1);
      const count = sizes.get(c.id) ?? Math.max(30, Math.round(calibrationSize(c) * scale));
      return {
        condition: c.id,
        count,
        partition,
        round: option('round', 0),
        reference: references.includes(c.id)
          ? sizes.has(c.id)
            ? count
            : Math.min(count, Math.max(30, Math.round(count * option('reference-scale', 1))))
          : 0,
      };
    });
}

/** The detailed reference artifact's target readings, for the summary-level comparison. */
function referenceArtifact() {
  const file = 'docs/benchmarks/detailed-model-calibration.json';
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // grid-bands may be writing it while a long run reports (T372).
    return undefined;
  }
  const a = parsed as {
    version: string;
    provenance: { gitHead: string; fingerprint: { sha256: string } };
    conditions: {
      condition: string;
      matches: number;
      targets: { id: string; value?: number; interval?: [number, number] }[];
      outcome: Record<string, { share: number }>;
    }[];
  };
  return a;
}

async function runReport() {
  const out = text('out', 'docs/benchmarks/aggregate-model-calibration.json');
  const jobs = reportJobs();
  const workers = Math.max(1, Math.min(option('jobs', 4), jobs.length + option('seasons', 0)));
  const source = sourceFingerprint();
  const computation = measurementIdentity('scripts/match-parity.ts');
  const started = performance.now();
  // Reference jobs are the slow ones: start them first.
  const seasonCount = option('seasons', 0);
  const seasonJobs: SeasonJob[] = Array.from({ length: seasonCount }, (_, season) => ({
    season,
    partition: text('partition', 'calibration') as Partition,
    round: option('round', 0),
  }));
  const stressCount = option('stress', 0);
  const stressJobs: StressJob[] = stressCount
    ? [
        {
          stress: stressCount,
          partition: text('partition', 'calibration') as Partition,
          round: option('round', 0),
        },
      ]
    : [];
  // Reference jobs, whole seasons and the settlement stress are the slow ones: start them first.
  const queue: (Job | SeasonJob | StressJob)[] = [
    ...stressJobs,
    ...seasonJobs,
    ...[...jobs].sort((a, b) => b.reference - a.reference),
  ];
  const done: Summary[] = [];
  const seasons: SeasonSummary[] = [];
  let stress: StressSummary | undefined;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      // Its own flag: grid-bands.ts, imported for the condition fixtures, answers `--worker`.
      const child = fork(
        fileURLToPath(import.meta.url),
        [
          '--aggregate-worker',
          ...(patch ? ['--patch', patch] : []),
          ...(text('reference-cache', '')
            ? ['--reference-cache', text('reference-cache', '')]
            : []),
        ],
        {
          execArgv: process.execArgv,
        },
      );
      for (let job = queue.shift(); job; job = queue.shift()) {
        const next = job;
        const message = await new Promise<Summary | SeasonSummary | StressSummary>(
          (resolve, reject) => {
            child.once('message', (m) => resolve(m as Summary | SeasonSummary | StressSummary));
            child.once('exit', (code) =>
              reject(
                new Error(
                  `worker exited ${code} on ${'season' in next ? `season ${next.season}` : 'stress' in next ? 'the settlement stress' : next.condition}`,
                ),
              ),
            );
            child.send(next);
          },
        );
        child.removeAllListeners('exit');
        if ('fallbackAmongRedMatches' in message) {
          stress = message;
          console.log(
            `settlement stress: ${message.fallback.events} of ${message.matches} fixtures on the fallback`,
          );
          continue;
        }
        if ('divisions' in message) {
          seasons.push(message);
          console.log(
            `season ${message.seed}: ${message.divisions.length} divisions, goals ${message.divisions.map((x) => x.goalsPerMatch.toFixed(2)).join('/')}`,
          );
          continue;
        }
        const result = message;
        done.push(result);
        const o = result.outcome;
        const inside = result.targets.filter((t) => t.status === 'inside').length;
        console.log(
          `${result.condition}: ${result.matches} matches, goals ${result.goals.mean.toFixed(2)}, W/D/L ${(100 * o.homeWin.share).toFixed(1)}/${(100 * o.draw.share).toFixed(1)}/${(100 * o.awayWin.share).toFixed(1)}, targets inside ${inside}/${result.targets.length}, ${result.msPerMatch.toFixed(1)} ms${result.reference ? ' (+reference)' : ''}`,
        );
        // A long reference run keeps what it measured if it is cut off (T372).
        if (result.reference) writeArtifact(false);
      }
      child.kill();
    }),
  );
  if (measurementIdentity('scripts/match-parity.ts').sha256 !== computation.sha256)
    throw new Error('Source changed during the measurement; rerun after edits settle');
  writeArtifact(true);

  function writeArtifact(final: boolean) {
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
    const pairingSamples = done.flatMap((d) => d.pairingSamples ?? []);
    const tacticPairings = pairingSamples.length ? tacticPairingVerdicts(pairingSamples) : null;
    const referencePairingSamples = done.flatMap((d) => d.referencePairingSamples ?? []);
    const referenceTacticPairings = referencePairingSamples.length
      ? tacticPairingVerdicts(referencePairingSamples)
      : null;
    // MATCH-29 parity: each row as a paired aggregate − detailed difference over the same forced
    // fixtures, judged against MATCH-28's margin (T396).
    const tacticPairingParity =
      pairingSamples.length && referencePairingSamples.length
        ? tacticPairingParityReport(pairingSamples, referencePairingSamples)
        : null;
    const measured = new Set(done.map((d) => d.condition));
    const artifact = referenceArtifact();
    const againstArtifact = artifact && {
      note: 'Point differences (aggregate − detailed) of the target readings on the same condition fixtures and seeds; the detailed artifact may come from another source tree, so this is context for T286, not MATCH-28 equivalence.',
      reference: {
        version: artifact.version,
        gitHead: artifact.provenance.gitHead,
        fingerprint: artifact.provenance.fingerprint.sha256,
      },
      conditions: done.flatMap((d) => {
        const ref = artifact.conditions.find((x) => x.condition === d.condition);
        if (!ref) return [];
        return [
          {
            condition: d.condition,
            draws: d.outcome.draw.share - (ref.outcome.draw?.share ?? NaN),
            homeWins: d.outcome.homeWin.share - (ref.outcome.homeWin?.share ?? NaN),
            targets: Object.fromEntries(
              d.targets.flatMap((t) => {
                const r = ref.targets.find((x) => x.id === t.id);
                return t.value === undefined || r?.value === undefined
                  ? []
                  : [[t.id, t.value - r.value]];
              }),
            ),
          },
        ];
      }),
    };
    const report = {
      kind: 'aggregate-model-calibration',
      version: MATCH_PARITY_VERSION,
      task: 'T284',
      model: MATCH_MODEL_REVISION,
      productionActivation:
        'off: the runner plays the aggregate adapter (playAggregate) directly; no world activates the model',
      releaseEvidence: false,
      // Written after each finished reference job; false only once every job is in (T372).
      partial: !final,
      provenance: {
        date: new Date().toISOString(),
        gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        gitDirty: !!execFileSync('git', ['status', '--porcelain', '--', ...SOURCE_SCOPE], {
          encoding: 'utf8',
        }).trim(),
        fingerprint: { ...source, scope: SOURCE_SCOPE },
        computationFingerprint: computation,
        node: process.version,
        machine: {
          platform: platform(),
          arch: arch(),
          cpu: cpus()[0]?.model ?? 'unknown',
          logicalCpus: cpus().length,
        },
        command: `pnpm exec tsx scripts/match-parity.ts ${args.join(' ')}`,
      },
      configs: {
        parity: PARITY_CONFIG.version,
        corpus: CORPUS_CONFIG.version,
        aggregate: AGGREGATE_CONFIG,
        participation: AGGREGATE_PARTICIPATION_CONFIG,
        scoringConcentration: SCORING_CONCENTRATION_TARGET,
      },
      settings: {
        partition: text('partition', 'calibration'),
        round: option('round', 0),
        scale: option('scale', 1),
        rareScale: option('rare-scale', option('scale', 1)),
        seasons: seasonCount,
        workers,
        forcedTactics:
          "tactic pairings force both tactics on the core pairs with each club's squad built for its forced formation (grid-bands forcedRosters, the detailed runner's rule) and start both squads from NEUTRAL_SQUAD_FATIGUE; the XI is rated at the formation it plays, the profiles and possession chance follow the tactics played",
        fatigue:
          'fatigue conditions set every matchday player of both sides to the pre-match fatigue',
        knockouts:
          'target counts and durations of a match with extra time are read per 90 minutes played (TargetBand.perNinety)',
        cellRows: TARGET_BANDS.filter((t) => t.reads === 'cells').map((t) => t.id),
        detailedOnlyRows: {
          rows: TARGET_BANDS.filter((t) => t.reads === 'diagnostics').map((t) => t.id),
          reason: DETAILED_ONLY_REASON,
        },
        advancedCounters: {
          target: ADVANCED_COUNTER_TARGET.version,
          unbanded: Object.fromEntries(
            ADVANCED_COUNTER_TARGET.counters.flatMap((c) =>
              'unbanded' in c ? [[c.id, c.unbanded]] : [],
            ),
          ),
        },
      },
      coverage: CORPUS_CONFIG.conditions.map((c) => ({
        condition: c.id,
        status: measured.has(c.id)
          ? 'measured'
          : c.id === 'season:league-20' && seasons.length
            ? `measured: ${seasons.length} founded worlds, one season each through ordinary settlement`
            : c.family === 'season'
              ? 'not measured: century careers need 100-season worlds (T285/T286 century runs)'
              : 'not selected',
      })),
      seasons: seasons.length ? seasonsReport(seasons) : null,
      settlementStress: stress ?? null,
      speed: {
        note: 'Wall time on a shared, loaded machine: context for T285, never a football or release claim.',
        elapsedSeconds: (performance.now() - started) / 1000,
        msPerMatch: Object.fromEntries(done.map((d) => [d.condition, d.msPerMatch])),
      },
      outcomeCurve: curve,
      tacticPairings,
      referenceTacticPairings,
      tacticPairingParity,
      againstArtifact,
      conditions: done.map((d) => ({
        ...d,
        gapScores: undefined,
        pairingSamples: undefined,
        referencePairingSamples: undefined,
        msPerMatch: undefined,
      })),
    };
    mkdirSync(dirname(out), { recursive: true });
    const rounded = (_key: string, value: unknown) =>
      typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(5)) : value;
    writeFileSync(out, JSON.stringify(report, rounded, 1) + '\n');
    console.log(
      `wrote ${out}${final ? '' : ' (partial)'}: ${done.length} conditions in ${report.speed.elapsedSeconds.toFixed(0)} s, fingerprint ${source.sha256}`,
    );
    if (!final) return;
    for (const d of done.filter((x) => x.family === 'core' || x.family === 'rare'))
      console.log(
        `${d.condition} targets inside ${d.targets.filter((t) => t.status === 'inside').length}/${d.targets.length}; outside ${d.targets
          .filter((t) => t.status === 'outside' || t.status === 'unresolved')
          .map((t) => `${t.id}=${t.value?.toFixed(3)}(${t.status[0]})`)
          .join(
            ' ',
          )}; detailed-only ${d.targets.filter((t) => t.status === 'detailed-only').length}`,
      );
    const core = done.find((x) => x.family === 'core');
    if (core) for (const line of describeAdvancedCounters(core.advancedCounters)) console.log(line);
    if (curve)
      console.log(`outcome curve mean absolute error (−10…+40): ${curve.meanAbsoluteError}`);
    if (tacticPairings)
      for (const line of describeTacticPairings(tacticPairings)) console.log(line);
    if (referenceTacticPairings)
      for (const line of describeTacticPairings(referenceTacticPairings)) console.log(line);
    if (tacticPairingParity)
      for (const line of describeTacticPairingParity(tacticPairingParity)) console.log(line);
  }
}

if (args.includes('--aggregate-worker')) {
  process.on('message', (job: Job | SeasonJob | StressJob) =>
    process.send!(
      'season' in job
        ? seasonSample(job.partition, job.round, job.season)
        : 'stress' in job
          ? settlementStress(job.partition, job.round, job.stress)
          : summarise(job),
    ),
  );
} else if (process.argv[1]?.endsWith('scripts/match-parity.ts')) {
  if (args.includes('--report')) await runReport();
  else if (!args.includes('--tactics')) {
    console.log('usage: pnpm exec tsx scripts/match-parity.ts --report|--tactics [options]');
  } else {
    const partition = text('partition', 'calibration') as Partition;
    if (!(partition in CORPUS_CONFIG.partitions)) throw new Error(`unknown partition ${partition}`);
    const round = Number(text('round', '0'));
    const core = conditionOf('core:equal-top-tier');
    const count = Number(text('matches', String(calibrationSize(core))));
    const started = performance.now();
    const samples = aggregateCoreSamples(partition, round, count);
    const tacticPairings = tacticPairingVerdicts(samples);
    const report = {
      kind: 'aggregate-tactic-pairings',
      version: MATCH_PARITY_VERSION,
      path: 'aggregate (prepareMatch + matchdayRosters + playAggregate + aggregateRecord)',
      condition: core.id,
      tacticAssignment: 'club',
      partition,
      round,
      seeds: `${corpusFixtureId(partition, core.id, 0, round)} … ${count - 1}`,
      command: `pnpm exec tsx scripts/match-parity.ts ${args.join(' ')}`,
      tacticPairings,
    };
    console.log(
      `aggregate path, ${core.id}, ${count} matches in ${((performance.now() - started) / 1000).toFixed(1)} s; venues ${JSON.stringify(tacticPairings.venues)}`,
    );
    for (const line of describeTacticPairings(tacticPairings)) console.log(line);
    const out = text('out', '');
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
      console.log(`wrote ${out}`);
    }
  }
}
