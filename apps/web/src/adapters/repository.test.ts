import { describe, expect, it, vi } from 'vitest';
import { writeCheckpoint } from './checkpointWriter';
import {
  INDEXED_CHECKPOINT_LIMIT,
  PORTABLE_FILE_LIMIT,
  SaveRepository,
  type Envelope,
  type PreviousStore,
  type StoragePort,
} from './repository';

const MANIFEST = 'haeram-soccor:manifest';
/** Every write in the order it happened, across the manifest and IndexedDB keys. */
type Log = string[];
class Memory implements StoragePort {
  data = new Map<string, string>();
  constructor(private log: Log = []) {}
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.log.push(k);
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.log.push(`-${k}`);
    this.data.delete(k);
  }
}
/** One IndexedDB key of the game in play, `active` or `previous`, in memory. */
class MemoryPrevious implements PreviousStore {
  raw: string | null = null;
  fail = false;
  constructor(
    private name: string,
    private log: Log = [],
  ) {}
  async read() {
    return this.raw;
  }
  async write(raw: string) {
    if (this.fail) throw new Error('QuotaExceededError');
    this.log.push(this.name);
    this.raw = raw;
  }
  async clear() {
    this.log.push(`-${this.name}`);
    this.raw = null;
  }
}
/** A checkpoint whose payload is `size` characters; the fake codec only checks its header. */
function checkpoint(generation: number, size = 100, worldId = 'w1') {
  const envelope: Envelope = {
    schema: 1,
    engine: '0.7.0',
    catalog: 'c',
    catalogHash: 'h',
    worldId,
    generation,
    parentGeneration: generation - 1,
    codec: 'gzip-cjk14',
    checksum: '0'.repeat(64),
    payload: 'x'.repeat(size),
  };
  return JSON.stringify(envelope);
}
const manifestOf = (generation: number, worldId = 'w1') =>
  JSON.stringify({ worldId, generation, parentGeneration: generation - 1 });
async function inspect(raw: string) {
  const envelope = JSON.parse(raw) as Envelope;
  if (!Number.isSafeInteger(envelope?.generation)) throw new Error('손상된 체크포인트');
  return { world: { id: envelope.worldId, revision: envelope.generation }, envelope };
}
function setup(indexed = true) {
  const log: Log = [];
  const storage = new Memory(log),
    previous = new MemoryPrevious('previous', log),
    active = new MemoryPrevious('active', log);
  const open = () =>
    indexed
      ? new SaveRepository(storage, inspect, writeCheckpoint, previous, active)
      : new SaveRepository(storage, inspect, writeCheckpoint);
  return { log, storage, previous, active, open };
}
/** The payload size whose checkpoint takes about `bytes` of conservative UTF-16. */
const sized = (bytes: number) => Math.floor(bytes / 2) - 300;

