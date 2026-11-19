import { initializeReadModels } from '../../../../packages/engine/src/read-models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { withoutMatchModel } from '../../../../tests/fixtures/earlier-saves';
import { simulatedWorld, withoutManagerHistory } from '../../../../tests/fixtures/worlds';
import { canonical } from '../../../../packages/contracts/src/index';
import { CURRENT_ENGINE_VERSION } from '../../../../packages/contracts/src/versions';
import type { MatchModelRelease } from '../../../../packages/engine/src/match-model';
import type { StoragePort } from '../adapters/repository';
import { AUTOSAVE_MS, GameClient, SAVE_DATA_UPDATED, type ClientState } from './client';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { CLUB_POSTS } from '../../../../packages/engine/src/staff-info';
import type { World } from '../../../../packages/contracts/src/types';
import { Host, type DatabaseBytes, type GameFiles, type OpenStore } from './host';
import type { RecordStore } from '../../../../packages/contracts/src/record-store';
import { nodeSqliteDriver, type SerializableDriver } from '../../../../tests/fixtures/node-sqlite';
import { saveFileOf } from '../../../../tests/fixtures/save-file';
import { decodeSaveFile, saveMetaOf } from '../adapters/saveFile';
import { sqlRecordStore } from '../adapters/sqlRecordStore';
import { RowSaver } from '../adapters/rowSaver';
import { serve as serveHelper } from './fixtureHelper';
import { HELPER_CONFIG, HelperPool, type HelperPort } from './helperPool';
import type { Reply, Request } from './protocol';
import { earlierRules, GameSlots, summarize } from './slots';
import { rowsToWorld } from '../adapters/worldRows';
import { GameIndexStore } from '../adapters/games';
import { createGameStore, NOTIFICATIONS_KEY, type SystemNotification } from './store';
import { START } from './host.testkit';
import { divisionName } from '../presentation/competitionLabels';

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

/**
 * This browser's game databases (→SAVE-2), in memory and outliving every engine worker as OPFS
 * files do; every write fails while `failWrites` holds, before it touches a row.
 */
let files = new Map<string, RecordStore>();
/** The SQLite behind each game's store, to write its file out as bytes (→SAVE-9). */
let drivers = new Map<string, SerializableDriver>();
let failWrites = false;
const keepStore = (gameId: string, driver: SerializableDriver) => {
  const inner = sqlRecordStore(driver);
  const store: RecordStore = {
    ...inner,
    write(changes) {
      if (failWrites) throw new Error('QuotaExceededError');
      inner.write(changes);
    },
    close() {},
  };
  files.set(gameId, store);
  drivers.set(gameId, driver);
  return store;
};
const openStore: OpenStore = (gameId, { create }) =>
  files.get(gameId) ?? (create ? keepStore(gameId, nodeSqliteDriver()) : undefined);
const gameFiles: GameFiles = {
  list: () => [...files.keys()],
  remove: (gameId) => {
    files.delete(gameId);
    drivers.delete(gameId);
  },
};
/** The same files as bytes, as the pool gives the engine worker. */
const databaseBytes: DatabaseBytes = {
  read: (gameId) => drivers.get(gameId)?.serialize(),
  meta: (gameId) => {
    const store = files.get(gameId);
    return store && saveMetaOf(store.meta());
  },
  scratch: async (bytes) => {
    const driver = nodeSqliteDriver(':memory:', bytes);
    return { driver, bytes: () => driver.serialize(), release: () => driver.close() };
  },
  write: async (gameId, bytes) => void keepStore(gameId, nodeSqliteDriver(':memory:', bytes)),
};
/** The world the game in play exports as a `.haeram-save` file, read back out of its database. */
async function exportedWorld(client: GameClient) {
  const file = await client.exportFile();
  expect(file).toBeDefined();
  const { dbBytes } = await decodeSaveFile(file!);
  const driver = nodeSqliteDriver(':memory:', dbBytes);
  const world = rowsToWorld(sqlRecordStore(driver), { includeCold: false });
  driver.close();
  return world;
}
/** The revision a game's database last committed. */
const committed = (gameId: string) => Number(files.get(gameId)?.meta().revision ?? -1);
/** Lists the world in play in the slot index, as the app does once it is shown (→SAVE-14). */
function listGame(client: GameClient) {
  new GameSlots(client, new GameIndexStore(storage)).sync(client.state.view?.world);
}
/** `w` committed whole as the database of `gameId`, listed as the game in play in slot 1. */
function seedGame(w: World, gameId = 'seeded') {
  files.delete(gameId);
  drivers.delete(gameId);
  new RowSaver(openStore(gameId, { create: true }) as RecordStore).save(w);
  const index = new GameIndexStore(storage);
  const slots = index.read();
  slots.slots[0] = { id: gameId, worldId: w.id, summary: summarize(w), playedAt: '' };
  slots.active = 0;
  index.write(slots);
  return gameId;
}

