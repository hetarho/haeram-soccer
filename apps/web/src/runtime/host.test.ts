import { squadPlayer } from './clubProfile';
import { squad } from '../../../../packages/engine/src/world';
import { WORLD_VIEW_FIELDS, projectWorldFacts } from './worldProjection';
import { initializeReadModels } from '../../../../packages/engine/src/read-models';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import { signSponsor, sponsorSlots } from '../../../../packages/engine/src/sponsors';
import { describe, it, expect } from 'vitest';
import { Host, VIEW_PATCH, type OpenStore } from './host';
import { applyViewDelta, type View } from './protocol';
import type { RecordStore } from '../../../../packages/contracts/src/record-store';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { canonical } from '../../../../packages/contracts/src/index';
import { roundTrip } from '../../../../tests/fixtures/save-roundtrip';
import { currentDay, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import {
  operate,
  simulateMatch,
  recordMatch,
  addEvent,
  clubNews,
  advanceRound,
  identityOf,
  UnreleasedMatchModelError,
} from '../../../../packages/engine/src/index';
import type { GameSettings, World } from '../../../../packages/contracts/src/types';
import { MATCH_MODEL_REVISION } from '../../../../packages/contracts/src/match-model';
import type { KitRole } from '../../../../packages/contracts/src/identity';
import { PRIOR_CATALOG_HASHES } from '../../../../packages/contracts/src/versions';
import { CATALOG_VERSION } from '../../../../packages/catalogs/src/index';
import { KIT_FIXTURE_CHANGED } from '../../../../packages/engine/src/identity-operations';
import { legacyCrestMap } from '../../../../packages/engine/src/identity-legacy';
import { staffAuthority } from '../../../../packages/engine/src/testing';
import { npcCompetition, trackingBoundary } from '../../../../packages/engine/src/npc-stats';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { ENABLED_RELEASE } from '../../../../tests/fixtures/releases';
import {
  onPreviousRevision,
  PREVIOUS_REVISION,
  withoutMatchModel,
} from '../../../../tests/fixtures/earlier-saves';
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { simulatedWorld, withoutManagerHistory } from '../../../../tests/fixtures/worlds';
import {
  gameHost,
  input,
  loadWorld,
  playOn,
  req,
  savedWorld,
  startedHost,
  startedWorld,
} from './host.testkit';
import { HelperPool, type HelperJob, type HelperPort } from './helperPool';
import { createFixtureHelper, serve as serveHelper } from './fixtureHelper';
import { persistedFixturePlayer } from '../../../../packages/engine/src/player-fixtures.testkit';
import { joinFreeAgents } from '../../../../packages/engine/src/free-agents';
/**
 * A host whose games' databases are in memory and outlive it (→SAVE-2), with `reopened`: the world
 * a new host opens from a game's database, as a reloaded page would.
 */
function withDatabase(progress?: ConstructorParameters<typeof Host>[0]) {
  const files = new Map<string, RecordStore>();
  const openStore: OpenStore = (gameId, { create }) => {
    let store = files.get(gameId);
    if (!store && create) files.set(gameId, (store = { ...memoryRecordStore(), close() {} }));
    return store;
  };
  const host = new Host(progress, { openStore });
  const reopened = async (gameId = 'game') => {
    const next = new Host(undefined, { openStore });
    const opened = await next.handle(req('open', -1, { type: 'open-game', gameId }));
    if (!opened.ok) throw new Error(opened.error);
    return next.world!;
  };
  const create = (gameId = 'game') =>
    host.handle(req('create', host.world!.revision, { type: 'create-game', gameId }));
  return { host, reopened, create };
}
describe('worker command protocol', () => {
  it('never projects persisted squads onto the UI thread', async () => {
    const { host, reply } = await startedHost();
    expect(Object.keys(host.world!.squads!).length).toBeGreaterThan(0);
    expect(reply.view!.world).not.toHaveProperty('squads');
    expect(reply.view!.world.clubs.every((club) => Number.isFinite(club.rating))).toBe(true);
  });
  it('resolves own, full squad, free, retired and representative player-profile reads without publishing records', async () => {
    const { host } = await startedHost();
    const w = host.world!;
    const [club, squadPlayers] = Object.entries(w.squads!)[0]!;
    const live = squadPlayers.at(-1)!;
    const free = { ...structuredClone(live), id: 'profile-free', freeSince: w.year };
    const retired = { ...structuredClone(live), id: 'profile-retired' };
    w.freeAgents = [free];
    w.playerRecords = {
      [retired.id]: {
        moves: [],
        linked: true,
        lines: [{ year: w.year - 1, club, appearances: 1, goals: 0, assists: 0 }],
        retired: { year: w.year - 1, club, profile: retired },
      },
    };
    const representative = w.clubs.find((c) => c.representative)!;
    const rep = squad(w, representative)[0]!;
    for (const [id, kind] of [
      [w.players[0]!.id, 'own'],
      [live.id, 'squad'],
      [free.id, 'free'],
      [retired.id, 'retired'],
      [rep.id, 'representative'],
    ] as const) {
      const reply = await host.handle(
        req(`profile-${kind}`, -1, {
          type: 'player-profile',
          world: w.id,
          playerId: id,
          clubId: w.playerClub,
        }),
      );
      expect(reply.ok, reply.error).toBe(true);
      expect(reply.playerProfile).toEqual(squadPlayer(w, id, w.playerClub));
      expect(reply.playerProfile!.kind).toBe(kind);
      expect(reply.view).toBeUndefined();
    }
    const missing = await host.handle(
      req('profile-missing', -1, {
        type: 'player-profile',
        world: w.id,
        playerId: 'unknown-player',
      }),
    );
    expect(missing.ok).toBe(false);
    expect(projectWorldFacts(w)).not.toHaveProperty('playerRecords');
  });
  it('classifies every World key before projection', async () => {
    const { host } = await startedHost();
    expect(Object.keys(host.world!).every((key) => Object.hasOwn(WORLD_VIEW_FIELDS, key))).toBe(
      true,
    );
    expect(() => projectWorldFacts({ ...host.world!, futureField: [] } as World)).toThrow();
  });
  it('serializes commands, returns duplicate acknowledgment and rejects stale/session requests', async () => {
    const { host: h } = await startedHost();
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
  it('accepts legacy stop hints on a clock command and refuses a withdrawn command', async () => {
    const { host: h } = await startedHost();
    // Settle unrelated sponsor decisions before testing an allowed clock command.
    for (const slot of sponsorSlots(h.world!))
      if (slot.offers.length) signSponsor(h.world!, slot.slot, 0);
    // Legacy stop hints remain accepted; live decisions determine actual stops.
    const step = await h.handle(
      req('step', 0, {
        type: 'command',
        command: { type: 'advance-days', days: 1, stop: ['match', 'window-open'] },
      }),
    );
    expect(step.ok).toBe(true);
    const settings = structuredClone(h.world!.settings);
    // The intervention level is withdrawn (→WEB-45): only 위임 설정 changes who decides.
    expect(
      (
        await h.handle(
          req('withdrawn', 1, {
            type: 'command',
            command: { type: 'intervention', level: 4 } as never,
          }),
        )
      ).ok,
    ).toBe(false);
    expect(h.world!.settings).toEqual(settings);
  });
  it('validates commands before applying money or revisions and keeps complete archives behind projections', async () => {
    const { host: h, reply: started } = await startedHost();
    const cash = h.world!.cash;
    expect(
      (
        await h.handle(
          req('bad', 0, {
            type: 'command',
            command: { type: 'sign-sponsor', slot: 'local', offer: -1 },
          }),
        )
      ).ok,
    ).toBe(false);
    expect(h.world!.cash).toBe(cash);
    expect(h.world!.revision).toBe(0);
    const r = await h.handle(req('read', 0, { type: 'archive', year: 1901 }));
    expect(r.archive?.matches).toEqual([]);
    expect(r.view).toBeUndefined();
    expect(started.view?.world.fixtures.length).toBeLessThan(h.world!.fixtures.length);
  });
  it('ends a multi-day step on the day news arrives or our match is played', async () => {
    const { host: h } = await startedHost();
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
    const { host: h } = await startedHost();
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
    const { host: h } = await startedHost();
    // Explicit quiet authority fixture: this tests date persistence, not automatic hiring.
    h.world!.settings = staffAuthority(2);
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
  it('publishes only the view parts that changed since the view the client holds (→ARCH-6)', async () => {
    const { host: h, reply: founded } = await startedHost();
    expect(founded.view).toBeDefined();
    expect(founded.viewDelta).toBeUndefined();
    h.world!.settings = staffAuthority(2);
    for (const slot of sponsorSlots(h.world!))
      if (slot.offers.length) signSponsor(h.world!, slot.slot, 0);
    const day = await h.handle({
      ...req('day', h.world!.revision, {
        type: 'command',
        command: { type: 'advance-days', days: 1 },
      }),
      viewBase: founded.viewSeq,
    });
    expect(day.ok, day.error).toBe(true);
    expect(day.view).toBeUndefined();
    const delta = day.viewDelta!;
    expect(delta.base).toBe(founded.viewSeq);
    // A day moves the date and leaves the season's settled parts where they were.
    expect(delta.world.calendar?.day).toBe(1);
    expect(delta.world).not.toHaveProperty('history');
    expect(delta.world).not.toHaveProperty('clubs');
    const rebuilt = applyViewDelta(structuredClone(founded.view!), structuredClone(delta));
    // Rebuilt on its base, the delta is the whole view the host would publish now.
    const whole = (h as unknown as { view(): View }).view();
    expect(canonical(rebuilt)).toBe(canonical(structuredClone(whole)));
    // A base the host no longer remembers also gets the whole view.
    const stale = await h.handle({
      ...req('stale', h.world!.revision, { type: 'command', command: { type: 'read-inbox' } }),
      viewBase: 999,
    });
    expect(stale.view).toBeDefined();
    expect(stale.viewDelta).toBeUndefined();
  });
  it("sends an own match day's clubs and discipline as patches that rebuild the same view (→ARCH-6)", async () => {
    const { host: h, reply: founded } = await startedHost();
    // Every business is delegated, so no decision stops the days before our first match.
    h.world!.settings = {
      ...settingsOf(h.world!),
      responsibilities: Object.fromEntries(
        RESPONSIBILITY_KEYS.map((key) => [key, 'delegated']),
      ) as GameSettings['responsibilities'],
    };
    // The client holds structured clones, as the worker's messages give it.
    let held = structuredClone(founded.view!),
      seq = founded.viewSeq;
    for (let day = 0; day < 40; day++) {
      const matches = h.world!.ownMatches.length;
      const reply = await h.handle({
        ...req(`day-${day}`, h.world!.revision, {
          type: 'command',
          command: { type: 'advance-days', days: 1 },
        }),
        viewBase: seq,
      });
      expect(reply.ok, reply.error).toBe(true);
      const delta = structuredClone(reply.viewDelta!);
      const rebuilt = applyViewDelta(held, delta);
      const whole = (h as unknown as { view(): View }).view();
      expect(canonical(rebuilt)).toBe(canonical(structuredClone(whole)));
      [held, seq] = [rebuilt, reply.viewSeq];
      // The first match day creates the season's discipline; the second only changes it.
      if (h.world!.ownMatches.length === matches || h.world!.ownMatches.length < 2) continue;
      for (const key of ['world.clubs', 'world.discipline']) {
        const patch = delta.patches?.[key];
        expect(patch, key).toBeDefined();
        const value = whole.world[key.slice(6) as 'clubs' | 'discipline'];
        expect(JSON.stringify(patch).length).toBeLessThanOrEqual(
          JSON.stringify(value).length * VIEW_PATCH.maxShare,
        );
      }
      expect(delta.world).not.toHaveProperty('clubs');
      return;
    }
    throw new Error('no second own match in 40 days');
  });
  it('blocks automatic progression before applying days when a critical alert is pending', async () => {
    const { host: h } = await startedHost();
    h.world!.critical = '감독 확인';
    const result = await h.handle(
      req('days', 0, { type: 'command', command: { type: 'advance-days', days: 3 } }),
    );
    expect(result.ok).toBe(false);
    expect(h.world!.calendar?.day).toBe(0);
    expect(h.world!.revision).toBe(0);
  });
  it('saves the current world and revision in its database, whatever revision the client saw', async () => {
    const { host: h, create, reopened } = withDatabase();
    await startedHost(undefined, undefined, h);
    expect((await create()).ok).toBe(true);
    await h.handle(req('days', 0, { type: 'command', command: { type: 'advance-days', days: 2 } }));
    const revision = h.world!.revision;
    expect(revision).toBeGreaterThan(0);
    const saving = await h.handle(req('save', -1, { type: 'save' }));
    expect(saving.ok).toBe(true);
    expect(saving.view).toBeUndefined();
    expect(saving.saved).toEqual({ gameId: 'game', worldId: h.world!.id, revision });
    const saved = await reopened();
    expect(saved.revision).toBe(revision);
    expect(
      Object.keys(saved).filter(
        (key) =>
          canonical(saved[key as keyof typeof saved]) !==
          canonical(h.world![key as keyof typeof saved]),
      ),
    ).toEqual([]);
    // Nothing is saved without a world or its database.
    expect((await new Host().handle(req('none', -1, { type: 'save' }))).ok).toBe(false);
    const { host: unopened } = await startedHost();
    expect((await unopened.handle(req('save', 0, { type: 'save' }))).ok).toBe(false);
  });
  it('saves a restorable game when next-match progression is cancelled between days', async () => {
    const {
      host: h,
      create,
      reopened,
    } = withDatabase(() => {
      h.cancelled = true;
    });
    await startedHost(undefined, undefined, h);
    await create();
    const result = await h.handle(
      req('match', 0, { type: 'command', command: { type: 'next-match' } }),
    );
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.view?.world.calendar?.day).toBe(1);
    expect(result.view?.world.ownMatches).toHaveLength(0);
    expect((await h.handle(req('save', -1, { type: 'save' }))).ok).toBe(true);
    const restored = await reopened();
    expect(restored.calendar?.day).toBe(1);
    expect(restored.receiptIds).toContain('match');
  });
  it('projects the complete own league schedule and round results without unrelated leagues', async () => {
    const { host: h } = await startedHost();
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
  it('simulates a fast season without sending empty observation playback', async () => {
    const { host: h } = await startedHost();
    const year = h.world!.year;
    // The season command plays every round as `advanceRound(w, undefined, false)`: the first 45
    // are built once, the last and the close run here through the command.
    playOn(
      h,
      cachedWorld('rich-45-rounds-takeover', () => {
        const w = startedWorld();
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
    expect(result.view?.world.year).toBe(year + 1);
    expect(result.view?.world.history).toHaveLength(1);
    expect(h.world!.ownMatches.some((m) => m.year === year && m.players.length > 0)).toBe(true);
  });
});

describe('next-fixture kit requests (→KIT-6, SAVE-6)', () => {
  const kit = (id: string, revision: number, fixtureId: string, role: KitRole | null) =>
    req(id, revision, { type: 'command', command: { type: 'match-kit', fixtureId, role } });
  it('duplicate kit receipt has one effect and the saved game keeps the choice', async () => {
    const { host: h, create, reopened } = withDatabase();
    await startedHost(undefined, undefined, h);
    await create();
    const next = nextOwnFixture(h.world!)!;
    const first = kit('kit', 0, next.id, 'third');
    const [chosen, duplicate] = await Promise.all([h.handle(first), h.handle(first)]);
    expect(chosen.ok, chosen.error).toBe(true);
    expect(duplicate).toBe(chosen);
    expect(h.world!.revision).toBe(1);
    expect(h.world!.receiptIds.filter((id) => id === 'kit')).toHaveLength(1);
    expect(chosen.view!.world.kitChoice).toEqual({ fixtureId: next.id, role: 'third' });
    // The owner decision's save commits the choice, which the reopened game keeps.
    await h.handle(req('save', -1, { type: 'save' }));
    expect((await reopened()).kitChoice).toEqual(h.world!.kitChoice);
    // Back to automatic, then the first request again: its stored answer, never a second effect.
    expect((await h.handle(kit('auto', 1, next.id, null))).ok).toBe(true);
    expect(await h.handle(first)).toBe(chosen);
    expect(h.world!.kitChoice).toBeUndefined();
    expect(h.world!.revision).toBe(2);
  });
  it('stale kit request does not overwrite newer work', async () => {
    const { host: h } = await startedHost();
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

/** A supported career saved before club identities: no designs, no recorded appearances. */
function withoutIdentities(w: World) {
  for (const club of w.clubs) delete club.identity;
  for (const match of w.ownMatches) delete match.appearance;
  return w;
}
/** A career saved before club identities, on today's match model. */
const preIdentity = (span?: { rounds: number }) => withoutIdentities(simulatedWorld(input, span));

describe('supported-career persisted squad adoption', () => {
  it('saves founded squads only on writer activation', async () => {
    const legacy = startedWorld();
    delete legacy.squads;
    const h = gameHost();
    const written = await loadWorld(h, 'squad-writer', legacy);
    expect(written.ok, written.error).toBe(true);
    expect(written.upgraded).toBe(true);
    expect(h.world!.squads).toBeDefined();
    expect(savedWorld(h).squads).toEqual(h.world!.squads);
    const again = gameHost();
    const reloaded = await loadWorld(again, 'squad-again', savedWorld(h));
    expect(reloaded.ok, reloaded.error).toBe(true);
    expect(reloaded.upgraded).toBeUndefined();
  });
});

describe('supported-career identity adoption (→SAVE-21, KIT-15)', () => {
  it('writer adoption preserves exact legacy crests and sporting facts', async () => {
    const legacy = preIdentity({ rounds: 2 });
    expect(legacy.ownMatches.length).toBeGreaterThan(0);
    const crests = legacyCrestMap({ ...legacy, clubs: legacy.clubs.slice() });
    // On today's model, so the designs are the only upgrade; the next case adds the model.
    const h = gameHost();
    const reply = await loadWorld(h, 'adopt', legacy);
    expect(reply.ok, reply.error).toBe(true);
    expect(reply.upgraded).toBe(true);
    const w = h.world!;
    expect(w.revision).toBe(legacy.revision + 1);
    for (const club of w.clubs) {
      expect(club.identity!.crest).toEqual(crests.get(club.id));
      expect(club.identity).toEqual(identityOf(legacy, club.id));
      expect(club.identity!.colours[0]).toBe(club.color);
    }
    // Nothing else moves: colours, sporting facts and the absence of every historical kit stay.
    expect(w.ownMatches.every((m) => !('appearance' in m))).toBe(true);
    expect(
      canonical({
        ...w,
        revision: legacy.revision,
        newsJournal: undefined,
        careerReads: undefined,
        clubs: w.clubs.map((club) => ({ ...club, identity: undefined })),
      }),
    ).toBe(canonical(legacy));
    // The database holds the adopted world.
    expect(canonical(savedWorld(h))).toBe(canonical(w));
    const again = gameHost();
    const repeat = await loadWorld(again, 'again', savedWorld(h));
    expect(repeat.ok, repeat.error).toBe(true);
    expect(repeat.upgraded).toBeUndefined();
    expect(canonical(again.world)).toBe(canonical(w));
  });

  it('moves the revision once whatever upgrades together, and never past a safe integer', async () => {
    const pinned = withoutMatchModel(preIdentity());
    pinned.revision = 9;
    pinned.catalog = '2026-demo-2';
    pinned.catalogHash = PRIOR_CATALOG_HASHES['2026-demo-2'];
    // With the release on, the full model is one more upgrade in the same writer activation.
    const h = gameHost({ release: ENABLED_RELEASE });
    const both = await loadWorld(h, 'both', pinned);
    expect(both.ok, both.error).toBe(true);
    expect(both.upgraded).toBe(true);
    expect(h.world!.revision).toBe(10);
    expect(h.world!.catalog).toBe(CATALOG_VERSION);
    expect(h.world!.clubs.every((club) => club.identity)).toBe(true);
    expect(h.world!.matchModel?.activated.revision).toBe(10);
    const top = preIdentity();
    top.revision = Number.MAX_SAFE_INTEGER;
    const full = gameHost({ release: ENABLED_RELEASE });
    const refused = await loadWorld(full, 'top', top);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('revision');
    expect(full.world).toBeUndefined();
  });

  it('leaves earlier gameplay and future designs to their compatibility rules', async () => {
    const earlier = preIdentity();
    earlier.engine = '3.0.0';
    const future = simulatedWorld(input);
    future.clubs[0].identity = { ...future.clubs[0].identity!, version: 3 as 2 };
    for (const world of [earlier, future]) {
      const h = gameHost();
      const reply = await loadWorld(h, 'incompatible', world);
      expect(reply.ok).toBe(false);
      expect(reply.errorCode).toBe('save-compatibility');
      expect(h.world).toBeUndefined();
    }
  });
});

describe('durable milestone projection', () => {
  it('keeps a cup win when recent UI records no longer contain it', async () => {
    const { host } = await startedHost();
    // A cup win, then thirty cup matches without one: one real cup match recorded as played, its
    // score forced to a win, then thirty copies of its record with a forced defeat. Built once and
    // cached.
    const {
      world: played,
      won,
      losses,
    } = cachedWorld('cup-win-then-forced-losses-takeover', () => {
      const world = startedWorld();
      const fixture = nextOwnFixture(world)!;
      recordMatch(
        world,
        simulateMatch(world, { ...fixture, id: 'milestone-cup-0', kind: 'cup' }, false),
      );
      const recorded = world.ownMatches.at(-1)!;
      const home = recorded.home === world.playerClub;
      const forced = (own: number, other: number) =>
        home ? { home: own, away: other } : { home: other, away: own };
      recorded.score = forced(1, 0);
      for (let i = 1; i <= 30; i++)
        world.ownMatches.push({
          ...structuredClone(recorded),
          id: `milestone-cup-${i}`,
          score: forced(0, 1),
        });
      const margins = world.ownMatches.map((match) =>
        match.home === world.playerClub
          ? match.score.home - match.score.away
          : match.score.away - match.score.home,
      );
      return {
        world,
        won: margins[0]! > 0,
        losses: margins.slice(1).filter((margin) => margin <= 0).length,
      };
    });
    playOn(host, played);
    const world = host.world!;
    expect(won).toBe(true);
    expect(losses).toBe(30);
    for (let i = 0; i < 160; i++) addEvent(world, 'fixture-note', '기록 보관', '후속 기록');
    const reply = await host.handle(
      req('milestone-read', world.revision, { type: 'command', command: { type: 'read-inbox' } }),
    );
    expect(reply.ok).toBe(true);
    expect(reply.view!.world.ownMatches).toHaveLength(30);
    expect(
      reply.view!.world.ownMatches.some(
        (match) =>
          (match.home === world.playerClub
            ? match.score.home - match.score.away
            : match.score.away - match.score.home) > 0,
      ),
    ).toBe(false);
    expect(reply.view!.milestones.goals.find((goal) => goal.id === 'first-win')?.done).toBe(true);
    expect(world.ownMatches).toHaveLength(31);
  });
});

describe('career view projection', () => {
  it('omits lifetime registry in views, preserves the saved career and leaves revision and draws unchanged', async () => {
    const { host: h, reply: started } = await startedHost();
    const held = persistedFixturePlayer(h.world!)!;
    expect(joinFreeAgents(h.world!, held.player, h.world!.year)).toBe(true);
    expect(started.view!.world.people).toBeUndefined();
    // The free-agent pool stays on the worker too (→CLUB-49), and in the save.
    expect(h.world!.freeAgents!.length).toBeGreaterThan(0);
    expect(started.view!.world).not.toHaveProperty('freeAgents');
    const before = canonical(h.world!),
      revision = h.world!.revision;
    const saved = roundTrip(h.world!);
    expect(canonical(h.world!)).toBe(before);
    expect(Object.keys(saved.people!).sort()).toEqual(Object.keys(h.world!.people!).sort());
    expect(canonical(saved.people)).toBe(canonical(h.world!.people));
    expect(canonical(saved.freeAgents)).toBe(canonical(h.world!.freeAgents));
    expect(h.world!.revision).toBe(revision);
  });
});

describe('complete statistics reads (→WEB-89, HIST-17)', () => {
  it('keeps the season ledger out of views and reads one competition on request', async () => {
    const { host: h } = await startedHost();
    const w = h.world!;
    const f = w.fixtures.find(
      (x) => x.kind === 'league' && x.home !== w.playerClub && x.away !== w.playerClub,
    )!;
    const scope = { type: 'full-stats', kind: 'league', groupKey: f.groupKey } as const;
    // A career on the pre-feature model keeps no ledger: the read answers with nothing, not zeros.
    const ledger = w.npcSeason;
    expect(ledger).toBeDefined();
    delete w.npcSeason;
    const none = await h.handle(req('full-none', w.revision, scope));
    expect(none).toMatchObject({ ok: true });
    expect(none.fullStats).toBeUndefined();
    w.npcSeason = ledger;
    const played = simulateMatch(w, f);
    f.score = played.record.score;
    recordMatch(w, played, true);
    const before = canonical(w);
    const read = await h.handle(req('full-read', w.revision, scope));
    expect(read.view).toBeUndefined();
    expect(read.fullStats!.competition).toEqual(npcCompetition(w.npcSeason, f));
    expect(read.fullStats!.competition.clubs.map((c) => c.club)).toEqual([f.home, f.away]);
    expect(canonical(w)).toBe(before);
    // A published view carries the model metadata, never the ledger itself.
    const view = await h.handle(
      req('full-view', w.revision, { type: 'command', command: { type: 'read-inbox' } }),
    );
    expect(view.view!.world.matchModel).toEqual(w.matchModel);
    expect(view.view!.world).not.toHaveProperty('npcSeason');
  });
});

describe('retained recruitment decision reads', () => {
  it('bounds resolved decisions in views, reads full history and previews without changing canonical state', async () => {
    const { detectMediations, resolveMediation } =
      await import('../../../../packages/engine/src/mediation');
    const { transferOffers, managerCandidates } =
      await import('../../../../packages/engine/src/index');
    const { lineOf } = await import('../../../../packages/engine/src/player');
    const { host: h } = await startedHost();
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

describe('prospective match-model activation (→SAVE-23)', () => {
  const enabled = () => gameHost({ release: ENABLED_RELEASE });
  const load = (host: Host, id: string, world: World) => loadWorld(host, id, world);
  const round = (host: Host, id: string) =>
    host.handle(
      req(id, host.world!.revision, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
  /** The career's facts apart from the model, its ledger and the revision. */
  const settled = (w: World) => {
    const { matchModel: _model, npcSeason: _season, revision: _revision, ...rest } = w;
    void [_model, _season, _revision];
    return canonical(rest);
  };
  /**
   * A supported career saved before the full model (no model data, `withoutMatchModel`):
   * mid-season with two own results settled; the next round plays an own match.
   */
  const career = () => {
    const w = withoutMatchModel(simulatedWorld(input, { rounds: 3 }));
    initializeReadModels(w);
    return w;
  };

  it('a career without a match model or on an earlier revision activates the released model on load before any fixture is played', async () => {
    for (const [label, source] of [
      ['none', career()],
      ['earlier', onPreviousRevision(simulatedWorld(input, { rounds: 2 }))],
    ] as const) {
      const host = enabled();
      const reply = await load(host, `released-${label}`, source);
      expect(reply.ok, reply.error).toBe(true);
      expect(reply.upgraded).toBe(true);
      // The writer load moves it before the next fixture: nothing has been played since.
      expect(host.world!.round).toBe(source.round);
      expect(host.world!.matchModel!.revision).toBe(MATCH_MODEL_REVISION);
      expect(host.world!.npcSeason!.model).toBe(MATCH_MODEL_REVISION);
      expect(canonical(savedWorld(host))).toBe(canonical(host.world!));
      const played = await round(host, `released-${label}-next`);
      expect(played.ok, played.error).toBe(true);
      expect(played.playback!.record.model).toBe(MATCH_MODEL_REVISION);
      expect(played.playback!.record.material).toBeDefined();
      expect(played.playback!.script).toBeDefined();
      expect(played.playback!.staging).toBeDefined();
    }
    // A fixture asked of a world still on an earlier model is refused by name, never played on
    // a path that no longer exists.
    const earlier = onPreviousRevision(simulatedWorld(input, { rounds: 2 }));
    expect(() => simulateMatch(earlier, nextOwnFixture(earlier)!)).toThrow(
      UnreleasedMatchModelError,
    );
    const none = career();
    expect(() => simulateMatch(none, nextOwnFixture(none)!)).toThrow(UnreleasedMatchModelError);
  });

  it('its settled matches keep their records and labels and replay from the record alone', async () => {
    const source = onPreviousRevision(simulatedWorld(input, { rounds: 2 }));
    expect(source.ownMatches.length).toBeGreaterThan(0);
    const host = enabled();
    const reply = await load(host, 'released-labels', source);
    expect(reply.upgraded).toBe(true);
    // Every settled own match keeps its record and the revision that settled it.
    expect(canonical(host.world!.ownMatches)).toBe(canonical(source.ownMatches));
    expect(host.world!.ownMatches.every((m) => m.model === PREVIOUS_REVISION)).toBe(true);
    // An archived replay reads the record alone, no engine or model code (→WEB-23): its goals
    // are the record's goal highlights, which give back the settled score.
    const goal = sourceMessage('copy.summary.68a6cf8ed8');
    for (const match of host.world!.ownMatches) {
      const goals = match.highlights.filter((h) => h.action === goal);
      expect(goals.filter((h) => h.side === 0).length, match.id).toBe(match.score.home);
      expect(goals.filter((h) => h.side === 1).length, match.id).toBe(match.score.away);
    }
  });

  it('activates supported careers only prospectively', async () => {
    const source = career();
    const host = enabled();
    const reply = await load(host, 'model-activate', source);
    expect(reply.ok, reply.error).toBe(true);
    expect(reply.upgraded).toBe(true);
    const w = host.world!;
    // One writer upgrade: the revision moves once and the model names it.
    expect(w.revision).toBe(source.revision + 1);
    expect(w.matchModel).toEqual({
      revision: MATCH_MODEL_REVISION,
      activated: { year: source.year, day: currentDay(source), revision: source.revision + 1 },
      trackedFrom: trackingBoundary(source),
      coverage: 'activation',
    });
    expect(w.npcSeason!.competitions).toEqual([]);
    // Nothing settled is replayed, rewritten or backfilled.
    expect(settled(w)).toBe(settled(source));
    // It is written to the database with its model data, validated as any game opens (→SAVE-23/24).
    expect(canonical(savedWorld(host))).toBe(canonical(w));
    // Loading it again keeps the recorded boundary and writes nothing.
    const again = enabled();
    const reloaded = await load(again, 'model-reload', savedWorld(host));
    expect(reloaded.upgraded).toBeUndefined();
    expect(canonical(again.world)).toBe(canonical(w));
    // New results carry the model; the earlier ones stay as settled.
    expect((await round(again, 'model-round')).ok).toBe(true);
    const added = again.world!.ownMatches.slice(source.ownMatches.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.model === MATCH_MODEL_REVISION)).toBe(true);
    expect(canonical(again.world!.ownMatches.slice(0, source.ownMatches.length))).toBe(
      canonical(source.ownMatches),
    );
    // A takeover tracks from its first day, the career's founding moment (→OWNER-4).
    const { host: taker } = await startedHost(undefined, undefined, enabled());
    expect(taker.world!.matchModel).toMatchObject({
      revision: MATCH_MODEL_REVISION,
      coverage: 'founding',
      activated: { year: taker.world!.year, day: 0 },
    });
  });

  it('keeps the original rows when it fails and refuses a future model', async () => {
    const source = career();
    const host = enabled();
    const reply = await load(host, 'model-write', source);
    expect(reply.upgraded).toBe(true);
    // The database holds the activated career; a retry from the original activates at the same
    // boundary.
    expect(canonical(savedWorld(host))).toBe(canonical(host.world));
    const retry = enabled();
    await load(retry, 'model-retry', source);
    expect(canonical(retry.world)).toBe(canonical(host.world));
    // A future model stays a compatibility failure, never activated over.
    const future = await load(retry, 'model-future', {
      ...source,
      matchModel: { ...host.world!.matchModel!, revision: 'continuous-aggregate-11' },
    } as unknown as World);
    expect(future.ok).toBe(false);
    expect(future.errorCode).toBe('save-compatibility');
    expect(canonical(retry.world)).toBe(canonical(host.world));
  });
});

describe('own-manager tracking at the writer boundary (→SAVE-24)', () => {
  const load = (host: Host, id: string, world: World) => loadWorld(host, id, world);
  const round = (host: Host, id: string) =>
    host.handle(
      req(id, host.world!.revision, { type: 'command', command: { type: 'advance', rounds: 1 } }),
    );
  /**
   * A supported career saved before manager history, on today's match model; its next round plays
   * an own match.
   */
  const older = () => withoutManagerHistory(simulatedWorld(input, { rounds: 3 }));
  /** A writer host on today's model: tracking is the cases' subject. */
  const writer = () => gameHost();

  it('starts a supported older career at its writer activation', async () => {
    const source = older();
    source.manager.since = source.year - 2;
    const host = writer();
    const reply = await load(host, 'track-old', source);
    expect(reply.ok, reply.error).toBe(true);
    expect(reply.upgraded).toBe(true);
    const w = host.world!;
    expect(w.revision).toBe(source.revision + 1);
    expect(w.managerHistory).toMatchObject({
      coverage: 'activation',
      trackedFrom: { year: source.year, day: currentDay(source), revision: source.revision + 1 },
    });
    // The model it already plays is kept as it was.
    expect(w.matchModel).toEqual(source.matchModel);
    // The known earlier service year stays; activation is no appointment date.
    expect(w.managerHistory!.tenures[0]).toMatchObject({ knownSince: source.year - 2 });
    expect(w.managerHistory!.tenures[0]).not.toHaveProperty('appointed');
    // Older facts are kept as they were and old results stay unattributed.
    const {
      managerHistory: _facts,
      newsJournal: _news,
      careerReads: _reads,
      matchModel: _model,
      npcSeason: _season,
      revision: _revision,
      ...rest
    } = w;
    void [_facts, _news, _reads, _model, _season, _revision];
    const { revision: _old, matchModel: _oldModel, npcSeason: _oldSeason, ...before } = source;
    void [_old, _oldModel, _oldSeason];
    expect(canonical(rest)).toBe(canonical(before));
    expect(canonical(w.npcSeason)).toBe(canonical(source.npcSeason));
    expect(w.ownMatches.every((m) => m.managerTenure === undefined)).toBe(true);
    // New results are attributed; the heavy facts never travel in a view.
    const played = await round(host, 'track-round');
    expect(played.ok, played.error).toBe(true);
    const added = host.world!.ownMatches.slice(source.ownMatches.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.managerTenure === w.managerHistory!.tenures[0]!.id)).toBe(true);
    expect(reply.view!.world).not.toHaveProperty('managerHistory');
    // Loaded again, a tracked career changes nothing.
    const again = writer();
    expect((await load(again, 'track-again', savedWorld(host))).upgraded).toBeUndefined();
  });

  it('waits for a queued or revealed own match before tracking starts', async () => {
    const source = older();
    const host = writer();
    host.world = structuredClone(source);
    const [watched, loaded] = await Promise.all([
      round(host, 'track-queued'),
      load(host, 'track-behind', source),
    ]);
    expect(watched.ok, watched.error).toBe(true);
    expect(watched.playback!.record).not.toHaveProperty('managerTenure');
    expect(loaded.upgraded).toBeUndefined();
    expect(host.world!.managerHistory).toBeUndefined();
    // The checkpoint holding that match is the boundary; its result stays unattributed.
    const replay = await round(host, 'track-replayed');
    expect(canonical(replay.playback!.record)).toBe(canonical(watched.playback!.record));
    const held = structuredClone(host.world!);
    expect((await load(host, 'track-held', held)).upgraded).toBe(true);
    expect(host.world!.managerHistory!.coverage).toBe('activation');
    expect(host.world!.ownMatches.every((m) => m.managerTenure === undefined)).toBe(true);
  });

  it('keeps the tracked career in its database and starts a retry at the same boundary', async () => {
    const source = older();
    const host = writer();
    const reply = await load(host, 'track-write', source);
    expect(reply.upgraded).toBe(true);
    expect(canonical(savedWorld(host))).toBe(canonical(host.world));
    expect(source).not.toHaveProperty('managerHistory');
    const retry = writer();
    await load(retry, 'track-retry', source);
    expect(canonical(retry.world)).toBe(canonical(host.world));
  });
});

/** A helper as the browser wires it: fixtureHelper.ts serving the far end of a real channel. */
function helperChannel() {
  const channel = new MessageChannel();
  serveHelper(channel.port1 as unknown as Parameters<typeof serveHelper>[0]);
  const port = channel.port2 as unknown as HelperPort;
  const posted: HelperJob[] = [];
  const post = port.postMessage.bind(port);
  port.postMessage = (job) => {
    posted.push(job);
    post(job);
  };
  const close = () => {
    channel.port1.close();
    channel.port2.close();
  };
  return { port, posted, close };
}
/** A helper that answers every share with an error. */
function failingHelper(): HelperPort & { posted: number } {
  const port: HelperPort & { posted: number } = {
    posted: 0,
    onmessage: null,
    postMessage(job) {
      port.posted++;
      setTimeout(
        () =>
          port.onmessage?.({
            data: {
              protocol: job.protocol,
              session: job.session,
              id: job.id,
              worldRevision: job.worldRevision,
              revision: 0,
              error: 'boom',
            },
          }),
        0,
      );
    },
  };
  return port;
}
/** Starts a game for unattended play: staff decide every business category, nothing is observed. */
async function startDelegated(h: Host) {
  await startedHost(undefined, undefined, h);
  const settings = structuredClone(settingsOf(h.world!));
  for (const key of RESPONSIBILITY_KEYS) settings.responsibilities[key] = 'delegated';
  settings.observations = { matchEve: false, windowOpen: false };
  const reply = await h.handle(
    req('delegate', h.world!.revision, {
      type: 'command',
      command: { type: 'settings', settings },
    }),
  );
  expect(reply.ok, reply.error).toBe(true);
}
/** Starts a game and plays it day by day through `advance-days` until our first match is played. */
async function throughFirstMatch(h: Host) {
  await startDelegated(h);
  for (let day = 0; !h.world!.ownMatches.length; day++) {
    expect(day).toBeLessThan(14);
    const reply = await h.handle(
      req(`day-${day}`, h.world!.revision, {
        type: 'command',
        command: { type: 'advance-days', days: 1 },
      }),
    );
    expect(reply.ok, reply.error).toBe(true);
    expect(reply.playback).toBeUndefined();
  }
  expect(h.world!.ownMatches[0]!.material).toBeUndefined();
  const continued = await h.handle(
    req('after-match', h.world!.revision, {
      type: 'command',
      command: { type: 'advance-days', days: 1 },
    }),
  );
  expect(continued.ok, continued.error).toBe(true);
  expect(continued.playback).toBeUndefined();
  return canonical(h.world!);
}
describe('fixture helpers', () => {
  it('compute our match day’s other fixtures on the helpers with the world of one engine', async () => {
    const sequential = await throughFirstMatch(new Host());
    const helpers = [helperChannel(), helperChannel()];
    const helped = new Host();
    helped.helpers = new HelperPool(helpers.map((helper) => helper.port));
    try {
      expect(await throughFirstMatch(helped)).toBe(sequential);
      // Only our league match day went to the helpers, one share each.
      expect(helpers.map((helper) => helper.posted.length)).toEqual([1, 1]);
      expect(helped.helpers.active).toBe(true);
    } finally {
      for (const helper of helpers) helper.close();
    }
    // A helper failing falls back to the engine worker for that round, with the same world.
    const failing = new Host();
    const bad = failingHelper();
    failing.helpers = new HelperPool([bad]);
    expect(await throughFirstMatch(failing)).toBe(sequential);
    expect(bad.posted).toBe(1);
    expect(failing.helpers.active).toBe(false);
  });
  it('holds reads while our match day waits for its helpers', async () => {
    const h = new Host();
    await startDelegated(h);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held: HelperPort & { jobs: HelperJob[] } = {
      jobs: [],
      onmessage: null,
      postMessage(job) {
        held.jobs.push(job);
        void gate.then(() => held.onmessage?.({ data: createFixtureHelper()(job) }));
      },
    };
    h.helpers = new HelperPool([held]);
    const order: string[] = [];
    for (let day = 0; !held.jobs.length; day++) {
      expect(day).toBeLessThan(14);
      const step = h.handle(
        req(`day-${day}`, h.world!.revision, {
          type: 'command',
          command: { type: 'advance-days', days: 1 },
        }),
      );
      // Let the step run up to its helpers, if this is our match day.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!held.jobs.length) {
        expect((await step).ok).toBe(true);
        continue;
      }
      const read = h.handle(req('read', -1, { type: 'archive', year: h.world!.year }));
      void step.then(() => order.push('step'));
      void read.then(() => order.push('read'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(order).toEqual([]);
      release();
      const [stepped, archive] = await Promise.all([step, read]);
      expect(stepped.ok).toBe(true);
      // The read waited for the completed day: our match is in the archive.
      expect(archive.archive?.matches).toHaveLength(1);
    }
  });
});
