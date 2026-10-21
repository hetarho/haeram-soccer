import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { canonical } from '../../../../packages/contracts/src/index';
import { CURRENT_ENGINE_VERSION } from '../../../../packages/contracts/src/versions';
import { decode, encode, type StoragePort } from '../adapters/persistence';
import { AUTOSAVE_MS, GameClient, SAVE_DATA_UPDATED, type ClientState } from './client';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import type { World } from '../../../../packages/contracts/src/types';
import { Host } from './host';
import { serve } from './codec';
import type { CodecResult, Reply, Request } from './protocol';
import { earlierRules, GameSlots } from './slots';
import { ACTIVE_SAVE_KEYS, GameIndexStore, type ParkedStore } from '../adapters/games';
import { NOTIFICATIONS_KEY, type SystemNotification } from './store';

class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  fail = '';
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.fail) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

/** Real host + persistence, with structured cloning at both worker boundaries. */
class WorkerPort {
  static instances: WorkerPort[] = [];
  requests: Request[] = [];
  replies: { request: Request; reply: Reply }[] = [];
  onmessage?: (event: MessageEvent<Reply>) => void;
  onerror?: () => void;
  host = new Host((reply) => this.deliver(reply));
  private codecPort?: MessagePort;
  constructor() {
    WorkerPort.instances.push(this);
  }
  private deliver(reply: Reply) {
    const cloned = structuredClone(reply);
    this.onmessage?.({ data: cloned } as MessageEvent<Reply>);
    return cloned;
  }
  postMessage(input: Request | { type: 'cancel' } | { type: 'codec'; port: MessagePort }) {
    if ('type' in input) {
      if (input.type === 'codec') this.host.codec = this.codecPort = input.port;
      else this.host.cancelled = true;
      return;
    }
    this.requests.push(input);
    void this.host.handle(structuredClone(input)).then((reply) => {
      this.replies.push({ request: input, reply: this.deliver(reply) });
    });
  }
  terminate() {
    this.codecPort?.close();
  }
}

/** The codec worker as codec.ts wires it; snapshots arrive through a real MessageChannel port. */
class CodecPort {
  static instances: CodecPort[] = [];
  results: CodecResult[] = [];
  onmessage?: (event: MessageEvent<CodecResult>) => void;
  onerror?: () => void;
  /** Answers wait for this, so a test can hold a checkpoint while the game moves on. */
  gate = Promise.resolve();
  private port?: MessagePort;
  constructor() {
    CodecPort.instances.push(this);
  }
  postMessage(input: { type: 'port'; port: MessagePort }) {
    this.port = input.port;
    serve(input.port, (result) => {
      void this.gate.then(() => {
        const cloned = structuredClone(result);
        this.results.push(cloned);
        this.onmessage?.({ data: cloned } as MessageEvent<CodecResult>);
      });
    });
  }
  terminate() {
    this.port?.close();
  }
}

function FakeWorker(url: URL) {
  return String(url).endsWith('codec.ts') ? new CodecPort() : new WorkerPort();
}

class ChannelPort {
  static instances: ChannelPort[] = [];
  constructor() {
    ChannelPort.instances.push(this);
  }
  onmessage?: (event: MessageEvent<{ generation: number }>) => void;
  postMessage() {}
  close() {}
}

/** The system notifications this browser keeps (→WEB-66). */
function notifications(): SystemNotification[] {
  return JSON.parse(storage.getItem(NOTIFICATIONS_KEY) || '{"items":[]}').items;
}

const founding = {
  country: 'ENG' as const,
  name: 'Background Athletic',
  color: '#223344',
  seed: 'client-background',
  level: 'normal' as const,
};
let storage: MemoryStorage;
const clients: GameClient[] = [];
/** A writer with a founded club whose first checkpoint is committed. */
async function start(notify: (state: ClientState) => void = () => {}) {
  const client = new GameClient(notify);
  clients.push(client);
  await client.start();
  await client.found(founding);
  await client.whenSaved();
  return client;
}

/** Quiet transport/save fixtures still use the real settings command and its save boundary. */
async function delegateMarket(client: GameClient) {
  const settings = structuredClone(client.state.view!.world.settings!);
  settings.responsibilities.sales = 'delegated';
  settings.responsibilities.recruitment = 'delegated';
  await client.command({ type: 'settings', settings }, { background: true });
  await client.whenSaved();
}

beforeEach(() => {
  storage = new MemoryStorage();
  WorkerPort.instances = [];
  CodecPort.instances = [];
  ChannelPort.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('BroadcastChannel', ChannelPort);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    setTimeout,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        _name: string,
        _options: unknown,
        callback: (lock: { name: string }) => Promise<void>,
      ) => callback({ name: 'writer' }),
    },
  });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.unstubAllGlobals();
});