/** Real host + persistence, with structured cloning at both worker boundaries. */
class WorkerPort {
  static instances: WorkerPort[] = [];
  /** The match-model release the next engine host takes; the production switch unless a test sets it. */
  static release?: MatchModelRelease;
  requests: Request[] = [];
  replies: { request: Request; reply: Reply }[] = [];
  onmessage?: (event: MessageEvent<Reply>) => void;
  onerror?: () => void;
  /** Save answers wait for this, so a test can hold a commit's answer while the game moves on. */
  static saveGate = Promise.resolve();
  host = new Host((reply) => this.deliver(reply), {
    release: WorkerPort.release,
    openStore,
    gameFiles,
    databaseBytes,
  });
  private helperPorts: MessagePort[] = [];
  constructor() {
    WorkerPort.instances.push(this);
  }
  private deliver(reply: Reply) {
    const cloned = structuredClone(reply);
    this.onmessage?.({ data: cloned } as MessageEvent<Reply>);
    return cloned;
  }
  postMessage(
    input:
      | Request
      | { type: 'cancel' }
      | { type: 'helpers'; ports: MessagePort[] }
      | { type: 'helpers-failed' },
  ) {
    if ('type' in input) {
      if (input.type === 'helpers') {
        this.helperPorts = input.ports;
        this.host.helpers = new HelperPool(input.ports as unknown as HelperPort[]);
      } else if (input.type === 'helpers-failed') this.host.helpers?.disable();
      else this.host.cancelled = true;
      return;
    }
    this.requests.push(input);
    const saving = input.body.type === 'save' || input.body.type === 'create-game';
    void this.host.handle(structuredClone(input)).then(async (reply) => {
      if (saving) await WorkerPort.saveGate;
      this.replies.push({ request: input, reply: this.deliver(reply) });
    });
  }
  terminate() {
    for (const port of this.helperPorts) port.close();
  }
}

/** A fixture helper as fixtureHelper.ts wires it, serving shares on a real MessageChannel port. */
class HelperWorker {
  static instances: HelperWorker[] = [];
  onerror?: () => void;
  terminated = false;
  private port?: MessagePort;
  constructor() {
    HelperWorker.instances.push(this);
  }
  postMessage(input: { type: 'port'; port: MessagePort }) {
    this.port = input.port;
    serveHelper(input.port as unknown as Parameters<typeof serveHelper>[0]);
  }
  terminate() {
    this.terminated = true;
    this.port?.close();
  }
}

