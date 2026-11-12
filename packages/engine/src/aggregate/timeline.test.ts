import { describe, expect, it } from 'vitest';
import type { Player } from '../../../contracts/src/types';
import { PD } from '../../../contracts/src/detail';
import { matchDetail, detailIssues, recordOf } from '../script/detail';
import { EV, FO, SH } from '../script/codes';
import { touchWindow, minuteIndex } from '../script/windows';
import { writeScript } from '../script/write';
import { validateScript } from '../script/validate';
import { compareRecord, countScript } from '../script/count';
import { validateFullMatchRecord } from '../match-model';
import { eraRules } from '../match/rules';
import { aggregateRecord } from './engine';
import { deriveTeamFacts } from './ledger';
import { attributePlayerFacts } from './players';
import { attributionFixture } from './players.testkit';
import { aggregateStreams } from './team';
import { commonSpan, pairParticipants, playingSpan } from './timeline';
import type { AggregateAttributionTrace, AggregateSide, AggregateStreams } from './types';

/** Hand-built actions and changing XIs only: no world, team draw or calendar progression. */
function fixture() {
  const m = attributionFixture();
  m.input.year = 2024;
  m.plan.placed = true;
  m.plan.era = eraRules(2024);
  const replace = (side: AggregateSide, line: number, at: number) => {
    const input = m.input.sides[side];
    input.lines = [...input.lines, { id: `${side}-${input.lines.length}` }];
    const stints = m.participation.stints[side];
    const incoming = input.lines.length - 1;
    const changed = [
      ...stints.map((s) => (s.line === line ? { ...s, to: at } : s)),
      { line: incoming, slot: line, from: at, to: 90 },
    ];
    m.participation.stints =
      side === 0 ? [changed, m.participation.stints[1]] : [m.participation.stints[0], changed];
    m.participation.incidents = [
      ...m.participation.incidents,
      {
        minute: at + 1,
        side,
        kind: 'sub' as const,
        player: `${side}-${line}`,
        other: `${side}-${incoming}`,
      },
    ].sort((a, b) => a.minute - b.minute);
  };
  replace(0, 10, 62);
  replace(0, 8, 75);
  replace(1, 8, 87);
  replace(1, 10, 81);
  return m;
}
function run(m: ReturnType<typeof fixture>, traced = true) {
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const base = aggregateStreams(m.input.seed, m.input.fixture);
  let draws = 0;
  const streams: AggregateStreams = {
    names: base.names,
    draw: (...args) => {
      const r = base.draw(...args);
      return () => {
        draws++;
        return r();
      };
    },
  };
  const facts = structuredClone(m.facts);
  const players = attributePlayerFacts(
    m.input,
    m.plan,
    m.participation,
    facts,
    streams,
    traced ? trace : undefined,
  );
  const match = { ...m, facts, players, retry: 0, decisions: new Map() };
  const squads = m.input.sides.map((s) => s.lines.map((p) => ({ id: p.id, name: p.id }))) as [
    Player[],
    Player[],
  ];
  return { match, squads, trace, draws };
}
function detailFor(m: ReturnType<typeof fixture>) {
  const r = run(m);
  const detail = matchDetail(r.match, r.squads, r.trace);
  const record = aggregateRecord(
    {
      id: m.input.fixture,
      year: 2024,
      round: 1,
      home: 'home',
      away: 'away',
      country: 'ENG',
      groupKey: 'ENG.0.0',
      kind: 'league',
    },
    r.squads,
    r.match,
    'scripted-aggregate-11',
  );
  expect(detailIssues(detail)).toEqual([]);
  expect(validateFullMatchRecord(record)).toEqual([]);
  const rebuilt = recordOf(detail);
  for (const key of ['metrics', 'detail', 'players', 'xg', 'incidents'] as const)
    expect(rebuilt[key], key).toEqual(record[key]);
  return { ...r, detail };
}

