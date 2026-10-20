import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_LIMIT,
  PreviousUnavailableError,
  SaveRepository,
  type Envelope,
  type PreviousStore,
  type StoragePort,
} from './repository';

const MANIFEST = 'haeram-soccor:manifest',
  A = 'haeram-soccor:slot:a',
  B = 'haeram-soccor:slot:b';
/** Every write in the order it happened, across localStorage and the previous store. */
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
class MemoryPrevious implements PreviousStore {
  raw: string | null = null;
  fail = false;
  constructor(private log: Log = []) {}
  async read() {
    return this.raw;
  }
  async write(raw: string) {
    if (this.fail) throw new Error('QuotaExceededError');
    this.log.push('previous');
    this.raw = raw;
  }
  async clear() {
    this.raw = null;
  }
}
/** A checkpoint whose payload is `size` characters; the fake codec only checks its header. */
function checkpoint(generation: number, size = 100, worldId = 'w1') {
  const envelope: Envelope = {
    schema: 1,
    engine: '4.0.0',
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
async function inspect(raw: string) {
  const envelope = JSON.parse(raw) as Envelope;
  if (!Number.isSafeInteger(envelope?.generation)) throw new Error('손상된 체크포인트');
  return { world: { id: envelope.worldId, revision: envelope.generation }, envelope };
}
function setup(withPrevious = true) {
  const log: Log = [];
  const storage = new Memory(log),
    previous = withPrevious ? new MemoryPrevious(log) : undefined;
  const open = () => new SaveRepository(storage, inspect, previous);
  return { log, storage, previous, open };
}
/** The payload size whose checkpoint takes about `bytes` of conservative UTF-16. */
const sized = (bytes: number) => Math.floor(bytes / 2) - 300;

describe('save repository', () => {
  it('keeps the committed generation in IndexedDB before replacing the active copy', async () => {
    const { log, storage, previous, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    expect(previous!.raw).toBeNull();
    log.length = 0;
    await saves.commit(checkpoint(2));
    expect(log).toEqual(['previous', A, MANIFEST]);
    expect(previous!.raw).toBe(checkpoint(1));
    expect(storage.getItem(A)).toBe(checkpoint(2));
    expect(storage.getItem(B)).toBeNull();
    expect(JSON.parse(storage.getItem(MANIFEST)!)).toEqual({
      slot: 0,
      worldId: 'w1',
      generation: 2,
      parentGeneration: 1,
    });
    // A failed copy leaves the active checkpoint and manifest as they were.
    const before = new Map(storage.data);
    previous!.fail = true;
    await expect(saves.commit(checkpoint(3))).rejects.toThrow('Quota');
    expect(storage.data).toEqual(before);
    const loaded = await open().load();
    expect(loaded?.envelope.generation).toBe(2);
    expect(loaded?.recovered).toBe(false);
  });
  it('recovers from IndexedDB when the active copy is corrupt', async () => {
    const { storage, previous, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1));
    await saves.commit(checkpoint(2));
    storage.data.set(A, 'corrupt');
    const recovery = open();
    const loaded = await recovery.load();
    expect(loaded?.envelope.generation).toBe(1);
    expect(loaded?.recovered).toBe(true);
    expect(recovery.committedRaw()).toBe(checkpoint(1));
    expect(recovery.generationInfo).toEqual({ generation: 2, parentGeneration: 1 });
    // The recovered copy stays the predecessor while the corrupt active copy is replaced.
    await recovery.commit(checkpoint(2));
    expect(previous!.raw).toBe(checkpoint(1));
    expect((await open().load())?.envelope.generation).toBe(2);
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
  it.each([true, false])('refuses a candidate over 3 MiB (previous store: %s)', async (idb) => {
    const { storage, open } = setup(idb);
    const saves = open();
    await saves.commit(checkpoint(1));
    const before = new Map(storage.data);
    await expect(saves.commit(checkpoint(2, sized(CHECKPOINT_LIMIT) + 400))).rejects.toThrow(
      '한도',
    );
    expect(storage.data).toEqual(before);
    // A checkpoint just within 3 MiB is kept.
    await saves.commit(checkpoint(2, sized(CHECKPOINT_LIMIT)));
    expect((await open().load())?.envelope.generation).toBe(2);
  });
  it('migrates a two-slot layout', async () => {
    const { storage, previous, open } = setup();
    const legacy = new SaveRepository(storage, inspect);
    await legacy.commit(checkpoint(1));
    await legacy.commit(checkpoint(2));
    expect(storage.getItem(B)).toBe(checkpoint(2));
    const saves = open();
    expect((await saves.load())?.envelope.generation).toBe(2);
    await saves.commit(checkpoint(3));
    expect(previous!.raw).toBe(checkpoint(2));
    expect(storage.getItem(A)).toBe(checkpoint(3));
    expect(storage.getItem(B)).toBeNull();
    expect(JSON.parse(storage.getItem(MANIFEST)!)).toMatchObject({ slot: 0, generation: 3 });
    expect((await open().load())?.envelope.generation).toBe(3);
  });
  it('never brings a removed game back from its previous copy', async () => {
    const { storage, previous, open } = setup();
    const saves = open();
    await saves.commit(checkpoint(1, 100, 'old'));
    await saves.commit(checkpoint(2, 100, 'old'));
    storage.data.clear();
    const fresh = open();
    expect(await fresh.load()).toBeNull();
    // The first checkpoint of the next career has no predecessor.
    await fresh.commit(checkpoint(1, 100, 'new'));
    expect(previous!.raw).toBeNull();
  });
});
