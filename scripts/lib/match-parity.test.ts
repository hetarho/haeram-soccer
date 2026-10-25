import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../packages/contracts/src/detail';
import type { Fixture, MatchRecord, Tactic } from '../../packages/contracts/src/types';
import { clubStyle, createWorld, PRESS_LOAD_FATIGUE } from '../../packages/engine/src/index';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import { inMatchFatigue } from '../../packages/engine/src/grid/changes';
import { M } from '../../packages/engine/src/grid/record';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { forcedGap, forceTacticRosters } from '../grid-bands';
import { FORMATIONS, levelFactor } from '../../packages/engine/src/player';
import { zeroMetrics } from '../../packages/engine/src/primitives';
import {
  aggregateFreshness,
  aggregateRun,
  conditionedMatch,
  rareEvents,
  settlementReport,
} from '../match-parity';
import {
  ADVANCED_COUNTER_TARGET,
  advancedCounterVerdicts,
  buildCoverageReport,
  buildEquivalenceReport,
  buildInvariantReport,
  buildOutcomeTargetReport,
  buildParityReport,
  buildPerformanceReport,
  buildTargetReport,
  calibrationSize,
  clusterSpread,
  compareDistributions,
  comparePerformance,
  compareRelationship,
  conditionOf,
  conditionValidationSize,
  CORPUS_CONFIG,
  corpusFixtureIds,
  COUNTER_INDEXES,
  describeAdvancedCounters,
  describeTacticPairingParity,
  describeTacticPairings,
  equivalencePower,
  HAT_TRICK_CONTEXT,
  hatTrickReading,
  INCIDENT_KINDS,
  MATCH_PARITY_VERSION,
  METRIC_BY_ID,
  METRIC_REGISTRY,
  NEUTRAL_SQUAD_FATIGUE,
  normalCdf,
  normalQuantile,
  observe,
  outcomeTarget,
  PERFORMANCE_CONFIG,
  pilotNeeds,
  poissonReading,
  rareComparisonPower,
  releaseGates,
  requiredRareEvents,
  ruleExclusions,
  SCORING_CONCENTRATION_TARGET,
  scoringConcentrationVerdicts,
  seedOverlap,
  TACTIC_PAIRING_TARGET,
  TARGET_BANDS,
  tacticPairingParity,
  tacticPairingVerdicts,
  validateCorpusConfig,
  validateRegistry,
  validationSize,
  type LedgerShot,
  type MatchSample,
  type Observations,
  type PairingEstimate,
  type PerformanceComponent,
  type Provenance,
} from './match-parity';

// Synthetic records and observations only (→ARCH-21): no engine run, no claim about real matches.
function team(goals = 0, shots = 12) {
  const m = zeroMetrics();
  m[M.goals] = goals;
  m[M.passes] = 400;
  m[M.completed] = 320;
  m[M.shots] = shots;
  m[M.onTarget] = Math.max(goals, 4);
  m[M.minutes] = 90;
  m[M.possession] = 45;
  return m;
}
function record(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: 'synthetic:1',
    year: 2024,
    round: 1,
    kind: 'league',
    home: 'SYN:H',
    away: 'SYN:A',
    country: 'ENG',
    groupKey: 'ENG:0:0',
    score: { home: 0, away: 0 },
    metrics: [team(), team()],
    players: [],
    highlights: [],
    tactics: ['balanced', 'balanced'],
    ...overrides,
  };
}
const sample = (r: MatchRecord, incidentsTracked = true): MatchSample => ({
  record: r,
  incidentsTracked,
  condition: 'core:equal-top-tier',
});
/** Values at evenly spaced normal quantiles: a deterministic sample with this mean and spread. */
const spread = (n: number, mean: number, sd: number) =>
  Array.from({ length: n }, (_, i) => mean + sd * normalQuantile((i + 0.5) / n));
const obs = (values: number[]): Observations => ({
  values,
  clusters: values.map((_, i) => i),
  missing: 0,
  undefinedRatios: 0,
  zeros: values.filter((v) => v === 0).length,
});
const mean = { id: 'td.crosses', comparison: 'mean-cdf' as const, applies: true };
/**
 * Events a path must expect for 80% power against [0.8, 1.2], Poisson counts included; pinned
 * because the corpus is frozen on it.
 */
const REQUIRED_RARE_EVENTS = 536;

