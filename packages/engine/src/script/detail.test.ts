import { describe, expect, it } from 'vitest';
import type { Player } from '../../../contracts/src/types';
import { PD, TD } from '../../../contracts/src/detail';
import { aggregateRecord, aggregateShootout, type AggregateMatch } from '../aggregate/engine';
import { deriveTeamFacts } from '../aggregate/ledger';
import { attributePlayerFacts } from '../aggregate/players';
import { attributionFixture } from '../aggregate/players.testkit';
import { aggregateStreams } from '../aggregate/team';
import type {
  AggregateAttributionTrace,
  AggregateLedger,
  AggregateParticipation,
  AggregateStint,
} from '../aggregate/types';
import { M } from '../grid/record';
import {
  matchDetail,
  recordOf,
  detailIssues,
  EVENT_RESULTS,
  EV,
  SH,
  FO,
  INCIDENT_KINDS,
  CARD_REASONS,
} from './detail';
import { expandGroup } from './expand';

/** Synthetic small ledgers: no world creation, fixture settlement or multi-match search. */
function fixture(
  edit?: (
    ledger: AggregateLedger,
    participation: AggregateParticipation,
    base: ReturnType<typeof attributionFixture>,
  ) => void,
) {
  const base = attributionFixture();
  const ledger = base.facts.ledger;
  for (const side of [0, 1] as const) {
    const own = ledger.sides[side];
    own.moves = [{ ...own.moves[0]!, attempts: 3, completed: 2, lineBreaking: 1, intercepted: 1 }];
    own.shots = [];
    own.fouled = [];
  }
  edit?.(ledger, base.participation, base);
  return traced({ ...base, facts: deriveTeamFacts(ledger) });
}

function traced(base: ReturnType<typeof attributionFixture>) {
  const facts = base.facts;
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const players = attributePlayerFacts(
    base.input,
    base.plan,
    base.participation,
    facts,
    aggregateStreams('detail-unit', 'match'),
    trace,
  );
  const match: AggregateMatch = { ...base, facts, players, retry: 0, decisions: new Map() };
  const rosters = base.input.sides.map((s) => s.lines.map((l) => ({ id: l.id }))) as [
    Player[],
    Player[],
  ];
  const detail = matchDetail(match, rosters, trace);
  return { match, trace, detail, rosters };
}

const counted = (f: ReturnType<typeof fixture>) => {
  const record = aggregateRecord(
    { id: 'match' } as Parameters<typeof aggregateRecord>[0],
    f.rosters,
    f.match,
  );
  const keys = [
    'score',
    'metrics',
    'detail',
    'players',
    'xg',
    'incidents',
    'regulation',
    'shootout',
  ] as const;
  const rebuilt = recordOf(f.detail);
  for (const key of keys) expect(rebuilt[key], key).toEqual(record[key]);
  expect(detailIssues(f.detail)).toEqual([]);
  return rebuilt;
};