function FakeWorker(url: URL) {
  if (String(url).endsWith('fixtureHelper.ts')) return new HelperWorker();
  return new WorkerPort();
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

const founding = { country: 'ENG' as const, seed: 'client-background' };
let storage: MemoryStorage;
const clients: GameClient[] = [];
/**
 * Starts a game in `client` as a player does (→WEB-2, WEB-15): the runtime tests' `START` on `seed`
 * generated, then the club the list names first that the fortune pays taken over; `replace` starts
 * it beside a game in play. Resolves with the take-over reply.
 */
async function startGame(client: GameClient, seed = 'client-background', replace = false) {
  await client.generate({ ...START, seed }, replace);
  const club = client.state.start?.listings?.find((listing) => listing.affordable);
  if (!club) throw new Error(client.state.start?.error ?? 'the fortune pays for no club');
  return client.takeOver(club.clubId);
}
/** The own club's name in `w`. */
const clubName = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!.name;
/** A writer with a club taken over whose first checkpoint is committed. */
async function start(notify: (state: ClientState) => void = () => {}) {
  const client = new GameClient(notify);
  clients.push(client);
  await client.start();
  await startGame(client);
  listGame(client);
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
  WorkerPort.release = undefined;
  WorkerPort.saveGate = Promise.resolve();
  files = new Map();
  drivers = new Map();
  failWrites = false;
  HelperWorker.instances = [];
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

describe('fixture helpers', () => {
  /**
   * The writer lock as the shared stub grants it, on a device with `cores` logical cores. A second
   * call is another device: its storage starts empty, so its client starts a game of its own rather
   * than loading the one the earlier device saved.
   */
  function withCores(cores: number | undefined) {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('navigator', {
      hardwareConcurrency: cores,
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: { name: string }) => Promise<void>,
        ) => callback({ name: 'writer' }),
      },
    });
  }
  it('creates its helpers on a device with the cores and hands their ports to the engine worker', async () => {
    withCores(HELPER_CONFIG.minCores);
    const client = await start();
    expect(HelperWorker.instances).toHaveLength(HELPER_CONFIG.count);
    const host = WorkerPort.instances[0]!.host;
    expect(host.helpers?.active).toBe(true);
    // Unattended play: staff decide every business category and nothing stops to observe.
    const settings = structuredClone(client.state.view!.world.settings!);
    for (const key of Object.keys(
      settings.responsibilities,
    ) as (keyof typeof settings.responsibilities)[])
      settings.responsibilities[key] = 'delegated';
    settings.observations = { matchEve: false, windowOpen: false };
    await client.command({ type: 'settings', settings }, { background: true });
    // The first own match is a league day within two weeks; it plays with the helpers' fixtures.
    for (let day = 0; !client.state.view!.world.ownMatches.length; day++) {
      expect(day).toBeLessThan(14);
      await client.command({ type: 'advance-days', days: 1 }, { background: true });
    }
    expect(host.helpers?.active).toBe(true);
    expect(client.state.error).toBeUndefined();
  });
  it('creates none below the core threshold or without a reported count', async () => {
    withCores(HELPER_CONFIG.minCores - 1);
    await start();
    withCores(undefined);
    await start();
    expect(HelperWorker.instances).toEqual([]);
    expect(WorkerPort.instances.map((worker) => worker.host.helpers)).toEqual([
      undefined,
      undefined,
    ]);
  });
  it('a helper error ends helper use and a creation failure leaves the engine worker computing', async () => {
    withCores(HELPER_CONFIG.minCores);
    await start();
    HelperWorker.instances[1]!.onerror?.();
    expect(HelperWorker.instances.every((helper) => helper.terminated)).toBe(true);
    expect(WorkerPort.instances[0]!.host.helpers?.active).toBe(false);
    // Another device with the cores, whose browser refuses the helper workers.
    withCores(HELPER_CONFIG.minCores);
    vi.stubGlobal('Worker', function BlockedHelpers(url: URL) {
      if (String(url).endsWith('fixtureHelper.ts')) throw new Error('blocked');
      return FakeWorker(url);
    });
    const client = await start();
    expect(WorkerPort.instances[1]!.host.helpers).toBeUndefined();
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    expect(client.state.view!.world.calendar?.day).toBe(1);
  });
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

  it('publishes shared held days once, keeping shown snapshots stable through background saves', async () => {
    const store = createGameStore(),
      client = await start((state) => store.publish(state, { viewShared: true })),
      initial = store.getSnapshot().view!;
    const first = await client.command(
      { type: 'advance-days', days: 1 },
      { background: true, automatic: true },
    );
    const second = await client.command(
      { type: 'advance-days', days: 1 },
      { background: true, automatic: true },
    );
    expect(store.getSnapshot().view).toBe(initial);
    expect(client.reveal()).toBe(1);
    const dayOne = store.getSnapshot().view!;
    expect(dayOne).toBe(first!.view);
    expect(dayOne.world.tables).toBe(initial.world.tables);
    expect(dayOne.world.history).toBe(initial.world.history);
    expect(dayOne.world.calendar!.day).toBe(1);
    client.saveSoon();
    await client.whenSaved();
    expect(store.getSnapshot().savedRevision).toBe(second!.view!.world.revision);
    expect(store.getSnapshot().view).toBe(dayOne);
    expect(client.reveal()).toBe(1);
    expect(store.getSnapshot().view).toBe(second!.view);
    expect(store.getSnapshot().view!.world.tables).toBe(initial.world.tables);
    expect(store.getSnapshot().view!.world.calendar!.day).toBe(2);
    expect(dayOne.world.calendar!.day).toBe(1);
    expect(initial.world.calendar!.day).toBe(0);
    expect(client.reveal()).toBe(0);
  });

  it('serializes overlapping background ticks with current revisions and one save at a time', async () => {
    const client = await start();
    await Promise.all([
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
    ]);
    await client.whenSaved();
    const replies = WorkerPort.instances[0].replies,
      commands = replies.filter(({ request }) => request.body.type === 'command'),
      saved = replies
        .filter(({ request }) => ['create-game', 'save'].includes(request.body.type))
        .map(({ reply }) => reply.saved!.revision);
    expect(commands.map(({ request }) => request.expectedRevision)).toEqual([0, 1]);
    // The takeover's game created whole, then the ticks' saves (folded when one was still
    // running): each commits a revision no older than the one before.
    expect(saved[0]).toBe(0);
    expect(saved.length).toBeGreaterThan(1);
    expect(saved).toEqual([...saved].sort((a, b) => a - b));
    expect(committed(client.gameId!)).toBe(2);
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

  it('opens no game in a second tab, which waits behind its playing tab', async () => {
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
    // The game's database opens in the playing tab only (→SAVE-6).
    expect(reader.state.view).toBeUndefined();
    expect(reader.state.elsewhere).toEqual({});
    expect(reader.state.busy).toBe(false);
    expect(reader.state.savedRevision).toBe(-1);
    expect(
      WorkerPort.instances[1].requests.some((request) => request.body.type === 'open-game'),
    ).toBe(false);
  });

  it('opens no game in a tab without Web Locks, saying why, with no notification', async () => {
    await start();
    vi.stubGlobal('navigator', {});
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    expect(reader.state.error).toContain('Web Locks');
    expect(reader.state.view).toBeUndefined();
    expect(notifications()).toHaveLength(0);
  });

  it('takes over writing on 여기서 이어 하기 once the playing tab releases the writer lock', async () => {
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
    expect(reader.state.elsewhere).toEqual({});
    // 여기서 이어 하기 queues for the lock (→SAVE-6).
    reader.continueHere();
    release({ name: 'haeram-soccor:writer' });
    await vi.waitFor(() => expect(reader.state.elsewhere).toBeUndefined());
    expect(notifications()).toMatchObject([{ text: expect.stringContaining('이어서 플레이') }]);
    await vi.waitFor(() => expect(reader.state.view?.world.revision).toBe(0));
  });
  it('retains memory progress and the last committed save when background saving fails', async () => {
    const client = await start();
    failWrites = true;
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    expect(client.state.error).toContain('저장 실패');
    expect(client.state.error).toContain('파일로 내보내세요');
    expect(client.state.saveFailed).toBe(true);
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.savedRevision).toBe(0);
    expect(client.state.processing).toBe(false);
    expect(client.state.busy).toBe(false);
    expect(committed(client.gameId!)).toBe(0);
    // The failed save is never acknowledged; a retry writes the same changes.
    failWrites = false;
    await client.retrySave();
    expect(client.state.saveFailed).toBe(false);
    expect(client.state.savedRevision).toBe(1);
    expect(committed(client.gameId!)).toBe(1);
  });
  it('commits the save in the engine worker, without an inspect or export round trip', async () => {
    const client = await start();
    await client.command({ type: 'advance-days', days: 1 });
    await client.whenSaved();
    const last = WorkerPort.instances[0].replies.findLast(
      ({ request }) => request.body.type === 'save',
    )!.reply;
    expect(last.saved).toEqual({
      gameId: client.gameId,
      worldId: client.state.view!.world.id,
      revision: client.state.view!.world.revision,
    });
    expect(client.state.savedRevision).toBe(last.saved!.revision);
    expect(committed(client.gameId!)).toBe(last.saved!.revision);
  });
  it('saves one at a time and folds requests made meanwhile into one newer save', async () => {
    const client = await start(),
      worker = WorkerPort.instances[0],
      saves = () => worker.requests.filter((request) => request.body.type === 'save');
    failWrites = true;
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(0);
    failWrites = false;
    let release = () => {};
    WorkerPort.saveGate = new Promise<void>((resolve) => (release = resolve));
    const first = client.save();
    await vi.waitFor(() => expect(saves()).toHaveLength(2));
    // While that save's answer is held, a tick and another request each ask for a save.
    const tick = client.command({ type: 'advance-days', days: 1 }, { background: true });
    await vi.waitFor(() => expect(client.state.view?.world.calendar?.day).toBe(2));
    const again = client.save();
    expect(saves()).toHaveLength(2);
    release();
    await Promise.all([first, tick, again]);
    expect(
      worker.replies
        .filter(({ request }) => request.body.type === 'save')
        .map(({ reply }) => reply.saved?.revision),
    ).toEqual([undefined, 1, 2]);
    expect(client.state.savedRevision).toBe(2);
    expect(committed(client.gameId!)).toBe(2);
    expect(client.state.error).toBeUndefined();
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
    // An owner decision asks at once; its command settles while the save's answer is held.
    let release = () => {};
    WorkerPort.saveGate = new Promise<void>((resolve) => (release = resolve));
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
    // The decision's save publishes its commit; the read afterwards publishes nothing.
    await client.whenSaved();
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
      replacement = simulatedWorld({ ...founding, seed: 'replacement' });
    initializeReadModels(replacement);
    await client.importFile(await saveFileOf(replacement));
    expect(client.state.view?.world.id).toBe(replacement.id);
    expect(client.state.savedRevision).toBe(0);
    const before = client.state.view;
    WorkerPort.instances[0].onmessage?.({
      data: { requestId: 'expired-session', ok: true, view: { ...before!, totalMatches: 123 } },
    } as MessageEvent<Reply>);
    expect(client.state.view).toBe(before);
  });
});

