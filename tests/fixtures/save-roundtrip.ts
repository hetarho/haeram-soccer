/**
 * The save round trip for tests and tools (→SAVE-3, →SAVE-5): a world written into a node SQLite
 * game database the way a game's save writes it, then read and checked back the way a game opens
 * (`storedWorld`). A save file of a world comes from `saveFileOf`.
 */
import type { World } from '../../packages/contracts/src/types';
import { RowSaver } from '../../apps/web/src/adapters/rowSaver';
import { decodeSaveFile } from '../../apps/web/src/adapters/saveFile';
import { sqlRecordStore } from '../../apps/web/src/adapters/sqlRecordStore';
import { storedWorld } from '../../apps/web/src/runtime/host';
import { memoryRecordStore, nodeSqliteDriver } from './node-sqlite';

export { saveFileOf, worldOfSaveFile } from './save-file';

/**
 * `w` saved into a fresh database and opened again, validated as `open-game` validates it: what a
 * career holds after a save and a reload. An unsupported or malformed world throws as opening does.
 */
export function roundTrip(w: World): World {
  const store = memoryRecordStore();
  try {
    new RowSaver(store).save(w);
    return storedWorld(store);
  } finally {
    store.close();
  }
}

/** The world a save file holds, checked as a game opens it (→SAVE-5): versions, then the world. */
export async function openedSaveFile(file: Uint8Array): Promise<World> {
  const { dbBytes } = await decodeSaveFile(file);
  const driver = nodeSqliteDriver(':memory:', dbBytes);
  try {
    return storedWorld(sqlRecordStore(driver));
  } finally {
    driver.close();
  }
}
