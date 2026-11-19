import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { World } from '../../../../packages/contracts/src/types';
import {
  CURRENT_ENGINE_VERSION,
  earlierRulesMessage,
  isEarlierEngine,
  NEWER_GAME_MESSAGE,
  SUPPORTED_ENGINE_VERSIONS,
} from '../../../../packages/contracts/src/versions';
import { country } from '../../../../packages/catalogs/src/index';
import { seasonDate } from '../../../../packages/engine/src/calendar';
import { clubOf, ownSeasons } from '../../../../packages/engine/src/player-state';
import {
  checkedGameId,
  GameIndexStore,
  type GameEntry,
  type GameIndex,
  type SlotSummary,
} from '../adapters/games';
import { divisionName } from '../presentation/competitionLabels';
import { crestOf } from '../presentation/crests';
import type { GameClient } from './client';

const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

/**
 * What a slot card shows without loading its game; the crest is a copy of the one applied now
 * (→WEB-49), its optional colours kept.
 */
export function summarize(w: World): SlotSummary {
  const club = clubOf(w);
  return {
    club: club.name,
    country: country(club.country).name,
    division: divisionName(club.country, club.tier, club.group),
    date: seasonDate(w),
    // The career's season in progress, counted from the takeover (→HIST-21).
    seasons: ownSeasons(w).length + 1,
    crest: { ...crestOf(w, w.playerClub) },
  };
}

/**
 * The rules version of a slot's game when this version cannot open it: a career of earlier rules
 * (→SAVE-16) or of a newer game (→SAVE-11), both kept for export or deletion only.
 */
export const earlierRules = (entry: Pick<GameEntry, 'engine'>) =>
  entry.engine !== undefined && !SUPPORTED_ENGINE_VERSIONS.includes(entry.engine)
    ? entry.engine
    : undefined;
/** A slot card for an earlier-rules checkpoint the index never listed: nothing of it is decoded. */
const unreadSummary = (): SlotSummary => ({
  club: sourceMessage('copy.slots.e9a070fc85'),
  country: '',
  division: '',
  date: '',
  seasons: 0,
  crest: {
    shape: 'shield',
    pattern: 'plain',
    primary: '#3a6352',
    secondary: '#12261f',
    emblem: 'ball',
  },
});

/**
 * Three game slots over one game in play (→WEB-62, →SAVE-14). Every occupied slot is its game's
 * database file: switching saves and closes the game in play and opens the next one's, a new game
 * creates its file, deleting removes it. Only the writer tab switches, starts, imports or deletes
 * games.
 */