describe('background worker publication', () => {
  it('waits for admitted background work before a manual decision and saves it beside the queue', async () => {
    const client = await start();
    const background = client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenIdle();
    await background;
    expect(client.state.processing).toBe(false);
    expect(client.state.view!.world.calendar?.day).toBe(1);
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(client.state.view!.world.revision);
  });
  it('advances without foreground loading flashes and saves without a validation view', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    const initialTables = client.state.view!.world.tables;
    publications.length = 0;
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    const worker = WorkerPort.instances[0],
      command = worker.replies.findLast(({ request }) => request.body.type === 'command')!,
      save = worker.replies.findLast(({ request }) => request.body.type === 'save')!;
    expect(save.reply.view).toBeUndefined();
    expect(worker.requests.some((request) => request.body.type === 'inspect')).toBe(false);
    expect(publications.length).toBeGreaterThan(0);
    expect(publications.every((state) => !state.busy && state.progress === 0)).toBe(true);
    expect(publications.some((state) => state.processing && state.activity === 'background')).toBe(
      true,
    );
    expect(client.state.processing).toBe(false);
    expect(client.state.activity).toBe('idle');
    expect(client.state.view).toEqual(command.reply.view);
    expect(client.state.view).toBe(
      publications.find((state) => state.view?.world.calendar?.day === 1)?.view,
    );
    expect(client.state.view!.world.tables).toBe(initialTables);
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.savedRevision).toBe(client.state.view?.world.revision);
    // The day came as the parts that changed (→ARCH-6), rebuilt into the host's whole view.
    expect(command.request.viewBase).toBeDefined();
    expect(command.reply.viewDelta?.world).not.toHaveProperty('history');
    expect(canonical(client.state.view)).toBe(
      canonical(structuredClone((worker.host as unknown as { view(): unknown }).view())),
    );
  });

  it('serializes overlapping background ticks with current revisions and checkpoint generations', async () => {
    const client = await start();
    await Promise.all([
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
    ]);
    await client.whenSaved();
    const requests = WorkerPort.instances[0].requests,
      commands = requests.filter((request) => request.body.type === 'command'),
      generations = requests
        .filter((request) => request.body.type === 'save')
        .map((request) => request.generation);
    expect(commands.map((request) => request.expectedRevision)).toEqual([0, 1]);
    // Founding, then the ticks' saves (folded when one was still building): every checkpoint
    // follows the last committed one.
    expect(generations).toEqual(generations.map((_, index) => index + 1));
    expect(generations.length).toBeGreaterThan(1);
    expect(JSON.parse(storage.getItem('haeram-soccor:manifest')!).generation).toBe(
      generations.at(-1),
    );
    expect(client.state.view?.world.calendar?.day).toBe(2);
    expect(client.state.savedRevision).toBe(2);
    expect(client.state.error).toBeUndefined();
  });

  it('manual next-event saves its final boundary without foreground progress feedback', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    const settings = structuredClone(client.state.view!.world.settings!);
    settings.mode = 'manual';
    for (const key of Object.keys(
      settings.responsibilities,
    ) as (keyof typeof settings.responsibilities)[])
      settings.responsibilities[key] = 'delegated';
    await client.command({ type: 'settings', settings }, { background: true });
    await client.whenSaved();
    publications.length = 0;
    await client.command({ type: 'next-event' }, { background: true });
    expect(
      publications.some(
        (state) =>
          state.processing && (state.pendingActions || 0) > 0 && state.activity === 'background',
      ),
    ).toBe(true);
    expect(publications.every((state) => !state.busy && state.progress === 0)).toBe(true);
    expect(client.state.view!.world.calendar?.day).toBe(6);
    expect(client.state.view!.world.settings!.mode).toBe('manual');
    expect(client.state.processing).toBe(false);
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(client.state.view!.world.revision);
  });

  it('keeps a second tab read-only even for silent background commands', async () => {
    await start();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
          callback(null),
      },
    });
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    expect(reader.state.readonly).toBe(true);
    expect(reader.state.view?.world.revision).toBe(0);
    await reader.command({ type: 'advance-days', days: 1 }, { background: true });
    expect(reader.state.error).toContain('읽기 전용');
    expect(reader.state.view?.world.calendar?.day).toBe(0);
    expect(reader.state.savedRevision).toBe(0);
    expect(
      WorkerPort.instances[1].requests.some((request) => request.body.type === 'command'),
    ).toBe(false);
  });

  it('keeps a tab without Web Locks read-only, its badge saying why, with no notification', async () => {
    await start();
    vi.stubGlobal('navigator', {});
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    expect(reader.state.readonly).toBe(true);
    expect(reader.state.notice).toContain('Web Locks');
    expect(reader.state.view?.world.revision).toBe(0);
    expect(notifications()).toHaveLength(0);
  });

  it('takes over writing once the playing tab releases the writer lock', async () => {
    await start();
    let release: (lock: object) => void = () => {};
    const granted = new Promise<object>((resolve) => (release = resolve));
    vi.stubGlobal('navigator', {
      locks: {
        request: (
          _name: string,
          options: { ifAvailable?: boolean },
          callback: (lock: object | null) => Promise<void>,
        ) => (options.ifAvailable ? callback(null) : granted.then((lock) => callback(lock))),
      },
    });
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    expect(reader.state.readonly).toBe(true);
    release({ name: 'haeram-soccor:writer' });
    await vi.waitFor(() => expect(reader.state.readonly).toBe(false));
    expect(reader.state.notice).toBeUndefined();
    expect(notifications()).toMatchObject([{ text: expect.stringContaining('이어서 플레이') }]);
    await vi.waitFor(() => expect(reader.state.view?.world.revision).toBe(0));
  });
  it('retains memory progress and the last recoverable checkpoint when background saving fails', async () => {
    const client = await start(),
      manifest = storage.getItem('haeram-soccor:manifest')!;
    storage.fail = 'haeram-soccor:manifest';
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    expect(client.state.error).toContain('저장 실패');
    expect(client.state.error).toContain('파일로 내보내세요');
    expect(client.state.saveFailed).toBe(true);
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.savedRevision).toBe(0);
    expect(client.state.processing).toBe(false);
    expect(client.state.busy).toBe(false);
    expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
    const slot = JSON.parse(manifest).slot ? 'b' : 'a',
      saved = await decode(storage.getItem(`haeram-soccor:slot:${slot}`)!);
    expect(saved.world.calendar?.day).toBe(0);
  });

  it('commits the codec checkpoint as built, without an inspect round trip', async () => {
    const client = await start();
    await client.command({ type: 'advance-days', days: 1 });
    await client.whenSaved();
    const last = CodecPort.instances[0].results.at(-1)!;
    if (!last.ok) throw new Error(last.error);
    const manifest = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
    expect(manifest.generation).toBe(last.envelope.generation);
    expect(storage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)).toBe(last.raw);
    expect(last.revision).toBe(client.state.view!.world.revision);
    expect(client.state.savedRevision).toBe(last.revision);
    expect(
      WorkerPort.instances[0].requests.some(
        (request) => request.body.type === 'inspect' || request.body.type === 'export',
      ),
    ).toBe(false);
    expect((await decode(last.raw)).world.calendar?.day).toBe(1);
  });

  it('writes no slot when the codec rejects its own candidate and reports the save error', async () => {
    const client = await start(),
      before = new Map(storage.data),
      w = WorkerPort.instances[0].host.world!;
    // A world the engine plays on but a load would reject: the codec's validation must catch it.
    w.rankHistory![0].rows[0][0] = w.clubs.length;
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    const last = CodecPort.instances[0].results.at(-1)!;
    expect(last.ok).toBe(false);
    expect(client.state.error).toContain('저장 실패');
    expect(client.state.error).toContain('순위 추이');
    expect(client.state.error).toContain('파일로 내보내세요');
    expect(storage.data).toEqual(before);
    expect(client.state.savedRevision).toBe(0);
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.processing).toBe(false);
  });

  it('builds one checkpoint at a time and folds requests made meanwhile into one newer save', async () => {
    const client = await start(),
      worker = WorkerPort.instances[0],
      codec = CodecPort.instances[0],
      saves = () => worker.requests.filter((request) => request.body.type === 'save');
    storage.fail = 'haeram-soccor:manifest';
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(0);
    storage.fail = '';
    let release = () => {};
    codec.gate = new Promise<void>((resolve) => (release = resolve));
    const first = client.save();
    await vi.waitFor(() => expect(saves()).toHaveLength(3));
    // While that checkpoint is held, a tick and another request each ask for a save.
    const tick = client.command({ type: 'advance-days', days: 1 }, { background: true });
    await vi.waitFor(() => expect(client.state.view?.world.calendar?.day).toBe(2));
    const again = client.save();
    expect(saves()).toHaveLength(3);
    release();
    await Promise.all([first, tick, again]);
    expect(saves().map((request) => request.generation)).toEqual([1, 2, 2, 3]);
    expect(codec.results.map((result) => result.ok && result.revision)).toEqual([0, 1, 1, 2]);
    expect(client.state.savedRevision).toBe(2);
    expect(client.state.error).toBeUndefined();
    const manifest = storage.getItem('haeram-soccor:manifest');
    expect(JSON.parse(manifest!).generation).toBe(3);
    // A late answer for a checkpoint already superseded is never written.
    codec.onmessage?.({ data: codec.results[2] } as MessageEvent<CodecResult>);
    await client.whenSaved();
    expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
  });

  it('saves automatic days when the autosave comes due and an owner decision at once, neither command waiting', async () => {
    // The autosave timer is held here so the test can bring it due.
    const due: (() => void)[] = [];
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms: number) =>
        ms === AUTOSAVE_MS ? due.push(fn) : setTimeout(fn, ms),
      addEventListener() {},
      removeEventListener() {},
    });
    const notices = vi.spyOn(ChannelPort.prototype, 'postMessage');
    const client = await start(),
      worker = WorkerPort.instances[0],
      codec = CodecPort.instances[0],
      saves = () => worker.requests.filter((request) => request.body.type === 'save').length;
    await delegateMarket(client);
    const baseRevision = client.state.view!.world.revision,
      baseSaves = saves();
    // Clock ticks are not saved per step: one autosave waits for the whole unsaved run.
    await client.command({ type: 'advance-days', days: 1 }, { background: true, automatic: true });
    await client.command({ type: 'advance-days', days: 1 }, { background: true, automatic: true });
    await client.whenSaved();
    expect(saves()).toBe(baseSaves);
    expect(due).toHaveLength(1);
    expect(client.state.savedRevision).toBe(baseRevision);
    const foundedAt = client.state.savedAt!;
    due[0]();
    await client.whenSaved();
    expect(saves()).toBe(baseSaves + 1);
    expect(client.state.savedRevision).toBe(baseRevision + 2);
    expect(client.state.savedAt).toBeGreaterThanOrEqual(foundedAt);
    // An owner decision asks at once; its command settles while the checkpoint is still held.
    let release = () => {};
    codec.gate = new Promise<void>((resolve) => (release = resolve));
    await client.command({ type: 'advance-days', days: 1 });
    expect(client.state.view?.world.revision).toBe(baseRevision + 3);
    await vi.waitFor(() => expect(saves()).toBe(baseSaves + 2));
    expect(client.state.savedRevision).toBe(baseRevision + 2);
    expect(client.state.processing).toBe(false);
    release();
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(baseRevision + 3);
    expect(due).toHaveLength(1);
    // Read-only tabs hear of every commit.
    const posted = notices.mock.calls as unknown as [{ revision: number }][];
    expect(posted.map(([notice]) => notice.revision)).toEqual([
      0,
      baseRevision,
      baseRevision + 2,
      baseRevision + 3,
    ]);
  });

  it('refreshes season and manager archives without publishing or interrupting automatic work', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state)),
      year = client.state.view!.world.year;
    await delegateMarket(client);
    publications.length = 0;
    const archive = await client.archive(year);
    expect(archive?.managers).toEqual(
      client.state.view!.world.events.filter((event) => event.kind.startsWith('manager-')),
    );
    expect(publications).toHaveLength(0);
    for (let day = 0; day < 3; day++) {
      const tick = client.command({ type: 'advance-days', days: 1 }, { background: true });
      const record = await client.archive(year);
      expect(record?.managers).toEqual(archive!.managers);
      await tick;
    }
    expect(publications.every((state) => !state.busy && state.activity !== 'foreground')).toBe(
      true,
    );
    expect(client.state.error).toBeUndefined();
    await client.whenSaved();
  });

  it('reads the all-time head-to-head without publishing a state or waiting for a tick', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    await delegateMarket(client);
    await client.command({ type: 'next-match' });
    const w = client.state.view!.world,
      met = w.ownMatches.at(-1)!,
      club = met.home === w.playerClub ? met.away : met.home;
    publications.length = 0;
    const record = await client.headToHead(club);
    expect(publications).toHaveLength(0);
    expect(record.played).toBe(1);
    expect(record.recent[0].id).toBe(met.id);
    const tick = client.command({ type: 'advance-days', days: 2 }, { background: true });
    await expect(client.headToHead(club)).resolves.toEqual(record);
    await tick;
    expect(client.state.error).toBeUndefined();
    await expect(client.headToHead(w.playerClub)).rejects.toThrow('맞대결 상대');
    expect(client.state.error).toBeUndefined();
  });

  it("reads another league's fixtures, which the view does not carry, without publishing", async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    const w = client.state.view!.world;
    expect(w.fixtures.some((f) => f.groupKey === 'GER:0:0')).toBe(false);
    publications.length = 0;
    const fixtures = await client.leagueFixtures({ code: 'GER', tier: 0, group: 0 });
    expect(publications).toHaveLength(0);
    // 18 clubs, each meeting every other home and away.
    expect(fixtures).toHaveLength(18 * 17);
    expect(fixtures.every((f) => f.groupKey === 'GER:0:0' && f.year === w.year)).toBe(true);
  });

  it('activates an explicit import while ignoring unsolicited stale worker responses', async () => {
    const client = await start(),
      replacement = simulatedWorld({ ...founding, seed: 'replacement', name: 'New Athletic' });
    await client.importFile(await encode(replacement));
    expect(client.state.view?.world.id).toBe(replacement.id);
    expect(client.state.savedRevision).toBe(0);
    const before = client.state.view;
    WorkerPort.instances[0].onmessage?.({
      data: { requestId: 'expired-session', ok: true, view: { ...before!, totalMatches: 123 } },
    } as MessageEvent<Reply>);
    expect(client.state.view).toBe(before);
  });
});

