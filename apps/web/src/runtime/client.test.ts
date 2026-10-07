import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
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
