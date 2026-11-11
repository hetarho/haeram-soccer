import { describe, expect, it } from 'vitest';
import type { AggregateTraceMove } from '../packages/engine/src/aggregate/types';
import {
  EVENT_RESULTS,
  expandGroup,
  noSubstituteYear,
  protoCell,
  swapOffsides,
} from './export-settled';

// Synthetic, explicitly marked test data: hand-made move groups and traces (→ARCH-21).
const counts = {
  lineBreaking: 0,
  offside: 0,
  intercepted: 0,
  outTouch: 0,
  outByline: 0,
  cornersWon: 0,
  recovered: 0,
};
const trace = (t: Partial<AggregateTraceMove>): AggregateTraceMove => ({
  attempts: [],
  completed: [],
  broke: [],
  offside: [],
  won: [],
  recovered: [],
  ...t,
});
const OUTFIELD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const name = (r: number) => EVENT_RESULTS[r];

describe('settled-match export (T819)', () => {
  it('every attempt of a group gets exactly one result', () => {
    const move = {
      ...counts,
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
    const t = trace({
      attempts: [0, 4, 0, 5, 3],
      completed: [0, 2, 0, 2, 1],
      broke: [0, 1, 0, 1, 0],
      offside: [0, 0, 0, 0, 1],
      won: [0, 0, 2],
      recovered: [1],
    });
    const out = expandGroup(move, t, OUTFIELD);
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
    // Per line the trace's completions are kept.
    for (const line of [1, 3, 4])
      expect(out.filter((a) => a.actor === line && a.result === 0)).toHaveLength(
        t.completed[line]!,
      );
    // Fates beyond the failed attempts are refused, and the rest of a group is kept loose.
    expect(() => expandGroup({ ...move, recovered: 2 }, t, OUTFIELD)).toThrow();
    const kept = expandGroup({ ...move, recovered: 0 }, { ...t, recovered: [] }, OUTFIELD);
    expect(name(kept[11]!.result)).toBe('looseKept');
    expect(kept[11]!.other).toBe(-1);
  });

  it("a pass's interceptor and a carry's tackler come from the opponent's wins in line order", () => {
    const pass = expandGroup(
      { ...counts, kind: 'long', attempts: 5, completed: 2, intercepted: 3 },
      trace({ attempts: [0, 2, 3], completed: [0, 1, 1], won: [0, 0, 1, 0, 2] }),
      OUTFIELD,
    );
    expect(pass.filter((a) => name(a.result) === 'intercepted').map((a) => a.other)).toEqual([
      2, 4, 4,
    ]);
    const carry = expandGroup(
      { ...counts, kind: 'takeOn', attempts: 4, completed: 1 },
      trace({ attempts: [0, 0, 2, 0, 0, 0, 2], completed: [0, 0, 1], won: [0, 0, 0, 2, 0, 1] }),
      OUTFIELD,
    );
    expect(carry.map((a) => name(a.result))).toEqual(['complete', 'tackled', 'tackled', 'tackled']);
    expect(carry.filter((a) => a.result !== 0).map((a) => a.other)).toEqual([3, 3, 5]);
    // A trace whose wins disagree with the group's losses is refused.
    expect(() =>
      expandGroup(
        { ...counts, kind: 'carry', attempts: 2, completed: 1 },
        trace({ attempts: [0, 2], completed: [0, 1], won: [2] }),
        OUTFIELD,
      ),
    ).toThrow();
  });

  it('the man offside is never the passer', () => {
    // Two offside passes: the first by line 3, caught line 3; the swap gives him the other's line.
    const two = expandGroup(
      { ...counts, kind: 'through', attempts: 2, completed: 0, offside: 2 },
      trace({
        attempts: [0, 0, 0, 1, 0, 0, 0, 1],
        completed: [],
        offside: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
      }),
      OUTFIELD,
    );
    expect(two.map((a) => [a.actor, a.other])).toEqual([
      [3, 9],
      [7, 3],
    ]);
    // The last offside pass caught on its own passer swaps with an earlier one that stays valid.
    const earlier = expandGroup(
      { ...counts, kind: 'short', attempts: 2, completed: 0, offside: 2 },
      trace({ attempts: [0, 0, 1, 0, 0, 1], offside: [0, 0, 0, 0, 1, 1] }),
      OUTFIELD,
    );
    expect(earlier.map((a) => [a.actor, a.other])).toEqual([
      [2, 5],
      [5, 4],
    ]);
    // The only offside caught on its passer passes to another man's failed attempt in the group,
    // which gives it its own fate (here an interception and its interceptor).
    const traded = expandGroup(
      { ...counts, kind: 'short', attempts: 2, completed: 0, offside: 1, intercepted: 1 },
      trace({ attempts: [0, 0, 0, 1, 0, 1], offside: [0, 0, 0, 1], won: [0, 1] }),
      OUTFIELD,
    );
    expect(traded.map((a) => [a.actor, name(a.result), a.other])).toEqual([
      [3, 'intercepted', 1],
      [5, 'offside', 3],
    ]);
    // Alone in its group, it takes the lowest other outfield line.
    const alone = expandGroup(
      { ...counts, kind: 'short', attempts: 1, completed: 0, offside: 1 },
      trace({ attempts: [0, 1], offside: [0, 1] }),
      OUTFIELD,
    );
    expect(alone[0]!.other).toBe(2);
    for (const a of [...two, ...earlier, ...alone]) expect(a.other).not.toBe(a.actor);
    // Without outfield lines the exporter swaps across groups of the same side, keeping each
    // player's count; a side with no valid partner falls back to its lowest other outfield player.
    const kept = expandGroup(
      { ...counts, kind: 'short', attempts: 1, completed: 0, offside: 1 },
      trace({ attempts: [0, 1], offside: [0, 1] }),
    );
    expect(kept[0]!.other).toBe(1);
    const OFF = EVENT_RESULTS.indexOf('offside');
    const row = (side: number, group: number, actor: number, other: number) => [
      side,
      group,
      0,
      0,
      20,
      30,
      actor,
      OFF,
      0,
      other,
    ];
    const events = [row(1, 0, 15, 20), row(0, 3, 4, 4), row(1, 7, 20, 20), row(0, 5, 9, 2)];
    swapOffsides(events, OFF);
    expect(events.map((e) => [e[6], e[9]])).toEqual([
      [15, 20],
      [4, 2],
      [20, 12],
      [9, 4],
    ]);
    for (const e of events) expect(e[9]).not.toBe(e[6]);
  });

  it("cells are converted to the prototype's numbering", () => {
    // The acting side's own goal area: band 0, central lane.
    expect(protoCell(2)).toBe(2);
    // The opponent's goal area: band 7, central lane.
    expect(protoCell(37)).toBe(37);
    // The wide cell on the acting side's own left in the band before the opponent's box: band 5.
    expect(protoCell(25)).toBe(25);
    expect(() => protoCell(40)).toThrow();
  });

  it('plays in the latest year without substitutes', () => {
    expect(noSubstituteYear()).toBe(1964);
  });
});
