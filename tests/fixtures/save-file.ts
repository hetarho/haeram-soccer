/**
 * Save files for tests and tools (→SAVE-9): a world written into a node SQLite database, its bytes
 * serialized and wrapped as a `.haeram-save` file, and the in-memory game files a host runs on
 * when it is given bytes to export and import.
 */
import type { RecordStore } from '../../packages/contracts/src/record-store';
import type { World } from '../../packages/contracts/src/types';
import { RowSaver } from '../../apps/web/src/adapters/rowSaver';
import {
  decodeSaveFile,
  encodeSaveFile,
  saveMetaOf,
  type DatabaseBytes,
} from '../../apps/web/src/adapters/saveFile';
import { rowsToWorld } from '../../apps/web/src/adapters/worldRows';
import { sqlRecordStore } from '../../apps/web/src/adapters/sqlRecordStore';
import { nodeSqliteDriver, type SerializableDriver } from './node-sqlite';

/** The bytes of the database file holding `w`, as a game's save writes it. */
export function worldDatabase(w: World): Uint8Array {
  const driver = nodeSqliteDriver();
  new RowSaver(sqlRecordStore(driver)).save(w);
  const bytes = driver.serialize();
  driver.close();
  return bytes;
}

/** `w` as a `.haeram-save` file. */
export async function saveFileOf(w: World): Promise<Uint8Array> {
  const driver = nodeSqliteDriver();
  const store = sqlRecordStore(driver);
  new RowSaver(store).save(w);
  const file = await encodeSaveFile(saveMetaOf(store.meta()), driver.serialize());
  driver.close();
  return file;
}

/** The world a `.haeram-save` file holds, read out of its database as a game opens it. */
export async function worldOfSaveFile(file: Uint8Array): Promise<World> {
  const { dbBytes } = await decodeSaveFile(file);
  const driver = nodeSqliteDriver(':memory:', dbBytes);
  try {
    return rowsToWorld(sqlRecordStore(driver), { includeCold: true });
  } finally {
    driver.close();
  }
}

/** A game database of the in-memory files: its driver, which serializes, and the store on it. */
export interface MemoryGame {
  driver: SerializableDriver;
  store: RecordStore;
}

/**
 * Game databases in memory, outliving every host as OPFS files do, with the bytes port a host
 * exports and imports through. `open` hands a host the same stores `OpenStore` would.
 */
export function memoryGames(options: { wrap?: (game: MemoryGame) => RecordStore } = {}) {
  const games = new Map<string, { game: MemoryGame; store: RecordStore }>();
  const keep = (gameId: string, driver: SerializableDriver) => {
    // Closing a store only releases it: the file outlives the host that opened it.
    const game = { driver, store: { ...sqlRecordStore(driver), close() {} } };
    const store = options.wrap?.(game) ?? game.store;
    games.set(gameId, { game, store });
    return store;
  };
  const bytes: DatabaseBytes = {
    read: (gameId) => games.get(gameId)?.game.driver.serialize(),
    meta: (gameId) => {
      const found = games.get(gameId);
      return found && saveMetaOf(found.game.store.meta());
    },
    scratch: async (content) => {
      const driver = nodeSqliteDriver(':memory:', content);
      return { driver, bytes: () => driver.serialize(), release: () => driver.close() };
    },
    write: async (gameId, content) => {
      keep(gameId, nodeSqliteDriver(':memory:', content));
    },
  };
  return {
    games,
    bytes,
    /** The store of a game, created empty when `create` is asked and it has none. */
    open: (gameId: string, { create }: { create: boolean }) => {
      const found = games.get(gameId);
      if (found) return found.store;
      return create ? keep(gameId, nodeSqliteDriver()) : undefined;
    },
    list: () => [...games.keys()],
    remove: (gameId: string) => void games.delete(gameId),
  };
}