function legacyCheckpoint(withHistory = false) {
  // Earlier rules never recorded the full model or tracked manager history (→SAVE-23/24), so they
  // never used either container.
  const legacy = withoutManagerHistory(
    withoutMatchModel(simulatedWorld(founding, withHistory ? { seasons: 1 } : { rounds: 2 })),
  );
  legacy.engine = '1.0.0';
  legacy.revision = 17;
  legacy.cash = '98765432101234567890';
  delete legacy.hardStreak;
  delete legacy.players[0].developed;
  return { legacy };
}

/** A supported career saved before club identities: no designs and no recorded appearances. */
function withoutIdentities(w: World) {
  for (const club of w.clubs) delete club.identity;
  for (const match of w.ownMatches) delete match.appearance;
  return w;
}
/**
 * That career on today's match model, committed as the game in play: its designs are the only
 * upgrade the writer commits.
 */
function identitylessCheckpoint() {
  const legacy = withoutIdentities(simulatedWorld(founding, { rounds: 2 }));
  return { legacy, gameId: seedGame(legacy) };
}

describe('supported-career identity adoption (→SAVE-21)', () => {
  it('adoption commits to the game database at once', async () => {
    const { legacy, gameId } = identitylessCheckpoint();
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toBeUndefined();
    expect(client.state.view!.world.clubs.every((club) => club.identity)).toBe(true);
    expect(client.state.savedRevision).toBe(legacy.revision + 1);
    expect(committed(gameId)).toBe(legacy.revision + 1);
    const saved = rowsToWorld(files.get(gameId)!, { includeCold: false });
    expect(saved.clubs.every((club) => club.identity)).toBe(true);
    expect(saved.ownMatches.every((m) => !('appearance' in m))).toBe(true);
    expect(notifications()).toMatchObject([{ text: SAVE_DATA_UPDATED, read: false }]);
    // Opening the adopted career again changes nothing and tells nothing more.
    await client.reload();
    expect(client.state.savedRevision).toBe(legacy.revision + 1);
    expect(committed(gameId)).toBe(legacy.revision + 1);
    expect(notifications()).toHaveLength(1);
  });
  it('failure preserves the stored game and export access', async () => {
    const { legacy, gameId } = identitylessCheckpoint();
    failWrites = true;
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toContain('갱신한 저장 데이터를 저장하지 못했어요');
    expect(client.state.saveFailed).toBe(true);
    expect(committed(gameId)).toBe(legacy.revision);
    expect(notifications()).toEqual([]);
    // The adopted career stays in memory and exportable.
    const exported = await exportedWorld(client);
    expect(exported.id).toBe(legacy.id);
    expect(exported.revision).toBe(legacy.revision + 1);
    expect(exported.clubs.every((club) => club.identity)).toBe(true);
    expect(canonical(rowsToWorld(files.get(gameId)!, { includeCold: false }))).toBe(
      canonical(legacy),
    );
  });
});

/**
 * A supported career saved before the full match model (no model data, `withoutMatchModel`), the
 * game in play.
 */
function preModelCheckpoint() {
  const career = withoutMatchModel(simulatedWorld(founding, { rounds: 2 }));
  return { career, gameId: seedGame(career) };
}

