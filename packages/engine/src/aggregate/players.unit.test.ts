import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PD } from '../../../contracts/src/detail';
import { M } from '../match/record';
import { deriveTeamFacts } from './ledger';
import { attributePlayerFacts, SideLines } from './players';
import {
  attributionFixture,
  attributionCacheFixture,
  attributionObservation,
  attributionWeightRole,
} from './players.testkit';
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

describe('attribution-scoped placed weights', () => {
  it('preserves complete pre-cache outputs and every named random draw', () => {
    // Captured before T900 memoization; six original ledgers plus regulation/extra substitutions.
    const expected = [
      '7c5af25698cd582c5fe1dc21dd91b91f471a1de77325ae3b3e9216ec55e5ee74',
      '60d740cda968cf3917d3d81770d6b3526e760abe66e2f45bc03bf0aaf92969a4',
      '73484d86ed92b121c5f8eeecda175d07bfcefd514d70447581afedb97ade09fb',
      '32f60b8d97c17e66610011df407839b034ba85eb85cb9b3e09a67225a360b7ed',
      '04762fbf5b848749a4840c7f3aac4c50749c10df2af3d673e2cf042cac081ba5',
      'fae9f787c334a836d55aa28b566c420a3c00049998bf6e695e43a6138ddd0e50',
      'cf474193ea0d70b88f51e058ac3e54eb7e54107e4fd6106ead607c3feebb0e4d',
      '02aaf9cf973c541f0d2cd095bef2f91f8541c6eecb3716dfe1b0c7be737fb271',
      '96ce6da0df3ace6be784b68be3e41ceeb9ac436f8a4cbcec245b33b9b02ee12c',
      '6fa9b5838f93cc783e6fe95e3027b55510dc106b17b7629190f238b207d50a3b',
      'b0a0712cd603e5039fe7f8e32f4fcfff5dee8fad8d89b589445ed946f6591f17',
      '942dd942fce3dec7ae53ba2f62b4e0c6f82f5530677e817ebaa8f9b76ce9dfa1',
      '56a8569aa12bcf0fdbe7faa97d463069eb2ec36564be0eaaeacd9bad947bdc64',
      'b981e7bb12d3f12714fe01d6841d91a35118f1b79422e774d32da0f5ef8071b2',
    ];
    const actual: string[] = [];
    for (const placed of [false, true])
      for (let index = 0; index < 7; index++)
        actual.push(
          createHash('sha256')
            .update(JSON.stringify(attributionObservation(index, placed, index === 6)))
            .digest('hex'),
        );
    expect(actual).toEqual(expected);
  });

  it('separates full keys and reproduces every original weight value', () => {
    const m = attributionCacheFixture();
    const rows = [];
    for (const side of [0, 1] as const) {
      const lines = new SideLines(side, m.input, { ...m.plan, placed: true }, m.participation);
      const arrays = new Set<readonly number[]>();
      for (const period of ['regulation', 'extra'] as const)
        for (let id = 0; id < 7; id++)
          for (const cell of [10, 14])
            for (const possession of [false, true]) {
              const role = attributionWeightRole(id);
              const weights = lines.weightsAt(period, role, cell, possession);
              expect(lines.weightsAt(period, role, cell, possession)).toBe(weights);
              expect(arrays.has(weights)).toBe(false);
              arrays.add(weights);
              rows.push({ side, period, id, cell, possession, weights });
            }
    }
    expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex')).toBe(
      '94a3c979980a67484fe3d05808ece959e38755bb4ae0a16480f616a19f3c718d',
    );
  });

  it('does not leak across sides, changed inputs or separate attributions', () => {
    const m = attributionCacheFixture();
    const plan = { ...m.plan, placed: true };
    const role = attributionWeightRole(1);
    const first = new SideLines(0, m.input, plan, m.participation).weightsAt(
      'regulation',
      role,
      10,
      true,
    );
    const other = new SideLines(1, m.input, plan, m.participation).weightsAt(
      'regulation',
      role,
      10,
      true,
    );
    expect(other).not.toBe(first);
    expect(other).not.toEqual(first);
    m.input.access.skill = () => 1;
    const changed = new SideLines(0, m.input, plan, m.participation).weightsAt(
      'regulation',
      role,
      10,
      true,
    );
    expect(changed).not.toBe(first);
    expect(changed).not.toEqual(first);
  });

  it('keeps the unplaced fast path and minutes-only fallback', () => {
    const m = attributionCacheFixture();
    const role = { ...attributionWeightRole(0), byLine: [0, 0, 0, 0] };
    const unplaced = new SideLines(0, m.input, m.plan, m.participation);
    expect(unplaced.weightsAt('extra', role, 10, true)).toBe(unplaced.weights('extra', role));
    const placed = new SideLines(0, m.input, { ...m.plan, placed: true }, m.participation);
    const weights = placed.weightsAt('extra', role, 10, true);
    expect(placed.weightsAt('extra', role, 10, true)).toBe(weights);
    expect(weights[6]).toBe(0);
    expect(weights[11]).toBeGreaterThan(0);
    expect(weights.every(Number.isFinite)).toBe(true);
  });

  it('all attribution consumers accept frozen shared weight arrays', () => {
    const original = SideLines.prototype.weightsAt;
    const spy = vi.spyOn(SideLines.prototype, 'weightsAt').mockImplementation(function (
      this: SideLines,
      ...args
    ) {
      return Object.freeze(original.apply(this, args));
    });
    try {
      expect(
        createHash('sha256')
          .update(JSON.stringify(attributionObservation(6, true, true)))
          .digest('hex'),
      ).toBe('b981e7bb12d3f12714fe01d6841d91a35118f1b79422e774d32da0f5ef8071b2');
    } finally {
      spy.mockRestore();
    }
  });
});