describe('joint participation before the record exists', () => {
  it('finds a feasible pairing of both existing marginals without drawing again', () => {
    const early = { from: 0, to: 62 },
      full = { from: 0, to: 90 };
    const pairs = pairParticipants([1, 1], [1, 1], [early, full], [full, early], [1, 1], () => {
      throw new Error('a feasible pairing must not draw');
    });
    expect(pairs).toEqual([
      { actor: 0, other: 1 },
      { actor: 1, other: 0 },
    ]);
  });
  it('conditions only an impossible marginal on common playing time', () => {
    const spans = [
      { from: 0, to: 62 },
      { from: 87, to: 90 },
    ];
    const pairs = pairParticipants([1, 0], [0, 1], spans, spans, [1, 100], (w) =>
      w.findIndex((x) => x > 0),
    );
    expect(pairs).toEqual([{ actor: 0, other: 0 }]);
    expect(commonSpan(spans[0]!, spans[1]!).to).toBeLessThan(commonSpan(spans[0]!, spans[1]!).from);
  });
  it('couples failed passes, tackled carries/take-ons, offsides and fouls across disjoint spells', () => {
    const { detail } = detailFor(fixture());
    for (let id = 0; id < detail.events.length; id++) {
      const window = touchWindow(detail, [], { event: id });
      expect(window.until, `event ${id}`).toBeGreaterThan(window.from);
    }
    for (let id = 0; id < detail.fouls.length; id++) {
      const window = touchWindow(detail, [], { foul: id });
      expect(window.until, `foul ${id}`).toBeGreaterThan(window.from);
    }
    for (const shot of detail.shots) {
      const source = shot[SH.source]!;
      const window = touchWindow(detail, [source], { shot: detail.shots.indexOf(shot) });
      expect(window.from).toBeLessThanOrEqual(minuteIndex(shot[SH.minute]!));
      expect(window.until).toBeGreaterThan(minuteIndex(shot[SH.minute]!));
    }
    expect(detail.events.some((e) => e[EV.result] === 8)).toBe(true);
    expect(detail.events.some((e) => e[EV.result] === 1)).toBe(true);
    const result = writeScript(detail, 'coupled-unit');
    if ('problems' in result) throw new Error(result.problems.join(';'));
    expect(validateScript(detail, result.script)).toEqual([]);
    expect(compareRecord(detail, countScript(result.script, detail))).toEqual([]);
  });
  it.each([undefined, 'yellow', 'red'] as const)(
    'gives a %s penalty one causal minute and present participants',
    (card) => {
      const m = fixture();
      const side = m.facts.ledger.sides[0];
      side.fouled = [{ period: 'regulation', cell: 32, n: 1, penalties: 1 }];
      side.shots = [
        {
          period: 'regulation',
          minute: 75,
          cell: 32,
          source: -1,
          kind: 'penalty',
          header: false,
          xg: 76,
          outcome: 'goal',
          corner: false,
        },
      ];
      if (card) {
        m.participation.incidents = [
          ...m.participation.incidents,
          {
            minute: 25,
            side: 1 as const,
            kind: card,
            player: '1-8',
            reason: card === 'red' ? ('dogso' as const) : ('reckless' as const),
          },
        ].sort((a, b) => a.minute - b.minute);
        side.cards = { yellow: 0, red: 0 };
        m.facts.ledger.sides[1].cards = {
          yellow: card === 'yellow' ? 1 : 0,
          red: card === 'red' ? 1 : 0,
        };
        m.facts.ledger.sides[1].cardFouls = 1;
        if (card === 'red') {
          m.participation.stints = [
            m.participation.stints[0],
            m.participation.stints[1]
              .filter((s) => s.line !== 11)
              .map((s) => (s.line === 8 ? { ...s, to: 24 } : s)),
          ];
          m.participation.incidents = m.participation.incidents.filter(
            (x) => !(x.kind === 'sub' && x.player === '1-8'),
          );
        }
      }
      m.facts = deriveTeamFacts(m.facts.ledger);
      const { detail, match, trace } = detailFor(m);
      const [foulId, shotId] = detail.penalties[0]!;
      const foul = detail.fouls[foulId!]!,
        shot = detail.shots[shotId!]!;
      expect(shot[SH.minute]).toBe(card ? 25 : 75);
      expect(foul[FO.cardMinute]).toBe(card ? 25 : -1);
      const window = touchWindow(detail, [], { foul: foulId! });
      expect(window.from).toBeLessThanOrEqual(minuteIndex(shot[SH.minute]!));
      expect(window.until).toBeGreaterThan(minuteIndex(shot[SH.minute]!));
      if (card) expect(trace.fouls[0][0]!.booked[0]!.fouler).toBe(8);
      expect(match.players.sides[1].reduce((n, p) => n + p.detail[PD.fouls]!, 0)).toBe(1);
      const result = writeScript(detail, 'penalty-unit');
      if ('problems' in result) throw new Error(result.problems.join(';'));
      expect(validateScript(detail, result.script)).toEqual([]);
      expect(compareRecord(detail, countScript(result.script, detail))).toEqual([]);
    },
  );
  it.each([false, true])(
    'optional tracing changes neither facts nor consumed RNG (penalty %s)',
    (penalty) => {
      const m = fixture();
      if (penalty) {
        m.facts.ledger.sides[0].fouled = [{ period: 'regulation', cell: 32, n: 1, penalties: 1 }];
        m.facts.ledger.sides[0].shots = [
          {
            period: 'regulation',
            minute: 75,
            cell: 32,
            source: -1,
            kind: 'penalty',
            header: false,
            xg: 76,
            outcome: 'goal',
            corner: false,
          },
        ];
        m.facts = deriveTeamFacts(m.facts.ledger);
      }
      const a = run(m),
        b = run(m, false);
      expect(a.match.players).toEqual(b.match.players);
      expect(a.match.facts).toEqual(b.match.facts);
      expect(a.draws).toBe(b.draws);
    },
  );
});