async function legacyCheckpoint(withHistory = false) {
  const legacy = simulatedWorld(founding, withHistory ? { seasons: 1 } : { rounds: 2 });
  legacy.engine = '1.0.0';
  legacy.revision = 17;
  legacy.cash = '98765432101234567890';
  delete legacy.trainingOrders;
  delete legacy.players[0].developed;
  const raw = await encode(legacy, 7, 6);
  storage.setItem('haeram-soccor:slot:a', raw);
  storage.setItem(
    'haeram-soccor:manifest',
    JSON.stringify({ slot: 0, worldId: legacy.id, generation: 7, parentGeneration: 6 }),
  );
  return { legacy, raw };
}

/** A supported career saved before club identities: no designs and no recorded appearances. */
function withoutIdentities(w: World) {
  for (const club of w.clubs) delete club.identity;
  for (const match of w.ownMatches) delete match.appearance;
  return w;
}
/** That career committed as the game in play, generation 7. */
async function identitylessCheckpoint() {
  const legacy = withoutIdentities(simulatedWorld(founding, { rounds: 2 }));
  const raw = await encode(legacy, 7, 6);
  storage.setItem('haeram-soccor:slot:a', raw);
  storage.setItem(
    'haeram-soccor:manifest',
    JSON.stringify({ slot: 0, worldId: legacy.id, generation: 7, parentGeneration: 6 }),
  );
  return { legacy, raw };
}

