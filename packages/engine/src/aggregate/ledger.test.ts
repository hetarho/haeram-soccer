import { describe, expect, it } from 'vitest';
import { TD } from '../../../contracts/src/detail';
import { M } from '../grid/record';
import { buildAggregateInput, fullParticipation } from './input';
import { deriveTeamFacts, inBoxCell, isPassKind, ledgerIssues, teamFactsIssues } from './ledger';
import { aggregateStreams, generateTeamFacts } from './team';
import { AGGREGATE_MOVE_KINDS, AGGREGATE_PASS_KINDS } from './types';
import type {
  AggregateLedger,
  AggregateMoveKind,
  AggregateParticipation,
  AggregateTeamFacts,
} from './types';

// Synthetic, explicitly marked test data: two flat XIs and simple finishing curves (→ARCH-21).
const xi = (side: number) =>
  Array.from({ length: 11 }, (_, i) => ({ id: `synthetic-${side}-${i}` }));
const neutral = { possession: 0, pass: 0, shot: 0, defense: 0, pressure: 0 };
const input = buildAggregateInput(
  {
    w: { seed: 'synthetic' },
    f: { id: 'synthetic-fixture', year: 2024 },
    squads: [xi(0), xi(1)],
    tactics: ['balanced', 'balanced'],
    strength: [70, 70],
    profiles: [neutral, neutral],
    possessionChance: 0.5,
  },
  {
    skill: () => 70,
    finishing: () => 1,
    targetChance: (goal) => Math.min(0.95, goal + 0.35),
  },
);
const booked: AggregateParticipation = {
  ...fullParticipation(input),
  incidents: [
    { minute: 30, side: 0, kind: 'yellow', player: 'synthetic-0-3', reason: 'reckless' },
    { minute: 70, side: 1, kind: 'yellow', player: 'synthetic-1-5', reason: 'dissent' },
  ],
};
/** The first generated match whose ledger has what a case tampers with. */
function matchWith(has: (f: AggregateTeamFacts) => boolean): AggregateTeamFacts {
  for (let i = 0; i < 400; i++) {
    const f = generateTeamFacts(input, aggregateStreams('synthetic', `fx-${i}`), booked);
    if (has(f)) return f;
  }
  throw new Error('no synthetic match has it');
}
const copy = (ledger: AggregateLedger): AggregateLedger => structuredClone(ledger);
/** Each tampered ledger is refused: listed by `ledgerIssues`, never derived into counters. */
function refused(ledger: AggregateLedger, issue: RegExp) {
  expect(ledgerIssues(ledger).join('\n')).toMatch(issue);
  expect(() => deriveTeamFacts(ledger)).toThrow(/집계 원장 불일치/);
}

