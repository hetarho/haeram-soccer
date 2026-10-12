import { deviceOwner, ownerOf, type Owner } from './profile';
import type { StoragePort } from './repository';

/**
 * Game slots (→SAVE-14, →WEB-62). The index lists what each slot holds and which one is in play;
 * the game in play keeps the two-slot localStorage checkpoint and every other game waits in
 * IndexedDB as the same checkpoint envelope an export file carries.
 */
export const GAMES_KEY = 'haeram-soccor:games';
export const SLOT_COUNT = 3;
/** The active checkpoint keys of the game in play (→SAVE-3). */
export const ACTIVE_SAVE_KEYS = [
  'haeram-soccor:manifest',
  'haeram-soccor:slot:a',
  'haeram-soccor:slot:b',
] as const;

/** What a slot card shows without loading its game. */
export interface SlotSummary {
  club: string;
  country: string;
  division: string;
  date: string;
  /** The season number in progress. */
  seasons: number;
  crest: { shape: string; pattern: string; primary: string; secondary: string; emblem: string };
}
export interface GameEntry {
  id: string;
  worldId: string;
  summary: SlotSummary;
  playedAt: string;
}
// Plain guards keep a validator library out of the entry bundle (→ARCH-28).
const text = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const object = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
function entryOf(value: unknown): GameEntry | null {
  const entry = object(value),
    summary = object(entry?.summary),
    crest = object(summary?.crest);
  if (!entry || !summary || !crest) return null;
  const valid =
    text(entry.id, 100) &&
    text(entry.worldId, 100) &&
    text(entry.playedAt, 40, 0) &&
    text(summary.club, 80) &&
    text(summary.country, 40) &&
    text(summary.division, 40) &&
    text(summary.date, 40) &&
    Number.isSafeInteger(summary.seasons) &&
    (summary.seasons as number) >= 0 &&
    ['shape', 'pattern', 'primary', 'secondary', 'emblem'].every((key) => text(crest[key], 20));
  return valid ? (entry as unknown as GameEntry) : null;
}
export interface GameIndex {
  owner: Owner;
  /** The slot whose game is in play, or null when none is loaded. */
  active: number | null;
  slots: (GameEntry | null)[];
}

/** Reads and writes the slot index; malformed slots read as empty, never fatal. */
export class GameIndexStore {
  constructor(private storage: StoragePort) {}
  read(): GameIndex {
    let raw: unknown;
    try {
      raw = JSON.parse(this.storage.getItem(GAMES_KEY) || 'null');
    } catch {
      raw = null;
    }
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const listed = Array.isArray(record.slots) ? record.slots : [];
    const slots = Array.from({ length: SLOT_COUNT }, (_, i) => entryOf(listed[i]));
    const active = typeof record.active === 'number' && slots[record.active] ? record.active : null;
    return { owner: ownerOf(record.owner) ?? deviceOwner(this.storage), active, slots };
  }
  write(index: GameIndex) {
    this.storage.setItem(GAMES_KEY, JSON.stringify({ v: 1, ...index }));
  }
  /** Whether any game exists on this browser, including a save from before slots. */
  hasGames() {
    return (
      this.read().slots.some(Boolean) ||
      ACTIVE_SAVE_KEYS.some((key) => this.storage.getItem(key) !== null)
    );
  }
}

/** Checkpoint envelopes of games not in play, keyed by game ID. */
export interface ParkedStore {
  get(id: string): Promise<string | undefined>;
  put(id: string, raw: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB = 'haeram-soccor',
  STORE = 'games';
function request<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error ?? new Error('게임 보관함을 열지 못했어요.'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const result = run(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(result.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('게임 보관함 작업에 실패했어요.'));
      };
    };
  });
}
export class IndexedDbParkedStore implements ParkedStore {
  static available() {
    return typeof indexedDB !== 'undefined';
  }
  async get(id: string) {
    const value = await request<unknown>((store) => store.get(id), 'readonly');
    return typeof value === 'string' ? value : undefined;
  }
  /** Writes and reads back, so a switch never relies on a copy it has not seen. */
  async put(id: string, raw: string) {
    await request((store) => store.put(raw, id), 'readwrite');
    if ((await this.get(id)) !== raw) throw new Error('보관한 게임을 다시 읽어 확인하지 못했어요.');
  }
  async remove(id: string) {
    await request((store) => store.delete(id), 'readwrite');
  }
}
