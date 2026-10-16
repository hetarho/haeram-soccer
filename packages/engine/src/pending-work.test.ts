import { describe, expect, it } from 'vitest';
import type { TransferBid } from '../../contracts/src/types';
import { createWorld, operate, transferOffers, contractTalks, activePlayers } from './index';
import { pendingWorkPreview } from './pending-work';
import { Host } from '../../../apps/web/src/runtime/host';
const input = {
  country: 'ENG' as const,
  name: 'Handover',
  color: '#224466',
  seed: 'handover',
  level: 'normal' as const,
};
function world() {
  const w = createWorld(input);
  w.cash = w.income = '999999999999';
  w.calendar = { day: 1 };
  return w;
}
function offers(w: ReturnType<typeof world>) {
  const candidates = transferOffers(w)
    .filter((o) => o.available && BigInt(o.fee) > 0n)
    .slice(0, 2);
  expect(candidates).toHaveLength(2);
  w.bids = candidates.map((o, i): TransferBid => ({
    id: `purchase:${i}`,
    direction: 'out',
    playerId: o.player.id,
    offer: { player: structuredClone(o.player), fee: o.fee, loanFee: o.loanFee },
    fee: o.fee,
    counterFee: o.fee,
    year: w.year,
    day: 0,
    due: 5,
    status: 'countered',
  }));
  const p = activePlayers(w)[0];
  w.bids.push({
    id: 'sale',
    direction: 'in',
    playerId: p.id,
    club: w.clubs.find((c) => c.id !== w.playerClub)!.id,
    fee: '100',
    year: w.year,
    day: 0,
    due: 5,
    status: 'pending',
  });
}
describe('explicit responsibility handover', () => {
  it('purely previews two pending acquisitions and resolves only that changed category once', () => {
    const w = world();
    offers(w);
    const settings = structuredClone(w.settings!);
    settings.responsibilities.recruitment = 'delegated';
    const before = JSON.stringify(w);
    expect(pendingWorkPreview(w, settings)).toEqual([
      { key: 'recruitment', to: 'delegated', count: 2, refs: ['purchase:0', 'purchase:1'] },
    ]);
    expect(JSON.stringify(w)).toBe(before);
    operate(w, { type: 'settings', settings });
    expect(
      w.bids!.slice(0, 2).every((b) => b.status === 'completed' || b.status === 'rejected'),
    ).toBe(true);
    for (const bid of w.bids!.slice(0, 2))
      expect(w.players.some((p) => p.id === bid.playerId)).toBe(bid.status === 'completed');
    expect(w.inbox?.filter((i) => i.kind === 'bid-response')).toHaveLength(2);
    expect(w.bids![2].status).toBe('pending');
    const cash = w.cash,
      events = w.events.length,
      players = w.players.length;
    operate(w, { type: 'settings', settings });
    expect([w.cash, w.events.length, w.players.length]).toEqual([cash, events, players]);
  });
  it('preserves external terms and dates when an unanswered purchase changes actor in either direction', () => {
    const w = world();
    offers(w);
    const bid = w.bids![0];
    bid.status = 'pending';
    w.bids = [bid];
    const original = { fee: bid.fee, due: bid.due, day: bid.day };
    const settings = structuredClone(w.settings!);
    settings.responsibilities.recruitment = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(bid.staff).toBeDefined();
    expect(bid.status).toBe('pending');
    settings.responsibilities.recruitment = 'direct';
    expect(pendingWorkPreview(w, settings)[0].refs).toEqual([bid.id]);
    operate(w, { type: 'settings', settings });
    expect(bid.staff).toBeUndefined();
    expect({ fee: bid.fee, due: bid.due, day: bid.day }).toEqual(original);
  });
  it('hands over existing contract talks without opening new ones', () => {
    const w = world();
    w.calendar!.day = 0;
    const p = activePlayers(w)[0];
    p.until = w.year + 1;
    contractTalks(w);
    expect(p.talk).toBeDefined();
    w.calendar!.day = 2;
    const settings = structuredClone(w.settings!);
    settings.responsibilities.contracts = 'delegated';
    expect(pendingWorkPreview(w, settings)[0].refs).toContain(p.id);
    operate(w, { type: 'settings', settings });
    expect(activePlayers(w).some((p) => p.talk)).toBe(false);
    const after = w.events.length;
    settings.responsibilities.contracts = 'direct';
    expect(pendingWorkPreview(w, settings)[0].count).toBe(0);
    operate(w, { type: 'settings', settings });
    expect(w.events).toHaveLength(after);
  });
  it('excludes completed work and rejects the whole invalid settings change before any effects', () => {
    const w = world();
    offers(w);
    w.bids![0].status = 'completed';
    const settings = structuredClone(w.settings!);
    settings.responsibilities.recruitment = 'delegated';
    expect(pendingWorkPreview(w, settings)[0].refs).toEqual(['purchase:1']);
    settings.mode = 'manual';
    settings.observations.matchEve = false;
    const before = JSON.stringify(w);
    expect(() => operate(w, { type: 'settings', settings })).toThrow();
    expect(JSON.stringify(w)).toBe(before);
  });
  it('uses the ordinary sale resolver for an already waiting listed-player offer', () => {
    const w = world();
    offers(w);
    const bid = w.bids!.find((b) => b.direction === 'in')!;
    const p = activePlayers(w).find((p) => p.id === bid.playerId)!;
    p.stance = 'listed';
    const before = BigInt(w.cash),
      settings = structuredClone(w.settings!);
    settings.responsibilities.sales = 'delegated';
    operate(w, { type: 'settings', settings });
    expect(bid.status).toBe('completed');
    expect(p.status).toBe('sold');
    expect(BigInt(w.cash)).toBe(before + BigInt(bid.fee));
    expect(
      w.bids!.filter((b) => b.direction === 'out').every((b) => b.status === 'countered'),
    ).toBe(true);
    operate(w, { type: 'settings', settings });
    expect(BigInt(w.cash)).toBe(before + BigInt(bid.fee));
  });
  it('uses the serialized request receipt to avoid repeated business effects on redelivery', async () => {
    const host = new Host();
    const request = {
      protocol: 1 as const,
      session: 'handover',
      requestId: 'found',
      expectedRevision: -1,
      generation: 1,
      parentGeneration: 0,
      body: { type: 'found' as const, input },
    };
    await host.handle(request);
    host.world = world();
    offers(host.world);
    const settings = structuredClone(host.world.settings!);
    settings.responsibilities.recruitment = 'delegated';
    const command = {
      ...request,
      requestId: 'apply',
      expectedRevision: host.world.revision,
      body: { type: 'command' as const, command: { type: 'settings' as const, settings } },
    };
    const first = await host.handle(command);
    expect(first.ok).toBe(true);
    const after = JSON.stringify(host.world);
    expect(await host.handle(command)).toBe(first);
    expect(JSON.stringify(host.world)).toBe(after);
  });
});
