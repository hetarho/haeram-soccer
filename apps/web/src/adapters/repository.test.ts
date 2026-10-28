import { describe, expect, it } from 'vitest';
import { PreviousUnavailableError, writeCheckpoint } from './checkpointWriter';
import {
  CHECKPOINT_LIMIT,
  SaveRepository,
  type Envelope,
  type PreviousStore,
  type StoragePort,
} from './repository';

const MANIFEST = 'haeram-soccor:manifest',
  A = 'haeram-soccor:slot:a',
  B = 'haeram-soccor:slot:b';
/** Every write in the order it happened, across localStorage and the IndexedDB keys. */
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
const manifestOf = (slot: number, generation: number, worldId = 'w1') =>
  JSON.stringify({ slot, worldId, generation, parentGeneration: generation - 1 });
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
  /** A repository of a browser without IndexedDB, which wrote the earlier slot:a/b layout. */
  const legacy = () => new SaveRepository(storage, inspect, writeCheckpoint);
  return { log, storage, previous, active, open, legacy };
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
      slot: 3,
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
  it('moves a game still in slot:a on its first commit, removing the key after the manifest', async () => {
    const { log, storage, previous, active, open, legacy } = setup();
    await legacy().commit(checkpoint(1));
    expect(JSON.parse(storage.getItem(MANIFEST)!).slot).toBe(0);
    const saves = open();
    expect((await saves.load())?.envelope.generation).toBe(1);
    // A failed active write leaves the legacy layout and its manifest as they were.
    const before = new Map(storage.data);
    active.fail = true;
    await expect(saves.commit(checkpoint(2))).rejects.toThrow('Quota');
    expect(storage.data).toEqual(before);
    const kept = await open().load();
    expect([kept?.envelope.generation, kept?.recovered]).toEqual([1, false]);
    active.fail = false;
    log.length = 0;
    await saves.commit(checkpoint(2));
    expect(log).toEqual(['previous', 'active', MANIFEST, `-${A}`]);
    expect([previous.raw, active.raw]).toEqual([checkpoint(1), checkpoint(2)]);
    expect(storage.getItem(A)).toBeNull();
    expect(JSON.parse(storage.getItem(MANIFEST)!)).toMatchObject({ slot: 3, generation: 2 });
    expect((await open().load())?.envelope.generation).toBe(2);
  });
  it('migrates a two-slot layout', async () => {
    const { storage, previous, active, open, legacy } = setup();
    const earlier = legacy();
    await earlier.commit(checkpoint(1));
    await earlier.commit(checkpoint(2));
    expect(storage.getItem(B)).toBe(checkpoint(2));
    const saves = open();
    expect((await saves.load())?.envelope.generation).toBe(2);
    await saves.commit(checkpoint(3));
    expect([previous.raw, active.raw]).toEqual([checkpoint(2), checkpoint(3)]);
    expect([storage.getItem(A), storage.getItem(B)]).toEqual([null, null]);
    expect(JSON.parse(storage.getItem(MANIFEST)!)).toMatchObject({ slot: 3, generation: 3 });
    expect((await open().load())?.envelope.generation).toBe(3);
  });
  it("loads the manifest's source, else the newest valid copy, and writes nothing while loading", async () => {
    const { log, storage, previous, active, open } = setup();
    // A move cut short before its manifest: slot:a is still the committed generation.
    storage.data.set(A, checkpoint(1));
    storage.data.set(MANIFEST, manifestOf(0, 1));
    active.raw = checkpoint(2);
    previous.raw = checkpoint(1);
    const loaded = await open().load();
    expect([loaded?.raw, loaded?.recovered]).toEqual([checkpoint(1), false]);
    // Without a manifest the newest valid copy wins.
    storage.data.delete(MANIFEST);
    const newest = open();
    expect((await newest.load())?.raw).toBe(checkpoint(2));
    expect(newest.committedRaw()).toBe(checkpoint(2));
    // A manifest naming active reads it.
    storage.data.clear();
    storage.data.set(MANIFEST, manifestOf(3, 2));
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
  it('falls back to two slots without IndexedDB while both fit', async () => {
    const { log, storage, open } = setup(false);
    const saves = open();
    await saves.commit(checkpoint(1));
    log.length = 0;
    await saves.commit(checkpoint(2));
    expect(log).toEqual([B, MANIFEST]);
    expect(storage.getItem(A)).toBe(checkpoint(1));
    expect(storage.getItem(B)).toBe(checkpoint(2));
    expect(JSON.parse(storage.getItem(MANIFEST)!).slot).toBe(1);
    storage.data.set(B, 'corrupt');
    const loaded = await open().load();
    expect(loaded?.envelope.generation).toBe(1);
    expect(loaded?.recovered).toBe(true);
  });
  it('refuses to overwrite the committed checkpoint without IndexedDB when no previous copy fits', async () => {
    const { storage, open } = setup(false);
    const saves = open();
    const size = sized(2_000_000);
    await saves.commit(checkpoint(1, size));
    const before = new Map(storage.data);
    const refusal = saves.commit(checkpoint(2, size));
    await expect(refusal).rejects.toBeInstanceOf(PreviousUnavailableError);
    await expect(refusal).rejects.toMatchObject({
      code: 'previous-unavailable',
      message: '이 브라우저에서는 이전 저장본을 함께 둘 공간이 없어 저장하지 않았어요',
    });
    expect(storage.data).toEqual(before);
    expect(saves.generationInfo).toEqual({ generation: 2, parentGeneration: 1 });
  });
  it('writes a first checkpoint without IndexedDB within the limit', async () => {
    const { storage, open } = setup(false);
    const raw = checkpoint(1, sized(2_000_000));
    await open().commit(raw);
    expect(storage.getItem(A)).toBe(raw);
    expect((await open().load())?.envelope.generation).toBe(1);
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
  it.each([true, false])('refuses a candidate over 3 MiB (IndexedDB: %s)', async (idb) => {
    const { storage, active, open } = setup(idb);
    const saves = open();
    await saves.commit(checkpoint(1));
    const before = [new Map(storage.data), active.raw];
    await expect(saves.commit(checkpoint(2, sized(CHECKPOINT_LIMIT) + 400))).rejects.toThrow(
      '한도',
    );
    expect([storage.data, active.raw]).toEqual(before);
    // A checkpoint just within 3 MiB is kept.
    await saves.commit(checkpoint(2, sized(CHECKPOINT_LIMIT)));
    expect((await open().load())?.envelope.generation).toBe(2);
  });
});
