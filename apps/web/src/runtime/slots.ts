import type { World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { seasonDate } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import {
  GameIndexStore,
  IndexedDbParkedStore,
  type GameIndex,
  type ParkedStore,
  type SlotSummary,
} from '../adapters/games';
import { crestOf } from '../ui/crests';
import { divisionName } from '../ui/league';
import type { GameClient } from './client';

const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

/** What a slot card shows without loading its game. */
export function summarize(w: World): SlotSummary {
  const club = clubOf(w);
  return {
    club: club.name,
    country: country(club.country).name,
    division: divisionName(club.country, club.tier, club.group),
    date: seasonDate(w),
    seasons: w.history.length + 1,
    crest: crestOf(w, w.playerClub),
  };
}

/**
 * Three game slots over one game in play (→WEB-62, →SAVE-14). Switching parks the game in play in
 * IndexedDB, read back equal, before the next one is activated through the import path; only the
 * writer tab switches, starts, imports or deletes games.
 */
export class GameSlots {
  /** The slot a new or imported game is going into, until its world is in play. */
  private pending?: number;
  constructor(
    private client: GameClient,
    private index = new GameIndexStore(browserStorage),
    private parked: ParkedStore | undefined = IndexedDbParkedStore.available()
      ? new IndexedDbParkedStore()
      : undefined,
  ) {}
  read(): GameIndex {
    return this.index.read();
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
    const index = this.index.read();
    if (!w || index.slots.some((entry) => entry?.worldId === w.id)) return index;
    const slot = this.home(index);
    index.slots[slot] = { id: 'in-play', worldId: w.id, summary: summarize(w), playedAt: '' };
    index.active = slot;
    return index;
  }
  get canPark() {
    return !!this.parked;
  }
  private writable() {
    if (this.client.state.readonly)
      throw new Error('다른 탭에서 플레이 중이라 이 탭은 읽기 전용이에요.');
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
      // The game this one replaces was confirmed away; its parked copy goes with it.
      const replaced = index.slots[slot];
      if (replaced) void this.parked?.remove(replaced.id).catch(() => {});
      index.slots[slot] = {
        id: crypto.randomUUID(),
        worldId: w.id,
        summary: summarize(w),
        playedAt: now,
      };
    } else {
      const entry = index.slots[slot]!;
      index.slots[slot] = {
        ...entry,
        summary: summarize(w),
        playedAt: played ? now : entry.playedAt,
      };
    }
    index.active = slot;
    this.pending = undefined;
    this.index.write(index);
    return index;
  }
  /** Stores the game in play in IndexedDB, saved first; true when there is none to keep. */
  private async park() {
    const w = this.client.state.view?.world;
    if (!w) return true;
    if (!this.parked)
      throw new Error(
        '이 브라우저는 게임 보관함(IndexedDB)을 지원하지 않아 슬롯을 바꿀 수 없어요.',
      );
    const raw = await this.client.checkpoint();
    if (!raw)
      throw new Error(
        this.client.state.error || '현재 게임을 저장하지 못해 슬롯을 바꾸지 않았어요.',
      );
    const index = this.sync(w, true);
    await this.parked.put(index.slots[index.active!]!.id, raw);
    return true;
  }
  /** Continues a slot's game, bringing it into play when it is parked. */
  async continue(slot: number) {
    const inPlay = this.client.state.view?.world;
    const entry = this.display(inPlay).slots[slot];
    if (!entry) throw new Error('빈 슬롯이에요.');
    if (inPlay?.id === entry.worldId) {
      this.sync(inPlay, true);
      return;
    }
    this.writable();
    if (!this.parked)
      throw new Error(
        '이 브라우저는 게임 보관함(IndexedDB)을 지원하지 않아 슬롯을 바꿀 수 없어요.',
      );
    const raw = await this.parked.get(entry.id);
    if (!raw) throw new Error('이 슬롯의 저장을 찾지 못했어요. 파일 가져오기로 복구하세요.');
    await this.park();
    this.pending = slot;
    if (!(await this.client.switchTo(raw))) {
      this.pending = undefined;
      const error = this.client.state.error;
      // The game in play stays what is on disk; a half-finished switch never lingers in memory.
      await this.client.reload();
      throw new Error(error || '게임을 불러오지 못했어요.');
    }
    this.sync(this.client.state.view?.world, true);
  }
  /** Readies a slot for a new or imported game, parking the game in play first. */
  async prepare(slot: number) {
    this.writable();
    const index = this.index.read();
    if (index.active !== slot) await this.park();
    this.pending = slot;
  }
  cancel() {
    this.pending = undefined;
  }
  async importInto(slot: number, raw: string) {
    await this.prepare(slot);
    await this.client.importFile(raw);
    if (this.client.state.error) {
      this.pending = undefined;
      throw new Error(this.client.state.error);
    }
    this.sync(this.client.state.view?.world, true);
  }
  /** A slot's checkpoint envelope for export: the game in play's, or its parked copy. */
  async exportRaw(slot: number) {
    const entry = this.index.read().slots[slot];
    if (!entry) return undefined;
    if (this.client.state.view?.world.id === entry.worldId) return this.client.exportFile();
    return this.parked?.get(entry.id);
  }
  /** Deletes a slot's game; true when it was the game in play, which the app then reloads away. */
  async remove(slot: number) {
    this.writable();
    const index = this.index.read();
    const entry = index.slots[slot];
    if (!entry) return false;
    const inPlay = index.active === slot;
    if (inPlay) await this.client.forget();
    await this.parked?.remove(entry.id).catch(() => {});
    index.slots[slot] = null;
    if (inPlay) index.active = null;
    this.index.write(index);
    return inPlay;
  }
}