describe('save repository', () => {
  it('copies the committed generation to previous, then writes active, then the manifest', async () => {
    const { log, storage, previous, active, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    expect(previous.raw).toBeNull();
    log.length = 0;
    await saves.commit(checkpoint(2));
    expect(log).toEqual(['previous', 'active', MANIFEST]);
    expect([previous.raw, active.raw]).toEqual([checkpoint(1), checkpoint(2)]);
    // No checkpoint is written to localStorage on this path.
    expect([...storage.data.keys()]).toEqual([MANIFEST]);
    expect(JSON.parse(storage.getItem(MANIFEST)!)).toEqual({
      worldId: 'w1',
      generation: 2,
      parentGeneration: 1,
    });
    expect(saves.committedRaw()).toBe(checkpoint(2));
    // A failed copy, or a failed active write after it, leaves the committed generation loadable.
    const before = new Map(storage.data);
    previous.fail = true;
    await expect(saves.commit(checkpoint(3))).rejects.toThrow('Quota');
    previous.fail = false;
    active.fail = true;
    await expect(saves.commit(checkpoint(3))).rejects.toThrow('Quota');
    expect(storage.data).toEqual(before);
    expect(active.raw).toBe(checkpoint(2));
    const loaded = await open().load();
    expect(loaded?.envelope.generation).toBe(2);
    expect(loaded?.recovered).toBe(false);
  });
  it('recovers from previous when the active copy is corrupt', async () => {
    const { log, previous, active, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    await saves.commit(checkpoint(2));
    active.raw = 'corrupt';
    const recovery = open();
    const loaded = await recovery.load();
    expect(loaded?.envelope.generation).toBe(1);
    expect(loaded?.recovered).toBe(true);
    expect(recovery.committedRaw()).toBe(checkpoint(1));
    expect(recovery.generationInfo).toEqual({ generation: 2, parentGeneration: 1 });
    // The recovered copy stays the predecessor while the corrupt active copy is replaced.
    log.length = 0;
    await recovery.commit(checkpoint(2));
    expect(log).toEqual(['active', MANIFEST]);
    expect(previous.raw).toBe(checkpoint(1));
    expect((await open().load())?.envelope.generation).toBe(2);
  });
  it("loads the manifest's source, else the newest valid copy, and writes nothing while loading", async () => {
    const { log, storage, previous, active, open } = setup();
    active.raw = checkpoint(2);
    previous.raw = checkpoint(1);
    // Without a manifest the newest valid copy wins.
    storage.data.delete(MANIFEST);
    const newest = open();
    expect((await newest.load())?.raw).toBe(checkpoint(2));
    expect(newest.committedRaw()).toBe(checkpoint(2));
    // A manifest naming active reads it.
    storage.data.clear();
    storage.data.set(MANIFEST, manifestOf(2));
    const declared = await open().load();
    expect([declared?.raw, declared?.recovered]).toEqual([checkpoint(2), false]);
    expect(log).toEqual([]);
  });
  it('never brings a removed game back from its previous copy', async () => {
    const { storage, previous, active, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1, 100, 'old'));
    await saves.commit(checkpoint(2, 100, 'old'));
    // An active copy left alone is still the game in play.
    storage.data.clear();
    expect((await open().load())?.envelope.generation).toBe(2);
    await saves.clearActive();
    const fresh = open();
    expect(await fresh.load()).toBeNull();
    expect(fresh.hasStored()).toBe(false);
    // The first checkpoint of the next career has no predecessor.
    await fresh.commit(checkpoint(1, 100, 'new'));
    expect(previous.raw).toBeNull();
    expect(active.raw).toBe(checkpoint(1, 100, 'new'));
  });
  it('keeps the active copy for recovery exports and the stored-game check', async () => {
    const { storage, active, open } = setup();
    await open().commit(checkpoint(1));
    active.raw = 'corrupt';
    const failed = open();
    await expect(failed.load()).rejects.toThrow('유효한 저장');
    expect(failed.recoveryRaw()).toBe('corrupt');
    storage.data.delete(MANIFEST);
    expect(failed.hasStored()).toBe(true);
    expect(failed.recoveryRaw()).toBe('corrupt');
  });
  it('keeps two 2 MB checkpoints in IndexedDB beyond the localStorage total', async () => {
    const { storage, previous, active, open } = setup();
    const saves = open();
    const size = sized(2_000_000);
    await saves.commit(checkpoint(1, size));
    await saves.commit(checkpoint(2, size));
    expect([previous.raw, active.raw]).toEqual([checkpoint(1, size), checkpoint(2, size)]);
    expect([...storage.data.keys()]).toEqual([MANIFEST]);
  });
  it('enforces the IndexedDB checkpoint budget', async () => {
    const { storage, active, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    const before = [new Map(storage.data), active.raw];
    const limit = INDEXED_CHECKPOINT_LIMIT;
    await expect(saves.commit(checkpoint(2, sized(limit) + 400))).rejects.toThrow('한도');
    expect([storage.data, active.raw]).toEqual(before);
    // The selected layout keeps a candidate just within its own bound.
    await saves.commit(checkpoint(2, sized(limit)));
    expect((await open().load())?.envelope.generation).toBe(2);
  });
  it('keeps larger indexed active and previous copies but rejects an unexportable UTF-8 file before writing', async () => {
    const { storage, previous, active, open } = setup();
    const saves = open();
    const big = sized(3_500_000);
    await saves.commit(checkpoint(1, big));
    await saves.commit(checkpoint(2, big));
    expect(active.raw).toBe(checkpoint(2, big));
    expect(previous.raw).toBe(checkpoint(1, big));
    const before = [new Map(storage.data), active.raw, previous.raw];
    const raw = checkpoint(3).replace(
      'x'.repeat(100),
      '한'.repeat(Math.ceil(PORTABLE_FILE_LIMIT / 3)),
    );
    expect(raw.length * 2).toBeLessThan(INDEXED_CHECKPOINT_LIMIT);
    await expect(saves.commit(raw)).rejects.toThrow('한도');
    expect([storage.data, active.raw, previous.raw]).toEqual(before);
  });
  it('requires IndexedDB and never reads, migrates or removes old checkpoint or strategy keys', async () => {
    const { storage, open } = setup(false);
    const oldKeys = ['haeram-soccor:slot:a', 'haeram-soccor:slot:b', 'haeram-soccor:strategies'];
    for (const key of oldKeys) storage.setItem(key, 'old data');
    const before = new Map(storage.data);
    await expect(open().load()).rejects.toThrow('IndexedDB');
    await expect(open().commit(checkpoint(1))).rejects.toThrow('IndexedDB');
    expect(storage.data).toEqual(before);
    const indexed = setup();
    for (const key of oldKeys) indexed.storage.setItem(key, 'old data');
    expect(await indexed.open().load()).toBeNull();
    await indexed.open().commit(checkpoint(1));
    expect(oldKeys.map((key) => indexed.storage.getItem(key))).toEqual(
      oldKeys.map(() => 'old data'),
    );
  });
  it('loads the committed predecessor after an interrupted manifest write', async () => {
    const { storage, active, previous, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    const set = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    await expect(saves.commit(checkpoint(2))).rejects.toThrow('Quota');
    expect(active.raw).toBe(checkpoint(2));
    expect(previous.raw).toBe(checkpoint(1));
    const recovery = open();
    expect((await recovery.load())?.raw).toBe(checkpoint(1));
    set.mockRestore();
    await recovery.commit(checkpoint(2));
    expect(previous.raw).toBe(checkpoint(1));
  });
  it('reports IndexedDB read failures without treating an existing game as empty', async () => {
    const { active, open } = setup();
    vi.spyOn(active, 'read').mockRejectedValue(new Error('IndexedDB access denied'));
    await expect(open().load()).rejects.toThrow('IndexedDB access denied');
  });
});
