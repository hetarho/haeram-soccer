import { describe, expect, it } from 'vitest';
import type { BackupFiles, BackupSide } from '../adapters/sqliteWasm';
import type { SqlDriver } from '../adapters/sqlRecordStore';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import {
  checkIntegrity,
  currentSide,
  dropBackups,
  isSaveCorruptedError,
  openFailure,
  rotateBackup,
  SaveCorruptedError,
  seasonClosed,
} from './seasonBackup';
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
/** A database's revision is its first byte here, 0 meaning not intact. */
const revisionOf = async (bytes: Uint8Array) => (bytes[0] ? bytes[0] : undefined);
const copy = (revision: number, size = 8) => new Uint8Array(size).fill(revision);

describe('season backup rotation (→SAVE-31)', () => {
  it('alternates between two files and deletes the other once the new one is whole', async () => {
    const { port, files, key } = memoryBackups();
    expect(await rotateBackup(port, 'g', copy(1), revisionOf)).toBe('a');
    expect([...files.keys()]).toEqual([key('g', 'a')]);
    expect(await rotateBackup(port, 'g', copy(2), revisionOf)).toBe('b');
    expect([...files.keys()]).toEqual([key('g', 'b')]);
    expect(files.get(key('g', 'b'))![0]).toBe(2);
    expect(await rotateBackup(port, 'g', copy(3), revisionOf)).toBe('a');
    expect([...files.keys()]).toEqual([key('g', 'a')]);
  });

  it('keeps the previous backup when a copy is cut short', async () => {
    const { port, files, state, key } = memoryBackups();
    await rotateBackup(port, 'g', copy(1), revisionOf);
    state.failWrite = true;
    await expect(rotateBackup(port, 'g', copy(2), revisionOf)).rejects.toThrow();
    expect([...files.keys()]).toEqual([key('g', 'a')]);
    expect(files.get(key('g', 'a'))![0]).toBe(1);
  });

  it('reads the newer intact copy as current when a crash left both', async () => {
    const { port, files, key } = memoryBackups();
    files.set(key('g', 'a'), copy(4));
    files.set(key('g', 'b'), copy(5));
    expect(await currentSide(port, 'g', revisionOf)).toBe('b');
    files.set(key('g', 'b'), copy(0));
    expect(await currentSide(port, 'g', revisionOf)).toBe('a');
    expect(await currentSide(port, 'none', revisionOf)).toBeUndefined();
  });

  it('drops every backup of a game and no other', async () => {
    const { port, files, key } = memoryBackups();
    files.set(key('g', 'a'), copy(1));
    files.set(key('h', 'b'), copy(1));
    await dropBackups(port, 'g');
    expect([...files.keys()]).toEqual([key('h', 'b')]);
  });

  it('follows a season close by the world year between saves', () => {
    expect(seasonClosed(undefined, 1931)).toBe(false);
    expect(seasonClosed(1931, 1931)).toBe(false);
    expect(seasonClosed(1931, 1932)).toBe(true);
  });
});

describe('the corrupted-open decision (→SAVE-11, SAVE-31)', () => {
  it('treats a failed integrity check as corruption', () => {
    const driver = (verdict: string) =>
      ({ get: () => ({ integrity_check: verdict }) }) as unknown as SqlDriver;
    expect(() => checkIntegrity(driver('ok'))).not.toThrow();
    expect(() => checkIntegrity(driver('row 3 missing from index'))).toThrow(SaveCorruptedError);
    const real = nodeSqliteDriver();
    try {
      expect(() => checkIntegrity(real)).not.toThrow();
    } finally {
      real.close();
    }
  });

  it('classes any other failure of a compatible database as corruption, never compatibility', () => {
    const malformed = openFailure(new Error('database disk image is malformed'));
    expect(isSaveCorruptedError(malformed)).toBe(true);
    const incompatible = new SaveCompatibilityError();
    expect(openFailure(incompatible)).toBe(incompatible);
    const capability = Object.assign(new Error('no opfs'), { code: 'storage-capability' });
    expect(openFailure(capability)).toBe(capability);
  });
});
