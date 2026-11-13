import type { Fixture, Tactic, World } from '../../../contracts/src/types';
import { prepareMatch } from '../match';
import { DEFAULT_SUB_POLICY, eraRules, type DecideRule } from '../match/rules';
import { FORMATIONS } from '../player';
import { matchdayRosters, playAggregate } from './engine';
import { buildAggregateInput, fullParticipation } from './input';
import { deriveTeamFacts } from './ledger';
import { attributePlayerFacts, type SideLines } from './players';
import { aggregateStreams } from './team';
import type {
  AggregateAttributionTrace,
  AggregateLedger,
  AggregateMove,
  AggregatePlan,
  AggregateSide,
} from './types';

/**
 * One world fixture played on the aggregate path with its attribution traced: the trace of the
 * settled players' facts themselves (tracing draws nothing, T833). `decide` makes it a knockout
 * tie, so a level one plays extra time.
 */
export function tracedAggregate(w: World, f: Fixture, decide?: DecideRule) {
  const prepared = prepareMatch(w, f);
  const rosters = matchdayRosters(w, f, prepared, eraRules(f.year));
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const match = playAggregate(w, f, prepared, rosters, decide, undefined, trace);
  return { match, trace };
}

/** Small synthetic attribution-only fixture: no world, team kernel or participation draw. */
export function attributionFixture(index = 0) {
  const tactics: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
  const roster = (side: number) => Array.from({ length: 11 }, (_, i) => ({ id: `${side}-${i}` }));
  const input = buildAggregateInput(
    {
      w: { seed: 'attribution-unit' },
      f: { id: `unit-${index}`, year: 1964 },
      squads: [roster(0), roster(1)],
      tactics: [tactics[index % 4]!, tactics[(index + 1) % 4]!],
      strength: [70, 70],
      profiles: Array.from({ length: 2 }, () => ({
        possession: 0,
        pass: 0,
        shot: 0,
        defense: 0,
        pressure: 0,
      })),
      possessionChance: 0.5,
    },
    {
      skill: (side, line, _, minute) => 55 + ((line * 7 + side * 3) % 30) - minute / 90,
      own: (_, line) => 40 + line * 4,
      finishing: () => 0.1,
      targetChance: () => 0.3,
    },
  );
  const side = (s: AggregateSide) => ({
    shape: {
      tactic: input.sides[s].tactic,
      roles: FORMATIONS[input.sides[s].tactic].slots.map((slot) => slot.role),
    },
    candidates: [],
    policy: { ...DEFAULT_SUB_POLICY },
    pressing: false,
    drain: 1,
    actionWeight: (line: number) => 1 + (line % 3) / 5,
  });
  const plan: AggregatePlan = {
    era: eraRules(input.year),
    placed: false,
    sides: [side(0), side(1)],
  };
  const participation = fullParticipation(input, index === 5 ? 120 : 90);
  const move = (kind: AggregateMove['kind'], from: number, to: number): AggregateMove => ({
    period: 'regulation',
    kind,
    from,
    to,
    attempts: 8,
    completed: 5,
    lineBreaking: kind === 'carry' || kind === 'takeOn' || kind === 'cutBack' ? 0 : 2,
    offside: kind === 'through' ? 2 : 0,
    intercepted: kind === 'carry' || kind === 'takeOn' || kind === 'through' ? 0 : 2,
    outTouch: 0,
    outByline: 0,
    cornersWon: 0,
    recovered: 0,
  });
  const ledgerSide = () => ({
    moves: [
      move('short', 10, 17),
      move('short', 14, 19),
      move('long', 12, 27),
      move('through', 22, 32),
      move('cross', 25, 32),
      move('cutBack', 36, 32),
      move('carry', 15, 20),
      move('takeOn', 24, 29),
    ],
    shots: [
      {
        period: 'regulation' as const,
        minute: 30,
        cell: 32,
        source: 4,
        kind: 'open' as const,
        header: true,
        xg: 20,
        outcome: 'goal' as const,
        corner: false,
      },
    ],
    fouled: [{ period: 'regulation' as const, cell: 22, n: 2, penalties: 0 }],
    held: participation.length === 120 ? [1620, 540] : [1620],
    cards: { yellow: 0, red: 0 },
    cardFouls: 0,
  });
  const ledger: AggregateLedger = {
    length: participation.length,
    periods: participation.length === 120 ? ['regulation', 'extra'] : ['regulation'],
    sides: [ledgerSide(), ledgerSide()],
  };
  return { input, plan, participation, facts: deriveTeamFacts(ledger) };
}

/** Repeated/distinct placement keys with extra time, a replacement and a dismissal. */
export function attributionCacheFixture() {
  const m = attributionFixture(5);
  m.input.sides[0].lines = [...m.input.sides[0].lines, { id: '0-bench' }];
  m.participation = {
    ...m.participation,
    stints: [
      [
        ...m.participation.stints[0].map((s) => (s.line === 6 ? { ...s, to: 50 } : s)),
        { line: 11, slot: 6, from: 50, to: 120 },
      ],
      m.participation.stints[1].map((s) => (s.line === 10 ? { ...s, to: 60 } : s)),
    ],
    incidents: [{ side: 1, minute: 60, kind: 'red', player: '1-10', reason: 'reckless' }],
  };
  for (const side of [0, 1] as const) {
    const ledger = m.facts.ledger.sides[side];
    ledger.moves.push(
      { ...ledger.moves[0]! },
      { ...ledger.moves[0]!, kind: 'long' },
      ...ledger.moves.map((move) => ({ ...move, period: 'extra' as const })),
    );
    ledger.fouled.push({ period: 'extra', cell: 22, n: 2, penalties: 0 });
    ledger.shots.push({ ...ledger.shots[0]!, period: 'extra', minute: 105, source: 14 });
  }
  m.facts.ledger.sides[1].cards.red = 1;
  m.facts.ledger.sides[1].cardFouls = 1;
  m.facts = deriveTeamFacts(m.facts.ledger);
  return m;
}

/** Full isolated output plus every named random draw, for exact pre/post comparisons. */
export function attributionObservation(index: number, placed: boolean, varied = false) {
  const m = varied ? attributionCacheFixture() : attributionFixture(index);
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const streams = aggregateStreams(m.input.seed, m.input.fixture);
  const draws: { stream: string; value: number }[] = [];
  const players = attributePlayerFacts(
    m.input,
    { ...m.plan, placed },
    m.participation,
    m.facts,
    {
      names: streams.names,
      draw: (family, period) => {
        const draw = streams.draw(family, period);
        return () => {
          const value = draw();
          draws.push({ stream: streams.names(family, period), value });
          return value;
        };
      },
    },
    trace,
  );
  return { players, trace, draws };
}

/** Distinct roles sharing an attribute still have independent line/action weights. */
export function attributionWeightRole(id: number): Parameters<SideLines['weightsAt']>[1] {
  const byLine = [0, id + 1, 8 - id, 2 + id / 2];
  return {
    id,
    table: { GK: byLine[0]!, DF: byLine[1]!, MF: byLine[2]!, FW: byLine[3]! },
    byLine,
    attribute: 'passing',
    call: undefined,
    action: id % 2 ? 'long' : undefined,
    wide: id % 2 ? 1.5 : undefined,
  };
}
