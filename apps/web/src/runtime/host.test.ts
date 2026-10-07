import { describe, it, expect } from 'vitest';
import { Host } from './host';
import type { Body } from './protocol';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import {
  lineupPreset,
  operate,
  simulateMatch,
  recordMatch,
  addEvent,
} from '../../../../packages/engine/src/index';
import { prepareSeason } from '../../../../packages/engine/src/season';
const input = {
  country: 'ENG' as const,
  name: 'Worker Athletic',
  color: '#223344',
  seed: 'worker',
  difficulty: 1 as const,
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
  it('validates commands before applying money or revisions and keeps complete archives behind projections', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const cash = h.world!.cash;
    expect(
      (await h.handle(req('bad', 0, { type: 'command', command: { type: 'ticket', price: -1 } })))
        .ok,
    ).toBe(false);
    expect(h.world!.cash).toBe(cash);
    expect(h.world!.revision).toBe(0);
    const r = await h.handle(req('read', 0, { type: 'archive', year: 1901 }));
    expect(r.archive?.matches).toEqual([]);
    expect(r.view?.world.fixtures.length).toBeLessThan(h.world!.fixtures.length);
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
    expect(days.raw).toBeTruthy();
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
  it('returns a restorable checkpoint when next-match progression is cancelled between days', async () => {
    const h = new Host(() => {
      h.cancelled = true;
    });
    await h.handle(req('create', -1, { type: 'found', input }));
    const result = await h.handle(
      req('match', 0, { type: 'command', command: { type: 'next-match' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.view?.world.calendar?.day).toBe(1);
    expect(result.view?.world.ownMatches).toHaveLength(0);
    const restored = new Host();
    const loaded = await restored.handle(
      req('restore', -1, { type: 'inspect', raw: result.raw!, activate: true }),
    );
    expect(loaded.ok).toBe(true);
    expect(restored.world?.calendar?.day).toBe(1);
    expect(restored.world?.receiptIds).toContain('match');
  });
  it('projects the complete own league schedule and round results without unrelated leagues', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
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
  it('projects every lower-league opponent fixture after relegation', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    h.world!.lower = true;
    h.world!.clubs.find((c) => c.id === h.world!.playerClub)!.tier = 4;
    prepareSeason(h.world!);
    const result = await h.handle(
      req('round', 0, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
    const view = result.view!.world;
    expect(view.fixtures).toHaveLength(8 * 7);
    expect(view.fixtures.every((f) => f.kind === 'lower')).toBe(true);
    expect(view.fixtures.filter((f) => f.round === 1 && f.score)).toHaveLength(4);
    expect(nextOwnFixture(view)?.round).toBe(4);
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
    expect(result.view?.world.year).toBe(1902);
    expect(result.view?.world.history).toHaveLength(1);
    expect(h.world!.ownMatches.some((m) => m.year === 1901 && m.players.length > 0)).toBe(true);
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