describe('aggregate ledger', () => {
  it('tells pass kinds exactly as the pass-kind list does (T612)', () => {
    for (const kind of [...AGGREGATE_MOVE_KINDS, 'header', ''] as AggregateMoveKind[])
      expect(isPassKind(kind), kind).toBe(
        (AGGREGATE_PASS_KINDS as readonly string[]).includes(kind),
      );
  });

  it('derives the facts it checks', () => {
    const f = matchWith(() => true);
    expect(ledgerIssues(f.ledger)).toEqual([]);
    expect(teamFactsIssues(f)).toEqual([]);
    expect(deriveTeamFacts(f.ledger)).toEqual(f);
  });

  it('rejects completions above attempts and outcomes beyond the failures', () => {
    const f = matchWith(() => true);
    const over = copy(f.ledger);
    over.sides[0].moves[0]!.completed = over.sides[0].moves[0]!.attempts + 1;
    refused(over, /completed of/);
    const fates = copy(f.ledger);
    const pass = fates.sides[1].moves.find((m) => m.kind === 'short')!;
    pass.intercepted = pass.attempts - pass.completed + 1;
    refused(fates, /failed outcomes/);
    const corners = copy(f.ledger);
    const out = corners.sides[0].moves.find((m) => m.kind === 'short')!;
    out.cornersWon = out.outByline + 1;
    refused(corners, /corners of/);
  });

  it('rejects shots its moves did not set up', () => {
    const f = matchWith((x) => x.ledger.sides[0].shots.some((s) => s.source >= 0));
    const index = f.ledger.sides[0].shots.findIndex((s) => s.source >= 0);
    const moved = copy(f.ledger);
    moved.sides[0].shots[index]!.cell = (moved.sides[0].shots[index]!.cell + 1) % 40;
    refused(moved, /its move ended in/);
    const unset = copy(f.ledger);
    const source = unset.sides[0].moves[unset.sides[0].shots[index]!.source]!;
    source.completed = 0;
    refused(unset, /shots from 0 arrivals/);
    const orphan = copy(f.ledger);
    orphan.sides[0].shots[index]!.source = -1;
    refused(orphan, /without the move it follows/);
  });

  it('rejects quality the record units cannot hold', () => {
    const f = matchWith((x) => x.ledger.sides[0].shots.some((s) => !inBoxCell(s.cell)));
    const outside = copy(f.ledger);
    outside.sides[0].shots.find((s) => !inBoxCell(s.cell))!.xg = 35;
    refused(outside, /big chance outside the box/);
    const huge = copy(f.ledger);
    huge.sides[0].shots[0]!.xg = 95;
    refused(huge, /xG 95/);
    const late = copy(f.ledger);
    late.sides[0].shots[0]!.minute = 105;
    refused(late, /outside regulation/);
  });

  it('rejects set pieces that did not happen', () => {
    const f = matchWith((x) => x.sides[0].detail[TD.corners]! > 0);
    const undelivered = copy(f.ledger);
    undelivered.sides[0].moves = undelivered.sides[0].moves.filter((m) => m.setPiece !== 'corner');
    refused(undelivered, /delivered 0 of/);
    const goalCorner = copy(f.ledger);
    const goal = goalCorner.sides[0].shots.find(
      (s) => s.outcome !== 'block' && s.outcome !== 'save',
    );
    if (goal) {
      goal.corner = true;
      refused(goalCorner, /wins a corner from a/);
    }
    const penalty = copy(f.ledger);
    penalty.sides[0].shots.push({
      period: 'regulation',
      minute: 50,
      cell: 32,
      source: -1,
      kind: 'penalty',
      header: false,
      xg: 76,
      outcome: 'goal',
      corner: false,
    });
    refused(penalty, /took \d+ of \d+ penalties/);
  });

  it('rejects fewer fouls than the cards shown for one', () => {
    const f = matchWith(() => true);
    expect(f.ledger.sides[0].cardFouls).toBe(1);
    // The dissent caution is no foul.
    expect(f.ledger.sides[1].cardFouls).toBe(0);
    expect(f.sides[1].detail[TD.yellowCards]).toBe(1);
    const unfouled = copy(f.ledger);
    unfouled.sides[1].fouled = [];
    refused(unfouled, /side 0 fouls 0 < cards for fouls 1/);
  });

  it('rejects team counters that differ from their ledger', () => {
    const f = matchWith((x) => x.sides[0].detail[TD.boxEntries]! > 0);
    const zeroed: AggregateTeamFacts = structuredClone(f);
    zeroed.sides[0].detail[TD.boxEntries] = 0;
    expect(teamFactsIssues(zeroed).join('\n')).toMatch(/detail 11: 0 ≠ ledger/);
    const raised: AggregateTeamFacts = structuredClone(f);
    raised.sides[1].metrics[M.goals]!++;
    raised.score[1]++;
    expect(teamFactsIssues(raised).join('\n')).toMatch(/metric 0/);
    expect(teamFactsIssues(raised).join('\n')).toMatch(/score/);
    const xg: AggregateTeamFacts = structuredClone(f);
    xg.sides[0].xg += 1;
    expect(teamFactsIssues(xg).join('\n')).toMatch(/xG/);
  });
});
