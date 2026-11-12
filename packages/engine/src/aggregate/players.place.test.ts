import { beforeAll, describe, expect, it } from 'vitest';
import { normalQuantile } from '../../../../scripts/lib/match-parity';
import type { Fixture, World } from '../../../contracts/src/types';
import { careerWorld } from '../career.testkit';
import { eraRules } from '../grid/setup';
import { prepareMatch } from '../match';
import { validateFullMatchRecord } from '../match-model';
import { MATCH_MODEL_RELEASE } from '../match-model-release';
import { AGGREGATE_ATTRIBUTION_CONFIG as AC } from './config';
import { aggregateRecord, matchdayRosters, playAggregate } from './engine';
import { isPassKind } from './ledger';
import { opposingCell, placeDistance } from './place';
import { attributePlayerFacts } from './players';
import { aggregateStreams } from './team';
import type { AggregateAttributionTrace, AggregateMove } from './types';

/** Full-match statistical/invariant evidence; integration tier, never run by a task unit. */
function sample(w: World, f: Fixture) {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const match = playAggregate(w, f, prepared, rosters);
  const trace = (placed: boolean) => {
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const streamId = match.retry === 0 ? f.id : `${f.id}:retry${match.retry}`;
    const players = attributePlayerFacts(
      match.input,
      { ...match.plan, placed },
      match.participation,
      match.facts,
      aggregateStreams(w.seed, streamId),
      trace,
    );
    return {
      trace,
      players,
      record: aggregateRecord(f, rosters, { ...match, players }, MATCH_MODEL_RELEASE.revision),
    };
  };
  return { match, placed: trace(true), unplaced: trace(false) };
}
type Sample = ReturnType<typeof sample>;

function fixtures(w: World, n: number, prefix: string): Fixture[] {
  const pool = w.fixtures.filter((f) => f.home !== w.playerClub && f.away !== w.playerClub);
  return Array.from({ length: n }, (_, i) => ({
    ...pool[(i * 47) % pool.length]!,
    id: `${prefix}:${i}`,
  }));
}

function distances(samples: readonly Sample[], placed: boolean) {
  const attempts: number[] = [],
    winners: number[] = [];
  for (const s of samples) {
    const { plan, facts, participation } = s.match;
    const shapes = [plan.sides[0].shape, plan.sides[1].shape] as const;
    const trace = (placed ? s.placed : s.unplaced).trace;
    for (const side of [0, 1] as const) {
      facts.ledger.sides[side].moves.forEach((move, index) => {
        const t = trace.moves[side][index]!;
        const add = (
          counts: readonly number[],
          owner: 0 | 1,
          cell: number,
          ip: boolean,
          into: number[],
        ) => {
          counts.forEach((count, line) => {
            const stints = participation.stints[owner].filter(
              (stint) =>
                stint.line === line && (move.period === 'extra' ? stint.to > 90 : stint.from < 90),
            );
            // A line can switch slots after a dismissal. Average his place by the exposure the
            // allocator actually weighs, restricted to this period.
            const spans = stints.map((stint) => ({
              slot: stint.slot,
              minutes: Math.max(
                0,
                Math.min(stint.to, move.period === 'extra' ? 120 : 90) -
                  Math.max(stint.from, move.period === 'extra' ? 90 : 0),
              ),
            }));
            const minutes = spans.reduce((n, x) => n + x.minutes, 0);
            if (count === 0) return;
            expect(minutes).toBeGreaterThan(0);
            const d =
              spans.reduce(
                (n, x) => n + x.minutes * placeDistance(shapes, owner, x.slot, cell, ip),
                0,
              ) / minutes;
            for (let k = 0; k < count; k++) into.push(d);
          });
        };
        add(t.attempts, side, move.from, true, attempts);
        add(
          t.won,
          side === 0 ? 1 : 0,
          opposingCell(isPassKind(move.kind) ? move.to : move.from),
          false,
          winners,
        );
      });
    }
  }
  attempts.sort((a, b) => a - b);
  return {
    median: attempts[Math.floor(attempts.length / 2)]!,
    far: attempts.filter((d) => d > 20).length / attempts.length,
    winnersFar: winners.filter((d) => d > 20).length / winners.length,
  };
}

