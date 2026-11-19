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
   * The index as the slot screen shows it: the world in play always has its slot, even before
   * the index lists it.
   */
  display(w: World | undefined): GameIndex {
    const index = this.read();
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
  /**
   * Lists the world in play: a world listed under a slot makes that slot active; an unlisted one
   * takes the slot it is going into, else the active slot, else the first empty one.
   */
  sync(w: World | undefined, played = false): GameIndex {
    const index = this.index.read();
    if (!w) return index;
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
  async importInto(slot: number, file: Uint8Array) {
    await this.prepare(slot);
    await this.client.importFile(file);
    if (this.client.state.error) {
      this.cancel();
      throw new Error(this.client.state.error);
    }
    this.sync(this.client.state.view?.world, true);
  }
  /**
   * A slot's game as a `.haeram-save` file (→SAVE-9): the game in play is saved first, any other
   * game is exported as last saved, one of earlier or newer rules included (→SAVE-11).
   */
  async exportFile(slot: number) {
    const entry = this.display(this.client.state.view?.world).slots[slot];
    if (!entry) return undefined;
    // A world in play the index never listed is exported under the ID its database has; an entry
    // that only names an unread earlier checkpoint has no database to export (→SAVE-29).
    const id = entry.id === 'in-play' ? this.client.gameId : entry.id;
    if (!id || id === 'earlier') return undefined;
    const file = await this.client.exportGame(checkedGameId(id));
    if (!file && this.client.state.error) throw new Error(this.client.state.error);
    return file;
  }
  /** Deletes a slot's game; true when it was the game in play, which the app then reloads away. */
  async remove(slot: number) {
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
