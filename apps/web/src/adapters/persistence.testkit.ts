import type { Founding, World } from '../../../../packages/contracts/src/types';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { writeCheckpoint } from './checkpointWriter';
import { decode, encode } from './persistence';
import {
  SaveRepository,
  type PreviousStore,
  type SaveInspector,
  type StoragePort,
} from './repository';

export const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Archive United',
  color: '#126044',
  seed: 'save-test',
  level: 'normal',
};
export const world = () => simulatedWorld(FOUNDING);
// The original compact1 unsigned stream, used to exercise historical save compatibility.
export function legacyIntegers(values: number[], width: number) {
  const count = values.length / width;
  const columns = Array.from(
    { length: values.length },
    (_, index) => values[(index % count) * width + Math.floor(index / count)],
  );
  const bytes: number[] = [];
  for (let value of columns) {
    do {
      const next = value % 128;
      value = Math.floor(value / 128);
      bytes.push(next + (value ? 128 : 0));
    } while (value);
  }
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    encoded += String.fromCharCode(...bytes.slice(offset, offset + 32768));
  return btoa(encoded);
}

/** In-memory IndexedDB port for tests of the repository's real codec. */
export class MemoryCheckpoint implements PreviousStore {
  constructor(
    private storage: StoragePort,
    private key: 'active' | 'previous',
  ) {}
  async read() {
    return this.storage.getItem('indexed:' + this.key);
  }
  async write(raw: string) {
    this.storage.setItem('indexed:' + this.key, raw);
    if ((await this.read()) !== raw) throw new Error('저장 읽기 검증 실패');
  }
  async clear() {
    this.storage.removeItem('indexed:' + this.key);
  }
}

/**
 * The save repository with the codec on the calling thread, as tests drive it; browser clients
 * hand the codec to their worker (`client.ts`).
 */
export class Saves extends SaveRepository {
  constructor(
    storage: StoragePort,
    inspect: SaveInspector = decode,
    previous: PreviousStore = new MemoryCheckpoint(storage, 'previous'),
    active: PreviousStore = new MemoryCheckpoint(storage, 'active'),
  ) {
    super(storage, inspect, writeCheckpoint, previous, active);
  }
  async save(w: World) {
    const info = this.generationInfo;
    const raw = await encode(w, info.generation, info.parentGeneration);
    await this.commit(raw);
    return raw;
  }
}