describe('supported-career identity adoption (→SAVE-21)', () => {
  it('adoption commits through the existing save repository', async () => {
    const { legacy, raw } = await identitylessCheckpoint();
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toBeUndefined();
    expect(client.state.view!.world.clubs.every((club) => club.identity)).toBe(true);
    expect(client.state.savedRevision).toBe(legacy.revision + 1);
    const manifest = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
    expect(manifest).toMatchObject({ worldId: legacy.id, generation: 8, parentGeneration: 7 });
    const saved = (
      await decode(storage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)!)
    ).world;
    expect(saved.revision).toBe(legacy.revision + 1);
    expect(saved.clubs.every((club) => club.identity)).toBe(true);
    expect(saved.ownMatches.every((m) => !('appearance' in m))).toBe(true);
    // The career as it was stays the previous copy until a newer save commits.
    expect(storage.getItem(`haeram-soccor:slot:${manifest.slot ? 'a' : 'b'}`)).toBe(raw);
    expect(notifications()).toMatchObject([{ text: SAVE_DATA_UPDATED, read: false }]);
    // Loading the adopted career again changes nothing and tells nothing more.
    const committed = new Map(storage.data);
    await client.reload();
    expect(client.state.savedRevision).toBe(legacy.revision + 1);
    expect(storage.data).toEqual(committed);
  });

  it('failure preserves old raw data and export access', async () => {
    const { legacy, raw } = await identitylessCheckpoint();
    const manifest = storage.getItem('haeram-soccor:manifest');
    storage.fail = 'haeram-soccor:manifest';
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toContain('갱신한 저장 데이터를 저장하지 못했어요');
    expect(client.state.saveFailed).toBe(true);
    expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
    expect(storage.getItem('haeram-soccor:slot:a')).toBe(raw);
    expect(notifications()).toEqual([]);
    // The adopted career stays in memory and exportable.
    const exported = (await decode((await client.exportFile())!)).world;
    expect(exported.id).toBe(legacy.id);
    expect(exported.revision).toBe(legacy.revision + 1);
    expect(exported.clubs.every((club) => club.identity)).toBe(true);
    expect(canonical((await decode(storage.getItem('haeram-soccor:slot:a')!)).world)).toBe(
      canonical(legacy),
    );
  });
});

