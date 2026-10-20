import { legacySettings } from '../../../../packages/engine/src/responsibilities';
import { signSponsor, sponsorSlots } from '../../../../packages/engine/src/sponsors';
import { describe, it, expect, vi } from 'vitest';
import { Host } from './host';
import { build } from './codec';
import type { CodecJob } from './protocol';
import { canonical } from '../../../../packages/contracts/src/index';
import { decode, encode } from '../adapters/persistence';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import {
  lineupPreset,
  operate,
  simulateMatch,
  recordMatch,
  addEvent,
  clubNews,
  advanceRound,
  createIdentityDraft,
  createWorld,
} from '../../../../packages/engine/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import type { KitRole } from '../../../../packages/contracts/src/identity';
import { KIT_FIXTURE_CHANGED } from '../../../../packages/engine/src/identity-operations';
import { FOUNDING_YEAR, clubOf } from '../../../../packages/engine/src/world';
import { professionalStart } from '../../../../packages/engine/src/testing';
import { cachedWorld } from '../../../../tests/fixtures/worlds';
import { input, playOn, req } from './host.testkit';
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
  it('accepts the legacy intervention command and validates clock-command boundaries', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const level = await h.handle(
      req('level', 0, { type: 'command', command: { type: 'intervention', level: 1 } }),
    );
    expect(level.ok).toBe(true);
    expect(h.world!.intervention).toBe(1);
    // Settle unrelated sponsor decisions before testing an allowed clock command.
    for (const slot of sponsorSlots(h.world!))
      if (slot.offers.length) signSponsor(h.world!, slot.slot, 0);
    // Legacy stop hints remain accepted; live decisions determine actual stops.
    const step = await h.handle(
      req('step', 1, {
        type: 'command',
        command: { type: 'advance-days', days: 1, stop: ['match', 'window-open'] },
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
    // Explicit quiet authority fixture: this tests date persistence, not automatic hiring.
    h.world!.settings = legacySettings(2);
    for (const slot of sponsorSlots(h.world!))
      if (slot.offers.length) signSponsor(h.world!, slot.slot, 0);
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
    // A real sale offer may have arrived on that date; reading it cannot authorize travel.
    for (const bid of h.world!.bids || [])
      if (bid.direction === 'in' && bid.status === 'pending')
        operate(h.world!, { type: 'respond-bid', id: bid.id, accept: false });
    const match = await h.handle(
      req('match', h.world!.revision, { type: 'command', command: { type: 'next-match' } }),
    );
    expect(match.ok, match.error).toBe(true);
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
    expect(
      Object.keys(saved).filter(
        (key) =>
          canonical(saved[key as keyof typeof saved]) !==
          canonical(h.world![key as keyof typeof saved]),
      ),
    ).toEqual([]);
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
    // The season command plays every round as `advanceRound(w, undefined, false)`: the first 45
    // are built once, the last and the close run here through the command.
    playOn(
      h,
      cachedWorld('rich-45-rounds', () => {
        const w = createWorld(input);
        w.cash = '999999999999';
        while (w.round < 45) advanceRound(w, undefined, false);
        return w;
      }),
    );
    const result = await h.handle(
      req('season', h.world!.revision, { type: 'command', command: { type: 'season', count: 1 } }),
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

describe('own-club design requests (→KIT-9, SAVE-6)', () => {
  const design = (color: string) =>
    createIdentityDraft({ country: input.country, seed: input.seed, color });
  const apply = (id: string, revision: number, color: string) =>
    req(id, revision, {
      type: 'command',
      command: { type: 'club-identity', identity: design(color) },
    });
  it('duplicate identity receipt has one effect', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const first = apply('design', 0, '#aa2233');
    const [applied, duplicate] = await Promise.all([h.handle(first), h.handle(first)]);
    expect(applied.ok, applied.error).toBe(true);
    expect(duplicate).toBe(applied);
    expect(h.world!.revision).toBe(1);
    expect(h.world!.receiptIds.filter((id) => id === 'design')).toHaveLength(1);
    const own = (w = h.world!) => w.clubs.find((club) => club.id === w.playerClub)!;
    expect(own(applied.view!.world as World).identity).toEqual(design('#aa2233'));
    // After newer work the same request returns its stored answer, never a second effect.
    expect((await h.handle(apply('newer', 1, '#3355aa'))).ok).toBe(true);
    expect(await h.handle(first)).toBe(applied);
    expect(h.world!.revision).toBe(2);
    expect(clubOf(h.world!).identity).toEqual(design('#3355aa'));
    expect(clubOf(h.world!).color).toBe('#3355aa');
    // Reloaded without the answers in memory, the saved receipt still refuses a replay.
    const restored = new Host();
    await restored.handle(
      req('restore', -1, { type: 'inspect', raw: await encode(h.world!), activate: true }),
    );
    const replay = await restored.handle(apply('newer', 2, '#3355aa'));
    expect(replay.ok).toBe(false);
    expect(replay.error).toContain('이미 처리된 요청');
    expect(restored.world!.revision).toBe(2);
    expect(canonical(restored.world)).toBe(canonical(h.world));
  });
  it('stale identity request does not overwrite newer work', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    expect((await h.handle(apply('newer', 0, '#3355aa'))).ok).toBe(true);
    const before = canonical(h.world);
    // Drafted against revision 0, it arrives after the newer design was applied.
    const stale = await h.handle(apply('stale', 0, '#aa2233'));
    expect(stale.ok).toBe(false);
    expect(stale.error).toContain('오래된 요청');
    expect(canonical(h.world)).toBe(before);
    expect(clubOf(h.world!).identity).toEqual(design('#3355aa'));
    expect(h.world!.receiptIds).not.toContain('stale');
  });
});

describe('next-fixture kit requests (→KIT-6, SAVE-6)', () => {
  const kit = (id: string, revision: number, fixtureId: string, role: KitRole | null) =>
    req(id, revision, { type: 'command', command: { type: 'match-kit', fixtureId, role } });
  it('duplicate kit receipt has one effect and the saved checkpoint keeps the choice', async () => {
    const { host: h, jobs } = withCodec();
    await h.handle(req('create', -1, { type: 'found', input }));
    const next = nextOwnFixture(h.world!)!;
    const first = kit('kit', 0, next.id, 'third');
    const [chosen, duplicate] = await Promise.all([h.handle(first), h.handle(first)]);
    expect(chosen.ok, chosen.error).toBe(true);
    expect(duplicate).toBe(chosen);
    expect(h.world!.revision).toBe(1);
    expect(h.world!.receiptIds.filter((id) => id === 'kit')).toHaveLength(1);
    expect(chosen.view!.world.kitChoice).toEqual({ fixtureId: next.id, role: 'third' });
    // The owner decision's save builds a validated checkpoint that restores the choice.
    await h.handle(req('save', -1, { type: 'save' }));
    const checkpoint = await build(jobs[0]);
    if (!checkpoint.ok) throw new Error(checkpoint.error);
    expect((await decode(checkpoint.raw)).world.kitChoice).toEqual(h.world!.kitChoice);
    // Back to automatic, then the first request again: its stored answer, never a second effect.
    expect((await h.handle(kit('auto', 1, next.id, null))).ok).toBe(true);
    expect(await h.handle(first)).toBe(chosen);
    expect(h.world!.kitChoice).toBeUndefined();
    expect(h.world!.revision).toBe(2);
  });
  it('stale kit request does not overwrite newer work', async () => {
    const h = new Host();
    await h.handle(req('create', -1, { type: 'found', input }));
    const w = h.world!;
    const next = nextOwnFixture(w)!;
    expect((await h.handle(kit('newer', 0, next.id, 'away'))).ok).toBe(true);
    const before = canonical(w);
    // Chosen against revision 0, it arrives after the newer choice.
    const stale = await h.handle(kit('stale', 0, next.id, 'third'));
    expect(stale.ok).toBe(false);
    expect(stale.error).toContain('오래된 요청');
    // At the current revision but naming a later fixture: refused, never moved to another match.
    const later = w.fixtures.find(
      (f) => !f.score && f.id !== next.id && (f.home === w.playerClub || f.away === w.playerClub),
    )!;
    const moved = await h.handle(kit('later', 1, later.id, 'third'));
    expect(moved.ok).toBe(false);
    expect(moved.error).toContain(KIT_FIXTURE_CHANGED);
    expect(canonical(w)).toBe(before);
    expect(w.kitChoice).toEqual({ fixtureId: next.id, role: 'away' });
    expect(w.receiptIds.filter((id) => id === 'stale' || id === 'later')).toEqual([]);
  });
});

describe('durable milestone projection', () => {
  it('keeps earlier preparation and a cup win when recent UI records no longer contain either', async () => {
    const host = new Host();
    await host.handle(req('milestone-found', -1, { type: 'found', input }));
    // A cup win, then thirty cup matches without one: built once and cached.
    const {
      world: played,
      won,
      losses,
    } = cachedWorld('cup-win-then-losses', () => {
      const world = createWorld(input);
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
      return { world, won, losses };
    });
    playOn(host, played);
    const world = host.world!;
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

describe('career view projection', () => {
  it('omits lifetime registry in views, preserves canonical export and leaves revision and draws unchanged', async () => {
    const h = new Host();
    const found = await h.handle(req('career-found', -1, { type: 'found', input }));
    expect(found.view!.world.people).toBeUndefined();
    expect(Object.keys(found.view!.careers).length).toBeGreaterThan(0);
    const before = canonical(h.world!),
      revision = h.world!.revision;
    const exported = await h.handle(req('career-export', revision, { type: 'export' }));
    expect(exported.view!.world.people).toBeUndefined();
    expect(canonical(h.world!)).toBe(before);
    const saved = await decode(exported.raw!);
    expect(Object.keys(saved.world.people!).sort()).toEqual(Object.keys(h.world!.people!).sort());
    expect(canonical(saved.world.people)).toBe(canonical(h.world!.people));
    expect(h.world!.revision).toBe(revision);
  });
});

describe('retained recruitment decision reads', () => {
  it('bounds resolved decisions in views, reads full history and previews without changing canonical state', async () => {
    const { detectMediations, resolveMediation } =
      await import('../../../../packages/engine/src/mediation');
    const { transferOffers, managerCandidates } =
      await import('../../../../packages/engine/src/index');
    const { lineOf } = await import('../../../../packages/engine/src/player');
    const h = new Host();
    await h.handle(req('mediation-found', -1, { type: 'found', input }));
    const w = h.world!;
    w.settings!.responsibilities.recruitment = 'direct';
    for (let i = 0; i < 23; i++) {
      const candidate = transferOffers(w).find(
        (o) => o.available && lineOf(o.player.position) === 'MF',
      )!;
      w.shortlist = {
        year: w.year,
        day: 0,
        entries: [{ playerId: candidate.player.id, line: 'MF' }],
        requests: [{ kind: 'short', line: 'MF', pick: candidate.player.id }],
      };
      w.cash = '0';
      detectMediations(w);
      resolveMediation(w, w.mediations!.at(-1)!.id, 'director');
      w.cash = '999999999999999';
      operate(w, { type: 'hire', id: managerCandidates(w).find((m) => m.source === 'club')!.id });
    }
    w.cash = '0';
    detectMediations(w);
    const response = await h.handle(
      req('bounded-mediations', w.revision, { type: 'command', command: { type: 'read-inbox' } }),
    );
    expect(w.mediations).toHaveLength(24);
    expect(response.view!.world.mediations).toHaveLength(21);
    const before = canonical(w);
    const history = await h.handle(req('all-mediations', -1, { type: 'recruitment-history' }));
    expect(history.recruitmentHistory!.mediations).toHaveLength(24);
    expect(history.view).toBeUndefined();
    const preview = await h.handle(
      req('preview-mediation', -1, {
        type: 'mediation-preview',
        id: w.mediations!.at(-1)!.id,
        support: 'balanced',
      }),
    );
    expect(preview.mediationPreview).toBeDefined();
    expect(canonical(w)).toBe(before);
  });
});

it('consumes only an exact validated inspection without sharing a live world or reusing changed bytes', async () => {
  const { createWorld } = await import('../../../../packages/engine/src/index');
  const source = createWorld(input),
    raw = await encode(source),
    host = new Host();
  const persistence = await import('../adapters/persistence');
  const spy = vi.spyOn(persistence, 'decode');
  try {
    const inspected = await host.handle(req('inspect-once', -1, { type: 'inspect', raw }));
    expect(inspected.ok).toBe(true);
    inspected.candidate!.cash = '0';
    const metadata = await host.handle(
      req('inspect-metadata', -1, { type: 'inspect', raw, metadataOnly: true }),
    );
    expect(metadata.worldMetadata).toEqual({ id: source.id, revision: source.revision });
    expect(metadata.candidate).toBeUndefined();
    metadata.worldMetadata!.revision = 999;
    const activated = await host.handle(
      req('activate-inspected', -1, { type: 'inspect', raw, activate: true }),
    );
    expect(activated.ok).toBe(true);
    expect(activated.candidate).toBeUndefined();
    expect(canonical(host.world)).toBe(canonical(source));
    expect(spy).toHaveBeenCalledTimes(1);
    host.world!.cash = '123';
    const fresh = await host.handle(req('inspect-original', 0, { type: 'inspect', raw }));
    expect(fresh.candidate!.cash).toBe(source.cash);
    expect(spy).toHaveBeenCalledTimes(2);
    const corrupt = JSON.stringify({ ...JSON.parse(raw), checksum: '0'.repeat(64) });
    expect(
      (
        await host.handle(
          req('changed-bytes', 0, { type: 'inspect', raw: corrupt, activate: true }),
        )
      ).ok,
    ).toBe(false);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(host.world!.cash).toBe('123');
  } finally {
    spy.mockRestore();
  }
});
