import type { Command, Founding, World } from '../../../../packages/contracts/src/types';
import { SaveRepository } from '../adapters/repository';
import { ACTIVE_SAVE_KEYS } from '../adapters/games';
import {
  SaveCompatibilityError,
  isSaveCompatibilityError,
  type SAVE_COMPATIBILITY_CODE,
} from '../../../../packages/contracts/src/versions';
import type { Body, CodecResult, Reply, View } from './protocol';
import { shareView } from './store';
/** A 100-season checkpoint takes the codec seconds; this long without an answer, the save failed. */
const CHECKPOINT_TIMEOUT_MS = 60000;
export interface ClientState {
  view?: View;
  busy: boolean;
  /** Commands remain serialized even when background simulation leaves the UI available. */
  processing: boolean;
  activity: 'idle' | 'foreground' | 'background';
  readonly: boolean;
  savedRevision: number;
  error?: string;
  errorCode?: typeof SAVE_COMPATIBILITY_CODE;
  notice?: string;
  progress: number;
  playback?: Reply['playback'];
  /** The latest committed player command and the world it changed, for outcome feedback. */
  lastAction?: { id: number; command: Command; before: World };
  /** Player commands queued or running; automatic clock ticks never count, so controls stay steady. */
  pendingActions?: number;
}
export class GameClient {
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
  /** The save being built and committed, and whether a newer one was asked for meanwhile. */
  private saving?: Promise<void>;
  private saveWanted = false;
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
    }
  >();
  private queue = Promise.resolve();
  private release?: () => void;
  private lockWait?: AbortController;
  private cancelled = false;
  private channel = new BroadcastChannel('haeram-soccor:updates');
  private saves: SaveRepository;
  private replacingIncompatible = false;
  private refreshPending = false;
  private refreshGeneration = 0;
  private storageListener = (event: StorageEvent) => {
    if (event.key === 'haeram-soccor:manifest' && event.newValue) {
      try {
        this.refresh(JSON.parse(event.newValue).generation);
      } catch {
        /* validated reload reports corruption */
      }
    }
  };
  constructor(private notify: (state: ClientState) => void) {
    this.saves = new SaveRepository(localStorage, async (raw) => {
      const reply = await this.rpc({ type: 'inspect', raw });
      if (!reply.candidate || !reply.envelope) throw new Error('저장 검증 응답 누락');
      return { world: reply.candidate, envelope: reply.envelope };
    });
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const r = event.data;
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
      if (r.view && pending.publishView) this.state.view = shareView(this.state.view, r.view);
      if (r.ok) pending.resolve(r);
      else
        pending.reject(
          r.errorCode === 'save-compatibility'
            ? new SaveCompatibilityError(r.error)
            : new Error(r.error || 'Worker 오류'),
        );
    };
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
    this.channel.onmessage = (event) => this.refresh(event.data?.generation || 0);
    window.addEventListener('storage', this.storageListener);
  }
  private refresh(generation: number) {
    if (!this.state.readonly || !Number.isSafeInteger(generation) || generation < 0) return;
    this.refreshGeneration = Math.max(this.refreshGeneration, generation);
    if (this.refreshPending) return;
    this.refreshPending = true;
    void this.enqueue(
      async () => {
        for (let n = 0; n < 2; n++) {
          await this.load();
          if (this.saves.generationInfo.parentGeneration >= this.refreshGeneration) break;
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
        this.state.notice = '다른 탭이 닫혀 이 탭에서 이어서 플레이합니다.';
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
    const result = await this.saves.load();
    if (result) {
      const reply = await this.rpc({
        type: 'inspect',
        raw: result.raw,
        activate: true,
        upgrade: !this.state.readonly,
      });
      this.state.playback = undefined;
      this.state.savedRevision = result.world.revision;
      if (result.recovered) this.state.notice = '이전의 정상 체크포인트로 복구했습니다.';
      if (reply.upgraded && reply.raw) {
        try {
          await this.saves.commit(reply.raw);
          this.state.savedRevision = this.state.view!.world.revision;
          this.state.notice = '기존 기록을 보존하고 새 게임 규칙으로 저장했습니다.';
          this.channel.postMessage({
            revision: this.state.savedRevision,
            generation: this.saves.generationInfo.parentGeneration,
          });
        } catch (error) {
          throw new Error(
            `현재 진행은 메모리에 있습니다. 규칙 업그레이드 저장 실패: ${String(error)} · 파일로 내보내세요.`,
          );
        }
      }
    }
    this.emit();
  }
  private requestId() {
    return `${this.session.slice(0, 8)}:${++this.serial}`;
  }
  private rpc(body: Body, requestId = this.requestId()): Promise<Reply> {
    if (this.failed)
      return Promise.reject(
        new Error('Worker를 다시 불러오세요. 마지막 저장은 파일로 보관할 수 있습니다.'),
      );
    return new Promise((resolve, reject) => {
      this.waiters.set(requestId, {
        resolve,
        reject,
        timer: window.setTimeout(() => this.failWorker(), 15000),
        publishView:
          body.type === 'found' ||
          body.type === 'command' ||
          body.type === 'ack-critical' ||
          (body.type === 'inspect' && !!body.activate),
      });
      this.worker.postMessage({
        protocol: 1,
        session: this.session,
        requestId,
        expectedRevision: this.state.view?.world.revision ?? -1,
        ...this.saves.generationInfo,
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
  private async mutate(body: Body) {
    if (this.state.readonly) throw new Error('이 탭은 읽기 전용입니다.');
    if (body.type === 'found' && this.saves.incompatibleCheckpoint && !body.replace)
      throw new SaveCompatibilityError(
        '호환되지 않는 기록을 내보낸 뒤 명시적으로 새 세계로 교체하세요.',
      );
    if (body.type === 'found') {
      this.state.savedRevision = -1;
      this.state.playback = undefined;
    }
    const reply = await this.rpc(body);
    if (body.type === 'found' && body.replace && this.saves.incompatibleCheckpoint)
      this.replacingIncompatible = true;
    if (reply.playback) this.state.playback = reply.playback;
    this.emit();
    // The engine answered without encoding; the change is committed before the queue moves on.
    await this.save();
    return reply;
  }
  /**
   * Saves the world in play through the codec worker (→SAVE-8). One checkpoint is built at a time;
   * requests made meanwhile become one newer save after it. Resolves once the world as it stood at
   * the latest request is committed; a failure becomes the save error and rejects.
   */
  save(): Promise<void> {
    this.saveWanted = true;
    this.saving ??= Promise.resolve().then(() => this.drainSaves());
    return this.saving;
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
      this.emit();
      throw failure;
    } finally {
      this.saving = undefined;
    }
  }
  /** One checkpoint of the engine's current world, committed with the envelope the codec validated. */
  private async saveOnce() {
    const w = this.state.view?.world;
    if (!w || this.state.readonly || w.revision === this.state.savedRevision) return;
    const requestId = this.requestId();
    const built = new Promise<CodecResult>((resolve) =>
      this.builds.set(requestId, {
        resolve,
        timer: window.setTimeout(
          () => this.built({ id: requestId, ok: false, error: '저장 Worker가 응답하지 않습니다.' }),
          CHECKPOINT_TIMEOUT_MS,
        ),
      }),
    );
    try {
      await this.rpc({ type: 'save' }, requestId);
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
      result.envelope.worldId !== this.state.view?.world.id ||
      result.envelope.generation <= this.saves.generationInfo.parentGeneration
    )
      return;
    await this.saves.commit(result.raw, {
      envelope: result.envelope,
      replaceIncompatible: this.replacingIncompatible,
    });
    this.replacingIncompatible = false;
    this.state.savedRevision = result.revision;
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
    return this.enqueue(() => this.mutate({ type: 'found', input, replace } as Body));
  }
  /** `automatic` marks clock ticks; every other command reports its outcome. */
  command(command: Command, options: { background?: boolean; automatic?: boolean } = {}) {
    this.cancelled = false;
    if (!options.automatic) {
      this.state.pendingActions = (this.state.pendingActions || 0) + 1;
      this.emit();
    }
    const task = this.enqueue(async () => {
      const before = this.state.view?.world;
      let reply: Reply | undefined;
      const count = command.type === 'season' ? Math.min(100, Math.max(1, command.count)) : 1;
      for (let i = 0; i < count; i++) {
        if (this.cancelled) break;
        reply = await this.mutate({
          type: 'command',
          command: command.type === 'season' ? { type: 'season', count: 1 } : command,
        } as Body);
        if (reply.cancelled || this.state.view?.world.critical) break;
      }
      if (reply?.ok && before && !options.automatic)
        this.state.lastAction = { id: ++this.actionSerial, command, before };
      return reply;
    }, options);
    if (options.automatic) return task;
    return task.finally(() => {
      this.state.pendingActions = Math.max(0, (this.state.pendingActions || 1) - 1);
      this.emit();
    });
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
    return this.enqueue(() => this.mutate({ type: 'ack-critical' }));
  }
  archive(year: number) {
    return this.enqueue(async () => (await this.rpc({ type: 'archive', year })).archive);
  }
  /**
   * Our all-time record against a club from every own match the worker keeps; the view holds only
   * the recent ones. A read skips the command queue, so it never sets busy or holds the clock.
   */
  async headToHead(club: string) {
    const reply = await this.rpc({ type: 'head-to-head', club });
    if (!reply.headToHead) throw new Error('맞대결 기록 응답이 없습니다.');
    return reply.headToHead;
  }
  /** Another league's fixtures this season, read like head-to-head without the command queue. */
  async leagueFixtures(league: { code: string; tier: number; group: number }) {
    const reply = await this.rpc({
      type: 'league-fixtures',
      country: league.code,
      tier: league.tier,
      group: league.group,
    });
    return reply.leagueFixtures ?? [];
  }
  private rawBackup() {
    if (this.saves.incompatibleBackup) return this.saves.incompatibleBackup;
    try {
      const m = JSON.parse(localStorage.getItem('haeram-soccor:manifest') || 'null');
      if (m && (m.slot === 0 || m.slot === 1))
        return localStorage.getItem(`haeram-soccor:slot:${m.slot ? 'b' : 'a'}`) || undefined;
    } catch {
      /* preserve raw slots for recovery */
    }
    return (
      localStorage.getItem('haeram-soccor:slot:a') ||
      localStorage.getItem('haeram-soccor:slot:b') ||
      undefined
    );
  }
  exportFile() {
    return this.enqueue(async () => {
      const incompatible = this.saves.incompatibleCheckpoint;
      if (incompatible && !this.replacingIncompatible) {
        this.state.error =
          '지원하지 않는 저장 버전의 원본을 보존하고 있습니다. 호환되는 앱으로 열거나 기록 파일을 가져오세요.';
        return this.rawBackup();
      }
      return this.state.view && !this.failed
        ? (await this.rpc({ type: 'export' })).raw
        : this.rawBackup();
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
      await this.whenSaved();
      for (const key of ACTIVE_SAVE_KEYS) localStorage.removeItem(key);
    });
  }
  retrySave() {
    return this.enqueue(() => this.save());
  }
  dispose() {
    window.removeEventListener('storage', this.storageListener);
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
  }
}