describe('match parity registry', () => {
  it('covers every counter exactly once', () => {
    expect(validateRegistry()).toEqual([]);
    for (const [family, indexes] of Object.entries(COUNTER_INDEXES)) {
      const covered = METRIC_REGISTRY.filter((d) => d.family === family).map((d) => d.index);
      expect(covered.sort((a, b) => a! - b!)).toEqual(Object.values(indexes).sort((a, b) => a - b));
    }
    expect(
      METRIC_REGISTRY.filter((d) => d.family === 'incident')
        .map((d) => d.key)
        .sort(),
    ).toEqual([...INCIDENT_KINDS].sort());
    // A counter appended to the contracts without an entry fails coverage.
    const grown = { ...COUNTER_INDEXES, 'team-detail': { ...TD, newCounter: 31 } };
    expect(validateRegistry(METRIC_REGISTRY, grown)).toContain(
      'team-detail index 31 (newCounter) has no registry entry',
    );
    const copy = { ...METRIC_BY_ID.get('td.keyPasses')!, id: 'td.keyPassesAgain' };
    expect(validateRegistry([...METRIC_REGISTRY, copy])).toContain(
      'team-detail index 0 is covered by td.keyPasses and td.keyPassesAgain',
    );
    const unknown = { ...METRIC_BY_ID.get('ratio.ppda')!, id: 'ratio.other' };
    unknown.ratio = { ...unknown.ratio!, numerator: 'td.nothing' };
    expect(validateRegistry([...METRIC_REGISTRY, unknown])).toContain(
      'ratio.other refers to unknown td.nothing',
    );
  });

  it('rejects missing metrics instead of zero filling', () => {
    // A legacy-summary-like record: no advanced counters, xG, player lines or added time.
    const bare = sample(record());
    // A detailed record whose advanced counters really are zero.
    const zero = sample(record({ detail: [emptyTeamDetail(), emptyTeamDetail()], xg: [0, 0] }));
    const keyPasses = METRIC_BY_ID.get('td.keyPasses')!;
    expect(observe([bare], keyPasses)).toMatchObject({ values: [], missing: 1, zeros: 0 });
    expect(observe([zero], keyPasses)).toMatchObject({ values: [0, 0], missing: 0, zeros: 2 });
    const coverage = buildCoverageReport([bare, zero]);
    expect(coverage.rows.find((r) => r.id === 'td.keyPasses')).toMatchObject({
      present: 1,
      missing: 1,
      zeros: 2,
    });
    expect(coverage.missing).toEqual(expect.arrayContaining(['td.keyPasses', 'pd.xg', 'team.xg']));
    expect(coverage.notApplicable).toEqual(['player.possession']);
    // No crosses attempted: the completion share is undefined, not 0%.
    expect(observe([zero], METRIC_BY_ID.get('ratio.crossCompletion')!)).toMatchObject({
      values: [],
      undefinedRatios: 2,
      missing: 0,
    });
    // Untracked incidents are missing; tracked with none recorded are real zeros.
    const red = METRIC_BY_ID.get('incident.red')!;
    expect(observe([sample(record(), false)], red).missing).toBe(1);
    expect(observe([bare], red)).toMatchObject({ missing: 0, zeros: 2 });

    const report = buildEquivalenceReport({
      condition: 'core:equal-top-tier',
      reference: Array.from({ length: 40 }, () => zero),
      candidate: Array.from({ length: 40 }, () => bare),
    });
    expect(report.metrics.find((m) => m.id === 'td.keyPasses')!.status).toBe('missing');
    expect(report.blocking).toContain('td.keyPasses');
    expect(report.passed).toBe(false);
    // A season condition without season samples has its measures missing, never passed.
    const seasons = buildEquivalenceReport({
      condition: 'season:league-20',
      reference: [],
      candidate: [],
    });
    expect(seasons.metrics.find((m) => m.id === 'season.championPpg')!.status).toBe('missing');
    expect(seasons.passed).toBe(false);
    const targets = buildTargetReport([bare]);
    expect(targets.find((t) => t.id === 'crosses')!.status).toBe('missing');
    expect(targets.find((t) => t.id === 'passForward')!.status).toBe('missing');
  });

  it('keeps training and validation seeds disjoint', () => {
    expect(validateCorpusConfig(CORPUS_CONFIG)).toEqual([]);
    const ids = (partition: 'calibration' | 'validation', round = 0) =>
      CORPUS_CONFIG.conditions.flatMap((c) => corpusFixtureIds(partition, c.id, 50, round));
    const calibration = ids('calibration'),
      validation = ids('validation'),
      heldOut = ids('validation', 1);
    expect(new Set(calibration).size).toBe(calibration.length);
    for (const world of CORPUS_CONFIG.conditions[0]!.params.worldSeeds as string[]) {
      expect(seedOverlap(calibration, validation, world)).toEqual({ ids: [], streams: 0 });
      expect(seedOverlap(validation, heldOut, world)).toEqual({ ids: [], streams: 0 });
    }
    expect(corpusFixtureIds('validation', 'gap:10', 3)).toEqual(
      corpusFixtureIds('validation', 'gap:10', 3),
    );
    expect(seedOverlap(calibration, calibration.slice(0, 2)).ids).toHaveLength(2);
    const shared = { calibration: { prefix: 'parity' }, validation: { prefix: 'parity' } };
    expect(validateCorpusConfig({ ...CORPUS_CONFIG, partitions: shared })).toContain(
      'calibration and validation partitions must have distinct prefixes',
    );
  });

  it('does not call overlap a proof of equivalence', () => {
    // The interval includes zero but reaches past the margin: not evidence of equivalence.
    const wide = compareDistributions(mean, obs(spread(40, 10, 5)), obs(spread(40, 10.2, 5)));
    expect(wide.difference!.interval[0]).toBeLessThan(0);
    expect(wide.difference!.interval[1]).toBeGreaterThan(wide.difference!.margin);
    expect(wide.status).toBe('insufficient');
    const close = compareDistributions(
      mean,
      obs(spread(20000, 10, 5)),
      obs(spread(20000, 10.05, 5)),
    );
    expect(close.status).toBe('equivalent');
    const far = compareDistributions(mean, obs(spread(20000, 10, 5)), obs(spread(20000, 13, 5)));
    expect(far.status).toBe('different');
    // Outcome rates: a 1-point difference on 100 matches each is far from resolved.
    const rate = (n: number, p: number) =>
      obs(Array.from({ length: n }, (_, i) => (i < n * p ? 1 : 0)));
    const outcome = { id: 'outcome.homeWin', comparison: 'proportion' as const, applies: true };
    const proportions = compareDistributions(outcome, rate(100, 0.45), rate(100, 0.46));
    expect(proportions.difference!.interval[0]).toBeLessThan(0);
    expect(proportions.status).toBe('insufficient');
    expect(compareDistributions(outcome, rate(40000, 0.45), rate(40000, 0.455)).status).toBe(
      'equivalent',
    );
  });

  it('reports constant and underpowered variables', () => {
    const fill = (n: number, value: number) => obs(Array(n).fill(value));
    // Both paths held at one value: equivalent by the zero difference, listed as constant.
    const constant = compareDistributions(mean, fill(50, 90), fill(50, 90));
    expect(constant).toMatchObject({
      status: 'equivalent',
      constant: true,
      reason: 'both paths constant and equal',
    });
    expect(compareDistributions(mean, fill(50, 0), fill(50, 0))).toMatchObject({
      status: 'equivalent',
      constant: true,
    });
    // A constant reference keeps MATCH-28's 5% margin: a candidate held elsewhere differs.
    const none = compareDistributions(mean, fill(50, 5), fill(50, 0));
    expect(none.status).toBe('different');
    expect(none.difference!.margin).toBeCloseTo(0.25, 10);
    // …and one that mostly matches it can be shown equivalent once the sample resolves it.
    const mostly = obs(Array.from({ length: 20000 }, (_, i) => (i % 20 === 0 ? 4 : 5)));
    expect(compareDistributions(mean, fill(20000, 5), mostly).status).toBe('equivalent');
    // A reference constant at 0 leaves no margin: nothing but a resolved difference is decided.
    const near = obs([...Array(46).fill(0), 1, 1, -1, -1]);
    expect(compareDistributions(mean, fill(50, 0), near)).toMatchObject({
      status: 'insufficient',
      reason: 'reference constant at 0: no margin',
    });
    expect(compareDistributions(mean, fill(50, 0), fill(50, 2)).status).toBe('different');
    expect(compareDistributions(mean, obs(spread(10, 5, 1)), obs(spread(10, 5, 1))).status).toBe(
      'underpowered',
    );
    const rare = { id: 'incident.red', comparison: 'rate-ratio' as const, applies: true };
    const events = (n: number, k: number) =>
      obs(Array.from({ length: n }, (_, i) => (i < k ? 1 : 0)));
    const few = compareDistributions(rare, events(1000, 20), events(1000, 22));
    expect(few.status).toBe('underpowered');
    expect(few.rate!.requiredEvents).toBe(requiredRareEvents());
    expect(compareDistributions(rare, events(1000, 0), events(1000, 3)).status).toBe(
      'underpowered',
    );
    // No events on either path is an equal constant once both paths have their minimum sample.
    expect(compareDistributions(rare, events(1000, 0), events(1000, 0))).toMatchObject({
      status: 'equivalent',
      constant: true,
      reason: 'no events on either path',
    });
    expect(compareDistributions(rare, events(10, 0), events(10, 0)).status).toBe('underpowered');
    expect(compareDistributions(rare, events(10000, 600), events(10000, 610)).status).toBe(
      'equivalent',
    );
    // The interval decides: fewer events than planned still pass once the interval fits.
    expect(compareDistributions(rare, events(10000, 500), events(10000, 500)).status).toBe(
      'equivalent',
    );
    // Goals never vary on either path: the shots–goals correlation cannot be identified.
    const scoreless = Array.from({ length: 40 }, (_, i) =>
      sample(record({ metrics: [team(0, 5 + (i % 9)), team(0, 6 + (i % 7))] })),
    );
    expect(compareRelationship(['team.shots', 'team.goals'], scoreless, scoreless).status).toBe(
      'unidentifiable',
    );
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    // Equivalence power is two-sided: a 3-point outcome margin at p = 0.5 needs 5,838 matches a
    // path for 80% (the one-sided formula's 4,361 reach about 60%).
    const outcome = validationSize(0.5, 0.03);
    expect(outcome).toMatchObject({ needed: 5838, size: 5838, sufficient: true });
    expect(outcome.power).toBeGreaterThanOrEqual(0.8);
    expect(equivalencePower(0.5 * Math.sqrt(2 / 5837), 0.03)).toBeLessThan(0.8);
    expect(equivalencePower(0.5 * Math.sqrt(2 / 4361), 0.03)).toBeCloseTo(0.6, 1);
    expect(validationSize(5, 0.5)).toMatchObject({ size: 4000, sufficient: true });
    expect(validationSize(50, 0.5)).toMatchObject({ size: 100000, sufficient: false });
    expect(validationSize(50, 0.5).power).toBeLessThan(0.8);
    // Rare events: the fewest expected per path for which the comparison itself says equivalent
    // with 80% probability over Poisson counts.
    const required = requiredRareEvents();
    expect(required).toBe(REQUIRED_RARE_EVENTS);
    expect(rareComparisonPower(required)).toBeGreaterThanOrEqual(0.8);
    expect(rareComparisonPower(required - 1)).toBeLessThan(0.8);
    expect(rareComparisonPower(473)).toBeLessThan(0.8);
    // Pilot spread is per match: two sides of a match averaged before the spread is taken.
    const paired = { ...obs([1, 3, 2, 4, 6, 8]), clusters: [0, 0, 1, 1, 2, 2] };
    expect(clusterSpread(paired)).toBeCloseTo(Math.sqrt(7), 10);
  });

  it('leaves rule-impossible metrics out of a condition verdict', () => {
    // Applicability comes from MATCH-6/20 rules only.
    expect(Object.keys(conditionOf('core:equal-top-tier').notApplicable).sort()).toEqual([
      'outcome.extraTime',
      'outcome.shootout',
    ]);
    expect(conditionOf('knockout:single-match').notApplicable).toEqual({});
    expect(conditionOf('rare:extra-time').notApplicable).toEqual({});
    expect(Object.keys(conditionOf('era:1950').notApplicable)).toContain('incident.sub');
    expect(Object.keys(conditionOf('era:1965').notApplicable)).not.toContain('incident.sub');
    expect(ruleExclusions({ year: 2024, decide: { awayGoals: false } })).toEqual({});

    const under = (condition: string) =>
      Array.from({ length: 40 }, (_, i) => ({
        ...sample(record({ metrics: [team(i % 3, 10 + (i % 5)), team(i % 2, 12)] })),
        condition,
      }));
    const league = under('core:equal-top-tier');
    const report = buildEquivalenceReport({
      condition: 'core:equal-top-tier',
      reference: league,
      candidate: league,
    });
    const status = (id: string) => report.metrics.find((m) => m.id === id)!.status;
    expect(status('outcome.extraTime')).toBe('not-applicable');
    expect(report.notApplicable).toEqual(
      expect.arrayContaining([
        { id: 'outcome.extraTime', reason: 'no tie that must produce a winner (MATCH-6)' },
        { id: 'outcome.shootout', reason: 'no tie that must produce a winner (MATCH-6)' },
      ]),
    );
    // Equal constants pass and stay listed; neither kind blocks the verdict.
    expect(report.constants).toEqual(expect.arrayContaining(['team.minutes', 'team.passes']));
    for (const id of ['outcome.extraTime', 'outcome.shootout', 'team.minutes'])
      expect(report.blocking).not.toContain(id);
    expect(report.metrics.some((m) => METRIC_BY_ID.get(m.id)!.family === 'season')).toBe(false);
    // The same absence under a knockout tie is measured, not ruled out: it is judged, here as an
    // equal constant at 0.
    const tie = under('knockout:single-match');
    const knockout = buildEquivalenceReport({
      condition: 'knockout:single-match',
      reference: tie,
      candidate: tie,
    });
    expect(knockout.metrics.find((m) => m.id === 'outcome.extraTime')).toMatchObject({
      status: 'equivalent',
      constant: true,
    });
    expect(knockout.notApplicable.map((n) => n.id)).not.toContain('outcome.extraTime');
    // An era without substitutions rules them out.
    const early = under('era:1950');
    expect(
      buildEquivalenceReport({
        condition: 'era:1950',
        reference: early,
        candidate: early,
      }).metrics.find((m) => m.id === 'incident.sub'),
    ).toMatchObject({ status: 'not-applicable', reason: 'no substitutions in 1950 (MATCH-20)' });
    expect(() =>
      buildEquivalenceReport({ condition: 'era:1950', reference: league, candidate: early }),
    ).toThrow(/drawn under core:equal-top-tier/);
  });

  it('fails a league record that played extra time', () => {
    const extraTime = record({
      score: { home: 2, away: 1 },
      regulation: { home: 1, away: 1 },
      metrics: [team(2), team(1)],
      added: [2, 4, 1, 2],
    });
    extraTime.metrics[0]![M.minutes] = 120;
    extraTime.metrics[1]![M.minutes] = 120;
    const rules = buildInvariantReport([sample(extraTime)]).find(
      (x) => x.id === 'condition-rules',
    )!;
    expect(rules.failed).toBe(1);
    expect(rules.examples[0]!.failures).toEqual([
      'extra time or a shoot-out in a league fixture (MATCH-6)',
      'outcome.extraTime recorded under core:equal-top-tier: no tie that must produce a winner (MATCH-6)',
    ]);
    // The rest of the record is consistent, so only the condition rule catches it.
    expect(
      buildInvariantReport([sample(extraTime)])
        .filter((x) => x.failed)
        .map((x) => x.id),
    ).toEqual(['condition-rules']);
    // A rule-excluded metric that a path records blocks the verdict instead of leaving it.
    const league = Array.from({ length: 40 }, () => sample(record()));
    const report = buildEquivalenceReport({
      condition: 'core:equal-top-tier',
      reference: league,
      candidate: [...league.slice(1), sample(extraTime)],
    });
    expect(report.metrics.find((m) => m.id === 'outcome.extraTime')).toMatchObject({
      status: 'violated',
      reason:
        'no tie that must produce a winner (MATCH-6), yet recorded in 0 reference and 1 candidate matches',
    });
    expect(report.blocking).toContain('outcome.extraTime');
    expect(report.passed).toBe(false);
    expect(buildInvariantReport(league).find((x) => x.id === 'condition-rules')!.failed).toBe(0);
  });

  it('holds a tie to extra time and a shoot-out exactly when level', () => {
    const tie = (
      score: { home: number; away: number },
      regulation?: { home: number; away: number },
      shootout?: { home: number; away: number },
    ): MatchSample => {
      const r = record({
        kind: 'cup',
        score,
        metrics: [team(score.home), team(score.away)],
        ...(regulation && { regulation }),
        ...(shootout && { shootout }),
      });
      if (regulation) for (const side of r.metrics) side[M.minutes] = 120;
      return { ...sample(r), condition: 'knockout:single-match' };
    };
    const failures = (s: MatchSample) =>
      buildInvariantReport([s])
        .filter((x) => x.failed)
        .flatMap((x) => x.examples[0]!.failures);
    expect(failures(tie({ home: 1, away: 1 }))).toEqual([
      'a tie level after 90 minutes played no extra time',
    ]);
    expect(failures(tie({ home: 3, away: 1 }, { home: 2, away: 1 }))).toEqual([
      'extra time after a decided 90 minutes',
    ]);
    expect(failures(tie({ home: 2, away: 1 }, { home: 1, away: 1 }, { home: 4, away: 3 }))).toEqual(
      ['a shoot-out after extra time decided the tie'],
    );
    expect(failures(tie({ home: 1, away: 1 }, { home: 1, away: 1 }))).toEqual([
      'a tie level after extra time had no shoot-out',
    ]);
    // Ties that follow MATCH-6 pass.
    for (const valid of [
      tie({ home: 2, away: 1 }),
      tie({ home: 2, away: 1 }, { home: 1, away: 1 }),
      tie({ home: 1, away: 1 }, { home: 1, away: 1 }, { home: 4, away: 3 }),
    ])
      expect(failures(valid)).toEqual([]);
    // A rule it cannot read is unsupported, never a pass; an unknown condition is refused.
    const untracked = { ...sample(record(), false), condition: 'era:1950' };
    expect(buildInvariantReport([untracked]).find((x) => x.id === 'condition-rules')).toMatchObject(
      { passed: 0, failed: 0, unsupported: 1 },
    );
    expect(() => buildInvariantReport([{ ...sample(record()), condition: 'nowhere' }])).toThrow(
      /unknown parity condition nowhere/,
    );
  });

  it('sizes a condition to cover every metric it judges', () => {
    expect(calibrationSize(conditionOf('core:equal-top-tier'))).toBe(600);
    expect(calibrationSize(conditionOf('rare:discipline'))).toBe(10000);
    // Rare metrics need requiredRareEvents() over their rate: at 0.05 a match, 10,720 matches.
    const size = conditionValidationSize({
      means: [
        { id: 'outcome.homeWin', spread: 0.5, margin: 0.03 },
        { id: 'team.minutes', spread: 0, margin: 4.5 },
      ],
      rates: [
        { id: 'incident.red', perMatch: 0.05 },
        { id: 'outcome.shootout', perMatch: 0 },
      ],
    });
    expect(size).toMatchObject({
      size: Math.ceil(REQUIRED_RARE_EVENTS / 0.05),
      sufficient: true,
      limiting: 'incident.red',
      unsized: ['outcome.shootout'],
    });
    // At the returned size the limiting rare comparison itself passes with the declared power.
    expect(rareComparisonPower(size.size * 0.05)).toBeGreaterThanOrEqual(0.8);
    expect(size.needs.find((n) => n.id === 'outcome.homeWin')!.matches).toBe(5838);
    expect(size.needs.find((n) => n.id === 'team.minutes')!.matches).toBe(0);
    const rarer = conditionValidationSize({
      means: [],
      rates: [{ id: 'incident.red', perMatch: 0.004 }],
    });
    expect(rarer).toMatchObject({ size: 100000, sufficient: false });
    // Needs come from the reference pilot and skip what the condition rules out.
    const core = conditionOf('core:equal-top-tier');
    const needs = pilotNeeds(
      Array.from({ length: 40 }, () => sample(record())),
      core,
    );
    expect(needs.rates.map((r) => r.id)).not.toContain('outcome.extraTime');
    expect(needs.rates.map((r) => r.id)).toContain('incident.red');
    expect(needs.means.find((m) => m.id === 'team.passes')).toMatchObject({
      spread: 0,
      margin: 20,
    });
  });

  it('measures rare events per match, not per player line', () => {
    const rare = { id: 'pd.redCards', comparison: 'rate-ratio' as const, applies: true };
    // 1,000 matches a path with 600 red cards: 16 player lines a match on one path, 11 on the other.
    const lines = (perMatch: number) => {
      const clusters = Array.from({ length: 1000 * perMatch }, (_, i) => Math.floor(i / perMatch));
      const values = clusters.map((match, i) => (i % perMatch === 0 && match < 600 ? 1 : 0));
      return { ...obs(values), clusters };
    };
    const result = compareDistributions(rare, lines(16), lines(11));
    expect(result.rate!.ratio).toBeCloseTo(1, 10);
    expect(result.status).toBe('equivalent');
  });

  it('records the outcome curve against the Elo target without passing it', () => {
    const scored = (home: number, away: number, gap: number) =>
      ({ ...sample(record({ score: { home, away } })), gap }) as MatchSample;
    const samples = [
      ...Array.from({ length: 6 }, () => scored(1, 0, 1)),
      ...Array.from({ length: 3 }, () => scored(0, 0, 2)),
      scored(0, 1, -1),
      scored(2, 0, 21),
    ];
    const report = buildOutcomeTargetReport(samples);
    expect(report.status).toBe('measured');
    expect(report.rows.map((r) => [r.bucket, r.matches])).toEqual([
      [0, 10],
      [20, 1],
    ]);
    const even = report.rows[0]!;
    expect(even.observed).toEqual({ homeWin: 0.6, draw: 0.3, awayWin: 0.1 });
    expect(even.target).toEqual(outcomeTarget(1.1));
    expect(report.meanAbsoluteError).toBeGreaterThan(0);
    expect(buildOutcomeTargetReport([sample(record())]).status).toBe('missing');
  });

  it('separates computation from codec time', () => {
    const timing = (id: PerformanceComponent, samplesMs: number[]) => ({
      id,
      samplesMs,
      warmup: 1,
      repetitions: 1,
    });
    const baseline = buildPerformanceReport({
      provisional: true,
      components: [
        timing('fixture.summary', [2, 2, 2]),
        timing('season.baseline', [8000, 8100]),
        timing('season.active-management', [8200]),
        timing('codec.encode', [900]),
        timing('codec.decode', [400]),
      ],
    });
    expect(baseline.categories.codec.totalMs).toBe(1300);
    expect(baseline.categories.computation.totalMs).toBe(6);
    expect(baseline.categories.season.totalMs).toBe(24300);
    // A slower codec does not count against the engine budgets.
    const candidate = buildPerformanceReport({
      provisional: false,
      components: [
        timing('fixture.candidate', [0.9, 1, 1.1]),
        timing('season.baseline', [6000]),
        timing('season.active-management', [6400]),
        timing('codec.encode', [5000]),
      ],
    });
    const provenance: Provenance = {
      date: '2026-10-21T00:00:00.000Z',
      source: {
        gitHead: 'synthetic',
        gitDirty: false,
        fingerprint: { algorithm: 'sha256', sha256: '0'.repeat(64), files: 1, scope: ['packages'] },
      },
      toolchain: { node: 'v24.12.0' },
      machine: { platform: 'test', arch: 'x', cpu: 'synthetic', logicalCpus: 1, memoryBytes: 1 },
      seeds: { profiles: ['release-century-baseline'] },
      conditions: [],
      partitions: {},
    };
    // The paired ratios to the summary path are context (→ARCH-31 r19), never a gate.
    const paired = comparePerformance(
      { provenance, report: baseline },
      { provenance, report: candidate },
    );
    expect(paired.paired).toBe(true);
    expect(paired.ratios.map((r) => [r.id, r.status, r.ratio])).toEqual([
      ['npc-fixture', 'measured', 0.5],
      ['season.baseline', 'measured', 6000 / 8050],
      ['season.active-management', 'measured', 6400 / 8200],
    ]);
    expect(paired).not.toHaveProperty('releaseEvidence');
    const elsewhere = comparePerformance(
      { provenance, report: baseline },
      {
        provenance: { ...provenance, machine: { ...provenance.machine, cpu: 'another' } },
        report: candidate,
      },
    );
    expect(elsewhere).toMatchObject({ paired: false, reasons: ['machine differs'] });
    expect(elsewhere.ratios.every((r) => r.status === 'unpaired')).toBe(true);
    expect(() =>
      buildPerformanceReport({
        provisional: true,
        components: [timing('codec.encode', [1]), timing('codec.encode', [2])],
      }),
    ).toThrow(/twice/);
    expect(() =>
      buildPerformanceReport({
        provisional: true,
        components: [timing('fixture.grid+codec' as PerformanceComponent, [1])],
      }),
    ).toThrow(/unknown/);
  });

  it('gates the release on absolute budgets, as evidence only from a quiet reference run', () => {
    const timing = (id: PerformanceComponent, samplesMs: number[]) => ({
      id,
      samplesMs,
      warmup: 1,
      repetitions: 1,
    });
    const run = (fixtureMs: number[], seasonMs: number[], provisional = false) =>
      buildPerformanceReport({
        provisional,
        components: [
          timing('fixture.candidate', fixtureMs),
          timing('season.baseline', seasonMs),
          timing('season.active-management', seasonMs),
        ],
      });
    const { referenceMachine, npcFixtureMs, seasonMs, quietLoad } = PERFORMANCE_CONFIG.release;
    const provenance: Provenance = {
      date: '2026-10-25T00:00:00.000Z',
      source: {
        gitHead: 'synthetic',
        gitDirty: false,
        fingerprint: { algorithm: 'sha256', sha256: '0'.repeat(64), files: 1, scope: ['packages'] },
      },
      toolchain: { node: 'v26.8.1' },
      machine: { ...referenceMachine, memoryBytes: 1 },
      seeds: {},
      conditions: [],
      partitions: {},
    };
    // Each budget holds at its value and fails just past it; the median decides.
    const at = releaseGates({
      provenance,
      report: run([0.5, npcFixtureMs, 9], [1, seasonMs, 99_999]),
      maxLoad: quietLoad,
    });
    expect(at.gates.map((g) => [g.id, g.status, g.budgetMs])).toEqual([
      ['npc-fixture', 'pass', npcFixtureMs],
      ['season.baseline', 'pass', seasonMs],
      ['season.active-management', 'pass', seasonMs],
    ]);
    expect(at).toMatchObject({ referenceMachine: true, reasons: [], passed: true });
    expect(at.releaseEvidence).toBe(true);
    const over = releaseGates({
      provenance,
      report: run([npcFixtureMs + 0.001], [seasonMs]),
      maxLoad: 1,
    });
    expect(over.gates.map((g) => g.status)).toEqual(['fail', 'pass', 'pass']);
    expect(over).toMatchObject({ passed: false, releaseEvidence: false, reasons: [] });
    // Another machine, a loaded or unsampled window and a provisional run are context only.
    const context = (input: Partial<Parameters<typeof releaseGates>[0]>) =>
      releaseGates({ provenance, report: run([0.5], [1]), maxLoad: 1, ...input });
    expect(
      context({ provenance: { ...provenance, machine: { ...provenance.machine, cpu: 'Xeon' } } }),
    ).toMatchObject({ referenceMachine: false, passed: true, releaseEvidence: false });
    expect(context({ maxLoad: quietLoad + 0.01 }).reasons).toEqual([
      `not quiet: load ${quietLoad + 0.01} > ${quietLoad}`,
    ]);
    expect(context({ maxLoad: undefined }).reasons).toEqual(['load not sampled']);
    expect(context({ report: run([0.5], [1], true) }).reasons).toEqual(['provisional run']);
    expect(
      releaseGates({
        provenance,
        report: buildPerformanceReport({ provisional: false, components: [] }),
        maxLoad: 1,
      }).gates.every((g) => g.status === 'missing'),
    ).toBe(true);
  });

  it('fails exact invariants without tolerance', () => {
    const line = (id: string, goals: number, xg: number) => {
      const metrics = zeroMetrics();
      metrics[M.goals] = goals;
      metrics[M.shots] = goals + 1;
      metrics[M.onTarget] = goals;
      metrics[M.passes] = 200;
      metrics[M.completed] = 160;
      metrics[M.minutes] = 90;
      const detail = emptyPlayerDetail();
      detail[PD.xg] = xg;
      return { id, metrics, detail };
    };
    const lined = (xg: number, goals = 1) => {
      const home = team(1, 3);
      home[M.passes] = 400;
      home[M.completed] = 320;
      home[M.onTarget] = 1;
      const away = team(0, 1);
      away[M.passes] = 200;
      away[M.completed] = 160;
      away[M.onTarget] = 0;
      return record({
        score: { home: goals, away: 0 },
        metrics: [home, away],
        xg: [0.35, 0.1],
        detail: [emptyTeamDetail(), emptyTeamDetail()],
        players: [line('SYN:H:1', 1, xg), line('SYN:H:2', 0, 0), line('SYN:A:1', 0, 10)],
        lineCounts: [2, 1],
      });
    };
    const status = (r: MatchRecord, id: string) => {
      const row = buildInvariantReport([sample(r)]).find((x) => x.id === id)!;
      return row.failed ? 'fail' : row.unsupported ? 'unsupported' : 'pass';
    };
    // Player lines make up the team rows: one home goal, and 0.35 xG within per-shot rounding.
    const fixed = lined(34);
    fixed.players[0]!.metrics[M.shots] = 3;
    fixed.players[1]!.metrics[M.shots] = 0;
    fixed.players[2]!.metrics[M.shots] = 1;
    expect(status(fixed, 'reconcile')).toBe('pass');
    expect(status(fixed, 'score-goals')).toBe('pass');
    const drifted = structuredClone(fixed);
    drifted.players[0]!.detail![PD.xg] = 30;
    expect(status(drifted, 'reconcile')).toBe('fail');
    expect(status(lined(34, 2), 'score-goals')).toBe('fail');
    const inverted = structuredClone(fixed);
    inverted.metrics[0]![M.completed] = 401;
    expect(status(inverted, 'attempts')).toBe('fail');
    expect(status(record(), 'detail-attempts')).toBe('unsupported');
    expect(status(record(), 'reconcile')).toBe('unsupported');
  });
});