describe('earlier-rules and future saves: compatibility recovery', () => {
  it('resets recognized earlier gameplay on writer activation (→SAVE-18)', async () => {
    await legacyCheckpoint();
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.errorCode).toBeUndefined();
    expect(client.state.view).toBeUndefined();
    expect(storage.getItem('haeram-soccor:slot:a')).toBeNull();
    expect(storage.getItem('haeram-soccor:manifest')).toBeNull();
    expect(storage.getItem('haeram-soccor:device')).toBeNull();
  });

  it.each([true, false])(
    'returns a typed error and exports the selected future checkpoint with manifest=%s',
    async (hasManifest) => {
      await legacyCheckpoint();
      const old = storage.getItem('haeram-soccor:slot:a')!;
      const future = JSON.stringify({ ...JSON.parse(old), engine: '9.0.0', generation: 8 });
      storage.setItem('haeram-soccor:slot:b', future);
      if (hasManifest)
        storage.setItem(
          'haeram-soccor:manifest',
          JSON.stringify({
            slot: 1,
            worldId: JSON.parse(old).worldId,
            generation: 8,
            parentGeneration: 7,
          }),
        );
      else storage.removeItem('haeram-soccor:manifest');
      const before = new Map(storage.data);
      // The independently recognized old predecessor may reset; the future bytes stay exact.
      before.delete('haeram-soccor:slot:a');
      const client = new GameClient(() => {});
      clients.push(client);
      await client.start();
      expect(client.state.errorCode).toBe('save-compatibility');
      expect(client.state.error).toContain('지원하지 않는');
      expect(client.state.view).toBeUndefined();
      expect(storage.data).toEqual(before);
      expect(await client.exportFile()).toBe(future);
      expect(storage.data).toEqual(before);
      expect(
        WorkerPort.instances[0].requests.some(
          (request) => request.body.type === 'inspect' && request.body.activate,
        ),
      ).toBe(false);
      await client.importFile(future);
      expect(client.state.errorCode).toBe('save-compatibility');
      expect(client.state.view).toBeUndefined();
      expect(await client.exportFile()).toBe(future);
      await client.found(founding);
      expect(client.state.errorCode).toBe('save-compatibility');
      expect(client.state.view).toBeUndefined();
      expect(storage.data).toEqual(before);
      const replacement = simulatedWorld({ ...founding, seed: 'explicit-recovery' });
      await client.importFile(await encode(replacement));
      expect(client.state.error).toBeUndefined();
      expect(client.state.view?.world.id).toBe(replacement.id);
      expect(JSON.parse(storage.getItem('haeram-soccor:manifest')!)).toEqual({
        slot: 0,
        worldId: replacement.id,
        generation: 9,
        parentGeneration: 8,
      });
      expect(storage.getItem('haeram-soccor:slot:b')).toBe(future);
    },
  );

  it('still recovers a compatible predecessor when the selected checkpoint is actually corrupt', async () => {
    const client = await start();
    await client.command({ type: 'advance-days', days: 1 });
    await client.whenSaved();
    const selected = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
    storage.setItem(`haeram-soccor:slot:${selected.slot ? 'b' : 'a'}`, 'corrupt');
    client.dispose();
    clients.splice(clients.indexOf(client), 1);
    const restored = new GameClient(() => {});
    clients.push(restored);
    await restored.start();
    expect(restored.state.error).toBeUndefined();
    expect(restored.state.notice).toBeUndefined();
    expect(notifications()).toMatchObject([
      { text: expect.stringContaining('체크포인트로 복구'), read: false },
    ]);
    // Until a save moves the manifest off the corrupt slot, every load recovers; it tells once.
    await restored.reload();
    expect(notifications()).toHaveLength(1);
    expect(restored.state.view?.world.calendar?.day).toBe(0);
    expect(restored.state.savedRevision).toBe(0);
    await restored.command({ type: 'advance-days', days: 1 });
    await restored.whenSaved();
    expect(restored.state.error).toBeUndefined();
    expect(restored.state.savedRevision).toBe(1);
  });

  it('keeps an explicitly imported replacement exportable and retryable after future-save write failure', async () => {
    const { raw } = await legacyCheckpoint();
    const future = JSON.stringify({ ...JSON.parse(raw), engine: '9.0.0' });
    storage.setItem('haeram-soccor:slot:a', future);
    const manifest = storage.getItem('haeram-soccor:manifest');
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.errorCode).toBe('save-compatibility');
    await client.found(founding);
    expect(client.state.errorCode).toBe('save-compatibility');
    expect(client.state.view).toBeUndefined();
    storage.fail = 'haeram-soccor:manifest';
    const replacement = simulatedWorld({ ...founding, seed: 'explicit-recovery-quota' });
    await client.importFile(await encode(replacement));
    expect(client.state.error).toContain('Quota');
    expect(client.state.view?.world.id).toBe(replacement.id);
    expect(client.state.savedRevision).toBe(-1);
    expect(storage.getItem('haeram-soccor:slot:a')).toBe(future);
    expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
    expect(canonical((await decode((await client.exportFile())!)).world)).toBe(
      canonical(replacement),
    );
    storage.fail = '';
    await client.retrySave();
    expect(client.state.error).toBeUndefined();
    expect(client.state.savedRevision).toBe(0);
    expect(JSON.parse(storage.getItem('haeram-soccor:manifest')!)).toEqual({
      slot: 1,
      worldId: replacement.id,
      generation: 8,
      parentGeneration: 7,
    });
    expect(storage.getItem('haeram-soccor:slot:a')).toBe(future);
  });
});

