import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../packages/contracts/src/detail';
import type { MatchRecord, Tactic } from '../../packages/contracts/src/types';
import { M } from '../../packages/engine/src/grid/record';
import { zeroMetrics } from '../../packages/engine/src/primitives';
import {
  buildCoverageReport,
  buildEquivalenceReport,
  buildInvariantReport,
  buildOutcomeTargetReport,
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
  describeTacticPairings,
  equivalencePower,
  INCIDENT_KINDS,
  MATCH_PARITY_VERSION,
  METRIC_BY_ID,
  METRIC_REGISTRY,
  normalCdf,
  normalQuantile,
  observe,
  outcomeTarget,
  pilotNeeds,
  rareComparisonPower,
  requiredRareEvents,
  ruleExclusions,
  seedOverlap,
  TACTIC_PAIRING_TARGET,
  tacticPairingVerdicts,
  validateCorpusConfig,
  validateRegistry,
  validationSize,
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
    const paired = comparePerformance(
      { provenance, report: baseline },
      { provenance, report: candidate },
    );
    expect(paired.paired).toBe(true);
    expect(paired.gates.map((g) => [g.id, g.status])).toEqual([
      ['npc-fixture', 'pass'],
      ['season.baseline', 'pass'],
      ['season.active-management', 'pass'],
    ]);
    // A provisional baseline is never release evidence.
    expect(paired.releaseEvidence).toBe(false);
    const elsewhere = comparePerformance(
      { provenance, report: baseline },
      {
        provenance: { ...provenance, machine: { ...provenance.machine, cpu: 'another' } },
        report: candidate,
      },
    );
    expect(elsewhere).toMatchObject({ paired: false, reasons: ['machine differs'] });
    expect(elsewhere.gates.every((g) => g.status === 'unpaired')).toBe(true);
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
    /** Minutes in possession, home then away. */
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