describe('MATCH-29 tactic pairings', () => {
  const TACTICS = TACTIC_PAIRING_TARGET.tactics;
  const z = normalQuantile(0.975);
  interface Readings {
    /** Possession as a part of 90 (MATCH-3's pass share), home then away. */
    possession?: [number, number];
    freshness?: [number, number];
  }
  /** A synthetic match of `home` at home to `away` with this 90-minute score. */
  function tactical(home: Tactic, away: Tactic, score: [number, number], o: Readings = {}) {
    const metrics = [team(score[0]), team(score[1])] as MatchRecord['metrics'];
    if (o.possession) [metrics[0][M.possession], metrics[1][M.possession]] = o.possession;
    return {
      ...sample(
        record({
          tactics: [home, away],
          score: { home: score[0], away: score[1] },
          metrics,
          xg: [1.2, 1.1],
          detail: [emptyTeamDetail(), emptyTeamDetail()],
        }),
      ),
      condition: `tactics:${home}-${away}`,
      ...(o.freshness && { freshness: o.freshness }),
    } as MatchSample;
  }
  /** `n` matches at one venue: `wins` home wins and `draws` draws, the rest away wins. */
  const venue = (home: Tactic, away: Tactic, n: number, wins: number, draws: number) =>
    Array.from({ length: n }, (_, i) =>
      tactical(home, away, i < wins ? [1, 0] : i < wins + draws ? [0, 0] : [0, 1], {
        freshness: [80, 80],
      }),
    );
  const row = (samples: MatchSample[], id: string) =>
    tacticPairingVerdicts(samples).rows.find((r) => r.id === id)!;
  /** Variance of a venue mean of a 0/1 reading times `weight`, from the sample spread. */
  const venueVariance = (p: number, n: number, weight: number) =>
    (weight * weight * p * (1 - p) * n) / (n - 1) / n;

  it('pools both venues of a pairing', () => {
    // Venue shares weigh equally whatever their sizes: draws 0.25 and 0.5 pool to 0.375, not 50/120.
    const samples = [
      ...venue('counter', 'press', 40, 20, 10),
      ...venue('press', 'counter', 80, 20, 40),
      ...venue('press', 'press', 40, 15, 10),
    ];
    const report = tacticPairingVerdicts(samples);
    expect(report.version).toBe(MATCH_PARITY_VERSION);
    expect(report.target).toBe(TACTIC_PAIRING_TARGET.version);
    expect(report.venues).toEqual({ 'counter-press': 40, 'press-counter': 80, 'press-press': 40 });
    const draws = report.rows.find((r) => r.id === 'draws:press-counter')!;
    expect(draws.matches).toBe(120);
    expect(draws.value).toBeCloseTo(0.375, 12);
    const half = z * Math.sqrt(venueVariance(0.25, 40, 0.5) + venueVariance(0.5, 80, 0.5));
    expect(draws.interval![0]).toBeCloseTo(0.375 - half, 12);
    expect(draws.interval![1]).toBeCloseTo(0.375 + half, 12);
    // Press wins 20/80 at home and 10/40 away; counter 20/40 at home and 20/80 away.
    const gap = report.rows.find((r) => r.id === 'winShareGap:press-counter')!;
    expect(gap.value).toBeCloseTo((20 / 80 + 10 / 40) / 2 - (20 / 40 + 20 / 80) / 2, 12);
    // A mirror pairing has one venue: both sides' readings come from it.
    expect(report.rows.find((r) => r.id === 'draws:press-press')!.value).toBeCloseTo(0.25, 12);
    expect(describeTacticPairings(report)[0]).toContain(
      `target v${TACTIC_PAIRING_TARGET.version}, ${MATCH_PARITY_VERSION}`,
    );
  });

  it('flags a pairing outside the draw band', () => {
    const decided = [
      ...venue('possession', 'balanced', 40, 40, 0),
      ...venue('balanced', 'possession', 40, 40, 0),
    ];
    expect(row(decided, 'draws:possession-balanced')).toMatchObject({
      status: 'outside',
      value: 0,
      band: TACTIC_PAIRING_TARGET.draws,
    });
    const level = [
      ...venue('possession', 'counter', 40, 10, 20),
      ...venue('counter', 'possession', 40, 10, 20),
    ];
    expect(row(level, 'draws:possession-counter').status).toBe('outside');
    const usual = [
      ...venue('possession', 'counter', 400, 150, 100),
      ...venue('counter', 'possession', 400, 150, 100),
    ];
    expect(row(usual, 'draws:possession-counter')).toMatchObject({ status: 'inside', value: 0.25 });
    // The same share on a tenth of the matches cannot resolve the band.
    const few = [
      ...venue('possession', 'counter', 40, 15, 10),
      ...venue('counter', 'possession', 40, 15, 10),
    ];
    expect(row(few, 'draws:possession-counter').status).toBe('insufficient');
  });

  it('requires counter at least press head to head', () => {
    const headToHead = (counterWins: number, pressWins: number) => [
      ...venue('counter', 'press', 40, counterWins, 40 - counterWins - pressWins),
      ...venue('press', 'counter', 40, pressWins, 40 - counterWins - pressWins),
    ];
    const beaten = row(headToHead(5, 25), 'atLeast:counter-press');
    expect(beaten.status).toBe('outside');
    expect(beaten.differences).toMatchObject([
      { higher: 'counter', lower: 'press', strict: false, status: 'fails' },
    ]);
    expect(beaten.differences![0]!.value).toBeCloseTo(5 / 40 - 25 / 40, 12);
    expect(row(headToHead(25, 5), 'atLeast:counter-press').status).toBe('inside');
    // Level on the evidence is unresolved, not a pass.
    expect(row(headToHead(15, 15), 'atLeast:counter-press')).toMatchObject({
      status: 'insufficient',
      differences: [{ status: 'unresolved', value: 0 }],
    });
  });

  it('holds an ordering only beyond its interval', () => {
    /**
     * Every venue of two different tactics with 40 matches; the home side holds the ball
     * 50 + strength(home) − strength(away) per cent of the time, give or take `noise`.
     */
    const possession = (strength: Record<Tactic, number>, noise: number) =>
      TACTICS.flatMap((home) =>
        TACTICS.filter((away) => away !== home).flatMap((away) =>
          Array.from({ length: 40 }, (_, i) => {
            const share = 50 + strength[home] - strength[away] + (i % 2 ? noise : -noise);
            return tactical(home, away, [0, 0], { possession: [share, 100 - share] });
          }),
        ),
      );
    const order = (samples: MatchSample[]) => row(samples, 'ordering:possession');
    const clear = order(possession({ possession: 6, press: 0, balanced: 0, counter: -6 }, 0));
    expect(clear.status).toBe('inside');
    // possession over the other three and the other two over counter, each pair once.
    expect(clear.differences!.map((d) => `${d.higher}>${d.lower}`)).toEqual([
      'possession>press',
      'possession>counter',
      'possession>balanced',
      'press>counter',
      'balanced>counter',
    ]);
    expect(clear.differences!.every((d) => d.strict && d.status === 'holds')).toBe(true);
    // The same order within the noise: every difference above zero, none beyond its interval.
    const noisy = order(possession({ possession: 2, press: 0, balanced: 0, counter: -2 }, 30));
    expect(noisy.status).toBe('insufficient');
    expect(noisy.differences!.every((d) => d.value! > 0 && d.status === 'unresolved')).toBe(true);
    const reversed = order(possession({ possession: -6, press: 0, balanced: 0, counter: 6 }, 0));
    expect(reversed.status).toBe('outside');
    // Each tactic's share against the other three: 50 + its strength − their mean strength.
    const report = tacticPairingVerdicts(
      possession({ possession: 6, press: 0, balanced: 0, counter: -6 }, 0),
    );
    expect((report.tactics.possession!.possession as PairingEstimate).value).toBeCloseTo(58, 10);
    expect((report.tactics.counter!.possession as PairingEstimate).value).toBeCloseTo(42, 10);
  });

  it('reports insufficient samples rather than a pass', () => {
    // Every venue at the band's centre on too few matches: nothing passes, nothing fails.
    const thin = TACTICS.flatMap((home) => TACTICS.flatMap((away) => venue(home, away, 20, 8, 5)));
    const report = tacticPairingVerdicts(thin);
    expect(report.rows.length).toBe(25);
    expect(report.summary).toEqual({ inside: 0, outside: 0, insufficient: 25 });
    expect(report.rows.every((r) => /fewer than 30/.test(r.reason!))).toBe(true);
    // A missing venue and a measure no sample carries are insufficient too.
    expect(row(venue('press', 'balanced', 40, 10, 10), 'draws:press-balanced').reason).toBe(
      '0 matches with balanced at home to press, fewer than 30',
    );
    const unfresh = TACTICS.flatMap((home) =>
      TACTICS.flatMap((away) => Array.from({ length: 30 }, () => tactical(home, away, [1, 1]))),
    );
    expect(row(unfresh, 'ordering:freshness')).toMatchObject({
      status: 'insufficient',
      reason: '30 matches with possession at home to press lack a reading',
    });
  });

  describe('paired parity of the two paths (T396)', () => {
    /** `n` fixtures at one venue, results cycling home win, away win, then three draws. */
    const fixtures = (home: Tactic, away: Tactic, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...tactical(home, away, i % 5 === 0 ? [1, 0] : i % 5 === 1 ? [0, 1] : [0, 0], {
          freshness: [80, 80],
        }),
        fixture: `${home}-${away}:${i}`,
      }));
    /** The same fixtures with the first `k` decisive results of a venue drawn instead. */
    const drawn = (samples: MatchSample[], home: Tactic, away: Tactic, k: number) => {
      let left = k;
      return samples.map((s) => {
        const decisive = s.record.score.home !== s.record.score.away;
        if (s.record.tactics[0] !== home || s.record.tactics[1] !== away || !decisive || !left)
          return s;
        left -= 1;
        return { ...s, record: { ...s.record, score: { home: 0, away: 0 } } };
      });
    };
    const every = (n: number) =>
      TACTICS.flatMap((home) => TACTICS.flatMap((away) => fixtures(home, away, n)));
    const parity = (aggregate: MatchSample[], detailed: MatchSample[], id: string) =>
      tacticPairingParity(aggregate, detailed).rows.find((r) => r.id === id)!;

    it('pairs MATCH-29 rows by fixture and gives each difference a 95% interval', () => {
      const detailed = every(40);
      // Reversed, so only the fixture id pairs them; two press–press fixtures end level instead.
      const aggregate = drawn(detailed, 'press', 'press', 2).reverse();
      const report = tacticPairingParity(aggregate, detailed);
      expect(report.matches).toEqual({ aggregate: 640, detailed: 640, paired: 640 });
      expect(report.rows.map((r) => r.id)).toEqual(
        tacticPairingVerdicts(detailed).rows.map((r) => r.id),
      );
      // Paired by fixture, every other row's difference is exactly 0.
      const other = report.rows.find((r) => r.id === 'draws:possession-counter')!;
      expect(other).toMatchObject({ verdict: 'equivalent', difference: 0, interval: [0, 0] });
      expect(other.margin).toBe(0.03);
      // Two of 40 paired differences are 1: mean 0.05 with the paired sample's interval.
      const drawRow = report.rows.find((r) => r.id === 'draws:press-press')!;
      const d = [1, 1, ...Array<number>(38).fill(0)];
      const sd = Math.sqrt(d.reduce((a, x) => a + (x - 0.05) ** 2, 0) / 39);
      expect(drawRow.difference).toBeCloseTo(0.05, 12);
      expect(drawRow.interval![0]).toBeCloseTo(0.05 - (z * sd) / Math.sqrt(40), 12);
      expect(drawRow.interval![1]).toBeCloseTo(0.05 + (z * sd) / Math.sqrt(40), 12);
      expect(drawRow.aggregate).toBeDefined();
      expect(drawRow.detailed).toBeDefined();
      // Points take MATCH-28's mean margin from the detailed reference: 3, 0, 1, 1, 1 a side.
      const points = [3, 0, 1, 1, 1, 0, 3, 1, 1, 1];
      const pointsSd = Math.sqrt(
        (points.reduce((a, x) => a + (x - 1.2) ** 2, 0) * 128) / (points.length * 128 - 1),
      );
      expect(report.rows.find((r) => r.id === 'points:press')!.margin).toBeCloseTo(
        Math.max(0.05 * 1.2, 0.1 * pointsSd),
        12,
      );
      // An ordering reports each pairwise gap's paired difference.
      const order = report.rows.find((r) => r.id === 'ordering:possession')!;
      expect(order.differences!.length).toBe(5);
      expect(
        order.differences!.every((x) => x.difference === 0 && x.verdict === 'equivalent'),
      ).toBe(true);
      expect(report.counts.equivalent + report.counts.different + report.counts.insufficient).toBe(
        25,
      );
      expect(describeTacticPairingParity(report)[0]).toContain('640 paired fixtures');
    });

    it('a MATCH-29 difference whose interval leaves the margin is different and one straddling it insufficient', () => {
      // 40 of 400 fixtures drawn instead: 0.10 with half-width ≈ 0.03, wholly beyond 0.03.
      const wide = fixtures('press', 'press', 400);
      const beyond = parity(drawn(wide, 'press', 'press', 40), wide, 'draws:press-press');
      expect(beyond.verdict).toBe('different');
      expect(beyond.interval![0]).toBeGreaterThan(0.03);
      // 2 of 40: 0.05 whose interval holds both 0 and the margin edge, so it decides nothing.
      const few = fixtures('press', 'press', 40);
      const straddling = parity(drawn(few, 'press', 'press', 2), few, 'draws:press-press');
      expect(straddling.verdict).toBe('insufficient');
      expect(straddling.interval![0]).toBeLessThan(0.03);
      expect(straddling.interval![1]).toBeGreaterThan(0.03);
      expect(straddling.reason).toBe('the interval crosses a margin edge');
      // A fixture on one path only is left out; a venue short of pairs is never a pass.
      const unpaired = parity(few.slice(0, 20), few, 'draws:press-press');
      expect(unpaired).toMatchObject({ verdict: 'insufficient', pairs: 20 });
      expect(unpaired.reason).toMatch(/fewer than 30/);
    });
  });

  it('reads knockout counts per 90 minutes', () => {
    const kicks = (extraTime: boolean) => {
      const r = record({ detail: [emptyTeamDetail(), emptyTeamDetail()] });
      r.detail![0]![TD.goalKicks] = 10;
      r.detail![1]![TD.goalKicks] = 10;
      if (extraTime) r.regulation = { home: 0, away: 0 };
      return sample(r);
    };
    const read = (samples: MatchSample[], id: string) =>
      buildTargetReport(samples).find((t) => t.id === id)!;
    const cup = Array.from({ length: 40 }, () => kicks(true));
    expect(read(cup, 'goalKicks').status).toBe('inside');
    expect(read(cup, 'goalKicks').value).toBeCloseTo(7.5, 12);
    expect(read(cup, 'passCompletion').value).toBe(80);
    const league = Array.from({ length: 40 }, () => kicks(false));
    expect(read(league, 'goalKicks')).toMatchObject({ value: 10, status: 'outside' });
  });
});