export class GameSlots {
  /** The slot a new or imported game is going into, until its world is in play. */
  private pending?: number;
  constructor(
    private client: GameClient,
    private index = new GameIndexStore(browserStorage),
  ) {}
  /**
   * The slot index with the games whose database file is missing read as empty (→SAVE-29); the
   * file listing is the engine worker's, so a tab without one hides nothing.
   */
  read(): GameIndex {
    const index = this.index.read();
    for (const [slot, entry] of index.slots.entries())
      if (entry && !this.client.hasGameFile(entry.id)) index.slots[slot] = null;
    if (index.active !== null && !index.slots[index.active]) index.active = null;
    return index;
  }
  /** The slot an unlisted world in play goes into. */
  private home(index: GameIndex) {
    const slot = this.pending ?? index.active ?? index.slots.findIndex((entry) => !entry);
    return slot < 0 ? 0 : slot;
  }
  /**
   * The index as the slot screen shows it: the world in play always has its slot, even in a
   * read-only tab that may not write the index.
   */
  display(w: World | undefined): GameIndex {
    const index = this.read();
    // An earlier-rules checkpoint in play never loads: its slot says so (→SAVE-16).
    const earlier = w ? undefined : this.client.earlierRules();
    if (earlier) {
      const slot = this.home(index);
      const entry = index.slots[slot];
      index.slots[slot] = entry
        ? { ...entry, engine: earlier }
        : {
            id: 'earlier',
            worldId: 'earlier',
            summary: unreadSummary(),
            playedAt: '',
            engine: earlier,
          };
      index.active = slot;
      return index;
    }
    if (!w || index.slots.some((entry) => entry?.worldId === w.id)) return index;
    const slot = this.home(index);
    index.slots[slot] = { id: 'in-play', worldId: w.id, summary: summarize(w), playedAt: '' };
    index.active = slot;
    return index;
  }
  /** Whether the browser can hold game databases (OPFS); the worker reports the rest. */
  get available() {
    return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
  }
  private writable() {
    if (this.client.state.readonly) throw new Error(sourceMessage('copy.slots.6a26f8d2c4'));
  }
  /**
   * Lists the world in play: a world listed under a slot makes that slot active; an unlisted one
   * takes the slot it is going into, else the active slot, else the first empty one.
   */
  sync(w: World | undefined, played = false): GameIndex {
    const index = this.index.read();
    if (!w || this.client.state.readonly) return index;
    let slot = index.slots.findIndex((entry) => entry?.worldId === w.id);
    const now = new Date().toISOString();
    if (slot < 0) {
      slot = this.home(index);
      index.slots[slot] = {
        // The game's database is named by the ID its client created it under (→SAVE-14).
        id: this.client.gameId ?? crypto.randomUUID(),
        worldId: w.id,
        summary: summarize(w),
        playedAt: now,
        engine: CURRENT_ENGINE_VERSION,
      };
    } else {
      const entry = index.slots[slot]!;
      index.slots[slot] = {
        ...entry,
        summary: summarize(w),
        playedAt: played ? now : entry.playedAt,
        engine: CURRENT_ENGINE_VERSION,
      };
    }
    index.active = slot;
    this.pending = undefined;
    this.index.write(index);
    return index;
  }
  /**
   * Continues a slot's game: the game in play is saved and closed, then this one's database is
   * opened and validated; a failed open leaves both files as they were and the previous game in
   * play (→SAVE-14).
   */
  async continue(slot: number) {
    const inPlay = this.client.state.view?.world;
    const entry = this.display(inPlay).slots[slot];
    if (!entry) throw new Error(sourceMessage('copy.slots.7b3241e6b3'));
    const earlier = earlierRules(entry);
    if (earlier)
      throw new Error(isEarlierEngine(earlier) ? earlierRulesMessage(earlier) : NEWER_GAME_MESSAGE);
    if (inPlay?.id === entry.worldId) {
      this.sync(inPlay, true);
      return;
    }
    this.writable();
    checkedGameId(entry.id);
    this.pending = slot;
    if (!(await this.client.switchTo(entry.id))) {
      this.pending = undefined;
      throw new Error(this.client.state.error || sourceMessage('copy.slots.f5da590ae2'));
    }
    this.sync(this.client.state.view?.world, true);
  }
  /**
   * Readies a slot for a new or imported game: the game in play is saved first, and the game the
   * slot holds loses its file when the new game's is created (→WEB-62).
   */
  async prepare(slot: number) {
    this.writable();
    const entry = this.read().slots[slot];
    if (entry) checkedGameId(entry.id);
    await this.client.saveGame();
    if (this.client.state.error) throw new Error(this.client.state.error);
    this.client.replaceOnCreate(entry?.id);
    this.pending = slot;
  }
  cancel() {
    this.pending = undefined;
    this.client.replaceOnCreate(undefined);
  }
  async importInto(slot: number, raw: string) {
    await this.prepare(slot);
    await this.client.importFile(raw);
    if (this.client.state.error) {
      this.cancel();
      throw new Error(this.client.state.error);
    }
    this.sync(this.client.state.view?.world, true);
  }
  /**
   * A slot's checkpoint envelope for export: the game in play's. A game not in play has none to
   * read until export carries database files (→SAVE-9).
   */
  async exportRaw(slot: number) {
    const index = this.display(this.client.state.view?.world);
    const entry = index.slots[slot];
    if (!entry) return undefined;
    // The game in play, or an earlier-rules checkpoint kept raw in its place.
    if (
      this.client.state.view?.world.id === entry.worldId ||
      (index.active === slot && this.client.earlierRules())
    )
      return this.client.exportFile();
    return undefined;
  }
  /** Deletes a slot's game; true when it was the game in play, which the app then reloads away. */
  async remove(slot: number) {
    this.writable();
    const index = this.index.read();
    // An earlier-rules checkpoint the index never listed is still the game in play's slot.
    const shown = this.display(this.client.state.view?.world);
    const entry = index.slots[slot] ?? (shown.active === slot ? shown.slots[slot] : null);
    if (!entry) return false;
    const inPlay = index.active === slot || shown.active === slot;
    // A world in play the index never listed is deleted under the ID its database has; an entry
    // that only names an unread checkpoint has no database file to delete.
    const id = entry.id === 'in-play' ? this.client.gameId : entry.id;
    if (id && id !== 'earlier') {
      await this.client.deleteGame(checkedGameId(id));
      if (this.client.state.error) throw new Error(this.client.state.error);
    }
    index.slots[slot] = null;
    if (inPlay) index.active = null;
    this.index.write(index);
    return inPlay;
  }
}
