import type { Tactic } from '../../../contracts/src/types';
import { DEFAULT_SUB_POLICY, eraRules } from '../match/rules';
import { FORMATIONS } from '../player';
import { buildAggregateInput, fullParticipation } from './input';
import { deriveTeamFacts } from './ledger';
import type { AggregateLedger, AggregateMove, AggregatePlan, AggregateSide } from './types';

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
