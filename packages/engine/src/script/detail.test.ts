import { describe, expect, it } from 'vitest';
import type { Incident, Score } from '../../../contracts/src/types';
import { M } from '../grid/record';
import { AGGREGATE_CONFIG } from '../aggregate/config';
import type { AggregateMatch } from '../aggregate/engine';
import { sideCards } from '../aggregate/input';
import { deriveTeamFacts } from '../aggregate/ledger';
import type {
  AggregateAttributionTrace,
  AggregateFouls,
  AggregateMove,
  AggregatePeriod,
  AggregateShot,
  AggregateShotCredit,
  AggregateShootoutKick,
  AggregateStint,
  AggregateTraceFouls,
  AggregateTraceMove,
} from '../aggregate/types';
import { matchDetail, recordOf } from './build';
import {
  CARD_REASONS,
  detailIssues,
  EV,
  EVENT_RESULTS,
  expandGroup,
  FO,
  IN,
  R,
  SH,
  ST,
  swapOffsides,
  type MatchDetail,
} from './detail';

// Synthetic, explicitly marked test data: hand-built ledgers of a few groups with their splits
// (→ARCH-21). Lines are the input's (`A0`… home, `B0`… away; 11 starters in slot order, then any
// bench); a detail's lines are the record's.

const NO_COUNTS = {
  lineBreaking: 0,
  offside: 0,
  intercepted: 0,
  outTouch: 0,
  outByline: 0,
  cornersWon: 0,
  recovered: 0,
};
const move = (m: Partial<AggregateMove> & Pick<AggregateMove, 'kind' | 'from' | 'to'>) =>
  ({
    period: 'regulation',
    attempts: 0,
    completed: 0,
    ...NO_COUNTS,
    ...m,
  }) as AggregateMove;
const split = (t: Partial<AggregateTraceMove>): AggregateTraceMove => ({
  attempts: [],
  completed: [],
  broke: [],
  offside: [],
  won: [],
  recovered: [],
  ...t,
});
/** `k` at `line`, zero elsewhere. */
const at = (line: number, k = 1) =>
  Array.from({ length: line + 1 }, (_, i) => (i === line ? k : 0));

interface Side<T> {
  0: T[];
  1: T[];
}
interface Built {
  length?: 90 | 120;
  bench?: number;
  stints?: [AggregateStint[], AggregateStint[]];
  incidents?: Incident[];
  moves?: Side<[AggregateMove, AggregateTraceMove]>;
  shots?: Side<[AggregateShot, Omit<AggregateShotCredit, 'side' | 'shot'>]>;
  fouled?: Side<[AggregateFouls, AggregateTraceFouls]>;
  shootout?: { score: Score; kicks: AggregateShootoutKick[] };
}
function built(b: Built) {
  const length = b.length ?? 90;
  const periods: AggregatePeriod[] = length === 120 ? ['regulation', 'extra'] : ['regulation'];
  const lines = (side: number) =>
    Array.from({ length: 11 + (b.bench ?? 0) }, (_, i) => ({ id: `${side ? 'B' : 'A'}${i}` }));
  const starters = (): AggregateStint[] =>
    Array.from({ length: 11 }, (_, line) => ({ line, slot: line, from: 0, to: length }));
  const participation = {
    length,
    stints: b.stints ?? [starters(), starters()],
    incidents: b.incidents ?? [],
  };
  const sides = ([0, 1] as const).map((side) => {
    const cards = sideCards(participation, side, 0, length);
    return {
      moves: (b.moves?.[side] ?? []).map(([m]) => m),
      shots: (b.shots?.[side] ?? []).map(([s]) => s),
      fouled: (b.fouled?.[side] ?? []).map(([f]) => f),
      held: periods.map(() => 0),
      cards: { yellow: cards.yellow, red: cards.red },
      cardFouls: cards.fouls,
    };
  });
  const facts = deriveTeamFacts({ length, periods, sides: [sides[0]!, sides[1]!] });
  const slots = Array.from({ length: 11 }, () => ({ line: 'MF' as const, wide: false }));
  const input = {
    seed: 'detail-unit',
    fixture: 'detail-unit',
    year: 2024,
    possessionChance: 0.5,
    sides: ([0, 1] as const).map((side) => ({
      lines: lines(side),
      slots,
      tactic: 'possession' as const,
      strength: 70,
      profile: { possession: 0, pass: 0, shot: 0, defense: 0, pressure: 0 },
    })),
  } as unknown as AggregateMatch['input'];
  const credits = ([0, 1] as const).flatMap((side) =>
    (b.shots?.[side] ?? []).map(([, c], shot) => ({ side, shot, ...c })),
  );
  const match = {
    input,
    plan: {} as AggregateMatch['plan'],
    participation,
    facts,
    players: { sides: [[], []], shots: credits },
    decisions: new Map(),
    retry: 0,
    ...(b.shootout && { shootout: b.shootout.score }),
  } as AggregateMatch;
  const trace: AggregateAttributionTrace = {
    moves: [(b.moves?.[0] ?? []).map(([, t]) => t), (b.moves?.[1] ?? []).map(([, t]) => t)],
    fouls: [(b.fouled?.[0] ?? []).map(([, t]) => t), (b.fouled?.[1] ?? []).map(([, t]) => t)],
    ...(b.shootout && { shootout: b.shootout.kicks }),
  };
  const detail = matchDetail(match, [lines(0), lines(1)], trace);
  return { match, detail };
}

