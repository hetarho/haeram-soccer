import { describe, expect, it } from 'vitest';
import { Host } from './host';
import type { Reply } from './protocol';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import {
  currentDay,
  daysInSeason,
  daysUntilNextMatch,
  nextOwnFixture,
} from '../../../../packages/engine/src/calendar';
import { nextWork, workDays } from '../../../../packages/engine/src/facilities';
import { transferOffers } from '../../../../packages/engine/src/scout-search';
import { ratio } from '../../../../packages/engine/src/primitives';
import { bidOutlook } from '../../../../packages/engine/src/transfers';
import { pendingDecisions, stoppingReasons } from '../../../../packages/engine/src/stopping';
import { req, startedHost } from './host.testkit';
async function host() {
  const progress: Reply[] = [];
  const { host: h } = await startedHost(
    'worker-next-event',
    undefined,
    new Host((reply) => progress.push(reply)),
  );
  h.world!.cash = h.world!.income = '999999999999';
  h.world!.settings!.mode = 'manual';
  for (const key of RESPONSIBILITY_KEYS) h.world!.settings!.responsibilities[key] = 'delegated';
  return { h, progress };
}
describe('manual next-event sole-writer protocol', () => {
  it('returns one final event date, caches duplicate requests and rejects stale/session writes', async () => {
    const { h, progress } = await host();
    const w = h.world!;
    w.academyFacility = 1;
    const to = w.academyFacility + 1;
    const completion = currentDay(w) + 1;
    w.facilityAutoUpgrade = { academy: 'armed' };
    w.facilityWorks = {
      academy: {
        to,
        year: w.year - 1,
        day: daysInSeason(w.year - 1) + completion - workDays('academy', to),
      },
    };
    const successor = nextWork({ ...w, academyFacility: to }, 'academy')!;
    const request = req('next', h.world!.revision, {
      type: 'command',
      command: { type: 'next-event' },
    });
    const reply = await h.handle(request);
    expect(reply.ok).toBe(true);
    expect(w.facilityWorks?.academy).toEqual({ to: successor.to, year: w.year, day: completion });
    expect(w.events.filter((event) => event.kind === 'facility')).toMatchObject([
      { amount: successor.cost },
    ]);
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
  it('stops at the match eve while two real counteroffers wait in the 결재함, never held by them', async () => {
    const { h } = await host(),
      w = h.world!;
    w.settings!.responsibilities.recruitment = 'direct';
    // A bid at or above the asking fee is always accepted, so a real counter needs a fee below it
    // that every draw of the seller's reservation answers with a counter: the middle of that band,
    // read in hundredths of the asking fee as the bid view reads it (→CLUB-18, CLUB-52).
    const counterFee = (index: number, asking: string) => {
      const band: string[] = [];
      for (let k = 25n; k < 100n; k++) {
        const fee = ratio(asking, k, 100n);
        if (bidOutlook(w, index, fee).counter === 1) band.push(fee);
        else if (band.length) break;
      }
      return band[Math.floor(band.length / 2)];
    };
    const all = transferOffers(w),
      offers: { o: (typeof all)[number]; fee: string }[] = [];
    for (const [index, o] of all.entries()) {
      if (offers.length === 2) break;
      if (!o.available || BigInt(o.fee) <= 0n) continue;
      const fee = counterFee(index, o.fee);
      if (fee) offers.push({ o, fee });
    }
    expect(offers).toHaveLength(2);
    w.bids = offers.map(({ o, fee }, i) => ({
      id: `counter:${i}`,
      direction: 'out' as const,
      playerId: o.player.id,
      offer: { player: o.player, fee: o.fee, loanFee: o.loanFee },
      fee,
      year: w.year,
      day: 0,
      due: 6,
      status: 'pending' as const,
    }));
    const reply = await h.handle(
      req('group', w.revision, { type: 'command', command: { type: 'next-event' } }),
    );
    expect(reply.ok).toBe(true);
    expect(currentDay(w)).toBe(6);
    // Only the observation stops; the counteroffers wait in the 결재함 (→WEB-42/83).
    expect(stoppingReasons(w).map((i) => i.kind)).toEqual(['match']);
    expect(pendingDecisions(w).filter((i) => i.kind === 'bid-response')).toHaveLength(2);
    const reply2 = await h.handle(
      req('onward', w.revision, { type: 'command', command: { type: 'next-event' } }),
    );
    expect(reply2.ok).toBe(true);
    expect(currentDay(w)).toBeGreaterThan(6);
  });
});