/** A deterministic `choose` that records its weights: the heaviest line, -1 when none weighs. */
function heaviest(calls: number[][]) {
  return (weights: readonly number[]) => {
    calls.push([...weights]);
    let best = -1;
    weights.forEach((w, line) => {
      if (w > 0 && (best < 0 || w > weights[best]!)) best = line;
    });
    return best;
  };
}
const refuse = () => {
  throw new Error('a matchable draw must not draw');
};

describe('common playing time at its edges (→MATCH-16, MATCH-27)', () => {
  const full = { from: 0, to: 90 };

  it('overlapping spells share their intersection; slot changes keep one spell', () => {
    expect(commonSpan({ from: 0, to: 62 }, { from: 45, to: 90 })).toEqual({ from: 45, to: 62 });
    expect(commonSpan(full, { from: 10, to: 80 }, { from: 30, to: 120 })).toEqual({
      from: 30,
      to: 80,
    });
    const moved = playingSpan([
      { from: 0, to: 40 },
      { from: 40, to: 105 },
    ]);
    expect(moved).toEqual({ from: 0, to: 105 });
    // A period's bounds clip a spell; a man who never played in it has no span there.
    expect(commonSpan({ from: 90, to: 120 }, moved)).toEqual({ from: 90, to: 105 });
    const none = commonSpan({ from: 90, to: 120 }, playingSpan([]));
    expect(none.to - none.from).toBeLessThan(0);
  });

  it('the man leaving at 79 and the man coming on at 79 share none and are never paired', () => {
    const leaving = { from: 0, to: 79 },
      coming = { from: 79, to: 90 };
    const span = commonSpan(leaving, coming);
    expect(span.to - span.from).toBe(0);
    // Both drawn on each side: the matching crosses over, never leaving with coming.
    expect(
      pairParticipants([1, 1], [1, 1], [leaving, full], [coming, full], [1, 1], refuse),
    ).toEqual([
      { actor: 0, other: 1 },
      { actor: 1, other: 0 },
    ]);
    // Only the incoming drawn: the leaving man's partner is drawn again, never the incoming.
    const calls: number[][] = [];
    expect(
      pairParticipants([1], [0, 1], [leaving], [full, coming], [1, 1], heaviest(calls)),
    ).toEqual([{ actor: 0, other: 0 }]);
    expect(calls).toEqual([[79 / 90, 0]]);
  });

  it('a matchable draw keeps every count and draws nothing, even when a match is reassigned', () => {
    // The first actor meets either winner, the second only the first: taken in order, the first
    // actor's early match would strand the second; the augmenting path moves it.
    const pairs = pairParticipants(
      [2, 1],
      [1, 2],
      [full, { from: 0, to: 40 }],
      [
        { from: 0, to: 40 },
        { from: 50, to: 90 },
      ],
      [1, 1],
      refuse,
    );
    expect(pairs).toEqual([
      { actor: 0, other: 1 },
      { actor: 0, other: 1 },
      { actor: 1, other: 0 },
    ]);
  });

  it("an unmatched second man is drawn only among men sharing the first's spell", () => {
    const actor = { from: 0, to: 62 };
    const recipients = [full, { from: 62, to: 90 }, { from: 30, to: 90 }];
    // The drawn winner came on at 62: each other man weighs his weight × the share of his own
    // spell he has in common with the actor; the man who came on weighs nothing.
    const calls: number[][] = [];
    expect(
      pairParticipants([1], [0, 1, 0], [actor], recipients, [1, 50, 3], heaviest(calls)),
    ).toEqual([{ actor: 0, other: 2 }]);
    expect(calls).toHaveLength(1);
    [62 / 90, 0, (3 * 32) / 60].forEach((w, line) => expect(calls[0]![line]).toBeCloseTo(w, 12));
    // No positive role weight among them: shared minutes alone, still only among them.
    const fallback: number[][] = [];
    expect(
      pairParticipants([1], [0, 1, 0], [actor], recipients, [0, 50, 0], heaviest(fallback)),
    ).toEqual([{ actor: 0, other: 0 }]);
    expect(fallback).toEqual([
      [0, 0, 0],
      [62, 0, 32],
    ]);
    // Nobody shares his time, or the counts differ: no pair is made.
    expect(() =>
      pairParticipants([1], [1], [{ from: 0, to: 10 }], [{ from: 20, to: 90 }], [1], heaviest([])),
    ).toThrow();
    expect(() => pairParticipants([2], [1], [full], [full], [1], heaviest([]))).toThrow();
  });
});
