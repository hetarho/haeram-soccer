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
import { eraRules } from '../grid/setup';
import { aggregateRecord } from './engine';
import { deriveTeamFacts } from './ledger';
import { attributePlayerFacts } from './players';
import { attributionFixture } from './players.testkit';
import { aggregateStreams } from './team';
import { commonSpan, pairParticipants } from './timeline';
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