describe('full match-model activation (→SAVE-23)', () => {
  it('activation commits to the game database at once', async () => {
    WorkerPort.release = ENABLED_RELEASE;
    const { career, gameId } = preModelCheckpoint();
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toBeUndefined();
    const world = client.state.view!.world;
    expect(world.matchModel?.coverage).toBe('activation');
    expect(client.state.savedRevision).toBe(career.revision + 1);
    expect(committed(gameId)).toBe(career.revision + 1);
    expect(rowsToWorld(files.get(gameId)!, { includeCold: false }).matchModel).toEqual(
      world.matchModel,
    );
    expect(notifications()).toMatchObject([{ text: SAVE_DATA_UPDATED, read: false }]);
    // Opening the activated career again changes nothing and tells nothing more.
    await client.reload();
    expect(client.state.view!.world.matchModel).toEqual(world.matchModel);
    expect(committed(gameId)).toBe(career.revision + 1);
    expect(notifications()).toHaveLength(1);
  });
  it('failure preserves the stored game and export access', async () => {
    WorkerPort.release = ENABLED_RELEASE;
    const { career, gameId } = preModelCheckpoint();
    failWrites = true;
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toContain('갱신한 저장 데이터를 저장하지 못했어요');
    expect(client.state.saveFailed).toBe(true);
    expect(committed(gameId)).toBe(career.revision);
    expect(notifications()).toEqual([]);
    // The activated career stays in memory and exportable.
    const exported = await exportedWorld(client);
    expect(exported.revision).toBe(career.revision + 1);
    expect(exported.matchModel?.trackedFrom.round).toBe(career.round + 1);
    expect(canonical(rowsToWorld(files.get(gameId)!, { includeCold: false }))).toBe(
      canonical(career),
    );
  });
  it('a tab behind the playing tab neither opens, activates nor writes', async () => {
    WorkerPort.release = ENABLED_RELEASE;
    const { career, gameId } = preModelCheckpoint();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
          callback(null),
      },
    });
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    expect(reader.state.view).toBeUndefined();
    expect(committed(gameId)).toBe(career.revision);
  });
  it('keeps a revealed playback of this career across a reload that holds its match', async () => {
    const client = await start();
    const founded = await exportedWorld(client);
    await client.command({ type: 'advance', rounds: 1 });
    await client.whenSaved();
    const playback = client.state.playback!;
    expect(playback.record.id).toBe(client.state.view!.world.ownMatches.at(-1)!.id);
    await client.reload();
    // A released match's playback keeps its record and script and stages its picture again from
    // the script (T834, →MATCH-39), so the object is new while the match is the same.
    expect(playback.script?.beats.length).toBeGreaterThan(0);
    expect(client.state.playback?.record).toBe(playback.record);
    expect(client.state.playback?.script).toBe(playback.script);
    // A game saved without that match replays its fixture: the playback goes.
    seedGame(founded, client.gameId);
    await client.reload();
    expect(client.state.view!.world.ownMatches).toHaveLength(0);
    expect(client.state.playback).toBeUndefined();
  });
});

/**
 * A founded career of the rules-4.0.0 line (game version 0.7.0), the game in play, written as that
 * line wrote it: the full match model and the managers' history.
 */
function rules4Checkpoint() {
  const career = simulatedWorld(founding, { rounds: 2 });
  return { career, gameId: seedGame({ ...structuredClone(career), engine: '0.7.0' }) };
}

describe('founded rules-4.0.0-line careers in game version 0.8.0 (→SAVE-26)', () => {
  it('the writer keeps a 0.7.0 career as stored and names its rules (→SAVE-26/29)', async () => {
    const { gameId } = rules4Checkpoint();
    const stored = JSON.stringify([files.get(gameId)!.meta(), files.get(gameId)!.count('squad')]);
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.view).toBeUndefined();
    expect(client.state.errorCode).toBe('save-compatibility');
    expect(client.state.error).toContain('규칙 0.7.0 커리어');
    // Nothing converted, cleared or announced: the stored career stays as it was.
    expect(JSON.stringify([files.get(gameId)!.meta(), files.get(gameId)!.count('squad')])).toBe(
      stored,
    );
    const said = notifications().length;
    await client.reload();
    expect(notifications()).toHaveLength(said);
  });
});

