import type { WorldMarketQuery, WorldMarketTarget } from '../../../../packages/contracts/src/types';
import type { Command, Founding, World } from '../../../../packages/contracts/src/types';
import type { FullStatsScope } from '../../../../packages/contracts/src/match-model';
import { SaveRepository, type SaveWorldMetadata } from '../adapters/repository';
import { IndexedDbCheckpointKey } from '../adapters/previousStore';
import { ACTIVE_SAVE_KEYS } from '../adapters/games';
import {
  CURRENT_ENGINE_VERSION,
  envelopeEngine,
  isEarlierEngine,
  SaveCompatibilityError,
  isSaveCompatibilityError,
  type SAVE_COMPATIBILITY_CODE,
} from '../../../../packages/contracts/src/versions';
import {
  applyViewDelta,
  PUBLISHED_VIEWS,
  type Body,
  type CodecResult,
  type Reply,
  type View,
} from './protocol';
import { NOTIFICATIONS_KEY, notificationStore, shareValue, shareView } from './store';
import { HELPER_CONFIG } from './helperPool';
/** Bound the engine snapshot RPC separately from expensive background compression. */
const CHECKPOINT_TIMEOUT_MS = 60000;
// Large lossless careers compress in the separate codec worker; engine RPC stays bounded below.
const CODEC_TIMEOUT_MS = 600000;
/** Automatic progress waits at most this long for its background save (→SAVE-8). */
export const AUTOSAVE_MS = 30000;
/** The writer's notice once an activated career's updated save data is committed (→WEB-66). */
export const SAVE_DATA_UPDATED = '기존 기록을 보존하고 저장 데이터를 현재 형식으로 갱신했어요.';
export interface ClientState {
  view?: View;
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
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  /** Builds and validates every checkpoint from the engine worker's snapshots (→ARCH-13). */
  private codec = new Worker(new URL('./codec.ts', import.meta.url), { type: 'module' });
  /** Checkpoints the codec is building, by the save request that asked for them. */
  private builds = new Map<string, { resolve: (result: CodecResult) => void; timer: number }>();
  /** The fixture helpers, computing an own match day's other fixtures for the engine (→ARCH-6). */
  private helpers: Worker[] = [];
  /** The save being built and committed, and whether a newer one was asked for meanwhile. */
  private saving?: Promise<void>;
  private savedCheckpoint?: { raw: string; worldId: string; revision: number };
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
  private saves: SaveRepository<SaveWorldMetadata>;
  private replacingIncompatible = false;
  private refreshPending = false;
  private refreshGeneration = 0;
  private refreshSerial = 0;
  private storageListener = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_KEY) notificationStore.sync();
    if (event.key === 'haeram-soccor:manifest' && event.newValue) {
      try {
        this.refresh(JSON.parse(event.newValue).generation);
      } catch {
        /* validated reload reports corruption */
      }
    }
  };
  constructor(private notify: (state: ClientState) => void) {
    const indexed = IndexedDbCheckpointKey.available();
    this.saves = new SaveRepository(
      localStorage,
      async (raw) => {
        const reply = await this.rpc({ type: 'inspect', raw, metadataOnly: true });
        if (!reply.worldMetadata || !reply.envelope) throw new Error('저장 검증 응답 누락');
        return { world: reply.worldMetadata, envelope: reply.envelope };
      },
      // The writer loads with the first save, keeping it out of the entry (→ARCH-28).
      async (...args) => (await import('../adapters/checkpointWriter')).writeCheckpoint(...args),
      // One availability decision for both IndexedDB keys (→SAVE-3).
      indexed ? new IndexedDbCheckpointKey('previous') : undefined,
      indexed ? new IndexedDbCheckpointKey('active') : undefined,
    );
    this.worker.onmessage = (event: MessageEvent<Reply>) => this.received(event.data);
    this.worker.onerror = () => this.failWorker();
    // Nested workers are not dependable on every browser (→ARCH-18), so the client creates the
    // codec and hands the engine worker a port to it: snapshots never pass through this thread.
    const codecChannel = new MessageChannel();
    this.codec.postMessage({ type: 'port', port: codecChannel.port1 }, [codecChannel.port1]);
    this.worker.postMessage({ type: 'codec', port: codecChannel.port2 }, [codecChannel.port2]);
    this.codec.onmessage = (event: MessageEvent<CodecResult>) => this.built(event.data);
    this.codec.onerror = () => {
      for (const id of [...this.builds.keys()])
        this.built({ id, ok: false, error: '저장 Worker가 종료되었습니다.' });
    };
    this.startHelpers();
    this.channel.onmessage = (event) => this.refresh(event.data?.generation);
    window.addEventListener('storage', this.storageListener);
    notificationStore.sync();
  }
  /**
   * Creates the fixture helpers on a device with the cores for them and hands their ports to the
   * engine worker, as for the codec (→ARCH-6/18). Without them, after a creation failure or once
   * one errors, the engine worker computes every fixture itself.
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
    pending.timer = window.setTimeout(() => this.failWorker(), 15000);
    if (r.progress !== undefined) {
      if (this.state.activity === 'foreground') {
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
          : new Error(r.error || 'Worker 오류'),
      );
  }
  private helpersFailed() {
    if (!this.helpers.length) return;
    for (const helper of this.helpers.splice(0)) helper.terminate();
    this.worker.postMessage({ type: 'helpers-failed' });
  }
  private refresh(generation: number) {
    if (!this.state.readonly || !Number.isSafeInteger(generation) || generation < 0) return;
    this.refreshGeneration = Math.max(this.refreshGeneration, generation);
    this.refreshSerial++;
    if (this.refreshPending) return;
    this.refreshPending = true;
    void this.enqueue(
      async () => {
        while (true) {
          const observed = this.refreshSerial;
          await this.load();
          // Drain notices that arrived during this load. An unchanged, unsatisfied hint
          // never spins; another actual notification is required for another attempt.
          if (
            this.saves.generationInfo.parentGeneration >= this.refreshGeneration ||
            this.refreshSerial === observed
          )
            break;
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
    this.state.error =
      '계산 Worker가 종료되었거나 응답하지 않습니다. 마지막 저장을 다시 불러오세요.';
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
      this.state.error =
        '이 브라우저는 저장 압축을 지원하지 않습니다. 최신 Chrome, Firefox 또는 Safari에서 기록을 가져오세요.';
      this.emit();
      return;
    }
    if (!navigator.locks) {
      // No tab may write without the lock, so this one stays read-only and its badge says why.
      this.state.notice =
        '안전한 저장을 위해 Web Locks가 지원되는 HTTPS 또는 localhost 환경이 필요합니다.';
      await this.enqueue(() => this.load());
      return;
    }
    await new Promise<void>((resolve) => {
      void navigator.locks.request('haeram-soccor:writer', { ifAvailable: true }, async (lock) => {
        this.state.readonly = !lock;
        if (!lock) this.state.notice = '다른 탭이 플레이 중입니다. 이 탭은 읽기 전용입니다.';
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
        notificationStore.add('다른 탭이 닫혀 이 탭에서 이어서 플레이합니다.');
        await this.enqueue(() => this.load());
        await new Promise<void>((done) => {
          this.release = done;
        });
      })
      .catch(() => {
        /* aborted on dispose */
      });
  }
  private async load() {
    await this.whenSaved();
    if (!this.state.readonly) {
      const [{ resetLegacy }, { IndexedDbParkedStore }] = await Promise.all([
        import('../adapters/legacyReset'),
        import('../adapters/games'),
      ]);
      const cleared = await resetLegacy(
        localStorage,
        IndexedDbParkedStore.available() ? new IndexedDbParkedStore() : undefined,
        () => !this.state.readonly && !this.failed,
      );
      if (cleared > 0)
        notificationStore.add(
          `이전 규칙 커리어 ${cleared}개를 정리했어요. 새 경기 엔진(게임 버전 ${CURRENT_ENGINE_VERSION})으로 새 커리어를 시작하세요.`,
        );
    }
    const result = await this.saves.load();
    if (result) {
      const playback = this.state.playback,
        career = this.state.view?.world.id;
      const reply = await this.rpc({
        type: 'inspect',
        raw: result.raw,
        activate: true,
        upgrade: !this.state.readonly,
      });
      // A revealed playback of this career whose match the checkpoint holds finishes under the
      // model it was settled with, even when this load activates a newer one (→SAVE-23).
      const world = this.state.view?.world;
      this.state.playback =
        playback &&
        world?.id === career &&
        world?.ownMatches.some((match) => match.id === playback.record.id)
          ? playback
          : undefined;
      this.state.savedRevision = result.world.revision;
      this.savedCheckpoint = {
        raw: result.raw,
        worldId: result.envelope.worldId,
        revision: result.world.revision,
      };
      this.state.savedAt = undefined;
      this.state.saveFailed = false;
      // The writer tells; read-only tabs reloading the same checkpoint would only repeat it.
      if (result.recovered && !this.state.readonly)
        notificationStore.add('이전의 정상 체크포인트로 복구했습니다.');
      if (reply.upgraded && reply.raw) {
        try {
          await this.saves.commit(reply.raw);
          this.state.savedRevision = this.state.view!.world.revision;
          this.savedCheckpoint = {
            raw: reply.raw,
            worldId: this.state.view!.world.id,
            revision: this.state.view!.world.revision,
          };
          this.state.savedAt = Date.now();
          // A catalog pin, missing club designs (→SAVE-21) or the full match model (→SAVE-23) are
          // updated, never the gameplay rules or a settled fact.
          notificationStore.add(SAVE_DATA_UPDATED);
          this.channel.postMessage({
            revision: this.state.savedRevision,
            generation: this.saves.generationInfo.parentGeneration,
          });
        } catch (error) {
          this.state.saveFailed = true;
          throw new Error(
            `현재 진행은 메모리에 있습니다. 갱신한 저장 데이터를 저장하지 못했어요: ${String(error)} · 파일로 내보내세요.`,
          );
        }
      }
    }
    this.emit();
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
    if (this.failed)
      return Promise.reject(
        new Error('Worker를 다시 불러오세요. 마지막 저장은 파일로 보관할 수 있습니다.'),
      );
    return new Promise((resolve, reject) => {
      this.waiters.set(requestId, {
        resolve,
        reject,
        timer: window.setTimeout(() => this.failWorker(), timeout),
        publishView:
          body.type === 'found' ||
          body.type === 'command' ||
          body.type === 'ack-critical' ||
          (body.type === 'inspect' && !!body.activate),
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
        ...this.saves.generationInfo,
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
    if (this.state.readonly) throw new Error('이 탭은 읽기 전용입니다.');
    if (body.type === 'found' && this.saves.incompatibleCheckpoint && !body.replace)
      throw new SaveCompatibilityError(
        '호환되지 않는 기록을 내보낸 뒤 명시적으로 새 세계로 교체하세요.',
      );
    if (body.type === 'found') {
      this.state.savedRevision = -1;
      this.state.playback = undefined;
    }
    const reply = await this.rpc(body, undefined, undefined, automatic);
    if (body.type === 'found' && body.replace && this.saves.incompatibleCheckpoint)
      this.replacingIncompatible = true;
    if (reply.playback) this.state.playback = reply.playback;
    this.emit();
    // The engine answered without encoding; the caller asks for the background save.
    return reply;
  }
  /**
   * Saves the world in play through the codec worker (→SAVE-8). One checkpoint is built at a time;
   * requests made meanwhile become one newer save after it. Resolves once the world as it stood at
   * the latest request is committed; a failure becomes the save error and rejects.
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
  /** Settles once no checkpoint is being built or waiting, whatever came of it. */
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
      const failure = new Error(
        `현재 진행은 메모리에 있습니다. 저장 실패: ${String(error)} · 파일로 내보내세요.`,
      );
      this.state.error = String(failure);
      this.state.saveFailed = true;
      this.emit();
      throw failure;
    } finally {
      this.saving = undefined;
    }
  }
  /**
   * One checkpoint of the engine's current world, committed with the envelope the codec validated.
   * During automatic play it may hold days not yet shown (→SAVE-8).
   */
  private async saveOnce() {
    const w = this.head?.world;
    if (!w || this.state.readonly || w.revision === this.state.savedRevision) return;
    const requestId = this.requestId();
    const built = new Promise<CodecResult>((resolve) =>
      this.builds.set(requestId, {
        resolve,
        timer: window.setTimeout(
          () => this.built({ id: requestId, ok: false, error: '저장 Worker가 응답하지 않습니다.' }),
          CODEC_TIMEOUT_MS,
        ),
      }),
    );
    try {
      // A background save may queue behind a long command that only reports its own progress.
      await this.rpc({ type: 'save' }, requestId, CHECKPOINT_TIMEOUT_MS);
    } catch (error) {
      this.built({ id: requestId, ok: false, error: String(error) });
      throw error;
    }
    const result = await built;
    if (!result.ok)
      throw result.errorCode === 'save-compatibility'
        ? new SaveCompatibilityError(result.error)
        : new Error(result.error);
    // A checkpoint of a world no longer in play, or no newer than the committed one, is dropped.
    if (
      result.envelope.worldId !== this.head?.world.id ||
      result.envelope.generation <= this.saves.generationInfo.parentGeneration
    )
      return;
    await this.saves.commit(result.raw, {
      envelope: result.envelope,
      replaceIncompatible: this.replacingIncompatible,
    });
    this.replacingIncompatible = false;
    this.state.savedRevision = result.revision;
    this.savedCheckpoint = {
      raw: result.raw,
      worldId: result.envelope.worldId,
      revision: result.revision,
    };
    this.state.savedAt = Date.now();
    this.state.saveFailed = false;
    // Read-only tabs reload on every commit.
    this.channel.postMessage({
      revision: result.revision,
      generation: this.saves.generationInfo.parentGeneration,
    });
    this.emit();
  }
  private built(result: CodecResult) {
    const build = this.builds.get(result.id);
    if (!build) return;
    clearTimeout(build.timer);
    this.builds.delete(result.id);
    build.resolve(result);
  }
  found(input: Founding, replace = false) {
    return this.enqueue(async () => {
      const reply = await this.mutate({ type: 'found', input, replace } as Body);
      this.saveSoon();
      return reply;
    });
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
      const count = command.type === 'season' ? Math.min(100, Math.max(1, command.count)) : 1;
      try {
        for (let i = 0; i < count; i++) {
          if (this.cancelled) break;
          reply = await this.mutate(
            {
              type: 'command',
              command: command.type === 'season' ? { type: 'season', count: 1 } : command,
            } as Body,
            options.automatic,
          );
          if (reply.cancelled || this.state.view?.world.critical) break;
        }
      } finally {
        // Seasons that ran before a failure are saved too.
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
  async archive(year: number) {
    return (await this.read({ type: 'archive', year })).archive;
  }
  async recruitmentHistory() {
    const reply = await this.read({ type: 'recruitment-history' });
    if (!reply.recruitmentHistory)
      throw new Error(reply.error ?? '영입 결정 기록 응답이 없습니다.');
    return reply.recruitmentHistory;
  }
  async mediationPreview(id: string, support: 'director' | 'balanced' | 'manager') {
    const reply = await this.read({ type: 'mediation-preview', id, support });
    if (!reply.mediationPreview) throw new Error(reply.error ?? '중재 미리보기 응답이 없습니다.');
    return reply.mediationPreview;
  }
  async personCareer(person: string) {
    const reply = await this.read({ type: 'person-career', person });
    if (!reply.personCareer) throw new Error(reply.error ?? '인물 경력 응답이 없습니다.');
    return reply.personCareer;
  }
  /**
   * Our all-time record against a club from every own match the worker keeps; the view holds only
   * the recent ones.
   */
  async headToHead(club: string) {
    const reply = await this.read({ type: 'head-to-head', club });
    if (!reply.headToHead) throw new Error('맞대결 기록 응답이 없습니다.');
    return reply.headToHead;
  }
  /** Our match records over every own match, read like head-to-head without the command queue. */
  async clubRecords() {
    const reply = await this.read({ type: 'club-records' });
    if (!reply.clubRecords) throw new Error('클럽 기록 응답이 없습니다.');
    return reply.clubRecords;
  }
  /** Bounded market page, admitted through the same displayed-day read gate as other previews. */
  async worldMarket(query: Omit<WorldMarketQuery, 'world'> = {}) {
    const world = this.state.view?.world.id;
    if (!world) throw new Error('먼저 클럽을 창단하세요.');
    const reply = await this.read({ type: 'world-market', query: { ...query, world } });
    if (!reply.ok || !reply.worldMarket)
      throw new Error(reply.error ?? '이적시장 응답이 없습니다.');
    if (this.state.view?.world.id !== world || reply.worldMarket.world !== world)
      throw new Error('다른 커리어의 이적시장입니다.');
    return reply.worldMarket;
  }
  async worldMarketDetail(target: WorldMarketTarget, fee?: string, loan = false) {
    const world = this.state.view?.world.id;
    if (!world || target.world !== world) throw new Error('다른 커리어의 이적 대상입니다.');
    const reply = await this.read({ type: 'world-market-detail', target, fee, loan });
    if (!reply.ok || !reply.worldMarketDetail)
      throw new Error(reply.error ?? '영입 미리보기 응답이 없습니다.');
    if (this.state.view?.world.id !== world || reply.worldMarketDetail.world !== world)
      throw new Error('다른 커리어의 영입 미리보기입니다.');
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
    if (!reply.managerHistory) throw new Error(reply.error ?? '감독 이력 응답이 없습니다.');
    if (this.state.view?.world.id !== world) throw new Error('다른 커리어의 감독 이력입니다.');
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
    if (!reply.ok) throw new Error(reply.error ?? '세부 기록 응답이 없습니다.');
    return reply.fullStats;
  }
  private rawBackup() {
    return this.saves.recoveryRaw();
  }
  /** Whether a game in play is stored, so an import would replace it. */
  hasStoredGame() {
    try {
      return this.saves.hasStored();
    } catch {
      return false; // unsupported storage is reported by the client
    }
  }
  /**
   * The rules version of an active checkpoint that cannot open because it is an earlier-rules
   * career (→SAVE-16), read from its header; undefined otherwise.
   */
  earlierRules() {
    if (!this.saves.incompatibleCheckpoint) return undefined;
    const raw = this.rawBackup(),
      engine = raw ? envelopeEngine(raw) : undefined;
    return engine && isEarlierEngine(engine) ? engine : undefined;
  }
  exportFile() {
    return this.enqueue(async () => {
      const incompatible = this.saves.incompatibleCheckpoint;
      if (incompatible && !this.replacingIncompatible) {
        this.state.error =
          '지원하지 않는 저장 버전의 원본을 보존하고 있습니다. 호환되는 앱으로 열거나 기록 파일을 가져오세요.';
        return this.rawBackup();
      }
      const head = this.head;
      if (head && !this.failed) {
        const saved = this.savedCheckpoint,
          current = head.world;
        if (saved?.worldId === current.id && saved.revision === current.revision) return saved.raw;
        return (await this.rpc({ type: 'export' }, this.requestId(), CODEC_TIMEOUT_MS)).raw;
      }
      return this.rawBackup();
    });
  }
  /** Validates a checkpoint envelope, makes it the game in play and commits it (→SAVE-5). */
  private async activate(raw: string) {
    if (this.state.readonly) throw new Error('읽기 전용 탭입니다.');
    await this.whenSaved();
    await this.rpc({ type: 'inspect', raw, activate: true, upgrade: true });
    this.replacingIncompatible = this.saves.incompatibleCheckpoint;
    this.state.savedRevision = -1;
    this.state.playback = undefined;
    await this.save();
  }
  importFile(raw: string) {
    return this.enqueue(() => this.activate(raw));
  }
  /** Brings a parked game into play; resolves true once it is the committed game (→SAVE-14). */
  async switchTo(raw: string) {
    return (await this.enqueue(async () => (await this.activate(raw), true))) === true;
  }
  /**
   * The committed checkpoint of the game in play, saved first if the latest revision is not yet
   * on disk, so parking never leaves progress behind.
   */
  async checkpoint() {
    return (
      (await this.enqueue(async () => {
        if (this.state.readonly) throw new Error('읽기 전용 탭입니다.');
        await this.save();
        return this.saves.committedRaw() ?? undefined;
      })) ?? undefined
    );
  }
  /** Reloads the committed game in play, e.g. after a switch that could not finish. */
  reload() {
    return this.enqueue(() => this.load());
  }
  /** Removes the game in play's checkpoints; the app reloads into the slot screen after. */
  forget() {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error('읽기 전용 탭입니다.');
      // No autosave may bring the removed game back.
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = undefined;
      await this.whenSaved();
      await this.saves.clearActive();
      for (const key of ACTIVE_SAVE_KEYS) localStorage.removeItem(key);
      await this.saves.clearPrevious().catch(() => {});
      // Nothing left in this page — the slot index on leaving, a save — may bring it back either.
      this.state.view = undefined;
      this.held = [];
      this.views.clear();
      this.state.playback = undefined;
      this.emit();
    });
  }
  retrySave() {
    return this.enqueue(() => this.save());
  }
  dispose() {
    window.removeEventListener('storage', this.storageListener);
    clearTimeout(this.autosaveTimer);
    this.failed = true;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('세션이 닫혔습니다.'));
    }
    this.waiters.clear();
    for (const id of [...this.builds.keys()])
      this.built({ id, ok: false, error: '세션이 닫혔습니다.' });
    this.lockWait?.abort();
    this.release?.();
    this.channel.close();
    this.worker.terminate();
    this.codec.terminate();
    for (const helper of this.helpers) helper.terminate();
  }
}
