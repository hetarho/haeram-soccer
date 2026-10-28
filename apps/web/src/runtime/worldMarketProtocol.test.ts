import { describe, expect, it } from 'vitest';
import { requestSchema } from './protocol';

const target = { world: 'career', kind: 'club', clubId: 'seller', playerId: 'player' } as const;
const request = (body: unknown) => ({
  protocol: 1,
  session: 's',
  requestId: 'r',
  expectedRevision: 1,
  generation: 1,
  parentGeneration: 0,
  body,
});
const accepts = (body: unknown) => requestSchema.safeParse(request(body)).success;

describe('world market protocol boundaries', () => {
  it('validates bounded, typed query and detail requests', () => {
    expect(
      accepts({
        type: 'world-market',
        query: {
          world: 'career',
          page: 2,
          pageSize: 50,
          name: 'name',
          recommendedOnly: true,
          league: { country: 'ESP', tier: 0, group: 0 },
          team: 'seller',
          position: 'AM',
          line: 'MF',
          fit: 'improves',
          sort: 'wage',
          direction: 'asc',
        },
      }),
    ).toBe(true);
    expect(accepts({ type: 'world-market-detail', target, fee: '123', loan: true })).toBe(true);
    for (const query of [
      {},
      { world: '' },
      { world: 'career', page: -1 },
      { world: 'career', pageSize: 51 },
      { world: 'career', sort: 'ability' },
      { world: 'career', direction: 'random' },
      { world: 'career', roster: [] },
      { world: 'career', league: { country: 'ESP' } },
    ])
      expect(accepts({ type: 'world-market', query })).toBe(false);
  });
  it('accepts either a stable target or a legacy index, and never mixes their meanings', () => {
    for (const type of ['bid', 'recruit']) {
      const fee = type === 'bid' ? { fee: '123' } : {};
      const command = (selection: object) => ({
        type: 'command',
        command: { type, ...fee, ...selection },
      });
      expect(accepts(command({ target }))).toBe(true);
      expect(accepts(command({ candidate: 1 }))).toBe(true);
      expect(
        accepts(command({ target: { world: 'career', kind: 'offer', playerId: 'free' } })),
      ).toBe(true);
      for (const invalid of [
        {},
        { candidate: -1 },
        { candidate: 1, target },
        { target: { ...target, kind: 'row', row: 2 } },
        { target: { kind: 'club', clubId: 'seller', playerId: 'player' } },
        { target: { ...target, clubId: '' } },
        { target: { ...target, playerId: 'x'.repeat(101) } },
      ])
        expect(accepts(command(invalid))).toBe(false);
    }
  });
});
