import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MATCH_MODEL_REVISION, MATCH_MODEL_REVISIONS } from '../../../contracts/src/match-model';
import type { Tactic } from '../../../contracts/src/types';
import { BAND_EDGES, LANE_EDGES, toEngine } from '../match/pitch';
import { MATCH_MODEL_RELEASE } from '../match-model-release';
import { FORMATIONS } from '../player';
import { placeFor, type ShapeSide } from '../staging/shape';
import { applyOverrides, restoreDefaults } from '../tunables';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './config';
import {
  PLACE_ROWS,
  PLACE_FIT_TOLERANCE,
  clearPlaceTables,
  fitPlaceWeights,
  opposingCell,
  placeDistance,
  placeRow,
  placeTable,
  placeTerm,
  type PlaceGroup,
} from './place';
import { attributePlayerFacts } from './players';
import { attributionFixture } from './players.testkit';
import { aggregateStreams } from './team';
import type { AggregateAttributionTrace, AggregatePlan } from './types';

describe('placed attribution primitives', () => {
  it('preserves target expectations across many asymmetric action classes', () => {
    const vector = () =>
      fc.array(fc.integer({ min: 2, max: 100 }), { minLength: 11, maxLength: 11 });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            count: fc.integer({ min: 1, max: 30 }),
            weights: vector(),
            factors: vector(),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (rows) => {
          const groups = rows.map((row) => ({
            count: row.count,
            weights: [...row.weights, 0],
            placed: [...row.weights.map((w, p) => (w * row.factors[p]!) / 100), 0],
          }));
          const fitted = fitPlaceWeights(groups);
          for (let p = 0; p < 12; p++) {
            const expected = groups.reduce(
              (sum, row) =>
                sum + (row.count * row.weights[p]!) / row.weights.reduce((a, b) => a + b, 0),
              0,
            );
            const actual = fitted.reduce(
              (sum, row, i) => sum + (groups[i]!.count * row[p]!) / row.reduce((a, b) => a + b, 0),
              0,
            );
            expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-7 * Math.max(1, expected));
          }
        },
      ),
      { seed: 849, numRuns: 100 },
    );
  });
  it('converges sooner for other fixtures while preserving group counts and place totals', () => {
    const source = [
      { count: 50, weights: [1, 1, 0.001, 0], placed: [1, 0.02, 0.0001, 0] },
      { count: 50, weights: [1, 1, 0.001, 0], placed: [0.1, 1, 0.002, 0] },
    ];
    const run = (tolerance: number) => {
      let reads = 0;
      const groups = source.map((g) => ({
        ...g,
        placed: new Proxy(g.placed, {
          get(target, key, receiver) {
            if (key === '0') reads++;
            return Reflect.get(target, key, receiver);
          },
        }),
      }));
      return { fitted: fitPlaceWeights(groups, tolerance), reads };
    };
    const own = run(PLACE_FIT_TOLERANCE.own);
    const other = run(PLACE_FIT_TOLERANCE.other);
    expect(other.reads).toBeLessThan(own.reads);
    const totals = [0, 0, 0, 0];
    other.fitted.forEach((row, i) => {
      const sum = row.reduce((a, b) => a + b, 0);
      const counts = row.map((weight) => (source[i]!.count * weight) / sum);
      expect(counts.reduce((a, b) => a + b, 0)).toBeCloseTo(source[i]!.count, 12);
      counts.forEach((count, p) => (totals[p]! += count));
    });
    [100 / 2.001, 100 / 2.001, 0.1 / 2.001, 0].forEach((expected, p) =>
      expect(Math.abs(totals[p]! - expected)).toBeLessThanOrEqual(expected * 1e-3),
    );
  });
  it('releases revision 11', () => {
    expect(MATCH_MODEL_REVISIONS.at(-1)).toBe('scripted-aggregate-11');
    expect(MATCH_MODEL_REVISION).toBe('scripted-aggregate-11');
    expect(MATCH_MODEL_RELEASE.revision).toBe(MATCH_MODEL_REVISION);
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: 'scripted-aggregate-11' });
  });

  it('measures both sides in metres and mirrors the lane with the band', () => {
    const sides = [
      { tactic: 'possession' as const, roles: FORMATIONS.possession.slots.map((s) => s.role) },
      { tactic: 'counter' as const, roles: FORMATIONS.counter.slots.map((s) => s.role) },
    ] as const;
    expect(opposingCell(10)).toBe(29);
    expect(opposingCell(opposingCell(10))).toBe(10);
    for (const side of [0, 1] as const)
      for (const ip of [true, false]) {
        const ball = toEngine(side, [
          (BAND_EDGES[2] + BAND_EDGES[3]) / 2,
          (LANE_EDGES[0] + LANE_EDGES[1]) / 2,
        ]);
        const p = placeFor(sides, side, 1, 10, ip);
        expect(placeDistance(sides, side, 1, 10, ip)).toBeCloseTo(
          Math.hypot(p[0] - ball[0], p[1] - ball[1]),
          12,
        );
      }
    expect(placeTerm(0)).toBe(1);
    expect(placeTerm(AC.place.reach)).toBeCloseTo(Math.exp(-0.5), 12);
    expect(placeTerm(100)).toBe(AC.place.floor);
  });

  it('keeps unequal row marginals while gathering symmetric flank actions', () => {
    // Two synthetic flank groups, a central player and a nonparticipant. Their unplaced
    // expected attempts are 20/20/10/0; each group must still split exactly 25 attempts.
    const groups = [
      { count: 25, weights: [2, 2, 1, 0], placed: [2, 0.04, 0.3, 0] },
      { count: 25, weights: [2, 2, 1, 0], placed: [0.04, 2, 0.3, 0] },
    ];
    const fitted = fitPlaceWeights(groups);
    const means = [0, 0, 0, 0];
    fitted.forEach((weights, g) => {
      const total = weights.reduce((n, x) => n + x, 0);
      weights.forEach((w, p) => (means[p]! += (groups[g]!.count * w) / total));
    });
    [20, 20, 10, 0].forEach((e, p) => expect(means[p]).toBeCloseTo(e, 10));
    expect(fitted[0]![0]! / fitted[0]![1]!).toBeCloseTo(50, 10);
    expect(groups[0]!.placed).toEqual([2, 0.04, 0.3, 0]);
    expect(fitPlaceWeights([])).toEqual([]);
  });

  it('fits different group counts and base weights without giving a zero target any weight', () => {
    const groups = [
      { count: 4, weights: [3, 2, 1, 0], placed: [3, 0.04, 0.1, 0] },
      { count: 6, weights: [2, 4, 1, 0], placed: [0.04, 4, 0.5, 0] },
      { count: 4, weights: [1, 2, 3, 0], placed: [0.1, 0.2, 3, 0] },
    ];
    const means = (weights: readonly (readonly number[])[]) =>
      [0, 1, 2, 3].map((p) =>
        groups.reduce(
          (n, g, i) => n + (g.count * weights[i]![p]!) / weights[i]!.reduce((a, b) => a + b, 0),
          0,
        ),
      );
    const expected = means(groups.map((g) => g.weights));
    const actual = means(fitPlaceWeights(groups));
    expected.forEach((e, p) => expect(Math.abs(actual[p]! - e)).toBeLessThanOrEqual(e * 0.03));
  });
  it('converges for asymmetric flank weights instead of stopping with biased expectations', () => {
    const groups = [
      { count: 50, weights: [1, 1, 0], placed: [1, 0.02, 0] },
      { count: 50, weights: [1, 1, 0], placed: [0.1, 1, 0] },
    ];
    const fitted = fitPlaceWeights(groups);
    const expected = [0, 0, 0];
    fitted.forEach((row, i) => {
      const sum = row.reduce((n, w) => n + w, 0);
      row.forEach((w, p) => (expected[p]! += (groups[i]!.count * w) / sum));
    });
    // Eight rounds left the first line at 50.752791, although both targets are exactly 50.
    expect(expected[0]).toBeCloseTo(50, 8);
    expect(expected[1]).toBeCloseTo(50, 8);
    expect(expected[2]).toBe(0);
  });
});

