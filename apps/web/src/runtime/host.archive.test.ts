import { legacySettings } from '../../../../packages/engine/src/responsibilities';
import { describe, it, expect } from 'vitest';
import { Host } from './host';
import { canonical } from '../../../../packages/contracts/src/index';
import type { ManagerHistoryPage } from '../../../../packages/contracts/src/manager-history-view';
import {
  advanceDays,
  captureCupTitle,
  createWorld,
  currentDay,
  domesticCupName,
  managerCandidates,
  operate,
  ROUND_INTERVAL_DAYS,
  simulateSeason,
} from '../../../../packages/engine/src/index';
import { encode } from '../adapters/persistence';
import { headToHead } from './headToHead';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { simulatedWorld, withoutManagerHistory } from '../../../../tests/fixtures/worlds';
import { input, playOn, req } from './host.testkit';
import type { View } from './protocol';

// Archive and history reads on the pre-feature path, careers and hosts alike: the reads, not the
// match model, are the subject.
const host = () => new Host(undefined, { release: DISABLED_RELEASE });

describe('worker command protocol', () => {
  it('projects closed seasons without brackets and scorer tables and returns them in the archive', async () => {
    const h = host();
    await h.handle(req('create', -1, { type: 'found', input }));
    playOn(h, simulatedWorld(input, { seasons: 1 }, DISABLED_RELEASE), DISABLED_RELEASE);
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
    const h = host();
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
    const h = host();
    await h.handle(req('create', -1, { type: 'found', input }));
    playOn(
      h,
      cachedWorld('legacy-season', () => {
        const w = createWorld(input, DISABLED_RELEASE);
        w.settings = legacySettings(4);
        return simulateSeason(w);
      }),
      DISABLED_RELEASE,
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

describe('the manager-history read (→HIST-18/19, WEB-92)', () => {
  /** The founding grown through a season, its manager then replaced `hires` times today. */
  async function career(hires = 0, untracked = false) {
    const h = host();
    await h.handle(req('create', -1, { type: 'found', input }));
    playOn(h, simulatedWorld(input, { seasons: 1 }, DISABLED_RELEASE), DISABLED_RELEASE);
    const w = untracked ? withoutManagerHistory(h.world!) : h.world!;
    w.cash = '999999999999';
    for (let n = 0; n < hires; n++)
      operate(w, {
        type: 'hire',
        id: managerCandidates(w).filter((c) => c.source !== 'club')[n % 2]!.id,
      });
    return h;
  }
  /** Every page from the first, each a read answered without a view. */
  async function pages(h: Host) {
    const read: ManagerHistoryPage[] = [];
    let cursor: string | undefined;
    do {
      const r = await h.handle(
        req(`page-${read.length}`, -1, {
          type: 'manager-history',
          world: h.world!.id,
          ...(cursor ? { cursor } : {}),
        }),
      );
      expect(r.ok, r.error).toBe(true);
      expect(r.view).toBeUndefined();
      read.push(r.managerHistory!);
      cursor = r.managerHistory!.nextCursor ?? undefined;
    } while (cursor);
    return read;
  }
  const view = (h: Host) => (h as unknown as { view(): View }).view();

  it('pages every tenure over all retained own matches, changing and projecting nothing', async () => {
    const h = await career(24);
    const w = h.world!,
      facts = w.managerHistory!,
      before = canonical(w);
    const read = await pages(h);
    expect(read.length).toBeGreaterThan(1);
    for (const page of read) expect(page.rows.length).toBeLessThanOrEqual(page.pageSize);
    const rows = read.flatMap((page) => page.rows);
    expect(rows).toHaveLength(read[0]!.total);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    // Tracked from the founding: one card per tenure, newest first, no older readable events.
    expect(rows.map((row) => row.kind === 'tenure' && row.tenure?.id)).toEqual(
      facts.tenures.map((t) => t.id).reverse(),
    );
    expect(rows.filter((row) => row.kind === 'tenure' && row.current)).toHaveLength(1);
    expect(rows[0]).toMatchObject({ current: true, manager: { id: w.manager.id } });
    // The season's whole record, far beyond the view's recent matches, and its final table.
    expect(w.ownMatches.length).toBeGreaterThan(30);
    const season = w.history[0]!;
    const finish = facts.outcomes.find((o) => o.source.kind === 'league-finish')!;
    const credited = rows.find((row) => row.kind === 'tenure' && row.tenure?.id === finish.tenure);
    expect(credited?.kind === 'tenure' && credited.summary).toMatchObject({
      record: {
        played: w.ownMatches.filter((m) => m.managerTenure === finish.tenure).length,
      },
      bestFinishes: [{ rank: season.rank, finishes: [{ season: { year: season.year } }] }],
    });
    expect(
      rows.reduce(
        (sum, row) => sum + (row.kind === 'tenure' ? (row.summary?.record.played ?? 0) : 0),
        0,
      ),
    ).toBe(w.ownMatches.length);
    // Reads move no revision, leave no receipt and change no fact; the projection keeps no facts.
    expect(canonical(w)).toBe(before);
    expect(w.receiptIds.some((id) => id.startsWith('page-'))).toBe(false);
    const projection = view(h);
    expect(projection.world).not.toHaveProperty('managerHistory');
    expect(projection.managerHistoryKey).toEqual(expect.any(String));
  });

  it('pages a career tracked from no point as its manager and older readable events', async () => {
    const h = await career(24, true);
    const w = h.world!;
    const rows = (await pages(h)).flatMap((page) => page.rows);
    expect(rows[0]).toMatchObject({
      kind: 'tenure',
      id: `current:${w.manager.id}`,
      tenure: null,
      summary: null,
      coverage: 'unavailable',
    });
    const legacy = rows.slice(1);
    expect(legacy.length).toBeGreaterThan(20);
    // Each keeps its place in the event log as its key, newest first, its words as written.
    for (const row of legacy) {
      expect(row.kind).toBe('legacy-event');
      if (row.kind !== 'legacy-event') continue;
      const index = Number(row.event.id.slice('event:'.length));
      expect(row.event.order).toBe(index);
      expect(row.event.event).toMatchObject({
        title: w.events[index]!.title,
        detail: w.events[index]!.detail,
        kind: w.events[index]!.kind,
      });
    }
    const order = legacy.map((row) => (row.kind === 'legacy-event' ? row.event.order : -1));
    expect(order).toEqual([...order].sort((a, b) => b - a));
    expect(legacy).toHaveLength(
      w.events.filter((e) => e.kind === 'manager-hire' || e.kind === 'manager-departure').length,
    );
  });

  it('keeps an appointment in the week tracking began a tenure, never an older event too', async () => {
    // A career saved before manager history, its manager replaced in round 3, then loaded by the
    // writer on a day between league rounds.
    const source = withoutManagerHistory(simulatedWorld(input, { rounds: 3 }, DISABLED_RELEASE));
    source.cash = '999999999999';
    operate(source, {
      type: 'hire',
      id: managerCandidates(source).find((c) => c.source !== 'club')!.id,
    });
    advanceDays(source, ROUND_INTERVAL_DAYS + 1);
    expect(source.round).toBe(4);
    expect(currentDay(source) % ROUND_INTERVAL_DAYS).not.toBe(0);
    const h = host();
    const loaded = await h.handle(
      req('load', -1, {
        type: 'inspect',
        raw: await encode(source),
        activate: true,
        upgrade: true,
      }),
    );
    expect(loaded.upgraded, loaded.error).toBe(true);
    const w = h.world!,
      logged = w.events.length;
    expect(w.managerHistory!.trackedFrom).toMatchObject({ year: w.year, day: currentDay(source) });
    // Replaced again the same week, after the load: an event of the round tracking began in.
    const hired = managerCandidates(w).find((c) => c.source !== 'club')!;
    operate(w, { type: 'hire', id: hired.id });
    expect(w.events.slice(logged).some((e) => e.kind === 'manager-hire' && e.round === 4)).toBe(
      true,
    );
    const rows = (await pages(h)).flatMap((page) => page.rows);
    expect(rows.flatMap((row) => (row.kind === 'tenure' ? [row.manager.id] : []))).toEqual([
      hired.id,
      source.manager.id,
    ]);
    // Older rows are exactly the personnel events of the rounds over before the load.
    const older = w.events.flatMap((e, index) =>
      (e.kind === 'manager-hire' || e.kind === 'manager-departure') &&
      (e.year < w.year || e.round < 4)
        ? [index]
        : [],
    );
    expect(older.length).toBeGreaterThan(0);
    expect(
      rows.flatMap((row) => (row.kind === 'legacy-event' ? [row.event.order] : [])).reverse(),
    ).toEqual(older);
  });

  it('answers between queued simulation steps without revisions, receipts or a projection', async () => {
    const h = host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const w = h.world!;
    let advanced = false;
    const step = h
      .handle(
        req('step', w.revision, { type: 'command', command: { type: 'advance-days', days: 3 } }),
      )
      .then((reply) => {
        advanced = true;
        return reply;
      });
    const read = await h.handle(req('managers', -1, { type: 'manager-history', world: w.id }));
    expect(advanced).toBe(false);
    expect(read.ok, read.error).toBe(true);
    expect(read.view).toBeUndefined();
    expect(read.managerHistory!.rows[0]).toMatchObject({ kind: 'tenure', current: true });
    expect((await step).ok).toBe(true);
    expect(w.receiptIds).not.toContain('managers');
  });

  it('follows an appointment and a cup final within one league round, not a quiet day', async () => {
    const h = await career();
    const w = h.world!,
      round = w.round,
      read = async () =>
        (await h.handle(req('read', -1, { type: 'manager-history', world: w.id }))).managerHistory!;
    const first = view(h).managerHistoryKey,
      founding = (await read()).rows[0]!;
    // A day on the calendar alone changes nothing the history reads.
    w.calendar = { day: currentDay(w) + 1 };
    expect(view(h).managerHistoryKey).toBe(first);
    const hired = managerCandidates(w).find((c) => c.source !== 'club')!;
    operate(w, { type: 'hire', id: hired.id });
    const appointed = view(h).managerHistoryKey;
    expect(appointed).not.toBe(first);
    const [current, previous] = (await read()).rows;
    expect(current).toMatchObject({ current: true, manager: { id: hired.id } });
    expect(previous).toMatchObject({ id: founding.id, current: false });
    expect(previous?.kind === 'tenure' && previous.tenure?.ended).toBeDefined();
    // Our domestic final, decided the same week, is the new manager's honour at once.
    const cup = w.cups!.find((c) => c.country === input.country)!;
    cup.winner = w.playerClub;
    captureCupTitle(w, 'cup');
    expect(view(h).managerHistoryKey).not.toBe(appointed);
    const [crowned] = (await read()).rows;
    expect(crowned?.kind === 'tenure' && crowned.summary?.honours).toEqual([
      expect.objectContaining({
        kind: 'cup-title',
        competition: 'cup',
        name: domesticCupName(input.country),
        season: { year: w.year, club: w.playerClub },
      }),
    ]);
    expect(w.round).toBe(round);
  });

  it('refuses stale sessions, invalid cursors and another career, changing nothing', async () => {
    const h = await career(24);
    const w = h.world!,
      before = canonical(w);
    const page = (await h.handle(req('first', -1, { type: 'manager-history', world: w.id })))
      .managerHistory!;
    const refused = async (body: object, session = 'session') => {
      const reply = await h.handle({
        ...req('refused', -1, { type: 'manager-history', ...body }),
        session,
      });
      expect(reply.ok, JSON.stringify(body)).toBe(false);
      expect(reply.managerHistory).toBeUndefined();
    };
    await refused({ world: w.id }, 'expired');
    await refused({ world: w.id, cursor: page.nextCursor!.slice(0, -3) });
    await refused({ world: w.id, cursor: 'manager-history:1:%XX' });
    await refused({
      world: w.id,
      cursor:
        'manager-history:1:' + encodeURIComponent(JSON.stringify(['ENG:other', page.rows[0]!.id])),
    });
    await refused({ world: 'world:another-career', cursor: page.nextCursor! });
    await refused({ world: w.id, year: w.year });
    expect(canonical(w)).toBe(before);
    // The cursor still reads on for its own career.
    const next = await h.handle(
      req('next', -1, { type: 'manager-history', world: w.id, cursor: page.nextCursor! }),
    );
    expect(next.ok, next.error).toBe(true);
    expect(next.managerHistory!.rows[0]!.id).not.toBe(page.rows.at(-1)!.id);
  });
});
