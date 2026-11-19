import { describe, expect, it } from 'vitest';
import type { BackupFiles, BackupSide } from '../adapters/sqliteWasm';
import { rowsToWorld } from '../adapters/worldRows';
import { sqlRecordStore } from '../adapters/sqlRecordStore';
import { Host } from './host';
import { req, startedWorld } from './host.testkit';
import { memoryGames, worldDatabase } from '../../../../tests/fixtures/save-file';
import { nodeSqliteDriver } from '../../../../tests/fixtures/node-sqlite';

/** Backup files in memory; `failWrite` cuts the next write short after storing half the bytes. */
function memoryBackups() {
  const files = new Map<string, Uint8Array>();
  const state = { failWrite: false };
  const key = (gameId: string, side: BackupSide) => `${gameId}/${side}`;
  const port: BackupFiles = {
    sides: async (gameId) => (['a', 'b'] as const).filter((side) => files.has(key(gameId, side))),
    read: async (gameId, side) => files.get(key(gameId, side)),
    write: async (gameId, side, bytes) => {
      if (state.failWrite) {
        files.set(key(gameId, side), bytes.slice(0, bytes.length >> 1));
        return;
      }
      files.set(key(gameId, side), bytes.slice());
    },
    remove: async (gameId, side) => void files.delete(key(gameId, side)),
  };
  return { files, state, port, key };
}
/** A host over memory games whose database reads can be broken, with memory backups. */
function backedHost() {
  const backups = memoryBackups();
  const broken = { value: false };
  const games = memoryGames({
    wrap: (game) =>
      broken.value
        ? {
            ...game.store,
            meta: () => {
              throw new Error('database disk image is malformed');
            },
          }
        : game.store,
  });
  const host = () =>
    new Host(undefined, {
      openStore: async (id, open) => games.open(id, open),
      gameFiles: { list: () => games.list(), remove: (id) => games.remove(id) },
      databaseBytes: games.bytes,
      backupFiles: backups.port,
    });
  return { backups, broken, games, host };
}
const save = (h: Host, id: string) => h.handle(req(id, h.world!.revision, { type: 'save' }));
const open = (h: Host, id: string) => h.handle(req(id, -1, { type: 'open-game', gameId: 'game' }));

describe('a game keeps a season backup (→SAVE-31)', () => {
  it('backs up after each season close commits, alternating its two files', async () => {
    const { backups, games, host } = backedHost();
    const w = startedWorld();
    await games.bytes.write('game', worldDatabase(w));
    const first = host();
    const opened = await open(first, 'open');
    expect(opened.ok, opened.error).toBe(true);
    // A founded world is upgraded when it opens, and that upgrade has its backup.
    expect(opened.opened?.backup).toMatchObject({ side: 'a', season: w.year });
    // An ordinary save is no season close.
    expect((await save(first, 'same')).saved?.backup).toBeUndefined();
    // The year changes between two saves: the save commits, then the backup is written.
    first.world!.year = w.year + 1;
    const closed = await save(first, 'close-1');
    expect(closed.ok, closed.error).toBe(true);
    expect(closed.saved?.backup).toMatchObject({ side: 'b', season: w.year + 1 });
    expect(await backups.port.sides('game')).toEqual(['b']);
    expect(await backups.port.read('game', 'b')).toEqual(await games.bytes.read('game'));
    expect((await save(first, 'again')).saved?.backup).toBeUndefined();
    first.world!.year = w.year + 2;
    expect((await save(first, 'close-2')).saved?.backup).toMatchObject({
      side: 'a',
      season: w.year + 2,
    });
    expect(await backups.port.sides('game')).toEqual(['a']);
  });

  it('offers a corrupted game its backup, written before its upgrade, and restores it', async () => {
    const { backups, broken, games, host } = backedHost();
    const legacy = startedWorld();
    delete legacy.squads;
    await games.bytes.write('game', worldDatabase(legacy));
    const first = host();
    const opened = await open(first, 'upgrade');
    expect(opened.ok, opened.error).toBe(true);
    expect(opened.upgraded).toBe(true);
    expect(opened.opened?.backup).toMatchObject({ side: 'a', season: legacy.year });
    const driver = nodeSqliteDriver(':memory:', (await backups.port.read('game', 'a'))!);
    try {
      // The backup holds the world as it was; the game file holds the upgrade.
      expect(rowsToWorld(sqlRecordStore(driver), { includeCold: true }).squads).toBeUndefined();
    } finally {
      driver.close();
    }
    expect(first.world!.squads).toBeDefined();
    // The game's rows fail to load: not compatibility, so its backup is offered, not applied.
    broken.value = true;
    await games.bytes.write('game', worldDatabase(first.world!));
    const second = host();
    const refused = await open(second, 'corrupt');
    expect(refused.ok).toBe(false);
    expect(refused.errorCode).toBe('save-corrupted');
    expect(second.world).toBeUndefined();
    expect(await backups.port.sides('game')).toEqual(['a']);
    // Accepting the offer copies the backup over the game file and opens it.
    broken.value = false;
    const restored = await second.handle(
      req('restore', -1, { type: 'restore-backup', gameId: 'game' }),
    );
    expect(restored.ok, restored.error).toBe(true);
    expect(restored.opened).toMatchObject({ gameId: 'game', found: true });
    expect(second.world!.year).toBe(legacy.year);
    // Deleting the game deletes its backups (→SAVE-14).
    await second.handle(req('delete', -1, { type: 'delete-game', gameId: 'game' }));
    expect(await backups.port.sides('game')).toEqual([]);
  });

  it('never offers recovery for an incompatible database', async () => {
    const { backups, games, host } = backedHost();
    const w = startedWorld();
    w.engine = '3.0.0';
    await games.bytes.write('game', worldDatabase(w));
    await backups.port.write('game', 'a', new Uint8Array(4).fill(1));
    const refused = await open(host(), 'incompatible');
    expect(refused.ok).toBe(false);
    expect(refused.errorCode).toBe('save-compatibility');
  });
});