/** Each event row's actor, result name, line break and other line. */
const rows = (d: MatchDetail) =>
  d.events.map((e) => [
    e[EV.actor],
    Object.keys(R).find((k) => R[k as keyof typeof R] === e[EV.result]),
    e[EV.lineBreaking],
    e[EV.other],
  ]);

// The expansion rule, from scripts/export-settled.test.ts (T819), where it lived before T825.
const OUTFIELD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const name = (r: number) => EVENT_RESULTS[r];

describe('a move group’s attempts (T819 rule)', () => {
  it('every attempt of a group gets exactly one result', () => {
    const m = {
      ...NO_COUNTS,
      kind: 'short' as const,
      attempts: 12,
      completed: 5,
      lineBreaking: 2,
      offside: 1,
      intercepted: 2,
      outTouch: 1,
      outByline: 2,
      cornersWon: 1,
      recovered: 1,
    };
    const t = split({
      attempts: [0, 4, 0, 5, 3],
      completed: [0, 2, 0, 2, 1],
      broke: [0, 1, 0, 1, 0],
      offside: [0, 0, 0, 0, 1],
      won: [0, 0, 2],
      recovered: [1],
    });
    const out = expandGroup(m, t, OUTFIELD);
    expect(out.map((a) => a.actor)).toEqual([1, 1, 1, 1, 3, 3, 3, 3, 3, 4, 4, 4]);
    expect(out.map((a) => name(a.result))).toEqual([
      'complete',
      'complete',
      'offside',
      'intercepted',
      'complete',
      'complete',
      'intercepted',
      'outTouch',
      'outByline',
      'complete',
      'cornerWon',
      'looseRecovered',
    ]);
    expect(out.map((a) => a.lineBreaking)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    for (const line of [1, 3, 4])
      expect(out.filter((a) => a.actor === line && a.result === 0)).toHaveLength(
        t.completed[line]!,
      );
    expect(() => expandGroup({ ...m, recovered: 2 }, t, OUTFIELD)).toThrow();
    const kept = expandGroup({ ...m, recovered: 0 }, { ...t, recovered: [] }, OUTFIELD);
    expect(name(kept[11]!.result)).toBe('looseKept');
    expect(kept[11]!.other).toBe(-1);
  });

  it("a pass's interceptor and a carry's tackler come from the opponent's wins in line order", () => {
    const pass = expandGroup(
      { ...NO_COUNTS, kind: 'long', attempts: 5, completed: 2, intercepted: 3 },
      split({ attempts: [0, 2, 3], completed: [0, 1, 1], won: [0, 0, 1, 0, 2] }),
      OUTFIELD,
    );
    expect(pass.filter((a) => name(a.result) === 'intercepted').map((a) => a.other)).toEqual([
      2, 4, 4,
    ]);
    const carry = expandGroup(
      { ...NO_COUNTS, kind: 'takeOn', attempts: 4, completed: 1 },
      split({ attempts: [0, 0, 2, 0, 0, 0, 2], completed: [0, 0, 1], won: [0, 0, 0, 2, 0, 1] }),
      OUTFIELD,
    );
    expect(carry.map((a) => name(a.result))).toEqual(['complete', 'tackled', 'tackled', 'tackled']);
    expect(carry.filter((a) => a.result !== 0).map((a) => a.other)).toEqual([3, 3, 5]);
    expect(() =>
      expandGroup(
        { ...NO_COUNTS, kind: 'carry', attempts: 2, completed: 1 },
        split({ attempts: [0, 2], completed: [0, 1], won: [2] }),
        OUTFIELD,
      ),
    ).toThrow();
  });

  it('the man offside is never the passer', () => {
    const two = expandGroup(
      { ...NO_COUNTS, kind: 'through', attempts: 2, completed: 0, offside: 2 },
      split({ attempts: [0, 0, 0, 1, 0, 0, 0, 1], offside: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1] }),
      OUTFIELD,
    );
    expect(two.map((a) => [a.actor, a.other])).toEqual([
      [3, 9],
      [7, 3],
    ]);
    const earlier = expandGroup(
      { ...NO_COUNTS, kind: 'short', attempts: 2, completed: 0, offside: 2 },
      split({ attempts: [0, 0, 1, 0, 0, 1], offside: [0, 0, 0, 0, 1, 1] }),
      OUTFIELD,
    );
    expect(earlier.map((a) => [a.actor, a.other])).toEqual([
      [2, 5],
      [5, 4],
    ]);
    const traded = expandGroup(
      { ...NO_COUNTS, kind: 'short', attempts: 2, completed: 0, offside: 1, intercepted: 1 },
      split({ attempts: [0, 0, 0, 1, 0, 1], offside: [0, 0, 0, 1], won: [0, 1] }),
      OUTFIELD,
    );
    expect(traded.map((a) => [a.actor, name(a.result), a.other])).toEqual([
      [3, 'intercepted', 1],
      [5, 'offside', 3],
    ]);
    const alone = expandGroup(
      { ...NO_COUNTS, kind: 'short', attempts: 1, completed: 0, offside: 1 },
      split({ attempts: [0, 1], offside: [0, 1] }),
      OUTFIELD,
    );
    expect(alone[0]!.other).toBe(2);
    for (const a of [...two, ...earlier, ...alone]) expect(a.other).not.toBe(a.actor);
    // Without outfield lines the rows swap across groups of the same side, keeping each player's
    // count; a side with no valid partner falls back to its line 1 (2 when the passer is 1).
    const kept = expandGroup(
      { ...NO_COUNTS, kind: 'short', attempts: 1, completed: 0, offside: 1 },
      split({ attempts: [0, 1], offside: [0, 1] }),
    );
    expect(kept[0]!.other).toBe(1);
    const row = (side: number, group: number, actor: number, other: number) => [
      side,
      group,
      0,
      0,
      20,
      30,
      actor,
      R.offside,
      0,
      other,
      0,
    ];
    const events = [row(1, 0, 4, 9), row(0, 3, 4, 4), row(1, 7, 9, 9), row(0, 5, 9, 2)];
    expect(swapOffsides(events)).toBe(1);
    expect(events.map((e) => [e[EV.actor], e[EV.other]])).toEqual([
      [4, 9],
      [4, 2],
      [9, 1],
      [9, 4],
    ]);
    for (const e of events) expect(e[EV.other]).not.toBe(e[EV.actor]);
  });

  it('a revision-11 group takes its offsides from the passer and receiver pairs', () => {
    const out = expandGroup(
      { ...NO_COUNTS, kind: 'short', attempts: 4, completed: 1, offside: 2, intercepted: 1 },
      split({
        attempts: [0, 2, 0, 2],
        completed: [0, 1],
        offside: [0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
        offsidePairs: [
          [3, 9],
          [3, 6],
        ],
        won: at(5),
      }),
    );
    expect(out.map((a) => [a.actor, name(a.result), a.other])).toEqual([
      [1, 'complete', -1],
      [1, 'intercepted', 5],
      [3, 'offside', 9],
      [3, 'offside', 6],
    ]);
  });
});

describe('an own match’s detail rows (T825)', () => {
  it('a group becomes one row an attempt', () => {
    const { match, detail } = built({
      moves: {
        0: [
          [
            move({
              kind: 'short',
              from: 12,
              to: 17,
              attempts: 6,
              completed: 2,
              intercepted: 1,
              outTouch: 1,
              outByline: 1,
              recovered: 1,
            }),
            split({
              attempts: [0, 3, 0, 0, 0, 3],
              completed: [0, 1, 0, 0, 0, 1],
              won: at(3),
            }),
          ],
        ],
        1: [
          [
            move({ kind: 'takeOn', from: 22, to: 27, attempts: 2, completed: 1 }),
            split({ attempts: at(9, 2), completed: at(9), won: at(4) }),
          ],
        ],
      },
    });
    // Line by line, completed first; the failed ones take their results in the listed order.
    expect(rows(detail)).toEqual([
      [1, 'complete', 0, -1],
      [1, 'intercepted', 0, 3],
      [1, 'outTouch', 0, -1],
      [5, 'complete', 0, -1],
      [5, 'outByline', 0, -1],
      // Recovered outside its winner's high-turnover zone: nobody named.
      [5, 'looseRecovered', 0, -1],
      [9, 'complete', 0, -1],
      [9, 'tackled', 0, 4],
    ]);
    expect(detail.events.map((e) => [e[EV.side], e[EV.group], e[EV.from], e[EV.to]])).toEqual([
      ...Array.from({ length: 6 }, () => [0, 0, 12, 17]),
      [1, 0, 22, 27],
      [1, 0, 22, 27],
    ]);
    expect(detailIssues(detail)).toEqual([]);
    const back = recordOf(detail);
    expect(back.metrics).toEqual([match.facts.sides[0].metrics, match.facts.sides[1].metrics]);
    expect(back.detail).toEqual([match.facts.sides[0].detail, match.facts.sides[1].detail]);
    expect(back.players[1]!.metrics[M.passes]).toBe(3);
    expect(back.players[11 + 3]!.metrics[M.interceptions]).toBe(1);
    expect(back.players[4]!.metrics[M.tackles]).toBe(1);
  });

  it('a completed pass that broke a line is flagged', () => {
    const { detail, match } = built({
      moves: {
        0: [
          [
            move({ kind: 'long', from: 7, to: 22, attempts: 3, completed: 3, lineBreaking: 2 }),
            split({ attempts: [0, 0, 2, 1], completed: [0, 0, 2, 1], broke: [0, 0, 1, 1] }),
          ],
        ],
        1: [],
      },
    });
    expect(rows(detail)).toEqual([
      [2, 'complete', 1, -1],
      [2, 'complete', 0, -1],
      [3, 'complete', 1, -1],
    ]);
    expect(recordOf(detail).detail).toEqual([
      match.facts.sides[0].detail,
      match.facts.sides[1].detail,
    ]);
  });

  it("a booked foul carries its card's minute and reason", () => {
    const incidents: Incident[] = [
      { minute: 30, side: 1, kind: 'yellow', player: 'B4', reason: 'reckless' },
    ];
    const { detail } = built({
      incidents,
      fouled: {
        0: [
          [
            { period: 'regulation', cell: 22, n: 2, penalties: 0 },
            { booked: [{ fouler: 4, fouled: 7, incident: 0 }], fouled: at(8), fouler: at(9) },
          ],
        ],
        1: [],
      },
    });
    expect(detail.fouls).toEqual([
      [0, 22, 4, 7, 30, 0, 0, -1, 0],
      [0, 22, 9, 8, -1, 0, 0, -1, -1],
    ]);
    const card = detail.incidents[detail.fouls[0]![FO.card]!]!;
    expect(card[IN.minute]).toBe(detail.fouls[0]![FO.cardMinute]);
    expect(CARD_REASONS[card[IN.reason]!]).toBe('reckless');
    expect(detailIssues(detail)).toEqual([]);
    expect(recordOf(detail).incidents).toEqual(incidents);
    // A booked foul whose card names another man is refused.
    detail.fouls[0]![FO.fouler] = 5;
    expect(detailIssues(detail).join()).toContain('without its card');
  });

  it("a penalty's foul row and its kick point at each other", () => {
    const penalty: AggregateShot = {
      period: 'regulation',
      minute: 50,
      cell: 37,
      source: -1,
      kind: 'penalty',
      header: false,
      xg: AGGREGATE_CONFIG.penalty.xg,
      outcome: 'goal',
      corner: false,
    };
    const { detail } = built({
      shots: { 0: [[penalty, { minute: 50, shooter: 9 }]], 1: [] },
      fouled: {
        0: [
          [
            { period: 'regulation', cell: 32, n: 1, penalties: 1 },
            { booked: [], fouled: at(10), fouler: at(5), penalties: [0] },
          ],
        ],
        1: [],
      },
    });
    expect(detail.fouls[0]![FO.penalty]).toBe(1);
    expect(detail.fouls[0]![FO.shot]).toBe(0);
    expect(detail.shots[0]![SH.foul]).toBe(0);
    expect(detailIssues(detail)).toEqual([]);
    expect(recordOf(detail).score).toEqual({ home: 1, away: 0 });
    detail.shots[0]![SH.foul] = -1;
    expect(detailIssues(detail).join()).toContain('penalty without its foul');
  });

  it("a substitute's rows carry his line and his stint bounds them", () => {
    const starters = (): AggregateStint[] =>
      Array.from({ length: 11 }, (_, line) => ({ line, slot: line, from: 0, to: 90 }));
    const home = starters();
    home[9] = { line: 9, slot: 9, from: 0, to: 60 };
    // The second of two named substitutes (input line 12) comes on for line 9.
    home.push({ line: 12, slot: 9, from: 60, to: 90 });
    const each = at(12).map((k, i) => (i === 9 ? 1 : k));
    const { detail } = built({
      bench: 2,
      stints: [home, starters()],
      incidents: [{ minute: 60, side: 0, kind: 'sub', player: 'A9', other: 'A12' }],
      moves: {
        0: [
          [
            move({ kind: 'carry', from: 17, to: 22, attempts: 2, completed: 2 }),
            split({ attempts: each, completed: each }),
          ],
        ],
        1: [],
      },
    });
    expect(detail.sides[0].lines).toHaveLength(12);
    expect(detail.sides[0].lines[11]).toMatchObject({ id: 'A12', slot: 9 });
    expect(detail.events.map((e) => e[EV.actor])).toEqual([9, 11]);
    expect(detail.incidents[0]!.slice(0, 5)).toEqual([60, 0, 3, 9, 11]);
    expect(detailIssues(detail)).toEqual([]);
    const back = recordOf(detail);
    expect(back.players.map((p) => p.id).slice(0, 12)).toContain('A12');
    expect(back.players[11]!.metrics[M.minutes]).toBe(30);
    // His stint moved past the period his rows are in is refused.
    const stint = detail.stints.find((s) => s[ST.side] === 0 && s[ST.line] === 11)!;
    stint[ST.from] = 90;
    expect(detailIssues(detail).join()).toContain('not on the pitch in period 0');
  });

  it('a shoot-out lists its kicks in order with their takers', () => {
    const kicks: AggregateShootoutKick[] = [
      { side: 0, line: 9, scored: true },
      { side: 1, line: 10, scored: false },
      { side: 0, line: 7, scored: true },
      { side: 1, line: 8, scored: true },
      { side: 0, line: 0, scored: false },
    ];
    const { detail } = built({
      length: 120,
      shootout: { score: { home: 2, away: 1 }, kicks },
    });
    expect(detail.shootout).toEqual([
      [0, 9, 1],
      [1, 10, 0],
      [0, 7, 1],
      [1, 8, 1],
      [0, 0, 0],
    ]);
    expect(detailIssues(detail)).toEqual([]);
    expect(recordOf(detail).shootout).toEqual({ home: 2, away: 1 });
    expect(recordOf(detail).regulation).toEqual({ home: 0, away: 0 });
  });

  it('rows of extra time carry the extra period', () => {
    const shot: AggregateShot = {
      period: 'extra',
      minute: 104,
      cell: 32,
      source: 1,
      kind: 'open',
      header: false,
      xg: 20,
      outcome: 'save',
      corner: false,
    };
    const { detail, match } = built({
      length: 120,
      moves: {
        0: [
          [
            move({ kind: 'short', from: 22, to: 27, attempts: 1, completed: 1 }),
            split({ attempts: at(6), completed: at(6) }),
          ],
          [
            move({ period: 'extra', kind: 'short', from: 27, to: 32, attempts: 1, completed: 1 }),
            split({ attempts: at(8), completed: at(8) }),
          ],
        ],
        1: [],
      },
      shots: { 0: [[shot, { minute: 104, shooter: 9, passer: 8 }]], 1: [] },
    });
    expect(detail.events.map((e) => e[EV.period])).toEqual([0, 1]);
    expect(detail.shots[0]![SH.source]).toBe(1);
    expect(detail.shots[0]![SH.keeper]).toBe(0);
    expect(detailIssues(detail)).toEqual([]);
    const back = recordOf(detail);
    expect(back.metrics).toEqual([match.facts.sides[0].metrics, match.facts.sides[1].metrics]);
    expect(back.players[11]!.metrics[M.saves]).toBe(1);
    // A row moved into a period the match did not play is refused.
    detail.events[1]![EV.period] = 2;
    expect(detailIssues(detail).join()).toContain('period 2');
  });
});