describe('game slots', () => {
  class MemoryParked implements ParkedStore {
    data = new Map<string, string>();
    async get(id: string) {
      return this.data.get(id);
    }
    async put(id: string, raw: string) {
      this.data.set(id, raw);
    }
    async remove(id: string) {
      this.data.delete(id);
    }
  }
  it('parks the game in play, starts another in an empty slot and switches back intact', async () => {
    const client = await start();
    const parked = new MemoryParked();
    const slots = new GameSlots(client, new GameIndexStore(storage), parked);
    const first = client.state.view!.world.id;
    expect(slots.sync(client.state.view!.world)).toMatchObject({ active: 0 });

    await slots.prepare(1);
    expect(parked.data.size).toBe(1);
    await client.found({ ...founding, name: 'Second Rovers', seed: 'second-slot' }, true);
    const second = client.state.view!.world.id;
    expect(second).not.toBe(first);
    let index = slots.sync(client.state.view!.world, true);
    expect(index.active).toBe(1);
    expect(index.slots.map((entry) => entry?.summary.club)).toEqual([
      'Background Athletic',
      'Second Rovers',
      undefined,
    ]);
    await client.command({ type: 'advance-days', days: 1 });

    await slots.continue(0);
    expect(client.state.view!.world.id).toBe(first);
    expect(slots.read().active).toBe(0);
    expect(JSON.parse(storage.getItem('haeram-soccor:manifest')!).worldId).toBe(first);
    // The second game kept the day it had played before it was parked.
    await slots.continue(1);
    expect(client.state.view!.world.id).toBe(second);
    expect(client.state.view!.world.calendar?.day).toBe(1);

    // A parked game is deleted with its copy; the game in play takes its checkpoints with it.
    expect(await slots.remove(0)).toBe(false);
    index = slots.read();
    expect(index.slots[0]).toBeNull();
    expect([...parked.data.keys()]).toEqual([index.slots[1]!.id]);
    expect(await slots.remove(1)).toBe(true);
    expect(ACTIVE_SAVE_KEYS.every((key) => storage.getItem(key) === null)).toBe(true);
    expect(slots.read()).toMatchObject({ active: null, slots: [null, null, null] });
  });

  it('slot import applies only to its intended world', async () => {
    const client = await start();
    const parked = new MemoryParked();
    const slots = new GameSlots(client, new GameIndexStore(storage), parked);
    const first = client.state.view!.world.id;
    slots.sync(client.state.view!.world);
    const firstRaw = await client.checkpoint();
    const imported = withoutIdentities(
      simulatedWorld({ ...founding, name: 'Archive Rovers', seed: 'identityless-import' }),
    );
    await slots.importInto(1, await encode(imported));
    const w = client.state.view!.world;
    expect(w.id).toBe(imported.id);
    expect(w.revision).toBe(imported.revision + 1);
    for (const club of w.clubs) expect(club.identity).toEqual(identityOf(imported, club.id));
    const index = slots.read();
    expect(index.slots.map((entry) => entry?.worldId)).toEqual([first, imported.id, undefined]);
    // The parked game is byte for byte what it was; only the imported world was adopted.
    expect(parked.data.get(index.slots[0]!.id)).toBe(firstRaw);
    const saved = (await decode((await client.checkpoint())!)).world;
    expect(saved.id).toBe(imported.id);
    expect(saved.clubs.every((club) => club.identity)).toBe(true);
  });

  it('lists a save from before slots as slot 1 and refuses a slot whose copy is gone', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage), new MemoryParked());
    expect(new GameIndexStore(storage).hasGames()).toBe(true);
    const index = slots.sync(client.state.view!.world);
    expect(index.active).toBe(0);
    expect(index.slots[0]!.summary.division).toBe('아마추어 리그');
    // A slot listed without its parked checkpoint is reported, and the game in play stays.
    storage.setItem(
      'haeram-soccor:games',
      JSON.stringify({
        ...index,
        slots: [index.slots[0], { ...index.slots[0], id: 'lost', worldId: 'gone' }, null],
      }),
    );
    await expect(slots.continue(1)).rejects.toThrow('찾지 못했어요');
    expect(client.state.view!.world.id).toBe(index.slots[0]!.worldId);
  });

  it('keeps the rules of each slot: an earlier-rules game is listed as such and never continues', async () => {
    const client = await start();
    const parked = new MemoryParked();
    const slots = new GameSlots(client, new GameIndexStore(storage), parked);
    const index = slots.sync(client.state.view!.world);
    expect(index.slots[0]!.engine).toBe(CURRENT_ENGINE_VERSION);
    // A game parked before slots kept their rules, saved under rules 1.22.0.
    const earlier = JSON.stringify({
      ...JSON.parse((await client.exportFile())!),
      engine: '1.22.0',
    });
    const unversioned = { ...index.slots[0]!, id: 'old', worldId: 'old' };
    delete unversioned.engine;
    storage.setItem(
      'haeram-soccor:games',
      JSON.stringify({ ...index, slots: [index.slots[0], unversioned, null] }),
    );
    await parked.put('old', earlier);
    expect(earlierRules(slots.read().slots[1]!)).toBeUndefined();
    expect(await slots.resolveEngines()).toBe(true);
    expect(earlierRules(slots.read().slots[1]!)).toBe('1.22.0');
    await expect(slots.continue(1)).rejects.toThrow('규칙 1.22.0 커리어');
    // Its file is still there to keep, exactly as parked.
    expect(await slots.exportRaw(1)).toBe(earlier);
  });
});

