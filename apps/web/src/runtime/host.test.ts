import { describe, it, expect } from 'vitest';
import { Host } from './host';
import { build } from './codec';
import type { Body, CodecJob } from './protocol';
import { canonical } from '../../../../packages/contracts/src/index';
import { decode } from '../adapters/persistence';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import {
  lineupPreset,
  operate,
  simulateMatch,
  simulateSeason,
  recordMatch,
  addEvent,
  clubNews,
} from '../../../../packages/engine/src/index';
import { FOUNDING_YEAR } from '../../../../packages/engine/src/world';
import { professionalStart } from '../../../../packages/engine/src/testing';
import { headToHead } from './headToHead';
import { STOP_KINDS } from './progression';
const input = {
  country: 'ENG' as const,
  name: 'Worker Athletic',
  color: '#223344',
  seed: 'worker',
  level: 'normal' as const,
};
const req = (id: string, revision: number, body: Body) => ({
  protocol: 1,
  session: 'session',
  requestId: id,
  expectedRevision: revision,
  generation: 1,
  parentGeneration: 0,
  body,
});
/** A host wired to a codec port that keeps each posted snapshot, cloned as postMessage would. */
function withCodec() {
  const jobs: CodecJob[] = [];
  const host = new Host();
  host.codec = { postMessage: (job) => jobs.push(structuredClone(job)) };
  return { host, jobs };
}
describe('worker command protocol', () => {
  it('serializes commands, returns duplicate acknowledgment and rejects stale/session requests', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const a = req('advance', 0, { type: 'command', command: { type: 'advance', rounds: 1 } });
    const [first, duplicate, stale] = await Promise.all([
      h.handle(a),
      h.handle(a),
      h.handle(req('other', 0, { type: 'command', command: { type: 'advance', rounds: 1 } })),
    ]);
    expect(first.ok).toBe(true);
    expect(duplicate).toBe(first);
    expect(h.world?.round).toBe(1);
    expect(stale.ok).toBe(false);
    expect((await h.handle({ ...a, session: 'expired', requestId: 'expired' })).ok).toBe(false);
  });
  it('takes the intervention level by command and a day step stopping for every kind (→WEB-45)', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const level = await h.handle(
      req('level', 0, { type: 'command', command: { type: 'intervention', level: 1 } }),
    );
    expect(level.ok).toBe(true);
    expect(h.world!.intervention).toBe(1);
    // Level 1 stops for every event kind, so the step names all of them.
    const step = await h.handle(
      req('step', 1, {
        type: 'command',
        command: { type: 'advance-days', days: 1, stop: [...STOP_KINDS] },
      }),
    );
    expect(step.ok).toBe(true);
    expect(
      (
        await h.handle(
          req('bad-level', 2, {
            type: 'command',
            command: { type: 'intervention', level: 5 as never },
          }),
        )
      ).ok,
    ).toBe(false);
    expect(h.world!.intervention).toBe(1);
  });
  it('validates commands before applying money or revisions and keeps complete archives behind projections', async () => {
    const h = new Host();
    const founded = await h.handle(req('create', -1, { type: 'found', input }));
    const cash = h.world!.cash;
    expect(
      (await h.handle(req('bad', 0, { type: 'command', command: { type: 'ticket', price: -1 } })))
        .ok,
    ).toBe(false);
    expect(h.world!.cash).toBe(cash);
    expect(h.world!.revision).toBe(0);
    const r = await h.handle(req('read', 0, { type: 'archive', year: 1901 }));
    expect(r.archive?.matches).toEqual([]);
    expect(r.view).toBeUndefined();
    expect(founded.view?.world.fixtures.length).toBeLessThan(h.world!.fixtures.length);
  });
  it('projects closed seasons without brackets and scorer tables and returns them in the archive', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    simulateSeason(h.world!);
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
    simulateSeason(h.world!);
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
  it('ends a multi-day step on the day news arrives or our match is played', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const before = h.world!.inbox?.length || 0;
    const step = await h.handle(
      req('long', 0, { type: 'command', command: { type: 'advance-days', days: 12 } }),
    );
    const w = step.view!.world;
    // The first own match is on day 7: the step never runs past it.
    expect(w.calendar!.day).toBeLessThanOrEqual(7);
    const news = (w.inbox?.length || 0) > before;
    expect(news || w.ownMatches.length === 1).toBe(true);
    if (!news) expect(w.calendar!.day).toBe(7);
  });
  it('keeps a celebrated headline under one ID while the projected event window slides', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const w = h.world!;
    for (let i = 0; i < 160; i++) addEvent(w, 'note', `기록 ${i}`, '-');
    addEvent(w, 'promotion', '승격', '5부 2위 · 자동 승격');
    const promoted = (news: { id: string; celebrate?: boolean }[] = []) =>
      news.filter((item) => item.celebrate && item.id.endsWith(':promotion')).map((n) => n.id);
    const first = await h.handle(
      req('r1', 0, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
    expect(first.view!.world.events.length).toBeLessThan(w.events.length);
    expect(promoted(first.view!.news)).toHaveLength(1);
    for (let i = 0; i < 20; i++) addEvent(w, 'note', `추가 ${i}`, '-');
    const second = await h.handle(
      req('r2', w.revision, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
    expect(promoted(second.view!.news)).toEqual(promoted(first.view!.news));
    expect(second.view!.news).toEqual(clubNews(w));
  });
  it('persists off days and reaches the next owned fixture exactly once', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const dayRequest = req('days', 0, {
      type: 'command',
      command: { type: 'advance-days', days: 3 },
    });
    const days = await h.handle(dayRequest);
    expect(days.ok).toBe(true);
    expect(days.view?.world.calendar?.day).toBe(3);
    expect(days.view?.world.round).toBe(0);
    // A command is answered without encoding: checkpoints come from the codec worker.
    expect(days.raw).toBeUndefined();
    expect(await h.handle(dayRequest)).toBe(days);
    const match = await h.handle(
      req('match', h.world!.revision, { type: 'command', command: { type: 'next-match' } }),
    );
    expect(match.ok).toBe(true);
    expect(match.view?.world.calendar?.day).toBe(7);
    expect(match.view?.world.ownMatches).toHaveLength(1);
    expect(match.playback?.record.id).toBe(match.view?.world.ownMatches[0].id);
    expect(match.view?.world.rankHistory).toHaveLength(2);
  });
  it('blocks automatic progression before applying days when a critical alert is pending', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    h.world!.critical = '감독 확인';
    const result = await h.handle(
      req('days', 0, { type: 'command', command: { type: 'advance-days', days: 3 } }),
    );
    expect(result.ok).toBe(false);
    expect(h.world!.calendar?.day).toBe(0);
    expect(h.world!.revision).toBe(0);
    expect(result.raw).toBeUndefined();
  });
  it('hands the codec a snapshot of the current world and revision, whatever revision the client saw', async () => {
    const { host: h, jobs } = withCodec();
    await h.handle(req('create', -1, { type: 'found', input }));
    await h.handle(req('days', 0, { type: 'command', command: { type: 'advance-days', days: 2 } }));
    const revision = h.world!.revision;
    expect(revision).toBeGreaterThan(0);
    const saving = await h.handle({ ...req('save', -1, { type: 'save' }), generation: 4 });
    expect(saving.ok).toBe(true);
    expect(saving.view).toBeUndefined();
    expect(saving.raw).toBeUndefined();
    expect(saving.saving).toEqual({ worldId: h.world!.id, revision });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'save', generation: 4, parentGeneration: 0 });
    const result = await build(jobs[0]);
    if (!result.ok) throw new Error(result.error);
    expect(result.revision).toBe(revision);
    expect(result.envelope).toMatchObject({ worldId: h.world!.id, generation: 4 });
    const saved = (await decode(result.raw)).world;
    expect(saved.revision).toBe(revision);
    expect(canonical(saved)).toBe(canonical(h.world!));
    // Nothing is posted without a world or a codec port.
    expect((await new Host().handle(req('none', -1, { type: 'save' }))).ok).toBe(false);
    const unwired = new Host();
    await unwired.handle(req('create', -1, { type: 'found', input }));
    expect((await unwired.handle(req('save', 0, { type: 'save' }))).error).toContain('저장 Worker');
  });
  it('returns a restorable checkpoint when next-match progression is cancelled between days', async () => {
    const jobs: CodecJob[] = [];
    const h = new Host(() => {
      h.cancelled = true;
    });
    h.codec = { postMessage: (job) => jobs.push(structuredClone(job)) };
    await h.handle(req('create', -1, { type: 'found', input }));
    const result = await h.handle(
      req('match', 0, { type: 'command', command: { type: 'next-match' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.view?.world.calendar?.day).toBe(1);
    expect(result.view?.world.ownMatches).toHaveLength(0);
    await h.handle(req('save', -1, { type: 'save' }));
    const checkpoint = await build(jobs[0]);
    if (!checkpoint.ok) throw new Error(checkpoint.error);
    const restored = new Host();
    const loaded = await restored.handle(
      req('restore', -1, { type: 'inspect', raw: checkpoint.raw, activate: true }),
    );
    expect(loaded.ok).toBe(true);
    expect(restored.world?.calendar?.day).toBe(1);
    expect(restored.world?.receiptIds).toContain('match');
  });
  it('projects the complete own league schedule and round results without unrelated leagues', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    professionalStart(h.world!);
    const result = await h.handle(
      req('round', 0, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
    const view = result.view!.world;
    const own = view.clubs.find((c) => c.id === view.playerClub)!;
    const ownGroup = `${own.country}:${own.tier}:${own.group}`;
    const members = view.clubs.filter(
      (c) => `${c.country}:${c.tier}:${c.group}` === ownGroup && !c.representative,
    );
    const results = view.fixtures.filter((f) => f.round === 1 && f.score);
    expect(results).toHaveLength(members.length / 2);
    expect(results.some((f) => f.home !== view.playerClub && f.away !== view.playerClub)).toBe(
      true,
    );
    expect(view.fixtures.every((f) => f.groupKey === ownGroup)).toBe(true);
    expect(view.fixtures).toHaveLength(members.length * (members.length - 1));
    const next = nextOwnFixture(view)!;
    expect([next.home, next.away]).toContain(view.playerClub);
    expect(next.score).toBeUndefined();
    expect(next.round).toBe(2);
  });
  it('projects every amateur-league opponent fixture for a new club', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const result = await h.handle(
      req('round', 0, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
    const view = result.view!.world;
    expect(view.fixtures).toHaveLength(16 * 15);
    expect(view.fixtures.every((f) => f.kind === 'lower')).toBe(true);
    expect(view.fixtures.filter((f) => f.round === 1 && f.score)).toHaveLength(8);
    expect(nextOwnFixture(view)?.round).toBe(2);
  });
  it('simulates a fast season without sending empty observation playback', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    h.world!.cash = '999999999999';
    const result = await h.handle(
      req('season', 0, { type: 'command', command: { type: 'season', count: 1 } }),
    );
    expect(result.ok).toBe(true);
    expect(result.playback).toBeUndefined();
    expect(result.view?.world.year).toBe(FOUNDING_YEAR + 1);
    expect(result.view?.world.history).toHaveLength(1);
    expect(h.world!.ownMatches.some((m) => m.year === FOUNDING_YEAR && m.players.length > 0)).toBe(
      true,
    );
  });
});

describe('durable milestone projection', () => {
  it('keeps earlier preparation and a cup win when recent UI records no longer contain either', async () => {
    const host = new Host();
    await host.handle(req('milestone-found', -1, { type: 'found', input }));
    const world = host.world!;
    operate(world, { type: 'lineup', ids: lineupPreset(world, 'strongest') });
    operate(world, { type: 'lineup', ids: null });
    const fixture = nextOwnFixture(world)!;
    let won = false,
      losses = 0;
    for (let i = 0; i < 400 && losses < 30; i++) {
      const playback = simulateMatch(
        world,
        { ...fixture, id: `milestone-cup-${i}`, kind: 'cup' },
        false,
        true,
      );
      const own =
        playback.record.home === world.playerClub
          ? playback.record.score.home
          : playback.record.score.away;
      const other =
        playback.record.home === world.playerClub
          ? playback.record.score.away
          : playback.record.score.home;
      if (!won && own > other) {
        recordMatch(world, playback);
        won = true;
      } else if (won && own <= other) {
        recordMatch(world, playback);
        losses++;
      }
    }
    expect(won).toBe(true);
    expect(losses).toBe(30);
    for (let i = 0; i < 160; i++) addEvent(world, 'fixture-note', '기록 보관', '후속 기록');
    const reply = await host.handle(req('milestone-export', world.revision, { type: 'export' }));
    expect(reply.ok).toBe(true);
    expect(reply.view!.world.ownMatches).toHaveLength(30);
    expect(reply.view!.world.events.some((event) => event.kind === 'lineup')).toBe(false);
    expect(
      reply.view!.world.ownMatches.some(
        (match) =>
          (match.home === world.playerClub
            ? match.score.home - match.score.away
            : match.score.away - match.score.home) > 0,
      ),
    ).toBe(false);
    for (const id of ['preparation', 'first-win'])
      expect(reply.view!.milestones.goals.find((goal) => goal.id === id)?.done).toBe(true);
    expect(world.ownMatches).toHaveLength(31);
  });
});

describe('budget recovery projection', () => {
  it('retains the true seasonal contribution quota after old receipts leave the noticeboard', async () => {
    const host = new Host();
    await host.handle(req('support-found', -1, { type: 'found', input }));
    const world = host.world!;
    for (let i = 0; i < 3; i++) operate(world, { type: 'support' });
    for (let i = 0; i < 160; i++) addEvent(world, 'fixture-note', '추가 기록', '최근 기록');
    const result = await host.handle(req('support-export', world.revision, { type: 'export' }));
    expect(result.ok).toBe(true);
    expect(result.view!.world.events.filter((event) => event.kind === 'support')).toHaveLength(0);
    expect(result.view!.supportUsed).toBe(3);
    expect(() => operate(world, { type: 'support' })).toThrow('3회');
  });
});
