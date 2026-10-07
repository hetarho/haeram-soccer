import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Command } from '../../../../packages/contracts/src/types';
import type { GameClient } from './client';
import { gameStore } from './store';

export type Pace = 'daily' | 'three-days' | 'match';
export interface ProgressionState {
  running: boolean;
  pace: Pace;
  watching: boolean;
  reason: string;
}
const commands: Record<Pace, Command> = {
  daily: { type: 'advance-days', days: 1 },
  'three-days': { type: 'advance-days', days: 3 },
  match: { type: 'next-match' },
};

/** Owns the clock outside React, so changing or hiding a view cannot restart it. */
export class ProgressionController {
  readonly store = createStore<ProgressionState>(() => ({
    running: false,
    pace: 'daily',
    watching: false,
    reason: '',
  }));
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private inFlight = false;
  private suspensionSources = new Set<string>();
  private get suspended() {
    return this.suspensionSources.size > 0;
  }
  private worldId?: string;
  private finishedId?: string;

  constructor(private client: GameClient) {
    this.worldId = gameStore.getSnapshot().view?.world.id;
    this.unsubscribe = gameStore.subscribe((state) => {
      const id = state.view?.world.id;
      if (this.worldId !== id) {
        this.worldId = id;
        this.finishedId = undefined;
        this.stop('');
      }
      if (
        this.store.getState().running &&
        (state.error || state.readonly || state.view?.world.critical)
      ) {
        this.stop(
          state.view?.world.critical
            ? '클럽 소식을 확인하면 계속할 수 있습니다.'
            : '진행을 멈췄습니다.',
        );
      }
      if (
        this.store.getState().running &&
        this.store.getState().watching &&
        !state.processing &&
        state.playback?.record.id === this.finishedId
      )
        void this.tick();
    });
    this.timer = setInterval(() => void this.tick(), 1000);
  }
  setPace(pace: Pace) {
    this.store.setState({ pace });
  }
  setWatching(watching: boolean) {
    const previous = this.store.getState().watching;
    if (previous === watching) return;
    this.store.setState({ watching });
    if (watching && this.store.getState().running) void this.tick();
  }
  setSuspended(suspended: boolean, source = 'feature') {
    if (suspended) this.suspensionSources.add(source);
    else this.suspensionSources.delete(source);
    if (suspended) this.stop('자동 진행을 멈췄습니다.');
  }
  start() {
    const state = gameStore.getSnapshot();
    if (
      this.suspended ||
      state.readonly ||
      state.error ||
      state.view?.world.critical ||
      !state.view
    )
      return;
    this.store.setState({ running: true, reason: '' });
    // Date progression starts on the next one-second tick. Watching starts without an empty wait.
    if (this.store.getState().watching) void this.tick();
  }
  stop(reason = '자동 진행을 멈췄습니다.') {
    this.store.setState({ running: false, reason });
    if (this.inFlight) this.client.cancel();
  }
  finishMatch(id: string) {
    if (this.finishedId === id) return;
    this.finishedId = id;
    if (this.store.getState().running && this.store.getState().watching) void this.tick();
  }
  beginMatch(id: string) {
    if (this.finishedId === id) this.finishedId = undefined;
  }
  private async tick() {
    const progress = this.store.getState();
    const state = gameStore.getSnapshot();
    if (!progress.running || this.suspended || this.inFlight || state.processing) return;
    if (!state.view || state.readonly || state.error || state.view.world.critical) return;
    if (state.savedRevision !== state.view.world.revision) return;
    if (
      progress.watching &&
      state.playback?.frames.length &&
      this.finishedId !== state.playback.record.id
    )
      return;
    this.inFlight = true;
    try {
      const reply = await this.client.command(
        progress.watching ? { type: 'next-match' } : commands[progress.pace],
        { background: true },
      );
      if (!reply?.ok || reply.cancelled || reply.view?.world.critical) this.stop();
    } finally {
      this.inFlight = false;
    }
  }
  dispose() {
    this.stop('');
    clearInterval(this.timer);
    this.unsubscribe();
    this.suspensionSources.clear();
  }
}
export function useProgression<T>(
  controller: ProgressionController,
  selector: (state: ProgressionState) => T,
) {
  return useStore(controller.store, selector);
}