describe('a new game by takeover (→WEB-2, WORLD-13, ECON-38, SAVE-27)', () => {
  const choice = {
    tier: 'oil' as const,
    traits: ['talisman' as const, 'fansFriend' as const],
    decade: 1930 as const,
    seed: 'client-takeover',
  };
  it('generates the world, reads a club sheet, takes the club over and saves the career whole', async () => {
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    const generated = await client.generate(choice);
    expect(generated?.ok).toBe(true);
    // Nothing is in play or saved until the takeover (→WORLD-13).
    expect(client.state.view).toBeUndefined();
    expect(storage.getItem('haeram-soccor:games')).toBeNull();
    const start = client.state.start!;
    expect(start.choice).toEqual(choice);
    expect(BigInt(start.fortune!)).toBeGreaterThan(0n);
    const club = start.listings!.find((listing) => listing.affordable && listing.division === 0)!;
    expect(club).toBeDefined();
    const sheet = await client.startClubProfile(club.clubId);
    expect(sheet!.squad.length).toBeGreaterThan(10);
    expect(sheet!.stadium.seats).toBeGreaterThan(0);
    // A club nobody owns names a holder of every post (→STAFF-49), the manager first.
    expect(sheet!.staff.map((post) => post.post)).toEqual(CLUB_POSTS);
    expect(sheet!.staff.every((post) => post.name)).toBe(true);
    await expect(client.startClubProfile('nobody')).rejects.toThrow('인수할 수 없는 구단입니다.');

    const reply = await client.takeOver(club.clubId);
    expect(reply?.ok).toBe(true);
    listGame(client);
    expect(client.state.start).toBeUndefined();
    const w = client.state.view!.world;
    expect(w.playerClub).toBe(club.clubId);
    // After the takeover any club reads from the career: ours and a rival list every post.
    const own = await client.clubProfile(club.clubId);
    expect(own.staff[0]).toMatchObject({ post: 'manager', name: w.manager.name });
    expect(own.staff.map((post) => post.post)).toContain('director');
    const rival = w.clubs.find((c) => c.id !== club.clubId)!;
    const rivalProfile = await client.clubProfile(rival.id);
    expect(rivalProfile.staff.map((post) => post.post)).toEqual(CLUB_POSTS);
    const rivalSquad = rivalProfile.squad;
    const found = await client.playerProfile(rivalSquad[0]!.id);
    expect(found).toMatchObject({ club: rival.id, player: { name: rivalSquad[0]!.name } });
    expect(w.build).toBeUndefined();
    expect(w.policy).toBeUndefined();
    expect(w.direction).toBeUndefined();
    expect(w.engine).toBe(CURRENT_ENGINE_VERSION);
    expect(w.owner).toMatchObject({ tier: 'oil', traits: choice.traits });
    expect(w.owner!.takeover).toMatchObject({ year: 1930, clubId: club.clubId });
    await client.whenSaved();
    expect(client.state.savedRevision).toBe(w.revision);

    // The committed checkpoint is the career as it stands, owner and all (→SAVE-27).
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    const loaded = reader.state.view!.world;
    expect(loaded.id).toBe(w.id);
    expect(loaded.owner).toEqual(w.owner);
    expect(loaded.loan).toEqual(w.loan);
    expect(loaded.clubs.map((c) => c.books)).toEqual(w.clubs.map((c) => c.books));
    expect(loaded.matchModel?.coverage).toBe('founding');
  });

  it('keeps a failed generation with the start and refuses a takeover before one', async () => {
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(await client.takeOver('any')).toBeUndefined();
    expect(client.state.error).toContain('먼저 세계를 생성하세요.');
    // A seed of spaces alone is no seed (→WORLD-13).
    await client.generate({ ...choice, seed: '   ' });
    expect(client.state.start?.error).toContain('시드를 확인해 주세요.');
    expect(client.state.start?.listings).toBeUndefined();
    client.leaveStart();
    expect(client.state.start).toBeUndefined();
  });
});

describe('manager-history reads (→HIST-18, WEB-92)', () => {
  it('reads a page in a reopened tab without the command queue, a write or a view', async () => {
    await start();
    const stored = new Map(storage.data);
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    const view = reader.state.view!;
    expect(view.managerHistoryKey).toEqual(expect.any(String));
    expect(view.world).not.toHaveProperty('managerHistory');
    const page = await reader.managerHistory();
    expect(page.rows).toEqual([
      expect.objectContaining({
        kind: 'tenure',
        current: true,
        manager: expect.objectContaining({ id: view.world.manager.id }),
      }),
    ]);
    expect(page.nextCursor).toBeNull();
    const worker = WorkerPort.instances[1],
      read = worker.replies.findLast(({ request }) => request.body.type === 'manager-history')!;
    // The read names the career it shows and comes back without a view to take.
    expect(read.request.body).toEqual({ type: 'manager-history', world: view.world.id });
    expect(read.reply.view).toBeUndefined();
    expect(read.reply.viewDelta).toBeUndefined();
    expect(reader.state.view).toBe(view);
    expect(reader.state.busy).toBe(false);
    expect(worker.requests.some((request) => ['command', 'save'].includes(request.body.type))).toBe(
      false,
    );
    expect(storage.data).toEqual(stored);
  });

  it('refuses a page for any career but the one this tab shows', async () => {
    const client = await start();
    const worker = WorkerPort.instances[0],
      shown = worker.host.world!;
    // The worker has moved to another game before this tab heard of it.
    worker.host.world = { ...shown, id: 'world:another' };
    await expect(client.managerHistory()).rejects.toThrow('다른 커리어');
    worker.host.world = shown;
    expect((await client.managerHistory()).rows).toHaveLength(1);
    // This tab moved to another game while the page was on its way.
    const pending = client.managerHistory();
    client.state.view = {
      ...client.state.view!,
      world: { ...client.state.view!.world, id: 'world:next' },
    };
    await expect(pending).rejects.toThrow('다른 커리어');
  });
});

