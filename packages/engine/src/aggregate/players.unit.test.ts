import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PD } from '../../../contracts/src/detail';
import { M } from '../grid/record';
import { deriveTeamFacts } from './ledger';
import { attributePlayerFacts } from './players';
import { attributionFixture } from './players.testkit';
import { aggregateStreams } from './team';
import type { AggregateAttributionTrace } from './types';

function attributed(index: number, placed: boolean) {
  const m = attributionFixture(index);
  const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
  const players = attributePlayerFacts(
    m.input,
    { ...m.plan, placed },
    m.participation,
    m.facts,
    aggregateStreams(m.input.seed, m.input.fixture),
    trace,
  );
  return { ...m, players, trace };
}

describe('small, isolated player attribution', () => {
  it('keeps the pre-place attribution and trace byte for byte on six small ledgers', () => {
    // Digests captured from the pre-T824 implementation on these hand-built ledgers.
    const expected = [
      '9d389e8119dc4406f8f0e93881b830da4f9ca1a086e53c3694f3273de8c6c958',
      'ce28e4df5f4ae3b3de8e0ed46b61a11a3f207417db905e24f12d8b40e4e2fbfb',
      'a055fbe4c0c8a191e37293df5215f5b6c6183f1f18d95f414f80c6d87c36b619',
      '32e98dd3e8177db60e9049946fb679c5dc9afd5ebd5a3bb6489f7ad4dbccf5d5',
      'b7ca63a29888872e633e15726d8fec693ab89c74b419cf27ff7e842524e0ceb1',
      '32332a692362c910fdcad749e7bd7617e69c1587f6735dd5d54899ec0c7adfd9',
    ];
    const actual = Array.from({ length: 6 }, (_, index) => {
      const { players, trace } = attributed(index, false);
      return createHash('sha256').update(JSON.stringify({ players, trace })).digest('hex');
    });
    expect(actual).toEqual(expected);
  });

  it('keeps every shot, key passer and team counter when place is enabled', () => {
    const old = attributed(0, false),
      placed = attributed(0, true);
    expect(placed.players.shots).toEqual(old.players.shots);
    for (const side of [0, 1] as const) {
      for (const key of [
        M.goals,
        M.assists,
        M.shots,
        M.onTarget,
        M.passes,
        M.completed,
        M.tackles,
        M.interceptions,
        M.dribbles,
        M.saves,
      ]) {
        const total = (m: typeof old) =>
          m.players.sides[side].reduce((n, p) => n + p.metrics[key]!, 0);
        expect(total(placed)).toBe(total(old));
      }
      const receiverCounts = Array(11).fill(0) as number[];
      placed.trace.moves[side].forEach((t, i) => {
        const pairs = t.offsidePairs ?? [];
        expect(pairs.length).toBe(placed.facts.ledger.sides[side].moves[i]!.offside);
        const used = Array(11).fill(0) as number[];
        for (const { actor, receiver } of pairs) {
          expect(actor).not.toBe(receiver);
          used[actor]!++;
          receiverCounts[receiver]!++;
        }
        used.forEach((count, line) =>
          expect(count).toBeLessThanOrEqual(t.attempts[line]! - t.completed[line]!),
        );
      });
      placed.players.sides[side].forEach((line) =>
        expect(line.detail[PD.offsides]).toBe(receiverCounts[line.line]),
      );
    }
    const noTrace = attributePlayerFacts(
      placed.input,
      { ...placed.plan, placed: true },
      placed.participation,
      placed.facts,
      aggregateStreams(placed.input.seed, placed.input.fixture),
    );
    expect(noTrace).toEqual(placed.players);
  });

  it('keeps a set-piece taker and the booked fouler while placing the other fouls', () => {
    const m = attributionFixture(6);
    const ledger = m.facts.ledger;
    const delivery = ledger.sides[0].moves[4]!;
    Object.assign(delivery, {
      setPiece: 'freeKick',
      attempts: 1,
      completed: 1,
      lineBreaking: 1,
      intercepted: 0,
    });
    ledger.sides[0].shots[0]!.kind = 'freeKick';
    ledger.sides[1].cards.yellow = 1;
    ledger.sides[1].cardFouls = 1;
    const participation = {
      ...m.participation,
      incidents: [
        {
          minute: 20,
          side: 1 as const,
          kind: 'yellow' as const,
          reason: 'reckless' as const,
          player: '1-6',
        },
      ],
    };
    const facts = deriveTeamFacts(ledger);
    const run = (placed: boolean) => {
      const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
      const players = attributePlayerFacts(
        m.input,
        { ...m.plan, placed },
        participation,
        facts,
        aggregateStreams(m.input.seed, m.input.fixture),
        trace,
      );
      return { players, trace };
    };
    const old = run(false),
      placed = run(true);
    expect(placed.players.shots).toEqual(old.players.shots);
    expect(placed.trace.moves[0][4]!.attempts).toEqual(old.trace.moves[0][4]!.attempts);
    expect(placed.trace.fouls[0][0]!.booked).toHaveLength(1);
    expect(placed.trace.fouls[0][0]!.booked[0]!.fouler).toBe(6);
    expect(placed.players.sides[1].find((p) => p.line === 6)!.detail[PD.yellowCards]).toBe(1);
    for (const side of [0, 1] as const) {
      expect(placed.players.sides[side].reduce((n, p) => n + p.detail[PD.fouls]!, 0)).toBe(2);
      expect(placed.players.sides[side].reduce((n, p) => n + p.detail[PD.foulsWon]!, 0)).toBe(2);
    }
  });
});