/**
 * `fitPlaceWeights` with every group summing its own normaliser: the reference a group sharing
 * its placed array with others must match bit for bit (T941 measured a shared-normaliser variant
 * slower and kept this one).
 */
function fitPerGroup(groups: readonly PlaceGroup[]): number[][] {
  if (groups.length === 0) return [];
  const n = groups[0]!.weights.length;
  const expected = Array<number>(n).fill(0);
  for (const g of groups) {
    const sum = g.weights.reduce((a, b) => a + b, 0);
    if (sum > 0) for (let p = 0; p < n; p++) expected[p]! += (g.count * g.weights[p]!) / sum;
  }
  const scale: number[] = expected.map((e) => (e > 0 ? 1 : 0));
  for (let iteration = 0; iteration < AC.place.iterations; iteration++) {
    const actual = Array<number>(n).fill(0);
    for (const g of groups) {
      let sum = 0;
      for (let p = 0; p < n; p++) sum += g.placed[p]! * scale[p]!;
      if (sum > 0)
        for (let p = 0; p < n; p++) actual[p]! += (g.count * g.placed[p]! * scale[p]!) / sum;
    }
    if (actual.every((a, p) => Math.abs(a - expected[p]!) <= 1e-10 * Math.max(1, expected[p]!)))
      break;
    for (let p = 0; p < n; p++)
      scale[p] = actual[p]! > 0 ? (scale[p]! * expected[p]!) / actual[p]! : 0;
  }
  return groups.map((g) => g.placed.map((w, p) => w * scale[p]!));
}