describe('earlier-rules and future saves: compatibility recovery', () => {
  it('protects an unsupported game database without an automatic beta reset', async () => {
    const { legacy } = legacyCheckpoint();
    const gameId = seedGame(legacy);
    const before = JSON.stringify([files.get(gameId)!.meta(), files.get(gameId)!.count('squad')]);
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.errorCode).toBe('save-compatibility');
    expect(client.state.view).toBeUndefined();
    expect(JSON.stringify([files.get(gameId)!.meta(), files.get(gameId)!.count('squad')])).toBe(
      before,
    );
  });
  it('refuses a future game database as stored, naming it unsupported', async () => {
    const career = simulatedWorld(founding, { rounds: 2 });
    const gameId = seedGame({ ...structuredClone(career), engine: '9.0.0' });
    const before = JSON.stringify(files.get(gameId)!.meta());
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.errorCode).toBe('save-compatibility');
    expect(client.state.error).toContain('지원하지 않는');
    expect(client.state.view).toBeUndefined();
    expect(JSON.stringify(files.get(gameId)!.meta())).toBe(before);
  });

  it('imports a file as a whole game and keeps it exportable and retryable after a write failure', async () => {
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    const replacement = simulatedWorld({ ...founding, seed: 'explicit-recovery-quota' });
    initializeReadModels(replacement);
    await client.importFile(await saveFileOf(replacement));
    expect(client.state.error).toBeUndefined();
    expect(client.state.view?.world.id).toBe(replacement.id);
    expect(client.state.savedRevision).toBe(0);
    expect(committed(client.gameId!)).toBe(0);
    expect(canonical(await exportedWorld(client))).toBe(canonical(replacement));
    // A day later its save fails: the progress stays exportable from memory, and a retry commits.
    failWrites = true;
    await client.command({ type: 'advance-days', days: 1 });
    await client.save().catch(() => {});
    expect(client.state.error).toContain('Quota');
    const revision = client.state.view!.world.revision;
    expect(revision).toBeGreaterThan(0);
    expect(committed(client.gameId!)).toBe(0);
    expect((await exportedWorld(client)).revision).toBe(revision);
    failWrites = false;
    await client.retrySave();
    expect(client.state.error).toBeUndefined();
    expect(committed(client.gameId!)).toBe(revision);
  });
});

