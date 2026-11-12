import { beforeAll, describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../../contracts/src/types';
import { careerWorld } from '../career.testkit';
import { MATCH_MODEL_RELEASE } from '../match-model-release';
import { AGGREGATE_CONFIG } from './config';
import { isPassKind, looseBalls } from './ledger';
import { tracedAggregate } from './players.testkit';
import { commonSpan, playingSpan } from './timeline';
import type { AggregatePeriod, AggregateSide } from './types';

/**
 * Revision 11's two-man actions over whole matches with substitutions (→MATCH-16, MATCH-27): world
 * fixtures of 2008 (seven named substitutes, three used), one a knockout tie that plays extra
 * time. Integration tier: full matches on a founded world, never run by a task unit.
 */
type Sample = ReturnType<typeof tracedAggregate>;
type Kind = 'wins' | 'recoveries' | 'offside' | 'foul';
interface Pair {
  kind: Kind;
  period: AggregatePeriod;
  a: { side: AggregateSide; line: number };
  b: { side: AggregateSide; line: number };
}

const CUP = { awayGoals: false } as const;
const FIXTURES = 8;

/** A line's playing span in a period, as the attribution reads it (`SideLines.spans`). */
function span(s: Sample, side: AggregateSide, line: number, period: AggregatePeriod) {
  return commonSpan(
    AGGREGATE_CONFIG.periods[period],
    playingSpan(s.match.participation.stints[side].filter((x) => x.line === line)),
  );
}
const length = (x: { from: number; to: number }) => x.to - x.from;
const shared = (s: Sample, period: AggregatePeriod, a: Pair['a'], b: Pair['b']) =>
  length(commonSpan(span(s, a.side, a.line, period), span(s, b.side, b.line, period)));
const key = (period: AggregatePeriod, a: Pair['a'], b: Pair['b']) => {
  const [x, y] = [a, b].sort((p, q) => p.side - q.side || p.line - q.line);
  return `${period}:${x!.side}.${x!.line}:${y!.side}.${y!.line}`;
};

/** Every pair the trace names: wins, recoveries and offsides by move, unbooked fouls by row. */
function pairsOf(s: Sample): Pair[] {
  const pairs: Pair[] = [];
  for (const side of [0, 1] as const) {
    const other = side === 0 ? 1 : 0;
    const ledger = s.match.facts.ledger.sides[side];
    ledger.moves.forEach((move, i) => {
      const t = s.trace.moves[side][i]!;
      for (const p of t.wins ?? [])
        pairs.push({
          kind: 'wins',
          period: move.period,
          a: { side, line: p.actor },
          b: { side: other, line: p.other },
        });
      for (const p of t.recoveries ?? [])
        pairs.push({
          kind: 'recoveries',
          period: move.period,
          a: { side, line: p.actor },
          b: { side: other, line: p.other },
        });
      for (const p of t.offsidePairs ?? [])
        pairs.push({
          kind: 'offside',
          period: move.period,
          a: { side, line: p.actor },
          b: { side, line: p.receiver },
        });
    });
    ledger.fouled.forEach((row, i) => {
      for (const p of s.trace.fouls[side][i]!.pairs ?? [])
        pairs.push({
          kind: 'foul',
          period: row.period,
          a: { side, line: p.actor },
          b: { side: other, line: p.other },
        });
    });
  }
  return pairs;
}

/** Couples of lines that both play in a period and share no minute of it. */
function apart(s: Sample) {
  const across = new Set<string>(),
    within = new Set<string>();
  const lines = (side: AggregateSide, period: AggregatePeriod) =>
    s.match.input.sides[side].lines
      .map((_, line) => ({ side, line }))
      .filter((p) => length(span(s, p.side, p.line, period)) > 0);
  for (const period of s.match.facts.ledger.periods) {
    const [home, away] = [lines(0, period), lines(1, period)];
    for (const a of home)
      for (const b of away) if (shared(s, period, a, b) <= 0) across.add(key(period, a, b));
    for (const side of [home, away])
      side.forEach((a, i) =>
        side.slice(i + 1).forEach((b) => {
          if (shared(s, period, a, b) <= 0) within.add(key(period, a, b));
        }),
      );
  }
  return { across, within };
}

const tally = (lines: readonly number[], n: number) => {
  const counts = Array<number>(n).fill(0);
  for (const line of lines) counts[line]!++;
  return counts;
};
const padded = (counts: readonly number[], n: number) =>
  Array.from({ length: n }, (_, i) => counts[i] ?? 0);

describe('revision 11 pairs over whole matches (→MATCH-16, MATCH-27)', () => {
  let samples: Sample[];
  beforeAll(() => {
    const w: World = careerWorld({ seed: 'pair-attribution', year: 2008 }, MATCH_MODEL_RELEASE);
    const pool = w.fixtures.filter((f) => f.home !== w.playerClub && f.away !== w.playerClub);
    const at = (i: number, prefix: string): Fixture => ({
      ...pool[(i * 47) % pool.length]!,
      id: `${prefix}:${i}`,
    });
    samples = Array.from({ length: FIXTURES - 1 }, (_, i) => tracedAggregate(w, at(i, 'pairs')));
    // The first knockout tie still level after 90 minutes: its pairs span two periods.
    for (let i = 0; samples.length < FIXTURES; i++) {
      if (i === 40) throw new Error('no knockout tie of 40 reached extra time');
      const s = tracedAggregate(w, at(i, 'pairs-cup'), CUP);
      if (s.match.facts.length === 120) samples.push(s);
    }
  }, 300_000);

  it('every pair is on the pitch together', () => {
    let across = 0,
      substituted = 0;
    const counted = new Map<Kind, number>();
    for (const s of samples) {
      expect(s.match.plan.placed).toBe(true);
      expect(s.match.input.year).toBe(2008);
      substituted += s.match.participation.incidents.filter((x) => x.kind === 'sub').length;
      const never = apart(s);
      across += never.across.size;
      for (const pair of pairsOf(s)) {
        counted.set(pair.kind, (counted.get(pair.kind) ?? 0) + 1);
        const name = `${s.match.input.fixture} ${pair.kind} ${key(pair.period, pair.a, pair.b)}`;
        expect(shared(s, pair.period, pair.a, pair.b), name).toBeGreaterThan(0);
        expect(never.across.has(key(pair.period, pair.a, pair.b)), name).toBe(false);
        expect(never.within.has(key(pair.period, pair.a, pair.b)), name).toBe(false);
      }
    }
    const extra = samples.filter((s) => s.match.facts.length === 120);
    console.info(
      'T848 pairs',
      JSON.stringify({
        fixtures: samples.length,
        extraTime: extra.length,
        substitutions: substituted,
        apartAcross: across,
        pairs: Object.fromEntries(counted),
        extraPairs: extra.flatMap(pairsOf).filter((p) => p.period === 'extra').length,
      }),
    );
    // Not vacuous: the sample holds extra time, substitutions and men who never met.
    expect(extra.length).toBeGreaterThanOrEqual(1);
    expect(extra.flatMap(pairsOf).some((p) => p.period === 'extra')).toBe(true);
    expect(across).toBeGreaterThanOrEqual(5);
    for (const kind of ['wins', 'recoveries', 'offside', 'foul'] as const)
      expect(counted.get(kind) ?? 0, kind).toBeGreaterThan(0);
  });

  it("pairs add up to the trace's counts", () => {
    for (const s of samples)
      for (const side of [0, 1] as const) {
        const other = side === 0 ? 1 : 0;
        const own = s.match.input.sides[side].lines.length,
          opp = s.match.input.sides[other].lines.length;
        const ledger = s.match.facts.ledger.sides[side];
        ledger.moves.forEach((move, i) => {
          const t = s.trace.moves[side][i]!;
          const name = `${s.match.input.fixture} side ${side} move ${i}`;
          const won = isPassKind(move.kind) ? move.intercepted : move.attempts - move.completed;
          expect(t.offsidePairs?.length ?? 0, name).toBe(move.offside);
          expect(t.wins?.length ?? 0, name).toBe(won);
          expect(t.recoveries?.length ?? 0, name).toBe(t.recovered.reduce((n, x) => n + x, 0));
          if (t.recoveries) expect(t.recoveries.length, name).toBe(looseBalls(move));
          expect(
            tally(
              (t.offsidePairs ?? []).map((p) => p.receiver),
              own,
            ),
            name,
          ).toEqual(padded(t.offside, own));
          expect(
            tally(
              (t.wins ?? []).map((p) => p.other),
              opp,
            ),
            name,
          ).toEqual(padded(t.won, opp));
          expect(
            tally(
              (t.recoveries ?? []).map((p) => p.other),
              opp,
            ),
            name,
          ).toEqual(padded(t.recovered, opp));
          // Offside passers, losers and loose balls' passers are distinct failed attempts.
          const actors = tally(
            [...(t.offsidePairs ?? []), ...(t.wins ?? []), ...(t.recoveries ?? [])].map(
              (p) => p.actor,
            ),
            own,
          );
          actors.forEach((n, line) =>
            expect(n, `${name} line ${line}`).toBeLessThanOrEqual(
              (t.attempts[line] ?? 0) - (t.completed[line] ?? 0),
            ),
          );
        });
        ledger.fouled.forEach((row, i) => {
          const t = s.trace.fouls[side][i]!;
          const name = `${s.match.input.fixture} side ${side} fouled ${i}`;
          const pairs = t.pairs ?? [];
          expect(t.booked.length + pairs.length, name).toBe(row.n);
          expect(
            tally(
              pairs.map((p) => p.other),
              opp,
            ),
            name,
          ).toEqual(padded(t.fouler, opp));
          expect(
            tally(
              pairs.map((p) => p.actor),
              own,
            ),
            name,
          ).toEqual(padded(t.fouled, own));
        });
      }
  });
});