const shape = (tactic: Tactic): ShapeSide => ({
  tactic,
  roles: FORMATIONS[tactic].slots.map((s) => s.role),
});
/** Every row of one side's place terms, computed directly. */
const directRows = (sides: readonly [ShapeSide, ShapeSide], side: 0 | 1) =>
  Array.from({ length: PLACE_ROWS }, (_, at) =>
    sides[side].roles.map((_, slot) =>
      placeTerm(placeDistance(sides, side, slot, at >> 1, (at & 1) === 1)),
    ),
  );
const tableRows = (sides: readonly [ShapeSide, ShapeSide], side: 0 | 1) => {
  const table = placeTable(sides, side, sides[side].roles.length);
  return Array.from({ length: PLACE_ROWS }, (_, at) => placeRow(table, at >> 1, (at & 1) === 1));
};

/** One small attribution with place on, under `plan`'s shapes. */
function attributed(plan?: (base: AggregatePlan) => AggregatePlan) {
  const m = attributionFixture(0);
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const placed = { ...m.plan, placed: true };
  const players = attributePlayerFacts(
    m.input,
    plan ? plan(placed) : placed,
    m.participation,
    m.facts,
    aggregateStreams(m.input.seed, m.input.fixture),
    trace,
  );
  return { players, trace };
}
const withShape = (side: 0 | 1, tactic: Tactic) => (plan: AggregatePlan) => ({
  ...plan,
  sides: plan.sides.map((s, i) => (i === side ? { ...s, shape: shape(tactic) } : s)) as [
    AggregatePlan['sides'][0],
    AggregatePlan['sides'][1],
  ],
});