describe('aggregate measurement (T284)', () => {
  const shot = (cell: number, goal: boolean, line = 'FW', setPiece = false): LedgerShot => ({
    side: 0,
    cell,
    header: false,
    setPiece,
    penalty: false,
    goal,
    line,
  });
  /** A ledger-read match: shots at these cells, passes 30/50/20 forward/lateral/back. */
  const ledgerSample = (shots: LedgerShot[]): MatchSample => ({
    ...sample(record()),
    ledger: {
      ballInPlay: 56 * 60,
      directions: [
        [30, 50, 20],
        [30, 50, 20],
      ],
      shots,
    },
  });
  const read = (samples: MatchSample[], id: string) =>
    buildTargetReport(samples).find((t) => t.id === id)!;

  it('reads cell-resolved rows from the aggregate ledger', () => {
    // Cells follow the markings (MATCH-14): band 7 lane 2 is the goal area, bands 6–7 lanes 1–3
    // the rest of the box, everything else outside it.
    const goalArea = 7 * 5 + 2,
      box = 6 * 5 + 1,
      outside = 5 * 5 + 2,
      wide = 6 * 5 + 0;
    const samples = Array.from({ length: 40 }, () =>
      ledgerSample([
        shot(goalArea, true, 'FW', true),
        shot(box, true, 'MF'),
        shot(box, false),
        shot(outside, false),
        shot(wide, false),
      ]),
    );
    expect(read(samples, 'shotsGoalArea')).toMatchObject({ value: 20, status: 'outside' });
    expect(read(samples, 'shotsBox').value).toBeCloseTo(40, 10);
    expect(read(samples, 'shotsOutside').value).toBeCloseTo(40, 10);
    expect(read(samples, 'passForward')).toMatchObject({ value: 30, status: 'inside' });
    expect(read(samples, 'setPieceGoals').value).toBe(50);
    expect(read(samples, 'goalsMF').value).toBe(50);
    expect(read(samples, 'ballInPlay')).toMatchObject({ value: 56, status: 'inside' });
    // A point or a possession sequence the ledger does not hold is missing, never a reading.
    for (const id of ['shotDistance', 'shotsFar', 'possessions', 'possessionShots'])
      expect(read(samples, id).status).toBe('missing');
    expect(
      TARGET_BANDS.filter((t) => t.reads === 'diagnostics')
        .map((t) => t.id)
        .sort(),
    ).toEqual(
      [
        'passesPerPossession',
        'possessionShots',
        'possessions',
        'shotDistance',
        'shotsFar',
        'shotsOwnHalf',
      ].sort(),
    );
    // Too few matches stay underpowered whatever the reading.
    expect(read(samples.slice(0, 10), 'shotsGoalArea').status).toBe('underpowered');
  });

  it('never mixes own-tactic and forced samples in MATCH-29', () => {
    const forced = (home: Tactic, away: Tactic): MatchSample => ({
      ...sample(record({ tactics: [home, away] })),
      condition: `tactics:${home}-${away}`,
      freshness: [80, 70],
    });
    const own: MatchSample = {
      ...sample(record({ tactics: ['press', 'balanced'] })),
      freshness: [60, 90],
    };
    expect(() => tacticPairingVerdicts([forced('press', 'balanced'), own])).toThrow(
      /one tactic assignment at a time: 1 forced and 1 own-tactic/,
    );
    // A forced sample must have played its condition's tactics.
    const misplayed = { ...forced('press', 'balanced'), condition: 'tactics:counter-balanced' };
    expect(() => tacticPairingVerdicts([misplayed])).toThrow(/under tactics:counter-balanced/);
    // On own tactics the freshness ordering reads the squads' weekly load: never a pass.
    const report = tacticPairingVerdicts(Array.from({ length: 40 }, () => own));
    expect(report.assignment).toBe('club');
    expect(report.rows.find((r) => r.id === 'ordering:freshness')).toMatchObject({
      status: 'insufficient',
      reason: expect.stringMatching(/forced pairings only/),
    });
    expect(tacticPairingVerdicts([forced('press', 'balanced')]).assignment).toBe('forced');
  });

  it("conditions a fixture with prepareMatch's own arithmetic", () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Parity Pilot',
      color: '#2a5d8f',
      seed: 'grid-bands-1',
      level: 'normal',
    });
    const clubs = w.clubs.filter((c) => c.tier === 0 && c.id !== w.playerClub);
    const press = clubs.find((c) => clubStyle(c) === 'press')!;
    const other = clubs.find((c) => clubStyle(c) === 'balanced')!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      id: 'conditioning:1',
      year: 2024,
      round: 1,
      kind: 'league',
      home: press.id,
      away: other.id,
    };
    const plain = conditionedMatch(w, f);
    // The clubs' own tactics through the conditioning arithmetic reproduce prepareMatch exactly.
    const own = conditionedMatch(w, f, { tactics: plain.prepared.tactics });
    for (const key of ['tactics', 'strength', 'shift', 'profiles', 'possessionChance'] as const)
      expect(own.prepared[key]).toEqual(plain.prepared[key]);
    expect(own.gap).toBe(plain.gap);
    // Forced tactics from the neutral squad fatigue: the press side sheds its weekly load (MATCH-2,
    // fatigue 32 costs 2 rating points), the world's players keep theirs.
    const forced = conditionedMatch(w, f, {
      tactics: ['counter', 'press'],
      fatigue: NEUTRAL_SQUAD_FATIGUE,
    });
    expect(forced.prepared.tactics).toEqual(['counter', 'press']);
    expect(forced.rosters.flat().every((p) => p.fatigue === NEUTRAL_SQUAD_FATIGUE)).toBe(true);
    expect(plain.rosters[0].every((p) => p.fatigue === PRESS_LOAD_FATIGUE)).toBe(true);
    expect(forced.gap).toBe(plain.gap + 2);
    // The detailed runner rates the same forced rosters at the formations played (CORPUS_CONFIG
    // v3): both runners give a forced sample one gap.
    const setup = buildGridSetup(w, f, {
      observe: false,
      recordPlayers: true,
      model: MATCH_MODEL_REVISION,
      tactics: ['counter', 'press'],
    });
    forceTacticRosters(w, f, setup, [press, other], NEUTRAL_SQUAD_FATIGUE);
    expect(forcedGap([press, other], setup.rosters, setup.tactics)).toBe(forced.gap);
    expect(forced.prepared.profiles[1]!.pressure).toBeGreaterThan(0);
    // Each squad is built for its forced formation, as the detailed runner's (T321): every starter
    // plays his own position, and without a declared squad fatigue there is no freshness reading.
    forced.rosters.forEach((side, i) => {
      const slots = FORMATIONS[forced.prepared.tactics[i]!].slots;
      expect(side.slice(0, 11).map((p, k) => levelFactor(p.positions, slots[k]!.position))).toEqual(
        Array(11).fill(1),
      );
    });
    const undeclared = aggregateRun(w, f, 'tactics:counter-press', undefined, {
      tactics: ['counter', 'press'],
    });
    expect(undeclared.sample.freshness).toBeUndefined();
    // The aggregate adapter's ledger readings agree with the record they come with.
    const { sample: s } = aggregateRun(w, f, 'tactics:counter-press', undefined, {
      tactics: ['counter', 'press'],
      fatigue: NEUTRAL_SQUAD_FATIGUE,
    });
    expect(s.record.tactics).toEqual(['counter', 'press']);
    expect(s.ledger!.shots.length).toBe(
      s.record.metrics[0]![M.shots]! + s.record.metrics[1]![M.shots]!,
    );
    expect(s.ledger!.shots.filter((x) => x.goal).length).toBe(
      s.record.score.home + s.record.score.away,
    );
    expect(s.ledger!.shots.every((x) => ['GK', 'DF', 'MF', 'FW'].includes(x.line))).toBe(true);
    expect(s.freshness![0]).toBeGreaterThan(s.freshness![1]!);
  });

  it("counts a moved player's freshness from when he came on", () => {
    // T320 review: the planner restarted a player's fatigue clock when he only changed slot (a
    // keeper sent off, an outfielder in goal); the grid counts from his entry (`onMin`).
    const w = createWorld({
      country: 'ENG',
      name: 'Parity Pilot',
      color: '#2a5d8f',
      seed: 'grid-bands-1',
      level: 'normal',
    });
    const clubs = w.clubs.filter((c) => c.tier === 0 && c.id !== w.playerClub);
    let moved = 0;
    for (let i = 0; i < 600 && moved < 2; i++) {
      const f: Fixture = {
        ...w.fixtures[0]!,
        id: `moved:${i}`,
        year: 2024,
        round: 1,
        kind: 'league',
        home: clubs[i % clubs.length]!.id,
        away: clubs[(i + 7) % clubs.length]!.id,
      };
      const { match } = aggregateRun(w, f, 'core:equal-top-tier');
      const { length, stints } = match.participation;
      for (const side of [0, 1] as const) {
        const on = [...new Set(stints[side].filter((x) => x.to === length).map((x) => x.line))];
        const spans = (line: number) => stints[side].filter((x) => x.line === line);
        if (!on.some((line) => spans(line).length > 1)) continue;
        moved++;
        const plan = match.plan.sides[side];
        const fresh = (from: (line: number) => number) =>
          100 -
          on.reduce((a, line) => {
            const c = plan.candidates[line]!;
            const minutes = length - from(line);
            return a + inMatchFatigue(c.fatigue, c.stamina, minutes, plan.pressing, plan.drain);
          }, 0) /
            on.length;
        const entry = fresh((line) => Math.min(...spans(line).map((x) => x.from)));
        const restarted = fresh((line) => Math.max(...spans(line).map((x) => x.from)));
        expect(aggregateFreshness(match)[side]).toBeCloseTo(entry, 10);
        expect(entry).toBeLessThan(restarted);
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('reports rare events short of power and the red-card settlement as measured', () => {
    // 600 matches with one red each: 600 events, past the 536 an 80%-power comparison needs; a
    // second yellow in one match of five is 120 events, short of it and so not resolvable.
    const matches = Array.from({ length: 600 }, (_, i) =>
      sample(
        record({
          detail: [emptyTeamDetail(), emptyTeamDetail()],
          incidents: [
            { minute: 30, side: 0, player: 'SYN:H:1', kind: 'red', reason: 'dogso' },
            ...(i % 5 === 0
              ? [{ minute: 60, side: 1, player: 'SYN:A:1', kind: 'secondYellow' } as const]
              : []),
          ] as MatchRecord['incidents'],
        }),
      ),
    );
    const rare = rareEvents(matches);
    expect(rare.redCards).toMatchObject({ events: 600, rate: 1, resolvable: true });
    expect(rare.secondYellows).toMatchObject({ events: 120, resolvable: false });
    expect(rare.secondYellows!.requiredEvents).toBe(REQUIRED_RARE_EVENTS);
    expect(rare.extraTime).toMatchObject({ events: 0, resolvable: false });
    // No event: the rule of three bounds the rate, never a zero-width interval.
    expect(rare.extraTime!.ci).toEqual([0, 3 / 600]);
    // Fixtures settled on a retry or on the fallback are counted apart from the first draws.
    const settled = settlementReport(matches.slice(0, 4), [
      { retry: 0, unreconciled: 0 },
      { retry: 1, unreconciled: 0 },
      { retry: 8, unreconciled: 2 },
      { retry: 0, unreconciled: 0 },
    ]);
    expect(settled.retries).toEqual({ 0: 2, 1: 1, 8: 1 });
    expect(settled.retried.events).toBe(2);
    expect(settled.fallback.events).toBe(1);
    expect(settled.unreconciledAnswers).toBe(2);
    expect(settled.firstDraw.matches).toBe(2);
    expect(settled.retriedDraw.matches).toBe(2);
  });

  it('declares the forced pairings neutral squad fatigue', () => {
    for (const c of CORPUS_CONFIG.conditions.filter((x) => x.family === 'tactics'))
      expect((c.params as { fatigue: number }).fatigue).toBe(NEUTRAL_SQUAD_FATIGUE);
    // v3: forced rosters built for the forced formation, rated as fielded in both runners.
    expect(CORPUS_CONFIG.version).toBe(3);
  });
});

describe('advanced counters and scoring concentration (→MATCH-23, MATCH-30)', () => {
  /** Matches whose sides carry these team counters (each side the same), with player lines. */
  const matches = (n: number, td: Partial<Record<keyof typeof TD, number>>, xa = 0) =>
    Array.from({ length: n }, (_, i) => {
      const side = () => {
        const d = emptyTeamDetail();
        for (const [k, v] of Object.entries(td)) d[TD[k as keyof typeof TD]] = v + (i % 3) - 1;
        return d;
      };
      const line = (id: string) => {
        const detail = emptyPlayerDetail();
        detail[PD.xa] = xa;
        return { id, metrics: zeroMetrics(), detail };
      };
      return sample(
        record({
          id: `synthetic:${i}`,
          detail: [side(), side()],
          players: [line('SYN:H:1'), line('SYN:A:1')],
          lineCounts: [1, 1],
        }),
      );
    });

  it('names one band, MATCH-23 row or unbanded reason for every MATCH-13 counter', () => {
    const counters = new Set(ADVANCED_COUNTER_TARGET.counters.map((c) => c.counter));
    // MATCH-13's table, row by row.
    for (const name of [
      'key pass',
      'xA',
      'big chance',
      'box shot',
      'final-third pass',
      'progressive pass',
      'take-on',
      'high turnover',
      'PPDA',
      'field tilt',
      'box entry',
      'front-of-box entry',
      'line-breaking pass',
      'xT added',
      'cut-back',
      'cross',
      'through ball',
      'progressive carry',
    ])
      expect(counters.has(name)).toBe(true);
    for (const c of ADVANCED_COUNTER_TARGET.counters) {
      expect(METRIC_BY_ID.has(c.reads)).toBe(true);
      const kinds = ['band', 'matchTarget', 'unbanded'].filter((k) => k in c);
      expect(kinds).toHaveLength(1);
      if ('band' in c) {
        expect(c.band[0]).toBeLessThan(c.band[1]);
        expect(c.source).toMatch(/StatsBomb|FBref|Opta/);
      }
      if ('matchTarget' in c) expect(TARGET_BANDS.some((t) => t.id === c.matchTarget)).toBe(true);
      if ('unbanded' in c) expect(c.unbanded.length).toBeGreaterThan(40);
    }
  });

  it('gives MATCH-30 verdicts and lists the unbanded counters', () => {
    // Synthetic levels: key passes and box shots inside, through balls far outside (T284's ~40);
    // PPDA is the opponent's build-up passes over the side's press actions (320 / 25 = 12.8).
    const rows = advancedCounterVerdicts(
      matches(
        60,
        {
          keyPasses: 9,
          boxShots: 7.2,
          throughBalls: 40,
          crosses: 16,
          highTurnovers: 6.5,
          buildUpPasses: 320,
          pressActions: 25,
        },
        90,
      ),
    );
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(rows).toHaveLength(ADVANCED_COUNTER_TARGET.counters.length);
    expect(by.get('keyPasses')).toMatchObject({ status: 'inside', value: 9 });
    expect(by.get('boxShots')!.status).toBe('inside');
    expect(by.get('throughBalls')).toMatchObject({ status: 'outside', value: 40 });
    // xA is the sum of a side's player lines (90 hundredths), read per team.
    expect(by.get('xa')!.status).toBe('inside');
    expect(by.get('xa')!.value).toBeCloseTo(0.9, 9);
    // A counter MATCH-23 bands reads that row.
    expect(by.get('crosses')).toMatchObject({ status: 'inside', matchTarget: 'crosses' });
    // Unbanded counters carry their reason and their measured level, never a verdict.
    for (const id of ['lineBreakingPasses', 'fieldTilt']) {
      expect(by.get(id)!.status).toBe('unbanded');
      expect(by.get(id)!.reason).toBeDefined();
      expect(by.get(id)!.band).toBeUndefined();
    }
    // T327 counts both under MATCH-13 r18's published conventions and bands them from Opta's
    // league-season figures (docs/MATCH-BASELINES.md), never the engines' output.
    expect(by.get('highTurnovers')).toMatchObject({ status: 'inside', band: [5.7, 7.5] });
    expect(by.get('highTurnovers')!.value).toBeCloseTo(6.5, 9);
    expect(by.get('ppda')).toMatchObject({ status: 'inside', band: [12, 14] });
    expect(by.get('ppda')!.value).toBeCloseTo(12.8, 9);
    expect(by.get('lineBreakingPasses')!.value).toBe(0);
    // Too few matches are underpowered; a record without detail rows is missing.
    expect(advancedCounterVerdicts(matches(10, { keyPasses: 9 }))[0]!.status).toBe('underpowered');
    const bare = advancedCounterVerdicts([sample(record())]);
    expect(bare.find((r) => r.id === 'keyPasses')!.status).toBe('missing');
    const lines = describeAdvancedCounters(rows);
    expect(lines[0]).toContain(
      `target v${ADVANCED_COUNTER_TARGET.version}, ${MATCH_PARITY_VERSION}`,
    );
    expect(lines.some((l) => l.includes('fieldTilt: unbanded'))).toBe(true);
    expect(lines.some((l) => l.includes('ppda: inside [12, 14]'))).toBe(true);
  });

  it("lists MATCH-23's trace-only rows as detailed-only on the aggregate path", () => {
    const set = matches(40, { crosses: 16 });
    const detailed = buildTargetReport(set);
    const aggregate = buildTargetReport(set, 'aggregate');
    const traceOnly = TARGET_BANDS.filter((t) => t.reads === 'diagnostics').map((t) => t.id);
    expect(traceOnly).toEqual([
      'possessions',
      'passesPerPossession',
      'possessionShots',
      'shotDistance',
      'shotsFar',
      'shotsOwnHalf',
    ]);
    for (const id of traceOnly) {
      expect(detailed.find((t) => t.id === id)!.status).toBe('missing');
      expect(aggregate.find((t) => t.id === id)!.status).toBe('detailed-only');
    }
    // Every other row reads the same on both paths.
    for (const t of aggregate.filter((x) => !traceOnly.includes(x.id)))
      expect(t).toEqual(detailed.find((x) => x.id === t.id));
    // The parity report names each side's engine and reads its targets the same way.
    const provenance: Provenance = {
      date: '2026-10-22T00:00:00.000Z',
      source: {
        gitHead: 'synthetic',
        gitDirty: false,
        fingerprint: { algorithm: 'sha256', sha256: '0'.repeat(64), files: 1, scope: ['scripts'] },
      },
      toolchain: { node: 'v24.12.0' },
      machine: { platform: 'test', arch: 'x', cpu: 'synthetic', logicalCpus: 1, memoryBytes: 1 },
      seeds: {},
      conditions: [],
      partitions: {},
    };
    const parity = buildParityReport({
      provenance,
      partition: 'calibration',
      condition: 'core:equal-top-tier',
      reference: { path: 'synthetic grid', engine: 'detailed', samples: set },
      candidate: { path: 'synthetic aggregate', engine: 'aggregate', samples: set },
    });
    expect(parity.targets.reference).toEqual(detailed);
    expect(parity.targets.candidate).toEqual(aggregate);
  });

  it("holds scoring concentration to MATCH-23's ratified rows", () => {
    expect(SCORING_CONCENTRATION_TARGET.source).toBe('MATCH-23');
    const verdicts = scoringConcentrationVerdicts({
      clubTopScorerShare: { value: 0.25, interval: [0.24, 0.26], n: 360 },
      leagueTopScorerGoals: { value: 33, interval: [32.5, 33.5], n: 360 },
      hatTricksPerMatch: poissonReading(300, 10000),
    });
    expect(verdicts.map((v) => [v.id, v.status])).toEqual([
      ['clubTopScorerShare', 'inside'],
      ['leagueTopScorerGoals', 'outside'],
      ['hatTricksPerMatch', 'inside'],
    ]);
    const thin = scoringConcentrationVerdicts({
      clubTopScorerShare: { value: 0.29, interval: [0.27, 0.31], n: 360 },
      leagueTopScorerGoals: { value: 27, interval: [20, 34], n: 12 },
    });
    expect(thin.map((v) => v.status)).toEqual(['unresolved', 'underpowered', 'missing']);
    // No hat-trick seen: the rule of three bounds the rate.
    expect(poissonReading(0, 600).interval).toEqual([0, 3 / 600]);
    // MATCH-23 states the hat-trick rate for a top-tier league season: a verdict on the core
    // condition only, context on every other condition.
    expect(hatTrickReading(300, 10000, conditionOf('core:equal-top-tier')).status).toBe('inside');
    const gap = hatTrickReading(300, 10000, conditionOf('gap:20'));
    expect(gap).toMatchObject({ status: 'context', note: HAT_TRICK_CONTEXT });
    expect(gap.value).toBeCloseTo(0.03, 9);
  });
});
