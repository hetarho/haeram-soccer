import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceRound, createWorld, simulateSeason } from '../../../../packages/engine/src/index';
import { canonical } from '../../../../packages/contracts/src/index';
import { CURRENT_ENGINE_VERSION } from '../../../../packages/contracts/src/versions';
import { decode, encode, type StoragePort } from '../adapters/persistence';
import { GameClient, type ClientState } from './client';
import { Host } from './host';
import type { Reply, Request } from './protocol';

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
  private host = new Host((reply) => this.deliver(reply));
  constructor() {
    WorkerPort.instances.push(this);
  }
  private deliver(reply: Reply) {
    const cloned = structuredClone(reply);
    this.onmessage?.({ data: cloned } as MessageEvent<Reply>);
    return cloned;
  }
  postMessage(input: Request | { type: 'cancel' }) {
    if ('type' in input) {
      this.host.cancelled = true;
      return;
    }
    this.requests.push(input);
    void this.host.handle(structuredClone(input)).then((reply) => {
      this.replies.push({ request: input, reply: this.deliver(reply) });
    });
  }
  terminate() {}
}

class ChannelPort {
  onmessage?: (event: MessageEvent<{ generation: number }>) => void;
  postMessage() {}
  close() {}
}

const founding = {
  country: 'ENG' as const,
  name: 'Background Athletic',
  color: '#223344',
  seed: 'client-background',
  difficulty: 1,
};
let storage: MemoryStorage;
const clients: GameClient[] = [];
async function start(notify: (state: ClientState) => void = () => {}) {
  const client = new GameClient(notify);
  clients.push(client);
  await client.start();
  await client.found(founding);
  return client;
}

