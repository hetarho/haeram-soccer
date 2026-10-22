import { describe, expect, it } from 'vitest';
import { Host } from './host';
import type { Body, Reply } from './protocol';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import {
  currentDay,
  daysUntilNextMatch,
  nextOwnFixture,
} from '../../../../packages/engine/src/calendar';
import { transferOffers } from '../../../../packages/engine/src/ops-squad';
import { ratio, random } from '../../../../packages/engine/src/primitives';
import { stoppingReasons } from '../../../../packages/engine/src/stopping';
const input = {
  country: 'ENG' as const,
  name: 'Worker Next Event',
  color: '#224466',
  seed: 'worker-next-event',
  level: 'normal' as const,
};
const req = (id: string, revision: number, body: Body) => ({
  protocol: 1 as const,
  session: 'next-event',
  requestId: id,
  expectedRevision: revision,
  generation: 1,
  parentGeneration: 0,
  body,
});
async function host() {
  const progress: Reply[] = [];
  const h = new Host((reply) => progress.push(reply));
  await h.handle(req('found', -1, { type: 'found', input }));
  h.world!.cash = h.world!.income = '999999999999';
  h.world!.settings!.mode = 'manual';
  for (const key of RESPONSIBILITY_KEYS) h.world!.settings!.responsibilities[key] = 'delegated';
  return { h, progress };
}
describe('manual next-event sole-writer protocol', () => {
  it('returns one final event date, caches duplicate requests and rejects stale/session writes', async () => {
    const { h, progress } = await host();
    const request = req('next', h.world!.revision, {
      type: 'command',
      command: { type: 'next-event' },
    });
    const reply = await h.handle(request);
    expect(reply.ok).toBe(true);
    expect(daysUntilNextMatch(h.world!)).toBe(1);
    expect(h.world!.ownMatches).toHaveLength(0);
    expect(progress).toEqual([]);
    const after = JSON.stringify(h.world);
    expect(await h.handle(request)).toBe(reply);
    expect(JSON.stringify(h.world)).toBe(after);
    expect((await h.handle({ ...request, requestId: 'stale' })).ok).toBe(false);
    expect(
      (
        await h.handle({
          ...request,
          session: 'readonly-client',
          requestId: 'forged',
          expectedRevision: h.world!.revision,
        })
      ).ok,
    ).toBe(false);
    expect(JSON.stringify(h.world)).toBe(after);
  });
  it('rejects automatic and critical/bankrupt states without moving a date', async () => {
    const { h } = await host();
    const w = h.world!;
    for (const blocker of ['automatic', 'critical', 'bankrupt'] as const) {
      w.settings!.mode = blocker === 'automatic' ? 'automatic' : 'manual';
      w.settings!.observations.matchEve = true;
      w.critical = blocker === 'critical' ? 'critical' : undefined;
      if (blocker === 'bankrupt') w.bankrupt = { year: w.year, round: w.round, day: currentDay(w) };
      const before = JSON.stringify(w);
      const reply = await h.handle(
        req(blocker, w.revision, { type: 'command', command: { type: 'next-event' } }),
      );
      expect(reply.ok).toBe(false);
      expect(JSON.stringify(w)).toBe(before);
    }
  });
  it('accepts manual without reports and commits only the next fixture result once', async () => {
    const { h } = await host();
    const w = h.world!;
    w.settings!.observations = { matchEve: false, windowOpen: false };
    const fixture = nextOwnFixture(w)!;
    const request = req('without-reports', w.revision, {
      type: 'command',
      command: { type: 'next-event' },
    });
    const reply = await h.handle(request);
    expect(reply.ok).toBe(true);
    expect(w.ownMatches.map((match) => match.id)).toEqual([fixture.id]);
    const settled = JSON.stringify(w);
    expect(await h.handle(request)).toBe(reply);
    expect(JSON.stringify(w)).toBe(settled);
  });
  it('groups two real counteroffers and the coincident match eve, and reading cannot bypass them', async () => {
    const { h } = await host(),
      w = h.world!;
    w.settings!.responsibilities.recruitment = 'direct';
    const offers = transferOffers(w)
      .filter((o) => o.available && BigInt(o.fee) > 0n)
      .slice(0, 2);
    expect(offers).toHaveLength(2);
    w.bids = offers.map((o, i) => {
      let id = '';
      for (let salt = 0; salt < 10000; salt++) {
        id = `counter:${i}:${salt}`;
        const roll = random(`${w.seed}:bid:${id}`)();
        if (roll > 0.5 && roll < 0.55) break;
      }
      return {
        id,
        direction: 'out' as const,
        playerId: o.player.id,
        offer: { player: o.player, fee: o.fee, loanFee: o.loanFee },
        fee: ratio(o.fee, 8n, 10n),
        year: w.year,
        day: 0,
        due: 6,
        status: 'pending' as const,
      };
    });
    const reply = await h.handle(
      req('group', w.revision, { type: 'command', command: { type: 'next-event' } }),
    );
    expect(reply.ok).toBe(true);
    expect(currentDay(w)).toBe(6);
    const group = stoppingReasons(w);
    expect(group.filter((i) => i.kind === 'bid-response')).toHaveLength(2);
    expect(group.filter((i) => i.kind === 'match')).toHaveLength(1);
    expect(group.every((i) => i.year === w.year && i.day === 6)).toBe(true);
    await h.handle(req('read', w.revision, { type: 'command', command: { type: 'read-inbox' } }));
    expect(
      (
        await h.handle(
          req('blocked', w.revision, { type: 'command', command: { type: 'next-event' } }),
        )
      ).ok,
    ).toBe(false);
    expect(currentDay(w)).toBe(6);
  });
});
