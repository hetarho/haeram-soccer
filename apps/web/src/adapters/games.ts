import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { deviceOwner, ownerOf, type Owner } from './profile';
import type { StoragePort } from './repository';

/**
 * Game slots (→SAVE-14, →WEB-62). The index lists what each slot holds and which one is in play;
 * every occupied slot is its game's database file, named by the entry's ID (→ARCH-11).
 */
export const GAMES_KEY = 'haeram-soccor:games';
export const SLOT_COUNT = 3;
/** What a slot card shows without loading its game. */
export interface SlotSummary {
  club: string;
  country: string;
  division: string;
  date: string;
  /** The season number in progress. */
  seasons: number;
  /** The own club's current crest: one to three colours, its secondary and accent optional. */
  crest: {
    shape: string;
    pattern: string;
    emblem: string;
    primary: string;
    secondary?: string;
    accent?: string;
  };
}
export interface GameEntry {
  id: string;
  worldId: string;
  summary: SlotSummary;
  playedAt: string;
  /** The rules version its checkpoint was written under (→SAVE-16); absent before it was kept. */
  engine?: string;
}
// Plain guards keep a validator library out of the entry bundle (→ARCH-28).
const text = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const object = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const colour = (value: unknown) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
function entryOf(value: unknown): GameEntry | null {
  const entry = object(value),
    summary = object(entry?.summary),
    crest = object(summary?.crest);
  if (!entry || !summary || !crest) return null;
  const valid =
    text(entry.id, 100) &&
    text(entry.worldId, 100) &&
    text(entry.playedAt, 40, 0) &&
    (entry.engine === undefined || text(entry.engine, 20)) &&
    text(summary.club, 80) &&
    text(summary.country, 40) &&
    text(summary.division, 40) &&
    text(summary.date, 40) &&
    Number.isSafeInteger(summary.seasons) &&
    (summary.seasons as number) >= 0 &&
    ['shape', 'pattern', 'emblem'].every((key) => text(crest[key], 20)) &&
    colour(crest.primary) &&
    ['secondary', 'accent'].every((key) => crest[key] === undefined || colour(crest[key]));
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
  /** Whether any slot is listed; a listed game without its file is found out at startup (→SAVE-29). */
  hasGames() {
    return this.read().slots.some(Boolean);
  }
}
/**
 * The file name a game's ID gives its database (→SAVE-14): the ID is used verbatim after it passes
 * the pattern the protocol also checks; anything else is a storage error.
 */
export const GAME_ID = /^[A-Za-z0-9:_-]{1,100}$/;
export function checkedGameId(id: string) {
  if (!GAME_ID.test(id)) throw new Error(sourceMessage('copy.games.a38061aa70'));
  return id;
}
