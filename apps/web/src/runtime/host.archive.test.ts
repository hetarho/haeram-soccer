import { legacySettings } from '../../../../packages/engine/src/responsibilities';
import { describe, it, expect } from 'vitest';
import { Host } from './host';
import { canonical } from '../../../../packages/contracts/src/index';
import { simulateSeason, createWorld } from '../../../../packages/engine/src/index';
import { headToHead } from './headToHead';
import { cachedWorld, simulatedWorld } from '../../../../tests/fixtures/worlds';
import { input, playOn, req } from './host.testkit';
describe('worker command protocol', () => {
  it('projects closed seasons without brackets and scorer tables and returns them in the archive', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    playOn(h, simulatedWorld(input, { seasons: 1 }));
    const season = h.world!.history[0];
    expect(season.brackets?.length).toBeGreaterThan(0);
    expect(season.scorers?.length).toBeGreaterThan(0);
    const r = await h.handle(
      req('closed', h.world!.revision, { type: 'archive', year: season.year }),
    );
    const projection = await h.handle(
      req('projection', h.world!.revision, { type: 'command', command: { type: 'read-inbox' } }),
    );
    const projected = projection.view!.world.history[0];
    expect(projected).not.toHaveProperty('brackets');
    expect(projected).not.toHaveProperty('scorers');
    expect(projected.ranks).toEqual(season.ranks);
    expect(projected.eloRange).toEqual(season.eloRange);
    expect(r.archive?.season).toEqual(season);
    expect(h.world!.history[0].brackets).toBe(season.brackets);
  });
  it('reads archives between queued simulation steps without revisions, receipts or a projection', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const w = h.world!,
      before = canonical(w),
      expected = {
        season: undefined,
        matches: w.ownMatches.filter((m) => m.year === w.year),
        events: w.events.filter((e) => e.year === w.year),
        managers: w.events.filter((e) => e.kind.startsWith('manager-')),
      };
    const stale = {
      ...req('old-archive', -1, { type: 'archive', year: w.year }),
      session: 'expired',
    };
    expect((await h.handle(stale)).ok).toBe(false);
    expect(canonical(w)).toBe(before);
    let advanced = false;
    const step = h
      .handle(
        req('step', w.revision, { type: 'command', command: { type: 'advance-days', days: 3 } }),
      )
      .then((reply) => {
        advanced = true;
        return reply;
      });
    const read = await h.handle(req('archive', -1, { type: 'archive', year: w.year }));
    expect(advanced).toBe(false);
    expect(read.ok).toBe(true);
    expect(read.view).toBeUndefined();
    expect(read.archive).toEqual(expected);
    expect((await step).ok).toBe(true);
    expect(w.receiptIds).not.toContain('archive');
  });
  it('reads the all-time head-to-head from every own match without queueing or projecting', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    playOn(
      h,
      cachedWorld('legacy-season', () => {
        const w = createWorld(input);
        w.settings = legacySettings(4);
        return simulateSeason(w);
      }),
    );
    const w = h.world!,
      met = w.ownMatches.find((m) => m.kind === 'lower')!,
      club = met.home === w.playerClub ? met.away : met.home,
      expected = headToHead(w.ownMatches, w.playerClub, club);
    expect(expected.played).toBe(
      w.ownMatches.filter((m) => m.home === club || m.away === club).length,
    );
    // The read is answered before the command sent ahead of it, whatever revision it names.
    let advanced = false;
    const step = h
      .handle(
        req('step', w.revision, { type: 'command', command: { type: 'advance-days', days: 3 } }),
      )
      .then((reply) => {
        advanced = true;
        return reply;
      });
    const read = await h.handle(req('h2h', -1, { type: 'head-to-head', club }));
    expect(advanced).toBe(false);
    expect(read.ok).toBe(true);
    expect(read.view).toBeUndefined();
    expect(read.headToHead).toEqual(expected);
    expect((await step).ok).toBe(true);
    expect(w.receiptIds).not.toContain('h2h');
    const stale = { ...req('old', -1, { type: 'head-to-head', club }), session: 'expired' };
    expect((await h.handle(stale)).ok).toBe(false);
    for (const other of [w.playerClub, 'XXX:none'])
      expect((await h.handle(req(other, -1, { type: 'head-to-head', club: other }))).ok).toBe(
        false,
      );
  });
});
