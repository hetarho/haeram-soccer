/**
 * A game's season backup (→SAVE-31): one copy of its database, alternating between two files so the
 * previous complete copy stays until the new one is whole, and the corrupted-open decision that
 * offers it back. The rotation reads files through a port; the browser's is the OPFS pool, tests'
 * is memory.
 */
import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import {
  isSaveCompatibilityError,
  type SaveCompatibilityError,
} from '../../../../packages/contracts/src/versions';
import type { BackupFiles, BackupInfo, BackupSide } from '../adapters/sqliteWasm';
import type { SqlDriver } from '../adapters/sqlRecordStore';

export type { BackupFiles, BackupInfo, BackupSide };

export const SAVE_CORRUPTED_CODE = 'save-corrupted' as const;
/** A compatible game database that cannot be read whole: only this may offer its backup (→SAVE-11). */
export class SaveCorruptedError extends Error {
  readonly code = SAVE_CORRUPTED_CODE;
  constructor(message: string = sourceMessage('backup.corrupted'), options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SaveCorruptedError';
  }
}
export function isSaveCorruptedError(error: unknown): error is SaveCorruptedError {
  return (
    error instanceof SaveCorruptedError ||
    (!!error && typeof error === 'object' && 'code' in error && error.code === SAVE_CORRUPTED_CODE)
  );
}
/**
 * What a failed open means (→SAVE-11): compatibility and capability failures and an already
 * classified corruption keep their kind; anything else a compatible database fails with is
 * corruption.
 */
export function openFailure(error: unknown): unknown {
  if (
    isSaveCompatibilityError(error) ||
    isSaveCorruptedError(error) ||
    (!!error && typeof error === 'object' && 'code' in error && error.code === 'storage-capability')
  )
    return error as SaveCompatibilityError | SaveCorruptedError;
  return new SaveCorruptedError(sourceMessage('backup.corrupted'), { cause: error });
}
/** Runs SQLite's integrity check on an open database; anything but `ok` is corruption. */
export function checkIntegrity(driver: SqlDriver) {
  const verdict = driver.get<{ integrity_check: string }>('PRAGMA integrity_check');
  if (verdict?.integrity_check !== 'ok') throw new SaveCorruptedError();
}

/** Whether the world's year moved since the last save: a season closed between two saves. */
export const seasonClosed = (savedYear: number | undefined, year: number) =>
  savedYear !== undefined && savedYear !== year;

const otherSide = (side: BackupSide | undefined): BackupSide => (side === 'a' ? 'b' : 'a');

/**
 * The side holding the current backup: the only file, or when a crash left both, the one that is
 * intact with the newer revision (`revisionOf` answers undefined for a file that is not intact).
 */
export async function currentSide(
  files: BackupFiles,
  gameId: string,
  revisionOf: (bytes: Uint8Array) => Promise<number | undefined>,
): Promise<BackupSide | undefined> {
  const sides = await files.sides(gameId);
  if (sides.length < 2) return sides[0];
  let best: { side: BackupSide; revision: number } | undefined;
  for (const side of sides) {
    const bytes = await files.read(gameId, side);
    const revision = bytes && (await revisionOf(bytes));
    if (revision !== undefined && (!best || revision > best.revision)) best = { side, revision };
  }
  return best?.side;
}

/**
 * Copies `bytes`, a committed database, into the side the current backup is not on. The new copy
 * is current only once it is completely written; then the other side is deleted. A copy cut short
 * is removed and the previous backup stays.
 */
export async function rotateBackup(
  files: BackupFiles,
  gameId: string,
  bytes: Uint8Array,
  revisionOf: (bytes: Uint8Array) => Promise<number | undefined>,
): Promise<BackupSide> {
  const current = await currentSide(files, gameId, revisionOf);
  const next = otherSide(current);
  try {
    await files.write(gameId, next, bytes);
    const written = await files.read(gameId, next);
    if (!written || written.length !== bytes.length)
      throw new Error(sourceMessage('backup.incomplete'));
  } catch (error) {
    await files.remove(gameId, next).catch(() => {});
    throw error;
  }
  // A crash here leaves both sides; the newer intact one is current (`currentSide`).
  for (const side of await files.sides(gameId)) if (side !== next) await files.remove(gameId, side);
  return next;
}

/** Deletes every backup of a game (→SAVE-14). */
export async function dropBackups(files: BackupFiles, gameId: string) {
  for (const side of await files.sides(gameId)) await files.remove(gameId, side);
}