it('exports verified current bytes after storage corruption and never reuses another world at the same revision', async () => {
  const client = await start(),
    original = (await client.exportFile())!;
  const oldWorld = (await decode(original)).world;
  const manifest = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
  storage.setItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`, 'external corruption');
  expect(await client.exportFile()).toBe(original);
  const codec = CodecPort.instances[0];
  let release!: () => void;
  codec.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await client.found({ ...founding, seed: 'other-world-same-revision' }, true);
    const current = (await decode((await client.exportFile())!)).world;
    expect(current.revision).toBe(oldWorld.revision);
    expect(current.id).not.toBe(oldWorld.id);
    expect(current.id).toBe(client.state.view!.world.id);
  } finally {
    release();
    await client.whenSaved();
  }
});

it('drains newer notices across more than two read-only loads without spinning on an unchanged hint', async () => {
  const writer = await start();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
        callback(null),
    },
  });
  const reader = new GameClient(() => {});
  clients.push(reader);
  await reader.start();
  const worker = WorkerPort.instances[1],
    channel = ChannelPort.instances[1];
  const original = worker.postMessage.bind(worker),
    held: (() => void)[] = [];
  const post = vi.spyOn(worker, 'postMessage').mockImplementation((input) => {
    if ('body' in input && input.body.type === 'inspect' && input.body.activate)
      held.push(() => original(input));
    else original(input);
  });
  const notice = (generation: number) =>
    channel.onmessage?.({ data: { generation } } as MessageEvent<{ generation: number }>);
  try {
    for (let i = 1; i <= 4; i++) {
      const previous = writer.state.savedRevision;
      await writer.command(
        {
          type: 'settings',
          settings: { ...writer.state.view!.world.settings!, mode: i % 2 ? 'manual' : 'automatic' },
        },
        { background: true },
      );
      await writer.whenSaved();
      expect(writer.state.savedRevision).toBeGreaterThan(previous);
      notice(JSON.parse(storage.getItem('haeram-soccor:manifest')!).generation);
      if (i > 1) held.shift()!();
      await vi.waitFor(() =>
        expect(
          held,
          `generation ${i}; channels ${ChannelPort.instances.length}; readonly ${reader.state.readonly}; requests ${worker.requests.map((r) => r.body.type).join(',')}`,
        ).toHaveLength(1),
      );
    }
    held.shift()!();
    await reader.whenIdle();
    expect(reader.state.view!.world.revision).toBe(writer.state.savedRevision);
    expect(reader.state.readonly).toBe(true);
    expect(worker.requests.some((request) => request.body.type === 'command')).toBe(false);
    const before = worker.requests.filter((request) => request.body.type === 'inspect').length;
    notice(999999);
    notice(999999);
    await vi.waitFor(() => expect(held).toHaveLength(1));
    held.shift()!();
    await reader.whenIdle();
    expect(
      worker.requests.filter((request) => request.body.type === 'inspect').length - before,
    ).toBeLessThanOrEqual(2);
    expect(reader.state.view!.world.revision).toBe(writer.state.savedRevision);
    // A bogus high generation must not mask real newer notices arriving during later loads.
    for (let i = 5; i <= 6; i++) {
      const previous = writer.state.savedRevision;
      await writer.command(
        {
          type: 'settings',
          settings: { ...writer.state.view!.world.settings!, mode: i % 2 ? 'manual' : 'automatic' },
        },
        { background: true },
      );
      await writer.whenSaved();
      expect(writer.state.savedRevision).toBeGreaterThan(previous);
      notice(JSON.parse(storage.getItem('haeram-soccor:manifest')!).generation);
      if (i > 5) held.shift()!();
      await vi.waitFor(() => expect(held).toHaveLength(1));
    }
    held.shift()!();
    await reader.whenIdle();
    expect(reader.state.view!.world.revision).toBe(writer.state.savedRevision);
    const inspected = worker.requests.length;
    for (const invalid of [NaN, -1, 0.5]) notice(invalid);
    await reader.whenIdle();
    expect(worker.requests).toHaveLength(inspected);
  } finally {
    post.mockRestore();
    for (const release of held) release();
  }
});
