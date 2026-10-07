import type { Command, Founding } from '../../../../packages/contracts/src/types';
import { Saves } from '../adapters/persistence';
import { requestSchema, type Body, type Reply, type View } from './protocol';
export interface ClientState {
  view?: View;
  busy: boolean;
  readonly: boolean;
  savedRevision: number;
  error?: string;
  notice?: string;
  progress: number;
  playback?: Reply['playback'];
}
export class GameClient {
  state: ClientState = { busy: true, readonly: true, savedRevision: -1, progress: 0 };
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private session = crypto.randomUUID();
  private serial = 0;
  private waiters = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();
  private queue = Promise.resolve();
  private release?: () => void;
  private cancelled = false;
  private channel = new BroadcastChannel('haeram-soccor:updates');
  private saves: Saves;
  constructor(private notify: (state: ClientState) => void) {
    this.saves = new Saves(localStorage, async (raw) => {
      const reply = await this.rpc({ type: 'inspect', raw });
      if (!reply.view || !reply.envelope) throw new Error('저장 검증 응답 누락');
      this.state.view = reply.view;
      return { world: reply.view.world, envelope: reply.envelope };
    });
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const r = event.data;
      if (r.progress !== undefined) {
        this.state.progress = r.progress;
        this.emit();
        return;
      }
      const waiter = this.waiters.get(r.requestId);
      this.waiters.delete(r.requestId);
      if (r.view) this.state.view = r.view;
      if (r.ok) waiter?.resolve(r);
      else waiter?.reject(new Error(r.error || 'Worker 오류'));
    };
    this.worker.onerror = () => {
      this.state.error = '계산 Worker가 종료되었습니다. 마지막 저장을 다시 불러오세요.';
      this.state.busy = false;
      for (const w of this.waiters.values()) w.reject(new Error(this.state.error));
      this.waiters.clear();
      this.emit();
    };
    this.channel.onmessage = () => {
      if (this.state.readonly)
        void this.enqueue(async () => {
          await this.load();
        });
    };
  }
  private emit() {
    this.notify({ ...this.state });
  }
  async start() {
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
      this.state.savedRevision = result.world.revision;
      if (result.recovered) this.state.notice = '이전의 정상 체크포인트로 복구했습니다.';
    }
    this.emit();
  }
  private rpc(body: Body): Promise<Reply> {
    const requestId = `${this.session.slice(0, 8)}:${++this.serial}`;
    return new Promise((resolve, reject) => {
      this.waiters.set(requestId, { resolve, reject });
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
  private enqueue<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const task = this.queue.then(async () => {
      this.state.busy = true;
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
        this.emit();
      }
    });
    this.queue = task.then(() => {});
    return task;
  }
  private async mutate(body: Body) {
    if (this.state.readonly) throw new Error('이 탭은 읽기 전용입니다.');
    const reply = await this.rpc(body);
    if (reply.playback) this.state.playback = reply.playback;
    this.emit();
    if (reply.raw) {
      try {
        await this.saves.commit(reply.raw);
        this.state.savedRevision = this.state.view!.world.revision;
        this.channel.postMessage({ revision: this.state.savedRevision });
      } catch (error) {
        throw new Error(
          `현재 진행은 메모리에 있습니다. 저장 실패: ${String(error)} · 파일로 내보내세요.`,
        );
      }
    }
    return reply;
  }
  found(input: Founding) {
    return this.enqueue(() =>
      this.mutate(requestSchema.shape.body.parse({ type: 'found', input })),
    );
  }
  command(command: Command) {
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
    });
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
  exportFile() {
    return this.enqueue(async () => (await this.rpc({ type: 'export' })).raw);
  }
  importFile(raw: string) {
    return this.enqueue(async () => {
      if (this.state.readonly) throw new Error('읽기 전용 탭입니다.');
      await this.rpc({ type: 'inspect', raw });
      const reply = await this.rpc({ type: 'export' });
      await this.saves.commit(reply.raw!);
      this.state.savedRevision = this.state.view!.world.revision;
      this.channel.postMessage({ revision: this.state.savedRevision });
    });
  }
  dispose() {
    this.release?.();
    this.channel.close();
    this.worker.terminate();
  }
}