describe('own match detail', () => {
  it('a group becomes one row an attempt', () => {
    const f = fixture();
    expect(f.detail.events).toHaveLength(6);
    expect(f.detail.events.filter((e) => e[EV.result] === 0)).toHaveLength(4);
    expect(
      f.detail.events.filter((e) => e[EV.result] === EVENT_RESULTS.indexOf('intercepted')),
    ).toHaveLength(2);
    const record = counted(f);
    expect(record.metrics[0]![M.passes]).toBe(3);
    expect(record.metrics[0]![M.interceptions]).toBe(1);
    expect(record.players.reduce((n, l) => n + l.metrics[M.passes]!, 0)).toBe(6);
  });
  it('a completed pass that broke a line is flagged', () => {
    const f = fixture();
    expect(f.detail.events.filter((e) => e[EV.lineBreaking])).toHaveLength(2);
    expect(f.detail.events.filter((e) => e[EV.lineBreaking]).every((e) => e[EV.result] === 0)).toBe(
      true,
    );
    expect(counted(f).detail![0]![TD.lineBreakingPasses]).toBe(1);
  });
  it("a booked foul carries its card's minute and reason", () => {
    const f = fixture((ledger, p) => {
      p.incidents = [{ minute: 24, side: 1, kind: 'yellow', player: '1-4', reason: 'reckless' }];
      ledger.sides[1].cards.yellow = 1;
      ledger.sides[1].cardFouls = 1;
      ledger.sides[0].fouled = [{ period: 'regulation', cell: 12, n: 1, penalties: 0 }];
    });
    expect(f.detail.fouls[0]![FO.cardMinute]).toBe(24);
    expect(f.detail.fouls[0]![FO.fouler]).toBe(4);
    expect(f.detail.incidents[0]![5]).toBe(CARD_REASONS.indexOf('reckless'));
    counted(f);
    const bad = structuredClone(f.detail);
    bad.incidents = [];
    expect(detailIssues(bad)).toContain('foul 0: booked foul without card');
  });
  it("a penalty's foul row and its kick point at each other", () => {
    const f = fixture((ledger) => {
      ledger.sides[0].fouled = [{ period: 'regulation', cell: 32, n: 1, penalties: 1 }];
      ledger.sides[0].shots = [
        {
          period: 'regulation',
          minute: 30,
          cell: 32,
          source: -1,
          kind: 'penalty',
          header: false,
          xg: 76,
          outcome: 'goal',
          corner: false,
        },
      ];
    });
    expect(f.detail.penalties).toEqual([[0, 0]]);
    expect(f.detail.fouls[0]![FO.penalty]).toBe(1);
    expect(f.detail.shots[0]![SH.source]).toBe(-1);
    counted(f);
    const bad = structuredClone(f.detail);
    bad.penalties = [];
    expect(detailIssues(bad)).toContain('shot 0: missing penalty foul');
  });
  it("a substitute's rows carry his line and his stint bounds them", () => {
    const f = fixture((ledger, p, base) => {
      base.input.sides[0].lines = [...base.input.sides[0].lines, { id: '0-sub' }];
      p.stints = [
        [
          ...p.stints[0].map((s) => (s.line === 9 ? { ...s, to: 60 } : s)),
          { line: 11, slot: 9, from: 60, to: 90 },
        ],
        p.stints[1],
      ];
      p.incidents = [{ minute: 61, side: 0, kind: 'sub', player: '0-9', other: '0-sub' }];
      ledger.sides[0].shots = [
        {
          period: 'regulation',
          minute: 80,
          cell: 17,
          source: 0,
          kind: 'open',
          header: false,
          xg: 4,
          outcome: 'save',
          corner: false,
        },
      ];
    });
    counted(f);
    expect(f.detail.sides[0].lines[11]!.id).toBe('0-sub');
    expect(f.detail.stints).toContainEqual([0, 11, 9, 60, 90]);
    // Give the substitute one of his side's fixed completions, preserving team counters.
    const sub = structuredClone(f.detail);
    const unpinned = sub.events.findIndex(
      (e, i) => e[EV.side] === 0 && e[EV.result] === 0 && i !== sub.shots[0]![SH.source],
    );
    sub.events[unpinned]![EV.actor] = 11;
    expect(detailIssues(sub)).toEqual([]);
    expect(recordOf(sub).players.find((l) => l.id === '0-sub')!.metrics[M.passes]).toBeGreaterThan(
      0,
    );
    const bad = structuredClone(f.detail);
    bad.events[0]![EV.actor] = 11;
    bad.events[0]![EV.period] = 1;
    expect(detailIssues(bad)).toContain('event 0: line 0/11 outside stint');
  });
  it('a shoot-out lists its kicks in order with their takers', () => {
    const f = fixture((ledger, p) => {
      ledger.length = 120;
      ledger.periods.push('extra');
      p.length = 120;
      const extend = (side: readonly AggregateStint[]) => side.map((s) => ({ ...s, to: 120 }));
      p.stints = [extend(p.stints[0]), extend(p.stints[1])];
      ledger.sides.forEach((s) => s.held.push(0));
    });
    f.match.shootout = { home: 2, away: 1 };
    f.trace.shootout = [
      { side: 0, line: 9, scored: 1 },
      { side: 1, line: 10, scored: 0 },
      { side: 0, line: 8, scored: 1 },
      { side: 1, line: 9, scored: 1 },
    ];
    f.detail = matchDetail(f.match, f.rosters, f.trace);
    expect(f.detail.shootout).toEqual([
      [0, 9, 1],
      [1, 10, 0],
      [0, 8, 1],
      [1, 9, 1],
    ]);
    counted(f);
  });
  it('rows of extra time carry the extra period', () => {
    const f = fixture((ledger, p) => {
      ledger.length = 120;
      ledger.periods.push('extra');
      p.length = 120;
      const extend = (side: readonly AggregateStint[]) => side.map((s) => ({ ...s, to: 120 }));
      p.stints = [extend(p.stints[0]), extend(p.stints[1])];
      for (const s of ledger.sides) {
        s.held.push(0);
        s.moves[0]!.period = 'extra';
      }
    });
    expect(f.detail.events.every((e) => e[EV.period] === 1)).toBe(true);
    counted(f);
  });
  it('recounts the hand-built carry, take-on, cross, cut-back and through groups under every counter', () => {
    for (let index = 0; index < 6; index++) counted(traced(attributionFixture(index)));
  });
  it('a direct free kick needs no invented pass or key passer', () => {
    const f = fixture((ledger) => {
      ledger.sides[0].fouled = [{ period: 'regulation', cell: 27, n: 1, penalties: 0 }];
      ledger.sides[0].shots = [
        {
          period: 'regulation',
          minute: 44,
          cell: 27,
          source: -1,
          kind: 'freeKick',
          header: false,
          xg: 8,
          outcome: 'goal',
          corner: false,
        },
      ];
    });
    expect(f.detail.shots[0]![SH.passer]).toBe(-1);
    expect(f.detail.shots[0]![SH.source]).toBe(-1);
    expect(counted(f).detail![0]![TD.keyPasses]).toBe(0);
  });
  it('tracing a shoot-out records every draw without changing the settled score', () => {
    const base = attributionFixture(5);
    const streams = () => aggregateStreams('shootout-unit', 'match');
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const score = aggregateShootout(base.input, base.participation, streams(), trace);
    expect(aggregateShootout(base.input, base.participation, streams())).toEqual(score);
    expect(trace.shootout!.map((k) => k.side)).toEqual(trace.shootout!.map((_, i) => i % 2));
    expect(trace.shootout!.filter((k) => k.side === 0 && k.scored).length).toBe(score.home);
    expect(trace.shootout!.filter((k) => k.side === 1 && k.scored).length).toBe(score.away);
    expect(trace.shootout!.every((k) => k.line >= 0 && k.line < 11)).toBe(true);
  });
  it('revision 11 offside pairs keep their own failed passer even across line order', () => {
    const out = expandGroup(
      {
        kind: 'through',
        attempts: 4,
        completed: 1,
        lineBreaking: 0,
        offside: 1,
        intercepted: 1,
        outTouch: 0,
        outByline: 0,
        cornersWon: 0,
        recovered: 0,
      },
      {
        attempts: [0, 2, 2],
        completed: [0, 1],
        broke: [],
        offside: [0, 1],
        offsidePairs: [{ actor: 2, receiver: 1 }],
        won: [0, 1],
        recovered: [],
      },
    );
    expect(out.map((a) => [a.actor, EVENT_RESULTS[a.result], a.other])).toEqual([
      [1, 'complete', -1],
      [1, 'intercepted', 1],
      [2, 'offside', 1],
      [2, 'looseKept', -1],
    ]);
  });
  it('rejects unknown lines and a source credited to somebody else', () => {
    const f = fixture((ledger) => {
      ledger.sides[0].shots = [
        {
          period: 'regulation',
          minute: 40,
          cell: 17,
          source: 0,
          kind: 'open',
          header: false,
          xg: 3,
          outcome: 'miss',
          corner: false,
        },
      ];
    });
    counted(f);
    const bad = structuredClone(f.detail);
    bad.shots[0]![SH.passer] = (bad.shots[0]![SH.passer]! + 1) % 11;
    expect(detailIssues(bad)).toContain('shot 0: invalid completed source');
    bad.events[0]![EV.actor] = 99;
    expect(detailIssues(bad)).toContain('event 0: unknown line 0/99');
  });
  it('recounts the recorded keeper and rejects a keeper who does not hold the slot', () => {
    const f = fixture((ledger) => {
      ledger.sides[0].shots = [
        {
          period: 'regulation',
          minute: 40,
          cell: 17,
          source: 0,
          kind: 'open',
          header: false,
          xg: 3,
          outcome: 'save',
          corner: false,
        },
      ];
    });
    counted(f);
    const bad = structuredClone(f.detail);
    bad.shots[0]![SH.keeper] = 4;
    expect(recordOf(bad).players.find((l) => l.id === '1-4')!.metrics[M.saves]).toBe(1);
    expect(detailIssues(bad)).toContain('shot 0: keeper does not hold the slot');
  });
  it('retains second-yellow, straight-red and unreplaced-injury incidents', () => {
    const f = fixture((ledger, p) => {
      p.incidents = [
        { minute: 20, side: 0, kind: 'yellow', player: '0-4', reason: 'dissent' },
        { minute: 30, side: 0, kind: 'secondYellow', player: '0-4', reason: 'tactical' },
        { minute: 40, side: 1, kind: 'red', player: '1-5', reason: 'violent' },
        { minute: 50, side: 0, kind: 'injury', player: '0-8' },
      ];
      const departed = (side: readonly AggregateStint[], which: number) =>
        side.map((stint) =>
          which === 0 && stint.line === 4
            ? { ...stint, to: 29 }
            : which === 1 && stint.line === 5
              ? { ...stint, to: 39 }
              : which === 0 && stint.line === 8
                ? { ...stint, to: 49 }
                : stint,
        );
      p.stints = [departed(p.stints[0], 0), departed(p.stints[1], 1)];
      ledger.sides[0].cards = { yellow: 2, red: 1 };
      ledger.sides[0].cardFouls = 1;
      ledger.sides[1].cards = { yellow: 0, red: 1 };
      ledger.sides[1].cardFouls = 1;
      ledger.sides[0].fouled = [{ period: 'regulation', cell: 12, n: 1, penalties: 0 }];
      ledger.sides[1].fouled = [{ period: 'regulation', cell: 12, n: 1, penalties: 0 }];
    });
    expect(f.detail.incidents.map((x) => INCIDENT_KINDS[x[2]!])).toEqual([
      'yellow',
      'secondYellow',
      'red',
      'injury',
    ]);
    expect(counted(f).players.find((l) => l.id === '0-4')!.detail![PD.yellowCards]).toBe(2);
  });
});
