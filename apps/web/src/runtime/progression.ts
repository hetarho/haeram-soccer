import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Command, InboxKind, World } from '../../../../packages/contracts/src/types';
import { daysUntilNextMatch, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import type { GameClient } from './client';
import { gameStore } from './store';

export type Pace = 'x1' | 'x2' | 'x5' | 'x10';
/** Real milliseconds per game day: x1 is one day a second, x10 one day every 0.1 s. */
export const PACE_MS: Record<Pace, number> = { x1: 1000, x2: 500, x5: 200, x10: 100 };
/**
 * A step normally advances one day. When saving takes longer than the pace allows, the next step
 * carries the days that piled up, at most this many, so the calendar keeps the chosen rate.
 */
export const MAX_STEP_DAYS = 5;
export type StopOn = Record<InboxKind, boolean>;
export interface ProgressionState {
  running: boolean;
  pace: Pace;
  watching: boolean;
  reason: string;
  /** Event kinds that stop automatic progression. */
  stopOn: StopOn;
  /** Tomorrow's own fixture the clock stopped for, until the owner watches or plays through. */
  matchEve?: string;
}
export const STOP_LABELS: Record<InboxKind, string> = {
  match: '경기 전날',
  'window-open': '이적시장 개장',
  'window-close': '이적시장 마감',
  'bid-response': '이적 협상 응답',
  'incoming-bid': '우리 선수 영입 제안',
  'youth-intake': '유소년 입단',
  'staff-report': '스태프 보고',
  'staff-renewal': '감독·코치 재계약·공석',
  cup: '컵 대진 발표',
  finance: '자금·후원 경고',
};
const WATCH_REASON = '관전 중에는 자동 진행을 잠시 멈춰요.';
/** First-run stops match the "important decisions" intervention level. */
const DEFAULT_STOP_ON: StopOn = {
  match: true,
  'window-open': true,
  'window-close': false,
  'bid-response': true,
  'incoming-bid': true,
  'youth-intake': true,
  'staff-report': false,
  'staff-renewal': true,
  cup: false,
  finance: true,
};
const STOP_KEY = 'haeram-soccor:stop-on';
function storedStopOn(): StopOn {
  try {
    const raw = JSON.parse(localStorage.getItem(STOP_KEY) || '{}');
    return Object.fromEntries(
      Object.entries(DEFAULT_STOP_ON).map(([kind, value]) => [
        kind,
        typeof raw[kind] === 'boolean' ? raw[kind] : value,
      ]),
    ) as StopOn;
  } catch {
    return { ...DEFAULT_STOP_ON };
  }
}
/** Unread attention items the owner asked to stop for. */
export function stoppingEvents(w: World, stopOn: StopOn) {
  return (w.inbox || []).filter((item) => item.attention && !item.read && stopOn[item.kind]);
}
/**
 * One tick of the clock. A multi-day catch-up step lands on a match eve instead of running
 * through the match day, and the host ends it early on the day an enabled event arrives.
 */
function command(days: number, stopOn: StopOn, w: World): Command {
  const until = daysUntilNextMatch(w);
  return {
    type: 'advance-days',
    days: stopOn.match && until !== undefined && until > 1 && until <= days ? until - 1 : days,
    stop: (Object.keys(stopOn) as InboxKind[]).filter((kind) => stopOn[kind]),
  };
}

/** Owns the clock outside React, so changing or hiding a view cannot restart it. */
export class ProgressionController {
  readonly store = createStore<ProgressionState>(() => ({
    running: false,
    pace: 'x1',
    watching: false,
    reason: '',
    stopOn: storedStopOn(),
  }));
  /** A fixture the owner chose to play through without watching. */
  private passedMatch?: string;
  /** Watching stopped a running clock (or answered a match eve); leaving the match resumes it. */
  private resumeAfterWatch = false;
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private inFlight = false;
  private suspensionSources = new Set<string>();
  private get suspended() {
    return this.suspensionSources.size > 0;
  }
  private worldId?: string;
  private finishedId?: string;
  /** When the last day step was sent; unset while stopped so a restart begins with one day. */
  private stepAt?: number;

  constructor(private client: GameClient) {
    this.worldId = gameStore.getSnapshot().view?.world.id;
    // A season close is recorded, not a stop: its review waits in the league's season list, so a
    // running clock plays on into the next season (→WEB-47).
    this.unsubscribe = gameStore.subscribe((state) => {
      const id = state.view?.world.id;
      if (this.worldId !== id) {
        this.worldId = id;
        this.finishedId = undefined;
        this.stop('');
      }
      if (
        this.store.getState().running &&
        (state.error ||
          state.readonly ||
          state.view?.world.critical ||
          state.view?.world.bankrupt ||
          state.view?.world.bankrupt)
      ) {
        this.stop(
          state.view?.world.bankrupt
            ? '구단이 파산했어요.'
            : state.view?.world.critical
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
    this.timer = setInterval(() => void this.tick(), PACE_MS.x1);
  }
  setPace(pace: Pace) {
    if (this.store.getState().pace === pace) return;
    this.store.setState({ pace });
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), PACE_MS[pace]);
  }
  setStopOn(kind: InboxKind, value: boolean) {
    const stopOn = { ...this.store.getState().stopOn, [kind]: value };
    this.store.setState({ stopOn });
    try {
      localStorage.setItem(STOP_KEY, JSON.stringify(stopOn));
    } catch {
      /* the setting still applies for this session */
    }
  }
  /** Replaces every stop at once, as an intervention level does. */
  setStopOnAll(stopOn: StopOn) {
    this.store.setState({ stopOn: { ...stopOn } });
    try {
      localStorage.setItem(STOP_KEY, JSON.stringify(stopOn));
    } catch {
      /* the setting still applies for this session */
    }
  }
  /** Resolve a match eve by settling the fixture as a result, then keep the clock running. */
  playThrough() {
    const id = this.store.getState().matchEve;
    if (id) this.passedMatch = id;
    this.store.setState({ matchEve: undefined });
    this.start();
  }
  clearMatchEve() {
    this.store.setState({ matchEve: undefined });
  }
  setWatching(watching: boolean) {
    const previous = this.store.getState().watching;
    if (previous === watching) return;
    this.store.setState({ watching });
    if (watching && this.store.getState().running) void this.tick();
    if (!watching) this.endWatch();
  }
  /**
   * The owner chose to watch the next match: stop the clock for it and remember whether to resume
   * once the owner leaves the match view. A match-eve card always resumes, as playing through would.
   */
  beginWatch(fromEve = false) {
    this.resumeAfterWatch = fromEve || this.store.getState().running;
    this.stop(WATCH_REASON);
  }
  /** Leaving the match view (or a watch that produced no match) resumes a clock watching stopped. */
  endWatch() {
    if (this.store.getState().reason === WATCH_REASON) this.store.setState({ reason: '' });
    if (!this.resumeAfterWatch) return;
    this.resumeAfterWatch = false;
    this.start();
  }
  /** The owner's own stop: nothing resumes it until the owner starts it again. */
  pause() {
    this.resumeAfterWatch = false;
    this.stop();
  }
  /**
   * Pauses ticks while a source holds it and resumes when released. Only watching a match
   * (an explicit stop) or a blocker ends the run; menus and sheets never pause the clock.
   */
  setSuspended(suspended: boolean, source = 'feature') {
    if (suspended) this.suspensionSources.add(source);
    else this.suspensionSources.delete(source);
    if (!this.suspended && this.store.getState().running && this.store.getState().watching)
      void this.tick();
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
    // Resuming at a match eve means playing that fixture through as a result.
    const eve = this.store.getState().matchEve;
    if (eve) this.passedMatch = eve;
    this.resumeAfterWatch = false;
    this.stepAt = undefined;
    this.store.setState({ running: true, reason: '', matchEve: undefined });
    // Date progression starts on the next tick of the pace. Watching starts without an empty wait.
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
    if (!progress.running || this.suspended) {
      // Time spent stopped or behind a sheet is not owed to the calendar.
      this.stepAt = undefined;
      return;
    }
    if (this.inFlight || state.processing) return;
    if (
      !state.view ||
      state.readonly ||
      state.error ||
      state.view.world.critical ||
      state.view.world.bankrupt
    )
      return;
    if (state.savedRevision !== state.view.world.revision) return;
    if (
      progress.watching &&
      state.playback?.frames.length &&
      this.finishedId !== state.playback.record.id
    )
      return;
    const w = state.view.world;
    if (!progress.watching && progress.stopOn.match && daysUntilNextMatch(w) === 1) {
      const next = nextOwnFixture(w);
      if (next && next.id !== this.passedMatch) {
        this.stop('내일 경기가 있어요');
        this.store.setState({ matchEve: next.id });
        return;
      }
    }
    const seen = new Set(stoppingEvents(w, progress.stopOn).map((item) => item.id));
    const now = Date.now(),
      owed =
        this.stepAt === undefined ? 1 : Math.floor((now - this.stepAt) / PACE_MS[progress.pace]),
      days = Math.max(1, Math.min(MAX_STEP_DAYS, owed));
    this.stepAt = now;
    this.inFlight = true;
    try {
      const reply = await this.client.command(
        progress.watching ? { type: 'next-match' } : command(days, progress.stopOn, w),
        { background: true, automatic: true },
      );
      // A cancelled tick after an explicit stop (e.g. to watch) keeps that stop's reason.
      if (
        !reply?.ok ||
        reply.cancelled ||
        reply.view?.world.critical ||
        reply.view?.world.bankrupt
      ) {
        if (this.store.getState().running) this.stop();
      } else if (reply.view) {
        const fresh = stoppingEvents(reply.view.world, this.store.getState().stopOn).find(
          (item) => !seen.has(item.id),
        );
        if (fresh) this.stop(fresh.title);
      }
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