beforeEach(() => {
  storage = new MemoryStorage();
  WorkerPort.instances = [];
  vi.stubGlobal('Worker', WorkerPort);
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
  it('waits for admitted background work and its save before a manual decision', async () => {
    const client = await start();
    const background = client.command({ type: 'advance-days', days: 1 }, { background: true });
    await client.whenIdle();
    await background;
    expect(client.state.processing).toBe(false);
    expect(client.state.savedRevision).toBe(client.state.view!.world.revision);
    expect(client.state.view!.world.calendar?.day).toBe(1);
  });
  it('advances without foreground loading flashes and does not activate save-validation views', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    const initialTables = client.state.view!.world.tables;
    publications.length = 0;
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    const worker = WorkerPort.instances[0],
      command = worker.replies.findLast(({ request }) => request.body.type === 'command')!,
      validation = worker.replies.findLast(({ request }) => request.body.type === 'inspect')!;
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
    expect(client.state.view).not.toBe(validation.reply.view);
    expect(client.state.view!.world.tables).toBe(initialTables);
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.savedRevision).toBe(client.state.view?.world.revision);
  });

  it('serializes overlapping background ticks with current revisions and checkpoint generations', async () => {
    const client = await start();
    await Promise.all([
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
      client.command({ type: 'advance-days', days: 1 }, { background: true }),
    ]);
    const commands = WorkerPort.instances[0].requests.filter(
      (request) => request.body.type === 'command',
    );
    expect(commands.map((request) => request.expectedRevision)).toEqual([0, 1]);
    expect(commands.map((request) => request.generation)).toEqual([2, 3]);
    expect(client.state.view?.world.calendar?.day).toBe(2);
    expect(client.state.savedRevision).toBe(2);
    expect(client.state.error).toBeUndefined();
  });

  it('retains foreground progress feedback for an explicitly requested manual command', async () => {
    const publications: ClientState[] = [],
      client = await start((state) => publications.push(state));
    publications.length = 0;
    await client.command({ type: 'advance-days', days: 2 });
    expect(publications.some((state) => state.busy && state.activity === 'foreground')).toBe(true);
    expect(publications.some((state) => state.busy && state.progress > 0)).toBe(true);
    expect(client.state.busy).toBe(false);
    expect(client.state.processing).toBe(false);
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
    expect(reader.state.notice).toContain('이어서 플레이');
    await vi.waitFor(() => expect(reader.state.view?.world.revision).toBe(0));
  });
  it('retains memory progress and the last recoverable checkpoint when background saving fails', async () => {
    const client = await start(),
      manifest = storage.getItem('haeram-soccor:manifest')!;
    storage.fail = 'haeram-soccor:manifest';
    await client.command({ type: 'advance-days', days: 1 }, { background: true });
    expect(client.state.error).toContain('저장 실패');
    expect(client.state.error).toContain('파일로 내보내세요');
    expect(client.state.view?.world.calendar?.day).toBe(1);
    expect(client.state.savedRevision).toBe(0);
    expect(client.state.processing).toBe(false);
    expect(client.state.busy).toBe(false);
    expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
    const slot = JSON.parse(manifest).slot ? 'b' : 'a',
      saved = await decode(storage.getItem(`haeram-soccor:slot:${slot}`)!);
    expect(saved.world.calendar?.day).toBe(0);
  });

  it('activates an explicit import while ignoring unsolicited stale worker responses', async () => {
    const client = await start(),
      replacement = createWorld({ ...founding, seed: 'replacement', name: 'New Athletic' });
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
  const legacy = createWorld(founding);
  if (withHistory) simulateSeason(legacy);
  else {
    advanceRound(legacy, undefined, false);
    advanceRound(legacy, undefined, false);
  }
  legacy.engine = '1.0.0';
  legacy.revision = 17;
  legacy.cash = '98765432101234567890';
  delete legacy.training;
  delete legacy.players[0].developed;
  const raw = await encode(legacy, 7, 6);
  storage.setItem('haeram-soccor:slot:a', raw);
  storage.setItem(
    'haeram-soccor:manifest',
    JSON.stringify({ slot: 0, worldId: legacy.id, generation: 7, parentGeneration: 6 }),
  );
  return { legacy, raw };
}

describe('legacy activation and compatibility recovery', () => {
  it('commits a writer upgrade through the inactive slot and preserves the full old career', async () => {
    const { legacy, raw } = await legacyCheckpoint(true);
    expect(legacy.ownMatches.length).toBeGreaterThan(30);
    expect(legacy.history.length).toBeGreaterThan(0);
    const writes = vi.spyOn(storage, 'setItem');
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.error).toBeUndefined();
    expect(client.state.view?.world.engine).toBe(CURRENT_ENGINE_VERSION);
    expect(client.state.savedRevision).toBe(18);
    expect(writes.mock.calls.map(([key]) => key)).toEqual([
      'haeram-soccor:slot:b',
      'haeram-soccor:manifest',
    ]);
    const manifest = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
    expect(manifest).toEqual({ slot: 1, worldId: legacy.id, generation: 8, parentGeneration: 7 });
    expect(storage.getItem('haeram-soccor:slot:a')).toBe(raw);
    const upgraded = (await decode(storage.getItem('haeram-soccor:slot:b')!)).world;
    expect(canonical(upgraded)).toBe(
      canonical({ ...legacy, engine: CURRENT_ENGINE_VERSION, revision: 18 }),
    );
    expect(canonical((await decode((await client.exportFile())!)).world)).toBe(canonical(upgraded));
  });

  it('opens an old career read-only without upgrading memory or committing either slot', async () => {
    const { legacy } = await legacyCheckpoint();
    const before = new Map(storage.data);
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
          callback(null),
      },
    });
    const client = new GameClient(() => {});
    clients.push(client);
    await client.start();
    expect(client.state.readonly).toBe(true);
    expect(client.state.error).toBeUndefined();
    expect(client.state.view?.world.engine).toBe('1.0.0');
    expect(client.state.savedRevision).toBe(17);
    expect(storage.data).toEqual(before);
    expect(canonical((await decode((await client.exportFile())!)).world)).toBe(canonical(legacy));
    expect(storage.data).toEqual(before);
    expect(
      WorkerPort.instances[0].requests
        .filter((request) => request.body.type === 'inspect')
        .some((request) => request.body.type === 'inspect' && request.body.upgrade),
    ).toBe(false);
  });

  it.each(['haeram-soccor:slot:b', 'haeram-soccor:manifest'])(
    'keeps old disk and exports upgraded memory when %s rejects the upgrade write',
    async (failedKey) => {
      const { legacy, raw } = await legacyCheckpoint();
      const manifest = storage.getItem('haeram-soccor:manifest');
      storage.fail = failedKey;
      const client = new GameClient(() => {});
      clients.push(client);
      await client.start();
      expect(client.state.error).toContain('규칙 업그레이드 저장 실패');
      expect(client.state.error).toContain('파일로 내보내세요');
      expect(client.state.view?.world.engine).toBe(CURRENT_ENGINE_VERSION);
      expect(client.state.view?.world.revision).toBe(18);
      expect(client.state.savedRevision).toBe(17);
      expect(storage.getItem('haeram-soccor:slot:a')).toBe(raw);
      expect(storage.getItem('haeram-soccor:manifest')).toBe(manifest);
      const exported = (await decode((await client.exportFile())!)).world;
      expect(canonical(exported)).toBe(
        canonical({ ...legacy, engine: CURRENT_ENGINE_VERSION, revision: 18 }),
      );
      storage.fail = '';
      await client.retrySave();
      expect(client.state.savedRevision).toBe(18);
      const current = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
      expect(current.slot).toBe(1);
      expect(current.generation).toBe(8);
      expect(storage.getItem('haeram-soccor:slot:a')).toBe(raw);
    },
  );

  it.each([true, false])(
    'returns a typed error and exports the selected future checkpoint with manifest=%s',
    async (hasManifest) => {
      await legacyCheckpoint();
      const old = storage.getItem('haeram-soccor:slot:a')!;
      const future = JSON.stringify({ ...JSON.parse(old), engine: '2.0.0', generation: 8 });
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
      const replacement = createWorld({ ...founding, seed: 'explicit-recovery' });
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
    const selected = JSON.parse(storage.getItem('haeram-soccor:manifest')!);
    storage.setItem(`haeram-soccor:slot:${selected.slot ? 'b' : 'a'}`, 'corrupt');
    client.dispose();
    clients.splice(clients.indexOf(client), 1);
    const restored = new GameClient(() => {});
    clients.push(restored);
    await restored.start();
    expect(restored.state.error).toBeUndefined();
    expect(restored.state.notice).toContain('체크포인트로 복구');
    expect(restored.state.view?.world.calendar?.day).toBe(0);
    expect(restored.state.savedRevision).toBe(0);
    await restored.command({ type: 'advance-days', days: 1 });
    expect(restored.state.error).toBeUndefined();
    expect(restored.state.savedRevision).toBe(1);
  });

  it('keeps an explicitly imported replacement exportable and retryable after future-save write failure', async () => {
    const { raw } = await legacyCheckpoint();
    const future = JSON.stringify({ ...JSON.parse(raw), engine: '2.0.0' });
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
    const replacement = createWorld({ ...founding, seed: 'explicit-recovery-quota' });
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
