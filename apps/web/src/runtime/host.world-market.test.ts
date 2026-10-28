import { describe, expect, it } from 'vitest';
import { Host } from './host';
import { input, req } from './host.testkit';
import { worldMarketOffer } from '../../../../packages/engine/src/world-market';
import { squad } from '../../../../packages/engine/src/world';

/** Integration: real host/engine world and serialized commands. Run only at the host batch gate. */
describe('world market worker integration', () => {
  it('keeps ordinary views bounded, reads without receipts/views, and settles an identity bid once', async () => {
    const host = new Host();
    const founded = await host.handle(req('found', -1, { type: 'found', input }));
    expect(founded.ok).toBe(true);
    const w = host.world!;
    const before = structuredClone(w);
    const page = await host.handle(
      req('market', -1, {
        type: 'world-market',
        query: { world: w.id, pageSize: 3, sort: 'name', direction: 'asc' },
      }),
    );
    expect(page.ok).toBe(true);
    expect(page.worldMarket!.items).toHaveLength(3);
    expect(page.worldMarket!.total).toBeGreaterThan(founded.view!.transfers.length);
    expect(page.view).toBeUndefined();
    expect(page.viewDelta).toBeUndefined();
    expect(host.world).toEqual(before);
    expect(
      (
        await host.handle(
          req('stale', w.revision, {
            type: 'world-market',
            query: { world: 'other-career' },
          }),
        )
      ).ok,
    ).toBe(false);
    const club = w.clubs.find((c) => c.id !== w.playerClub && c.country !== input.country)!;
    const player = squad(w, club)[0];
    const target = { world: w.id, kind: 'club' as const, clubId: club.id, playerId: player.id };
    const detail = await host.handle(
      req('detail', w.revision, { type: 'world-market-detail', target }),
    );
    expect(detail.worldMarketDetail!.offer.player.id).toBe(player.id);
    expect(detail.view).toBeUndefined();
    w.cash = '9999999999999999';
    const asking = worldMarketOffer(w, target)!;
    const bid = await host.handle(
      req('approach', w.revision, {
        type: 'command',
        command: { type: 'bid', target, fee: asking.fee },
      }),
    );
    expect(bid.ok).toBe(true);
    const pending = host.world!.bids![0];
    expect(pending.club).toBe(club.id);
    pending.status = 'countered';
    const accept = req('accept', host.world!.revision, {
      type: 'command',
      command: { type: 'respond-bid', id: pending.id, accept: true },
    });
    expect((await host.handle(accept)).ok).toBe(true);
    const cash = host.world!.cash;
    expect((await host.handle(accept)).ok).toBe(true);
    expect(host.world!.cash).toBe(cash);
    expect(host.world!.players.filter((p) => p.id === player.id)).toHaveLength(1);
    expect(host.world!.people![player.id].club).toBe(w.playerClub);
    expect(squad(host.world!, club).some((p) => p.id === player.id)).toBe(false);
    expect(host.world!.transfers!.facts.at(-1)).toMatchObject({
      club: club.id,
      player: player.id,
      fee: pending.fee,
    });
  });
});
