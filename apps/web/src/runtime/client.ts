import type { Command, Founding } from '../../../../packages/contracts/src/types';
import { Saves } from '../adapters/persistence';
import { requestSchema, type Body, type Reply, type View } from './protocol';
import { shareView } from './store';
export interface ClientState {
  view?: View;
  busy: boolean;
  /** Commands remain serialized even when background simulation leaves the UI available. */
  processing: boolean;
  activity: 'idle' | 'foreground' | 'background';
  readonly: boolean;
  savedRevision: number;
  error?: string;
  notice?: string;
  progress: number;
  playback?: Reply['playback'];
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
  private session = crypto.randomUUID();
  private serial = 0;
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
  private cancelled = false;
  private channel = new BroadcastChannel('haeram-soccor:updates');
  private saves: Saves;
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
    this.saves = new Saves(localStorage, async (raw) => {
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
      else pending.reject(new Error(r.error || 'Worker 오류'));
    };
    this.worker.onerror = () => this.failWorker();
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
      });
    });
  }
  private async load() {
    const result = await this.saves.load();
    if (result) {
      await this.rpc({ type: 'inspect', raw: result.raw, activate: true });
      this.state.playback = undefined;
      this.state.savedRevision = result.world.revision;
      if (result.recovered) this.state.notice = '이전의 정상 체크포인트로 복구했습니다.';
    }
    this.emit();
  }
  private rpc(body: Body): Promise<Reply> {
    if (this.failed)
      return Promise.reject(
        new Error('Worker를 다시 불러오세요. 마지막 저장은 파일로 보관할 수 있습니다.'),
      );
    const requestId = `${this.session.slice(0, 8)}:${++this.serial}`;
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
      this.state.progress = 0;
      this.emit();
      try {
        return await fn();
      } catch (error) {
        this.state.error = String(error);
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
    if (body.type === 'found') {
      this.state.savedRevision = -1;
      this.state.playback = undefined;
    }
    const reply = await this.rpc(body);
    if (reply.playback) this.state.playback = reply.playback;
    this.emit();
    if (reply.raw) {
      try {
        await this.saves.commit(reply.raw);
        this.state.savedRevision = this.state.view!.world.revision;
        this.channel.postMessage({
          revision: this.state.savedRevision,
          generation: this.saves.generationInfo.parentGeneration,
        });
      } catch (error) {
        throw new Error(
          `현재 진행은 메모리에 있습니다. 저장 실패: ${String(error)} · 파일로 내보내세요.`,
        );
      }
    }
    return reply;
  }
  found(input: Founding, replace = false) {
    return this.enqueue(() =>
      this.mutate(requestSchema.shape.body.parse({ type: 'found', input, replace })),
    );
  }
  command(command: Command, options: { background?: boolean } = {}) {
    this.cancelled = false;
    return this.enqueue(async () => {
      let reply: Reply | undefined;
      const count = command.type === 'season' ? Math.min(100, Math.max(1, command.count)) : 1;
      for (let i = 0; i < count; i++) {
        if (this.cancelled) break;
        reply = await this.mutate(
          requestSchema.shape.body.parse({
            type: 'command',
            command: command.type === 'season' ? { type: 'season', count: 1 } : command,
          }),
        );
        if (reply.cancelled || this.state.view?.world.critical) break;
      }
      return reply;
    }, options);
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
  private rawBackup() {
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
    return this.enqueue(async () =>
      this.state.view && !this.failed ? (await this.rpc({ type: 'export' })).raw : this.rawBackup(),
    );
  }
  importFile(raw: string) {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error('읽기 전용 탭입니다.');
      await this.rpc({ type: 'inspect', raw, activate: true });
      this.state.savedRevision = -1;
      this.state.playback = undefined;
      const reply = await this.rpc({ type: 'export' });
      await this.saves.commit(reply.raw!);
      this.state.savedRevision = this.state.view!.world.revision;
      this.channel.postMessage({
        revision: this.state.savedRevision,
        generation: this.saves.generationInfo.parentGeneration,
      });
    });
  }
  retrySave() {
    return this.enqueue(() => this.mutate({ type: 'export' }));
  }
  dispose() {
    window.removeEventListener('storage', this.storageListener);
    this.failed = true;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('세션이 닫혔습니다.'));
    }
    this.waiters.clear();
    this.release?.();
    this.channel.close();
    this.worker.terminate();
  }
}