describe('game slots', () => {
  /** The game ID each slot lists, in slot order. */
  const ids = (slots: GameSlots) => slots.read().slots.map((entry) => entry?.id);
  it('saves and closes the game in play, starts another in an empty slot and switches back intact', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const first = client.state.view!.world.id,
      firstClub = clubName(client.state.view!.world);
    expect(slots.sync(client.state.view!.world)).toMatchObject({ active: 0 });
    const firstGame = client.gameId!;

    await slots.prepare(1);
    await startGame(client, 'second-slot', true);
    await client.whenSaved();
    const second = client.state.view!.world.id;
    expect(second).not.toBe(first);
    let index = slots.sync(client.state.view!.world, true);
    expect(index.active).toBe(1);
    expect(index.slots.map((entry) => entry?.summary.club)).toEqual([
      firstClub,
      clubName(client.state.view!.world),
      undefined,
    ]);
    // A new game creates its own file; the first game's stays as it was saved.
    expect([...files.keys()].sort()).toEqual([firstGame, client.gameId!].sort());
    await client.command({ type: 'advance-days', days: 1 });
    const secondGame = client.gameId!;

    await slots.continue(0);
    expect(client.state.view!.world.id).toBe(first);
    expect(slots.read().active).toBe(0);
    // Switching saved the game left, and the one come back is its database as saved.
    expect(client.gameId).toBe(firstGame);
    expect(committed(firstGame)).toBe(client.state.view!.world.revision);
    expect(committed(secondGame)).toBe(1);
    // The second game kept the day it had played before it was closed.
    await slots.continue(1);
    expect(client.state.view!.world.id).toBe(second);
    expect(client.state.view!.world.calendar?.day).toBe(1);

    // Deleting a game not in play removes its file only; the game in play's takes its file with it.
    expect(await slots.remove(0)).toBe(false);
    index = slots.read();
    expect(index.slots[0]).toBeNull();
    expect([...files.keys()]).toEqual([secondGame]);
    expect(await slots.remove(1)).toBe(true);
    expect(files.size).toBe(0);
    expect(client.state.view).toBeUndefined();
    expect(slots.read()).toMatchObject({ active: null, slots: [null, null, null] });
  });

  it('a failed open leaves both files untouched and the previous game in play (→SAVE-14)', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const first = client.state.view!.world.id;
    slots.sync(client.state.view!.world);
    await slots.prepare(1);
    await startGame(client, 'second-slot', true);
    await client.whenSaved();
    slots.sync(client.state.view!.world, true);
    const [firstGame, secondGame] = ids(slots) as string[];
    await slots.continue(0);
    // The second game's file now belongs to a newer game.
    files.get(secondGame)!.write({ put: [], delete: [], meta: { engine: '99.0.0' } });
    const kept = JSON.stringify([files.get(secondGame)!.meta(), committed(firstGame)]);
    await expect(slots.continue(1)).rejects.toThrow();
    expect(client.state.view!.world.id).toBe(first);
    expect(client.gameId).toBe(firstGame);
    expect(slots.read().active).toBe(0);
    expect(JSON.stringify([files.get(secondGame)!.meta(), committed(firstGame)])).toBe(kept);
    // The reopened game plays and saves as before.
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenSaved();
    expect(committed(firstGame)).toBe(client.state.view!.world.revision);
  });

  it('a new game over an occupied slot deletes the old file once the new one is created', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    slots.sync(client.state.view!.world);
    const old = client.gameId!;
    await slots.prepare(0);
    // Nothing is deleted before the takeover (→WEB-62): the confirmed replacement may still be left.
    expect(files.has(old)).toBe(true);
    await startGame(client, 'replacing', true);
    await client.whenSaved();
    expect(files.has(old)).toBe(false);
    expect([...files.keys()]).toEqual([client.gameId!]);
    expect(slots.sync(client.state.view!.world, true).slots[0]!.id).toBe(client.gameId);
  });

  it('slot import applies only to its intended world', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const first = client.state.view!.world.id;
    slots.sync(client.state.view!.world);
    const firstGame = client.gameId!,
      firstRevision = client.state.view!.world.revision;
    const imported = withoutIdentities(
      simulatedWorld({ ...founding, seed: 'identityless-import' }),
    );
    await slots.importInto(1, await saveFileOf(imported));
    const w = client.state.view!.world;
    expect(w.id).toBe(imported.id);
    expect(w.revision).toBe(imported.revision + 1);
    for (const club of w.clubs) expect(club.identity).toEqual(identityOf(imported, club.id));
    const index = slots.read();
    expect(index.slots.map((entry) => entry?.worldId)).toEqual([first, imported.id, undefined]);
    // The first game's database is what it was; only the imported world was adopted.
    expect(committed(firstGame)).toBe(firstRevision);
    const saved = await exportedWorld(client);
    expect(saved.id).toBe(imported.id);
    expect(saved.clubs.every((club) => club.identity)).toBe(true);
  });

  it('exports any slot as a file: the game in play as it stands, another as last saved (→SAVE-9)', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const first = client.state.view!.world.id;
    slots.sync(client.state.view!.world);
    const imported = simulatedWorld({ ...founding, seed: 'slot-export' });
    initializeReadModels(imported);
    await slots.importInto(1, await saveFileOf(imported));
    // Slot 2's game is in play now and slot 1's rests in its file; both export, an empty slot not.
    const worldOf = async (slot: number) =>
      (await decodeSaveFile((await slots.exportFile(slot))!)).header.worldId;
    expect(await worldOf(0)).toBe(first);
    expect(await worldOf(1)).toBe(imported.id);
    expect(await slots.exportFile(2)).toBeUndefined();
    // A day played and not yet saved is in the file of the game in play: it is saved first.
    await client.command({ type: 'advance-days', days: 1 });
    const { dbBytes } = await decodeSaveFile((await slots.exportFile(1))!);
    const driver = nodeSqliteDriver(':memory:', dbBytes);
    expect(Number(sqlRecordStore(driver).meta().revision)).toBe(client.state.view!.world.revision);
    driver.close();
  });

  it('lists a save from before slots as slot 1 and reads a slot without its file as empty (→SAVE-29)', async () => {
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const index = slots.sync(client.state.view!.world);
    expect(index.active).toBe(0);
    expect(new GameIndexStore(storage).hasGames()).toBe(true);
    const own = client.state.view!.world.clubs.find(
      (club) => club.id === client.state.view!.world.playerClub,
    )!;
    expect(index.slots[0]!.summary.division).toBe(divisionName(own.country, own.tier, own.group));
    // A slot listed without its database file reads as empty, and the game in play stays.
    storage.setItem(
      'haeram-soccor:games',
      JSON.stringify({
        ...index,
        slots: [index.slots[0], { ...index.slots[0], id: 'lost', worldId: 'gone' }, null],
      }),
    );
    const reader = new GameClient(() => {});
    clients.push(reader);
    await reader.start();
    await reader.whenIdle();
    const afterStartup = new GameSlots(reader, new GameIndexStore(storage));
    expect(afterStartup.read().slots.map((entry) => entry?.id)).toEqual([
      index.slots[0]!.id,
      undefined,
      undefined,
    ]);
    await expect(slots.continue(1)).rejects.toThrow();
    expect(client.state.view!.world.id).toBe(index.slots[0]!.worldId);
  });

  it('keeps the rules of each slot: an earlier-rules game is listed as such and never continues', async () => {
    // Its file exists when the tab starts, so the startup listing holds it (→SAVE-29).
    openStore('old', { create: true });
    const client = await start();
    const slots = new GameSlots(client, new GameIndexStore(storage));
    const index = slots.sync(client.state.view!.world);
    expect(index.slots[0]!.engine).toBe(CURRENT_ENGINE_VERSION);
    storage.setItem(
      'haeram-soccor:games',
      JSON.stringify({
        ...index,
        slots: [
          index.slots[0],
          { ...index.slots[0], id: 'old', worldId: 'old', engine: '1.22.0' },
          null,
        ],
      }),
    );
    expect(earlierRules(slots.read().slots[1]!)).toBe('1.22.0');
    await expect(slots.continue(1)).rejects.toThrow('규칙 1.22.0 커리어');
    // Its file is still there to keep, exactly as it was.
    expect(files.has('old')).toBe(true);
  });
});

it('exports the world in play and never another world at the same revision', async () => {
  const client = await start(),
    oldWorld = await exportedWorld(client);
  expect(oldWorld.id).toBe(client.state.view!.world.id);
  await startGame(client, 'other-world-same-revision', true);
  await client.whenSaved();
  const current = await exportedWorld(client);
  expect(current.revision).toBe(oldWorld.revision);
  expect(current.id).not.toBe(oldWorld.id);
  expect(current.id).toBe(client.state.view!.world.id);
});

it('opens no game in a tab behind the playing tab, however many commits it hears of (→SAVE-6)', async () => {
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
  await writer.command({ type: 'advance-days', days: 1 }, { background: true });
  await writer.whenSaved();
  ChannelPort.instances[1].onmessage?.({
    data: { revision: writer.state.savedRevision },
  } as unknown as MessageEvent<{ generation: number }>);
  await reader.whenIdle();
  expect(reader.state.view).toBeUndefined();
  expect(WorkerPort.instances[1].requests).toHaveLength(0);
});