describe('process place tables and shared placed weights (T941)', () => {
  afterEach(restoreDefaults);

  it('holds the direct terms for every pairing of shapes, one table per pairing and side', () => {
    const a = [shape('possession'), shape('counter')] as const;
    const b = [shape('press'), shape('counter')] as const;
    for (const side of [0, 1] as const) {
      expect(tableRows(a, side)).toEqual(directRows(a, side));
      expect(tableRows(b, side)).toEqual(directRows(b, side));
      // A later match of the same shapes, as new objects, reads the same table.
      const again = [shape('possession'), shape('counter')] as const;
      expect(placeTable(again, side, 11)).toBe(placeTable(a, side, 11));
      expect(placeTable(b, side, 11)).not.toBe(placeTable(a, side, 11));
    }
    expect(tableRows(b, 0)).not.toEqual(tableRows(a, 0));
  });

  it('a tactic change between two matches attributes as a fresh process does', () => {
    const first = attributed();
    const changed = attributed(withShape(0, 'press'));
    clearPlaceTables();
    const fresh = attributed(withShape(0, 'press'));
    expect(changed).toEqual(fresh);
    expect(changed.players).not.toEqual(first.players);
    // Back to the first shapes after the change, on a warm table.
    expect(attributed()).toEqual(first);
  });

  it('a lab override of a place leaf reaches the next match and leaves with its restore', () => {
    const before = attributed();
    const sides = [shape('possession'), shape('press')] as const;
    const defaults = tableRows(sides, 0);
    const outcome = applyOverrides({
      'AGGREGATE_ATTRIBUTION_CONFIG.place.reach': AC.place.reach / 4,
    });
    expect(outcome.applied).toEqual(['AGGREGATE_ATTRIBUTION_CONFIG.place.reach']);
    const overridden = tableRows(sides, 0);
    expect(overridden).toEqual(directRows(sides, 0));
    expect(overridden).not.toEqual(defaults);
    const after = attributed();
    expect(after.players).not.toEqual(before.players);
    clearPlaceTables();
    expect(attributed()).toEqual(after);
    restoreDefaults();
    expect(tableRows(sides, 0)).toEqual(defaults);
    expect(attributed()).toEqual(before);
  });

  it('fits groups sharing one placed array exactly as one normaliser per group', () => {
    const vector = () => fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 6, maxLength: 6 });
    fc.assert(
      fc.property(
        fc.array(vector(), { minLength: 1, maxLength: 4 }),
        fc.array(
          fc.record({ count: fc.integer({ min: 1, max: 30 }), weights: vector(), at: fc.nat() }),
          { minLength: 1, maxLength: 16 },
        ),
        (placedRows, rows) => {
          // Shared objects, as `weightsAt` hands one array to every group of a cell and role.
          const placed = placedRows.map((row) => row.map((x) => x / 7));
          const groups = rows.map((row) => ({
            count: row.count,
            weights: row.weights,
            placed: placed[row.at % placed.length]!,
          }));
          expect(fitPlaceWeights(groups)).toEqual(fitPerGroup(groups));
        },
      ),
      { seed: 941, numRuns: 200 },
    );
  });

  it('fits distinct placed arrays exactly as the reference, typed rows included (T983)', () => {
    const vector = () =>
      fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 11, maxLength: 11 });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            count: fc.integer({ min: 1, max: 30 }),
            weights: vector(),
            placed: vector(),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (rows) => {
          const groups = rows.map((row) => ({
            count: row.count,
            weights: row.weights,
            placed: row.placed.map((x) => x / 13),
          }));
          expect(fitPlaceWeights(groups)).toEqual(fitPerGroup(groups));
        },
      ),
      { seed: 983, numRuns: 200 },
    );
  });

  it('stops at the iteration cap exactly as the reference when the fit cannot converge', () => {
    // The third line is expected to take attempts but no group places it, so its scale falls to
    // zero and its expectation is never met: every one of the capped iterations runs.
    const shared = [1, 0.3, 0];
    const groups = [
      { count: 9, weights: [1, 1, 1], placed: shared },
      { count: 5, weights: [2, 1, 3], placed: [0.2, 1.5, 0] },
      { count: 7, weights: [1, 3, 2], placed: shared },
    ];
    const fitted = fitPlaceWeights(groups);
    expect(fitted).toEqual(fitPerGroup(groups));
    const reached = [0, 0, 0];
    fitted.forEach((row, i) => {
      const sum = row.reduce((n, w) => n + w, 0);
      row.forEach((w, p) => (reached[p]! += (groups[i]!.count * w) / sum));
    });
    expect(reached[2]).toBe(0);
    expect(AC.place.iterations).toBeGreaterThan(0);
  });
});
