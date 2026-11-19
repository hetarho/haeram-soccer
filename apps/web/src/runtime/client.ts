import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import type { NewsItem } from '../../../../packages/contracts/src/news';
import type { WorldMarketQuery, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import type { Command, GenerationDigest, World } from '../../../../packages/contracts/src/types';
import type { ClubListing, StartChoice } from '../../../../packages/contracts/src/owner';
import type { FullStatsScope } from '../../../../packages/contracts/src/match-model';
import { GameIndexStore } from '../adapters/games';
import { readSaveFileHeader } from '../adapters/saveFile';
import {
  SaveCompatibilityError,
  isSaveCompatibilityError,
  type SAVE_COMPATIBILITY_CODE,
} from '../../../../packages/contracts/src/versions';
import { applyViewDelta, PUBLISHED_VIEWS, type Body, type Reply, type View } from './protocol';
import { NOTIFICATIONS_KEY, notificationStore, shareValue, shareView } from './store';
import { HELPER_CONFIG } from './helperPool';
import { PlaybackStaging } from './staging';
/**
 * How long opening, creating, saving or exporting a game may take in the engine worker: a save
 * may queue behind a long command that reports only its own progress, and a new career's first
 * save writes every row.
 */
const STORAGE_TIMEOUT_MS = 600000;
/**
 * How long a world's generation may go without reaching its next season (→WORLD-13, ARCH-28):
 * each season it reaches is a progress message that restarts the watchdog.
 */
const GENERATION_STEP_MS = 600000;
/** Automatic progress waits at most this long for its background save (→SAVE-8). */
export const AUTOSAVE_MS = 30000;
/** The writer's notice once an activated career's updated save data is committed (→WEB-66). */
export const SAVE_DATA_UPDATED = sourceMessage('copy.client.424f709abd');
/**
 * A new game on its way (→WEB-2, WEB-15): the start's choices, the season the world's generation
 * has reached, then every club on sale with the tier's fortune, or why the generation failed.
 */
export interface StartState {
  choice: StartChoice;
  /** Whether it replaces the game in play once a club is taken over (→WEB-62). */
  replace: boolean;
  season?: number;
  /** The latest season's history while the world is generated (→WEB-115). */
  digest?: GenerationDigest;
  listings?: ClubListing[];
  /** The tier's fortune in pounds, minor units (→OWNER-3). */
  fortune?: string;
  error?: string;
}
export interface ClientState {
  view?: View;
  /** The new game being generated or chosen from, until its takeover (→WORLD-13). */
  start?: StartState;
  busy: boolean;
  /** Commands remain serialized even when background simulation leaves the UI available. */
  processing: boolean;
  /** Continuous automatic play, including the gaps between worker day calculations. */
  clockRunning?: boolean;
  activity: 'idle' | 'foreground' | 'background';
  readonly: boolean;
  savedRevision: number;
  /** When this tab last committed a checkpoint (epoch ms); unknown for a checkpoint it loaded. */
  savedAt?: number;
  /** The last save failed and nothing newer is committed: progress waits for a retry. */
  saveFailed?: boolean;
  error?: string;
  errorCode?: typeof SAVE_COMPATIBILITY_CODE;
  /**
   * Why this tab is read-only, for its HUD badge (→WEB-10). App notices are system notifications
   * in the inbox instead (→WEB-66).
   */
  notice?: string;
  progress: number;
  playback?: Reply['playback'];
  /** The latest committed player command and the world it changed, for outcome feedback. */
  lastAction?: { id: number; command: Command; before: World };
  /** Player commands queued or running; automatic clock ticks never count. */
  pendingActions?: number;
}
/**
 * How a reply's view is taken: `hold` keeps an automatic day for `reveal`; `head`, reading a notice
 * while the clock runs, replaces the newest held day when there is one and marks the notices read
 * on the others; any other view is shown at once, with whatever was computed before it.
 */
type Taking = 'hold' | 'head' | undefined;
/**
 * How the progression controller holds a read outside the command queue (→WEB-18): `ready`, when
 * set, settles once the read may be posted, and `settled` is called once it is answered or failed.
 * Undefined lets the read go at once.
 */
export type ReadGate = () => { ready?: Promise<void>; settled: () => void } | undefined;
/** `view` with the notices in `read` marked read; the same view when none of them was unread. */
function withRead(view: View, read: Set<string>): View {
  const inbox = view.world.inbox;
  if (!inbox?.some((item) => !item.read && read.has(item.id))) return view;
  return {
    ...view,
    world: {
      ...view.world,
      inbox: inbox.map((item) =>
        !item.read && read.has(item.id) ? { ...item, read: true } : item,
      ),
    },
  };
}
/** The slot index's game in play (→SAVE-14), when one is. */
function activeGameId() {
  const index = new GameIndexStore(localStorage).read();
  return index.active === null ? undefined : index.slots[index.active]?.id;
}
/** The game ID the slot index lists `worldId` under, else a new one. */
function gameIdFor(worldId: string) {
  const listed = new GameIndexStore(localStorage).read().slots.find((e) => e?.worldId === worldId);
  return listed?.id ?? crypto.randomUUID();
}
export class GameClient {
  private automaticPending = 0;
  state: ClientState = {
    busy: true,
    processing: true,
    activity: 'foreground',
    readonly: true,
    savedRevision: -1,
    progress: 0,
  };
  private staging = new PlaybackStaging(
    (playback) => {
      this.state.playback = playback;
      this.emit();
    },
    () => notificationStore.add(sourceMessage('copy.client.aa2516a9e3')),
  );
  /** Presentation work stops when its theatre is left; the world worker is independent. */
  setWatching(watching: boolean) {
    this.staging.watching(watching);
  }
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  /**
   * The game in play's ID in the slot index, naming its database (→SAVE-14); `stored` once the
   * engine worker holds that database, so a save writes the changed rows, else its first save
   * creates it whole (replacing what it held only for an activated import or parked game).
   */
  gameId?: string;
  private stored = false;
  private createReplaces = false;
  /**
   * The game IDs whose database files exist, from the startup listing and kept as this tab creates
   * and deletes games (→SAVE-29); undefined while unknown.
   */
  private gameFiles?: Set<string>;
  /** The game a new one replaces in its slot: its file goes when the new game's is created. */
  private replacedGame?: string;
  /** The fixture helpers, computing an own match day's other fixtures for the engine (→ARCH-6). */
  private helpers: Worker[] = [];
  /** The save being committed, and whether a newer one was asked for meanwhile. */
  private saving?: Promise<void>;
  private saveWanted = false;
  /** Saves automatic progress no later than AUTOSAVE_MS after its first unsaved day. */
  private autosaveTimer?: number;
  private session = crypto.randomUUID();
  private serial = 0;
  private actionSerial = 0;
  private failed = false;
  private waiters = new Map<
    string,
    {
      resolve: (r: Reply) => void;
      reject: (e: Error) => void;
      timer: number;
      /** The watchdog each message restarts. */
      timeout: number;
      publishView: boolean;
      /** How its view is taken (`take`). */
      taking?: Taking;
    }
  >();
  private queue = Promise.resolve();
  /** The latest published views this tab holds by sequence, the newest the head's (→ARCH-6). */
  private views = new Map<number, View>();
  private viewSeq?: number;
  /**
   * Days automatic play computed ahead of the shown date, oldest first (→WEB-18). The newest is
   * the world the engine worker holds: requests and saves start from it, and `reveal` shows them.
   */
  private held: View[] = [];
  /**
   * Set by the progression controller: the engine answers a read from its newest computed day, so
   * a read waits until the days computed ahead are shown (→WEB-18).
   */
  readGate?: ReadGate;
  private release?: () => void;
  private lockWait?: AbortController;
  private cancelled = false;
  private channel = new BroadcastChannel('haeram-soccor:updates');
  private refreshPending = false;
  private refreshSerial = 0;
  private storageListener = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_KEY) notificationStore.sync();
  };
  constructor(private notify: (state: ClientState) => void) {
    this.worker.onmessage = (event: MessageEvent<Reply>) => this.received(event.data);
    this.worker.onerror = () => this.failWorker();
    this.startHelpers();
    this.channel.onmessage = () => this.refresh();
    window.addEventListener('storage', this.storageListener);
    notificationStore.sync();
  }
  /**
   * Creates the fixture helpers on a device with the cores for them and hands their ports to the
   * engine worker: nested workers are not dependable on every browser (→ARCH-6/18). Without them,
   * after a creation failure or once one errors, the engine worker computes every fixture itself.
   */
  private startHelpers() {
    if (!((navigator.hardwareConcurrency ?? 0) >= HELPER_CONFIG.minCores)) return;
    const ports: MessagePort[] = [];
    try {
      for (let i = 0; i < HELPER_CONFIG.count; i++) {
        const helper = new Worker(new URL('./fixtureHelper.ts', import.meta.url), {
          type: 'module',
        });
        this.helpers.push(helper);
        helper.onerror = () => this.helpersFailed();
        const channel = new MessageChannel();
        helper.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
        ports.push(channel.port2);
      }
    } catch {
      this.helpersFailed();
      return;
    }
    this.worker.postMessage({ type: 'helpers', ports }, ports);
  }
  /** An engine worker reply: progress, or the answer its request waits for. */
  private received(r: Reply) {
    const pending = this.waiters.get(r.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.timer = window.setTimeout(() => this.failWorker(), pending.timeout);
    if (r.progress !== undefined) {
      if (r.season !== undefined && this.state.start)
        this.state.start = {
          ...this.state.start,
          season: r.season,
          ...(r.digest ? { digest: r.digest } : {}),
        };
      if (this.state.activity === 'foreground' || r.season !== undefined) {
        this.state.progress = r.progress;
        this.emit();
      }
      return;
    }
    clearTimeout(pending.timer);
    this.waiters.delete(r.requestId);
    const { view, shared } = this.viewOf(r, pending.publishView);
    // A failed day changes nothing to show: its view stands where the worker does.
    const taking = pending.taking === 'hold' && !r.ok ? 'head' : pending.taking;
    const taken =
      view && pending.publishView
        ? this.take(shared ? view : shareView(this.head, view)!, taking)
        : undefined;
    if (taken && r.viewSeq !== undefined) {
      this.views.set(r.viewSeq, taken);
      this.viewSeq = r.viewSeq;
      while (this.views.size > PUBLISHED_VIEWS) this.views.delete(this.views.keys().next().value!);
    }
    // Callers read the whole view, sharing the taken view's references.
    if (view) r.view = taken ?? view;
    if (r.ok) pending.resolve(r);
    else
      pending.reject(
        r.errorCode === 'save-compatibility'
          ? new SaveCompatibilityError(r.error)
          : new Error(r.error || sourceMessage('copy.client.aa2516a9e3')),
      );
  }
  private helpersFailed() {
    if (!this.helpers.length) return;
    for (const helper of this.helpers.splice(0)) helper.terminate();
    this.worker.postMessage({ type: 'helpers-failed' });
  }
  private refresh() {
    if (!this.state.readonly) return;
    this.refreshSerial++;
    if (this.refreshPending) return;
    this.refreshPending = true;
    void this.enqueue(
      async () => {
        while (true) {
          const observed = this.refreshSerial;
          await this.load();
          // Drain notices that arrived during this load; another notification asks again.
          if (this.refreshSerial === observed) break;
        }
      },
      { background: !!this.state.view },
    ).finally(() => {
      this.refreshPending = false;
    });
  }

  private failWorker() {
    this.failed = true;
    this.worker.terminate();
    this.state.error = sourceMessage('copy.client.0747dd4e85');
    this.state.busy = false;
    this.state.processing = false;
    this.state.activity = 'idle';
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(this.state.error));
    }
    this.waiters.clear();
    this.emit();
  }
  private emit() {
    this.notify({ ...this.state });
  }
  async start() {
    if (!globalThis.CompressionStream || !globalThis.DecompressionStream || !crypto.subtle) {
      this.state.busy = false;
      this.state.processing = false;
      this.state.activity = 'idle';
      this.state.error = sourceMessage('copy.client.d09886a50b');
      this.emit();
      return;
    }
    if (!navigator.locks) {
      // No tab may write without the lock, so this one stays read-only and its badge says why.
      this.state.notice = sourceMessage('copy.client.2313251099');
      await this.enqueue(() => this.load());
      return;
    }
    await new Promise<void>((resolve) => {
      void navigator.locks.request('haeram-soccor:writer', { ifAvailable: true }, async (lock) => {
        this.state.readonly = !lock;
        if (!lock) this.state.notice = sourceMessage('shell.readonlyNotice');
        await this.enqueue(() => this.load());
        resolve();
        if (lock)
          await new Promise<void>((done) => {
            this.release = done;
          });
        else this.awaitOwnership();
      });
    });
  }
  /**
   * A read-only tab queues for the writer lock. When the playing tab closes (browsers may release
   * the lock a moment later), this tab reloads the latest checkpoint and continues as the writer.
   */
  private awaitOwnership() {
    if (this.failed || !navigator.locks) return;
    this.lockWait = new AbortController();
    void navigator.locks
      .request('haeram-soccor:writer', { signal: this.lockWait.signal }, async (lock) => {
        if (!lock || this.failed) return;
        this.state.readonly = false;
        delete this.state.notice;
        notificationStore.add(sourceMessage('copy.client.b912d5c1e3'));
        await this.enqueue(() => this.load());
        await new Promise<void>((done) => {
          this.release = done;
        });
      })
      .catch(() => {
        /* aborted on dispose */
      });
  }
  /**
   * Opens the game in play — the slot index's active game — in the engine worker, which validates
   * its database and commits any writer upgrade at once (→SAVE-5, →SAVE-10). A game without a
   * database file reads as an empty slot (→SAVE-29). A read-only tab opens nothing: a game's
   * database opens in one tab only (→SAVE-6).
   */
  private async load() {
    await this.whenSaved();
    if (!this.state.readonly) await this.listGames();
    const gameId = this.state.readonly ? undefined : activeGameId();
    if (gameId) await this.open(gameId);
    this.emit();
  }
  /**
   * The game IDs whose database files exist, asked of the engine worker at startup (→SAVE-29): a
   * slot-index entry outside them reads as an empty slot. Unknown, so nothing is hidden, when the
   * worker cannot list its files.
   */
  private async listGames() {
    try {
      const reply = await this.rpc({ type: 'list-games' }, undefined, STORAGE_TIMEOUT_MS);
      this.gameFiles = new Set(reply.games ?? []);
    } catch {
      this.gameFiles = undefined;
    }
  }
  /** Whether a slot-index game has its database file, or is not known to lack one (→SAVE-29). */
  hasGameFile(gameId: string) {
    return !this.gameFiles || this.gameFiles.has(gameId) || gameId === this.gameId;
  }
  /** Opens one game's database as the game in play; false when it has no file. */
  private async open(gameId: string) {
    const playback = this.state.playback,
      career = this.state.view?.world.id;
    const reply = await this.opening({ type: 'open-game', gameId }, gameId);
    if (!reply.opened?.found) {
      this.gameFiles?.delete(gameId);
      return false;
    }
    this.adopt(gameId, reply, playback, career);
    return true;
  }
  /**
   * Asks the engine worker to put a game's database in play (`open-game`, or `import-game` for a
   * file checked first). A write that failed after the game was in play leaves the upgraded game
   * in memory, exportable (→SAVE-10).
   */
  private async opening(body: Body, gameId: string): Promise<Reply> {
    const before = this.state.view?.world;
    try {
      return await this.rpc(body, undefined, STORAGE_TIMEOUT_MS);
    } catch (error) {
      const opened = this.state.view?.world;
      if (!opened || (opened.id === before?.id && opened.revision === before?.revision))
        throw error;
      // The upgraded game is in play, its commit failed: memory keeps it, exportable (→SAVE-10).
      this.gameId = gameId;
      this.stored = true;
      this.state.savedRevision = -1;
      this.state.saveFailed = true;
      throw new Error(sourceMessage('copy.client.042fb5736b', { p0: String(error) }));
    }
  }
  /** Takes the game a worker reply opened as the game in play. */
  private adopt(
    gameId: string,
    reply: Reply,
    playback: ClientState['playback'],
    career: string | undefined,
  ) {
    // A revealed playback of this career whose match the game holds finishes under the model it
    // was settled with, even when this load activates a newer one (→SAVE-23).
    const world = this.state.view?.world;
    this.staging.replace(
      playback &&
        world?.id === career &&
        world?.ownMatches.some((match) => match.id === playback.record.id)
        ? playback.script
          ? { ...playback, frames: [] }
          : playback
        : undefined,
    );
    this.gameId = gameId;
    this.stored = true;
    this.createReplaces = false;
    this.gameFiles?.add(gameId);
    this.state.savedRevision = reply.opened?.revision ?? -1;
    this.state.savedAt = undefined;
    this.state.saveFailed = false;
    if (reply.upgraded) {
      this.state.savedAt = Date.now();
      // A catalog pin, missing club designs (→SAVE-21) or the full match model (→SAVE-23) are
      // updated, never the gameplay rules or a settled fact.
      notificationStore.add(SAVE_DATA_UPDATED);
      this.channel.postMessage({ revision: this.state.savedRevision });
    }
  }
  /**
   * The whole view a reply carries, rebuilt on the base it names when it sends only changes;
   * `shared` when it was rebuilt on the head to follow it, its values regaining that view's
   * references as they went in, as `shareView` would give them (→ARCH-6).
   */
  private viewOf(r: Reply, publish: boolean): { view?: View; shared?: boolean } {
    if (r.view) return { view: r.view };
    const delta = r.viewDelta,
      base = delta && this.views.get(delta.base);
    if (!delta || !base) return {};
    if (publish && base === this.head)
      return { view: applyViewDelta(base, delta, shareValue), shared: true };
    return { view: applyViewDelta(base, delta) };
  }
  /** The newest view the engine worker holds: the last day computed ahead, else the shown one. */
  private get head() {
    return this.held.at(-1) ?? this.state.view;
  }
  /** Takes a view as `taking` says; held days share structure with the day before (→WEB-18). */
  private take(view: View, taking: Taking) {
    const same = this.head?.world.id === view.world.id;
    if (!same) this.staging.replace();
    if (taking === 'hold' && same) this.held.push(view);
    else if (taking === 'head' && same && this.held.length) {
      // Notices read during play read on the day shown and every day held too (→WEB-97).
      const read = new Set(
        (view.world.inbox || []).filter((item) => item.read).map((item) => item.id),
      );
      this.held = [...this.held.slice(0, -1).map((held) => withRead(held, read)), view];
      this.state.view = withRead(this.state.view!, read);
    } else {
      // An owner decision, a load or another world stands past whatever was computed ahead.
      this.held = [];
      this.state.view = view;
    }
    return view;
  }
  /**
   * Shows the next computed day, or every one at once, in order; returns how many it showed. The
   * progression controller calls it at the pace (→WEB-18).
   */
  reveal(all = false) {
    const shown = this.held.splice(0, all ? this.held.length : 1);
    if (!shown.length) return 0;
    this.state.view = shown.at(-1);
    this.emit();
    return shown.length;
  }
  private requestId() {
    return `${this.session.slice(0, 8)}:${++this.serial}`;
  }
  private rpc(
    body: Body,
    requestId = this.requestId(),
    timeout = 15000,
    automatic = false,
  ): Promise<Reply> {
    if (this.failed) return Promise.reject(new Error(sourceMessage('copy.client.3e8bd256a6')));
    return new Promise((resolve, reject) => {
      this.waiters.set(requestId, {
        resolve,
        reject,
        timer: window.setTimeout(() => this.failWorker(), timeout),
        timeout,
        publishView:
          body.type === 'take-over' ||
          body.type === 'command' ||
          body.type === 'ack-critical' ||
          body.type === 'open-game' ||
          body.type === 'import-game',
        taking: automatic
          ? 'hold'
          : body.type === 'command' && body.command.type === 'read-inbox'
            ? 'head'
            : undefined,
      });
      // The worker stands at the head, ahead of the shown date while days are held.
      const head = this.head;
      this.worker.postMessage({
        protocol: 1,
        session: this.session,
        requestId,
        expectedRevision: head?.world.revision ?? -1,
        viewBase: head ? this.viewSeq : undefined,
        body,
      });
    });
  }
  private enqueue<T>(
    fn: () => Promise<T>,
    options: { background?: boolean } = {},
  ): Promise<T | undefined> {
    const task = this.queue.then(async () => {
      this.state.processing = true;
      this.state.busy = !options.background;
      this.state.activity = options.background ? 'background' : 'foreground';
      delete this.state.error;
      delete this.state.errorCode;
      this.state.progress = 0;
      this.emit();
      try {
        return await fn();
      } catch (error) {
        this.state.error = String(error);
        this.state.errorCode = isSaveCompatibilityError(error) ? error.code : undefined;
        return undefined;
      } finally {
        this.state.busy = false;
        this.state.processing = false;
        this.state.activity = 'idle';
        this.emit();
      }
    });
    this.queue = task.then(() => {});
    return task;
  }
  private async mutate(body: Body, automatic = false) {
    if (this.state.readonly) throw new Error(sourceMessage('copy.client.ef47a5dab0'));
    // A new career's first world, the club taken over, is saved whole (→SAVE-3).
    const starts = body.type === 'take-over';
    if (starts) {
      this.state.savedRevision = -1;
      this.staging.replace();
    }
    const reply = await this.rpc(body, undefined, undefined, automatic);
    if (reply.playback) this.staging.replace(reply.playback);
    this.emit();
    // The engine answered without encoding; the caller asks for the background save.
    return reply;
  }
  /**
   * Saves the world in play in its database, in the engine worker (→SAVE-8). One save runs at a
   * time; requests made meanwhile become one newer save after it. Resolves once the world as it
   * stood at the latest request is committed; a failure becomes the save error and rejects.
   */
  save(): Promise<void> {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    this.saveWanted = true;
    this.saving ??= Promise.resolve().then(() => this.drainSaves());
    return this.saving;
  }
  /**
   * Asks for a background save without waiting for it: after an owner decision, when the clock
   * stops and when the page hides or closes. A failure still becomes the save error.
   */
  saveSoon() {
    // A failed engine worker holds the only copy of the world; its own error already says so.
    if (this.failed) return;
    void this.save().catch(() => {});
  }
  /** Automatic progress is saved within AUTOSAVE_MS, or sooner when anything else saves. */
  private autosave() {
    if (this.autosaveTimer !== undefined || this.state.readonly) return;
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = undefined;
      this.saveSoon();
    }, AUTOSAVE_MS);
  }
  /** Settles once no save is running or waiting, whatever came of it. */
  whenSaved(): Promise<void> {
    return this.saving?.catch(() => {}) ?? Promise.resolve();
  }
  private async drainSaves() {
    try {
      while (this.saveWanted) {
        this.saveWanted = false;
        await this.saveOnce();
      }
    } catch (error) {
      this.saveWanted = false;
      const failure = new Error(sourceMessage('copy.client.38dd719a53', { p0: String(error) }));
      this.state.error = String(failure);
      this.state.saveFailed = true;
      this.emit();
      throw failure;
    } finally {
      this.saving = undefined;
    }
  }
  /**
   * One save of the engine's current world: its changed rows, or every row on the game's first
   * save, answered once the transaction commits (→SAVE-3). During automatic play it may hold days
   * not yet shown (→SAVE-8).
   */
  private async saveOnce() {
    const w = this.head?.world;
    if (!w || this.state.readonly || w.revision === this.state.savedRevision) return;
    const gameId = this.gameId;
    if (!gameId) throw new Error(sourceMessage('copy.host.c64421732a'));
    if (!this.stored && this.replacedGame) {
      // A game replaced in its slot (after the owner confirmed it, →WEB-62) loses its file first.
      if (this.replacedGame !== gameId)
        await this.rpc(
          { type: 'delete-game', gameId: this.replacedGame },
          undefined,
          STORAGE_TIMEOUT_MS,
        );
      this.gameFiles?.delete(this.replacedGame);
      this.replacedGame = undefined;
    }
    const body: Body = this.stored
      ? { type: 'save' }
      : { type: 'create-game', gameId, ...(this.createReplaces ? { replace: true } : {}) };
    const reply = await this.rpc(body, undefined, STORAGE_TIMEOUT_MS);
    const saved = reply.saved;
    if (!saved) throw new Error(sourceMessage('copy.client.d9dbcef838'));
    this.gameFiles?.add(saved.gameId);
    if (saved.gameId === this.gameId) {
      this.stored = true;
      this.createReplaces = false;
    }
    // A save of a world no longer in play changes nothing shown.
    if (saved.worldId !== this.head?.world.id) return;
    this.state.savedRevision = saved.revision;
    this.state.savedAt = Date.now();
    this.state.saveFailed = false;
    // Read-only tabs hear of every commit.
    this.channel.postMessage({ revision: saved.revision });
    this.emit();
  }
  /**
   * Generates a new game's world to the chosen decade (→WEB-2, WORLD-13): the worker reports each
   * season it reaches, then lists every club on sale with the tier's fortune. Nothing is saved or
   * replaced until a club is taken over; a failure stays with the start, which offers a retry.
   */
  generate(choice: StartChoice, replace = false) {
    return this.enqueue(async () => {
      this.state.start = { choice, replace };
      this.state.progress = 0;
      this.emit();
      try {
        if (this.state.readonly) throw new Error(sourceMessage('copy.client.ef47a5dab0'));
        const reply = await this.rpc(
          { type: 'generate', choice, replace },
          undefined,
          GENERATION_STEP_MS,
        );
        if (!reply.start) throw new Error(sourceMessage('copy.client.e77af07eb2'));
        this.state.start = { ...this.state.start!, ...reply.start };
        return reply;
      } catch (error) {
        this.state.start = { ...this.state.start!, error: String(error) };
        return undefined;
      }
    });
  }
  /**
   * Takes a club of the generated world over with standard operating defaults (→ECON-38, WEB-15): the
   * career's first world, saved at once.
   */
  takeOver(clubId: string) {
    return this.enqueue(async () => {
      const replace = !!this.state.start?.replace;
      // The new career's database, created on its first save (→SAVE-2). Set before the takeover's
      // view is published, so the slot index lists the career under it.
      const previous = { gameId: this.gameId, stored: this.stored, replaces: this.createReplaces };
      this.gameId = crypto.randomUUID();
      this.stored = false;
      this.createReplaces = false;
      let reply: Reply;
      try {
        reply = await this.mutate({ type: 'take-over', clubId, ...(replace ? { replace } : {}) });
      } catch (error) {
        this.gameId = previous.gameId;
        this.stored = previous.stored;
        this.createReplaces = previous.replaces;
        throw error;
      }
      delete this.state.start;
      this.saveSoon();
      return reply;
    });
  }
  /** A club's profile in the generated world, read outside the command queue (→WEB-15). */
  async startClubProfile(clubId: string) {
    const reply = await this.rpc({ type: 'club-profile', clubId });
    return reply.clubProfile;
  }
  /** Any club's profile in the career shown (→WEB-58); one answered for another career is refused. */
  async clubProfile(clubId: string) {
    const world = this.careerWorld();
    const reply = await this.read({ type: 'club-profile', clubId, world });
    if (!reply.clubProfile) throw new Error(reply.error ?? sourceMessage('copy.client.2495f14743'));
    if (this.state.view?.world.id !== world)
      throw new Error(sourceMessage('copy.client.bb0388da59'));
    return reply.clubProfile;
  }
  /**
   * A first-team player of any club in the career shown, with the club he plays for (→WEB-59);
   * `clubId`, where he was named, is looked at first.
   */
  async playerProfile(playerId: string, clubId?: string) {
    const world = this.careerWorld();
    const reply = await this.read({
      type: 'player-profile',
      playerId,
      world,
      ...(clubId ? { clubId } : {}),
    });
    if (!reply.playerProfile)
      throw new Error(reply.error ?? sourceMessage('copy.client.da8045ca44'));
    if (this.state.view?.world.id !== world)
      throw new Error(sourceMessage('copy.client.66590a4777'));
    return reply.playerProfile;
  }
  private careerWorld() {
    const world = this.state.view?.world.id;
    if (!world) throw new Error(sourceMessage('copy.client.a198ec6115'));
    return world;
  }
  /** Leaves a new game before its takeover; the worker drops its world with the next start. */
  leaveStart() {
    if (!this.state.start) return;
    delete this.state.start;
    this.emit();
  }
  /**
   * `automatic` marks clock ticks, whose days are held until `reveal` shows them; every other
   * command is an owner decision and reports its outcome. Neither waits for its save: a decision
   * asks for one at once, automatic days within AUTOSAVE_MS (→SAVE-8).
   */
  command(command: Command, options: { background?: boolean; automatic?: boolean } = {}) {
    if (
      !options.automatic &&
      command.type !== 'read-inbox' &&
      (this.state.clockRunning || this.automaticPending > 0)
    )
      return Promise.resolve(undefined);
    this.cancelled = false;
    if (options.automatic) this.automaticPending++;
    if (!options.automatic) {
      this.state.pendingActions = (this.state.pendingActions || 0) + 1;
      this.emit();
    }
    const task = this.enqueue(async () => {
      const before = this.head?.world;
      let reply: Reply | undefined;
      try {
        if (!this.cancelled)
          reply = await this.mutate({ type: 'command', command } as Body, options.automatic);
      } finally {
        if (reply) {
          if (options.automatic) this.autosave();
          else this.saveSoon();
        }
      }
      if (reply?.ok && before && !options.automatic)
        this.state.lastAction = { id: ++this.actionSerial, command, before };
      return reply;
    }, options);
    if (options.automatic)
      return task.finally(() => {
        this.automaticPending--;
      });
    return task.finally(() => {
      this.state.pendingActions = Math.max(0, (this.state.pendingActions || 1) - 1);
      this.emit();
    });
  }
  /** The progression controller owns this flag; worker activity cannot clear it between days. */
  setClockRunning(running: boolean) {
    if (!!this.state.clockRunning === running) return;
    this.state.clockRunning = running;
    this.emit();
  }
  /** Settle already admitted work before opening a manual decision or match. */
  whenIdle() {
    return this.queue;
  }
  cancel() {
    this.cancelled = true;
    this.worker.postMessage({ type: 'cancel' });
  }
  acknowledge() {
    return this.enqueue(async () => {
      const reply = await this.mutate({ type: 'ack-critical' });
      this.saveSoon();
      return reply;
    });
  }
  /**
   * A read skips the command queue, so it never sets busy or waits behind a season command
   * (→ARCH-6). The engine answers it from its newest computed day, so it is posted only once the
   * controller has shown the days computed ahead, and computing ahead waits for its answer (→WEB-18).
   */
  private async read(body: Body) {
    const gate = this.readGate?.();
    try {
      if (gate?.ready) await gate.ready;
      return await this.rpc(body);
    } finally {
      gate?.settled();
    }
  }
  /** Season and manager records are reads; refreshing them never holds the clock or sets busy. */
  async newsPage(before?: string, tag?: NewsItem['tag']) {
    const world = this.state.view?.world.id;
    if (!world) throw new Error(sourceMessage('copy.client.c4072852b5'));
    const reply = await this.read({
      type: 'news-page',
      world,
      ...(before ? { before } : {}),
      ...(tag ? { tag } : {}),
    });
    if (!reply.ok || !reply.newsPage)
      throw new Error(reply.error ?? sourceMessage('copy.client.61c0310bdd'));
    if (this.state.view?.world.id !== world || reply.newsPage.world !== world)
      throw new Error(sourceMessage('copy.client.b5f5102d65'));
    return reply.newsPage;
  }
  async archive(year: number) {
    return (await this.read({ type: 'archive', year })).archive;
  }
  async recruitmentHistory() {
    const reply = await this.read({ type: 'recruitment-history' });
    if (!reply.recruitmentHistory)
      throw new Error(reply.error ?? sourceMessage('copy.client.77f448d4c3'));
    return reply.recruitmentHistory;
  }
  async mediationPreview(id: string, support: 'director' | 'balanced' | 'manager') {
    const reply = await this.read({ type: 'mediation-preview', id, support });
    if (!reply.mediationPreview)
      throw new Error(reply.error ?? sourceMessage('copy.client.5f4238fea0'));
    return reply.mediationPreview;
  }
  async personCareer(person: string) {
    const reply = await this.read({ type: 'person-career', person });
    if (!reply.personCareer)
      throw new Error(reply.error ?? sourceMessage('copy.client.3e6c4c1970'));
    return reply.personCareer;
  }
  /**
   * Our all-time record against a club from every own match the worker keeps; the view holds only
   * the recent ones.
   */
  async headToHead(club: string) {
    const reply = await this.read({ type: 'head-to-head', club });
    if (!reply.headToHead) throw new Error(sourceMessage('copy.client.f7307d418d'));
    return reply.headToHead;
  }
  /** Our match records over every own match, read like head-to-head without the command queue. */
  async clubRecords() {
    const reply = await this.read({ type: 'club-records' });
    if (!reply.clubRecords) throw new Error(sourceMessage('copy.client.3a2136dd0f'));
    return reply.clubRecords;
  }
  /** Bounded market page, admitted through the same displayed-day read gate as other previews. */
  async worldMarket(query: Omit<WorldMarketQuery, 'world'> = {}) {
    const world = this.state.view?.world.id;
    if (!world) throw new Error(sourceMessage('copy.client.a198ec6115'));
    const reply = await this.read({ type: 'world-market', query: { ...query, world } });
    if (!reply.ok || !reply.worldMarket)
      throw new Error(reply.error ?? sourceMessage('copy.client.29113d74d3'));
    if (this.state.view?.world.id !== world || reply.worldMarket.world !== world)
      throw new Error(sourceMessage('copy.client.468e777c46'));
    return reply.worldMarket;
  }
  async worldMarketDetail(target: WorldMarketTarget, fee?: string, loan = false) {
    const world = this.state.view?.world.id;
    if (!world || target.world !== world) throw new Error(sourceMessage('copy.client.906fd444a8'));
    const reply = await this.read({ type: 'world-market-detail', target, fee, loan });
    if (!reply.ok || !reply.worldMarketDetail)
      throw new Error(reply.error ?? sourceMessage('copy.client.5e4dc51a81'));
    if (this.state.view?.world.id !== world || reply.worldMarketDetail.world !== world)
      throw new Error(sourceMessage('copy.client.866fec3562'));
    return reply.worldMarketDetail;
  }
  /**
   * One page of our managers' history (→HIST-18/19, WEB-92), summarised from every own match the
   * worker keeps and read like head-to-head without the command queue; `cursor` is the previous
   * page's. It names the career this tab shows, and a page for any other career is refused: one
   * answered after the worker switched games or landing after this tab did.
   */
  async managerHistory(cursor?: string) {
    const world = this.state.view?.world.id;
    const reply = await this.read({
      type: 'manager-history',
      ...(cursor !== undefined ? { cursor } : {}),
      ...(world !== undefined ? { world } : {}),
    });
    if (!reply.managerHistory)
      throw new Error(reply.error ?? sourceMessage('copy.client.7694a5e1a8'));
    if (this.state.view?.world.id !== world)
      throw new Error(sourceMessage('copy.client.cba83d23a6'));
    return reply.managerHistory;
  }
  /** Another league's fixtures this season, read like head-to-head without the command queue. */
  async leagueFixtures(league: { code: string; tier: number; group: number }) {
    const reply = await this.read({
      type: 'league-fixtures',
      country: league.code,
      tier: league.tier,
      group: league.group,
    });
    return reply.leagueFixtures ?? [];
  }
  /**
   * A competition's complete statistics this season (→WEB-89), read like head-to-head without the
   * command queue; undefined while the season keeps none.
   */
  async fullStats(scope: FullStatsScope) {
    const reply = await this.read({ type: 'full-stats', ...scope });
    if (!reply.ok) throw new Error(reply.error ?? sourceMessage('copy.client.9c85eddfec'));
    return reply.fullStats;
  }
  /** Whether a game in play is stored, so an import would replace it. */
  hasStoredGame() {
    return this.stored;
  }
  /**
   * A game's database as a `.haeram-save` file (→SAVE-9). The game in play is saved first, so the
   * file holds its latest progress, or what memory holds when that save fails; any other game is
   * exported as last saved, even one of rules this version cannot open (→SAVE-11). Undefined when
   * the game has no file.
   */
  exportGame(gameId: string) {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error(sourceMessage('copy.client.6d888fa0f2'));
      // A save that fails keeps the progress exportable from memory (→SAVE-3, →SAVE-10).
      let memory = false;
      if (gameId === this.gameId) await this.save().catch(() => (memory = true));
      return (
        await this.rpc(
          { type: 'export-game', gameId, ...(memory ? { memory } : {}) },
          undefined,
          STORAGE_TIMEOUT_MS,
        )
      ).file;
    });
  }
  /** The game in play as a `.haeram-save` file; undefined while none is in play. */
  exportFile() {
    return this.gameId ? this.exportGame(this.gameId) : Promise.resolve(undefined);
  }
  /**
   * Imports a `.haeram-save` file as the game in play (→SAVE-9). The engine worker checks it whole
   * before anything is replaced; a refused file leaves every game and the game in play as they
   * were. The game of the slot being replaced loses its file only after the import is in place.
   */
  importFile(file: Uint8Array) {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error(sourceMessage('copy.client.6d888fa0f2'));
      await this.whenSaved();
      // A file of another format is refused here, before the worker is asked.
      const { header } = readSaveFileHeader(file);
      // The game's database is the slot's that lists its world, else a new one.
      const gameId = gameIdFor(header.worldId);
      const replaces = this.replacedGame;
      const playback = this.state.playback,
        career = this.state.view?.world.id;
      const reply = await this.opening(
        {
          type: 'import-game',
          gameId,
          ...(replaces && replaces !== gameId ? { replaces } : {}),
          file,
        },
        gameId,
      );
      if (replaces) {
        this.gameFiles?.delete(replaces);
        this.replacedGame = undefined;
      }
      this.staging.replace();
      this.adopt(gameId, reply, playback, career);
    });
  }
  /**
   * Switches games (→SAVE-14): the game in play is saved and closed, then the next game's database
   * is opened and validated. A failed open leaves both files untouched and reopens the previous
   * game; resolves true once the next game is in play.
   */
  async switchTo(gameId: string) {
    return (
      (await this.enqueue(async () => {
        if (this.state.readonly) throw new Error(sourceMessage('copy.client.6d888fa0f2'));
        const previous = this.gameId;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = undefined;
        await this.save();
        const opened = this.stored && previous !== undefined;
        if (opened) await this.rpc({ type: 'close-game' }, undefined, STORAGE_TIMEOUT_MS);
        this.leaveGame();
        let failure: unknown;
        try {
          if (await this.open(gameId)) return true;
          failure = new Error(sourceMessage('copy.slots.148750cdf5'));
        } catch (error) {
          failure = error;
        }
        if (opened) await this.open(previous).catch(() => false);
        throw failure;
      })) === true
    );
  }
  /** Saves the game in play, so another game may take its slot or its place (→SAVE-14). */
  saveGame() {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error(sourceMessage('copy.client.6d888fa0f2'));
      await this.save();
    });
  }
  /** The game whose file goes when the next new game's is created, in the same slot (→WEB-62). */
  replaceOnCreate(gameId: string | undefined) {
    this.replacedGame = gameId;
  }
  /** Reloads the committed game in play, e.g. after a switch that could not finish. */
  reload() {
    return this.enqueue(() => this.load());
  }
  /** Nothing of the game in play stays in this page: no view, no database, no pending save. */
  private leaveGame() {
    this.gameId = undefined;
    this.stored = false;
    this.state.view = undefined;
    delete this.state.start;
    this.held = [];
    this.views.clear();
    this.staging.replace();
    this.emit();
  }
  /**
   * Deletes a game's database (→SAVE-14, →WEB-62); the game in play leaves this page with it, and
   * the app reloads into the slot screen after.
   */
  deleteGame(gameId: string) {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error(sourceMessage('copy.client.6d888fa0f2'));
      // No autosave may bring the removed game back.
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = undefined;
      await this.whenSaved();
      await this.rpc({ type: 'delete-game', gameId }, undefined, STORAGE_TIMEOUT_MS);
      this.gameFiles?.delete(gameId);
      if (gameId === this.gameId) this.leaveGame();
    });
  }
  retrySave() {
    return this.enqueue(() => this.save());
  }
  dispose() {
    this.staging.stop();
    window.removeEventListener('storage', this.storageListener);
    clearTimeout(this.autosaveTimer);
    this.failed = true;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(sourceMessage('copy.client.250bdea6bf')));
    }
    this.waiters.clear();
    this.lockWait?.abort();
    this.release?.();
    this.channel.close();
    this.worker.terminate();
    for (const helper of this.helpers) helper.terminate();
  }
}