/** Attempts by initial XI slot and action class, on the no-substitute 1964 sample. */
function counts(s: Sample, placed: boolean) {
  const totals = new Map<string, number>();
  const trace = (placed ? s.placed : s.unplaced).trace;
  const add = (kind: string, counts: readonly number[]) =>
    counts.forEach((n, slot) => {
      const key = `${slot}:${kind}`;
      totals.set(key, (totals.get(key) ?? 0) + n);
    });
  for (const side of [0, 1] as const)
    s.match.facts.ledger.sides[side].moves.forEach((move: AggregateMove, i) => {
      const t = trace.moves[side][i]!;
      add(move.kind === 'cutBack' ? 'cross' : move.kind, t.attempts);
      add(isPassKind(move.kind) ? 'interception' : 'tackle', t.won);
    });
  return totals;
}

describe('revision 11 attribution by place (→MATCH-16)', () => {
  let w: World, samples: Sample[];
  beforeAll(() => {
    w = careerWorld({ seed: 'placed-attribution', year: 1964 }, MATCH_MODEL_RELEASE);
    samples = fixtures(w, 24, 'placed-fixture').map((f) => sample(w, f));
  });

  it('team numbers do not move', () => {
    for (const { match, placed, unplaced } of samples) {
      expect(match.plan.placed).toBe(true);
      expect(placed.players).toEqual(match.players);
      expect(placed.record.metrics).toEqual(unplaced.record.metrics);
      expect(placed.record.detail).toEqual(unplaced.record.detail);
      expect(validateFullMatchRecord(placed.record)).toEqual([]);
    }
  });

  it("a player's actions gather where he plays", () => {
    const placed = distances(samples, true),
      unplaced = distances(samples, false);
    console.info(
      'T824 place measurements',
      JSON.stringify({ placed, unplaced, fixtures: samples.length, reach: AC.place.reach }),
    );
    expect(placed.median).toBeLessThanOrEqual(AC.place.target.median);
    expect(placed.far).toBeLessThanOrEqual(AC.place.target.far);
    expect(placed.winnersFar).toBeLessThanOrEqual(AC.place.target.winnersFar);
  });

  it('expected totals hold', () => {
    const sums = new Map<string, { base: number; differences: number[] }>();
    for (const f of fixtures(w, 300, 'placed-expectation')) {
      const s = sample(w, f),
        a = counts(s, true),
        b = counts(s, false);
      for (const [key, base] of b) {
        const row = sums.get(key) ?? { base: 0, differences: [] };
        row.base += base;
        row.differences.push((a.get(key) ?? 0) - base);
        sums.set(key, row);
      }
    }
    // This is one joint claim about every slot/action class. Pointwise 95% intervals would
    // falsely fail at least one of 88 independent null comparisons about 99% of the time.
    // Bonferroni keeps family-wise coverage at 95% even though these paired rows are correlated.
    const confidence = 0.95;
    const critical = normalQuantile(1 - (1 - confidence) / (2 * sums.size));
    let worstRelative = 0;
    for (const [key, row] of sums) {
      const n = row.differences.length;
      const mean = row.differences.reduce((a, b) => a + b, 0) / n;
      const variance = row.differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (n - 1);
      const interval = critical * Math.sqrt(variance / n);
      const margin = (0.03 * row.base) / n;
      if (row.base > 0) worstRelative = Math.max(worstRelative, Math.abs(mean) / (row.base / n));
      expect(
        Math.abs(mean),
        `${key}: mean ${mean}, 3% ${margin}, simultaneous paired 95% ${interval}`,
      ).toBeLessThanOrEqual(Math.max(margin, interval));
    }
    console.info(
      'T824 expected totals',
      JSON.stringify({
        fixtures: 300,
        classesAndSlots: sums.size,
        confidence,
        critical,
        worstRelative,
      }),
    );
  });

  it("an offside is never the passer's own", () => {
    let pairs = 0;
    for (const s of samples)
      for (const side of [0, 1] as const)
        s.placed.trace.moves[side].forEach((t, index) => {
          expect(t.offsidePairs?.length ?? 0).toBe(
            s.match.facts.ledger.sides[side].moves[index]!.offside,
          );
          const caught = t.offside.map(() => 0),
            actors = t.attempts.map(() => 0);
          for (const { actor, receiver } of t.offsidePairs ?? []) {
            pairs++;
            expect(actor).not.toBe(receiver);
            caught[receiver]!++;
            actors[actor]!++;
          }
          expect(caught).toEqual(t.offside);
          actors.forEach((n, p) => expect(n).toBeLessThanOrEqual(t.attempts[p]! - t.completed[p]!));
        });
    expect(pairs).toBeGreaterThan(0);
  });

  it('shots keep their shooters', () => {
    for (const s of samples) expect(s.placed.players.shots).toEqual(s.unplaced.players.shots);
  });
});
