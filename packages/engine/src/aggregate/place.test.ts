import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  isScriptedModel,
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
} from '../../../contracts/src/match-model';
import { BAND_EDGES, LANE_EDGES, toEngine } from '../match/pitch';
import { MATCH_MODEL_RELEASE } from '../match-model-release';
import { FORMATIONS } from '../player';
import { placeFor } from '../staging/shape';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './config';
import { fitPlaceWeights, opposingCell, placeDistance, placeTerm } from './place';

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
  it('releases revision 11', () => {
    expect(MATCH_MODEL_REVISIONS.at(-1)).toBe('scripted-aggregate-11');
    expect(MATCH_MODEL_REVISION).toBe('scripted-aggregate-11');
    expect(MATCH_MODEL_RELEASE.revision).toBe(MATCH_MODEL_REVISION);
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: 'scripted-aggregate-11', enabled: true });
    expect(isScriptedModel(undefined)).toBe(false);
    for (const revision of MATCH_MODEL_REVISIONS.slice(0, 10))
      expect(isScriptedModel(revision)).toBe(false);
    expect(isScriptedModel(MATCH_MODEL_RELEASE.revision)).toBe(true);
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
