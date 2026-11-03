import type { World } from '../../../../packages/contracts/src/types';
import type { CareerInput } from '../../../../packages/engine/src/career.testkit';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { writeCheckpoint } from './checkpointWriter';
import { decode, encode } from './persistence';
import {
  SaveRepository,
  type PreviousStore,
  type SaveInspector,
  type StoragePort,
} from './repository';

export const CAREER: CareerInput = { country: 'ENG', seed: 'save-test' };
export const world = () => simulatedWorld(CAREER);
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

/**
 * The save repository with the codec on the calling thread, as tests drive it; browser clients
 * hand the codec to their worker (`client.ts`).
 */
export class Saves extends SaveRepository {
  constructor(
    storage: StoragePort,
    inspect: SaveInspector = decode,
    previous?: PreviousStore,
    active?: PreviousStore,
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
