/**
 * Storage limits and the small key-value port the adapters share. A game's data lives in its
 * database (→SAVE-2, →ARCH-11); this port carries only small current metadata (→SAVE-29).
 */
/** An export file is at most 256 MiB (→SAVE-4); every import-size check reads this. */
export const PORTABLE_FILE_LIMIT = 256 * 1024 * 1024;
/** The database an export carries is at most 1 GiB; decompression stops at it (→SAVE-4, →ARCH-16). */
export const DECOMPRESSED_LIMIT = 1024 * 1024 * 1024;
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
