import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Command, InboxKind, World } from '../../../../packages/contracts/src/types';
import { daysUntilNextMatch, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import type { GameClient } from './client';
import { gameStore } from './store';

export type Pace = 'daily' | 'three-days' | 'five-days';
/** Game days per one-second tick. */
export const PACE_DAYS: Record<Pace, number> = { daily: 1, 'three-days': 3, 'five-days': 5 };
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
  /** The season that just closed, until the owner has seen its review. */
  seasonEnd?: number;
}
export const STOP_LABELS: Record<InboxKind, string> = {
  match: '경기 전날',
  'window-open': '이적시장 개장',
  'window-close': '이적시장 마감',
  'bid-response': '이적 협상 응답',
  'incoming-bid': '우리 선수 영입 제안',
  'youth-intake': '유소년 입단',
  'staff-report': '스태프 보고',
  finance: '자금·후원 경고',
};
/** First-run stops match the "important decisions" intervention level. */
const DEFAULT_STOP_ON: StopOn = {
  match: true,
  'window-open': true,
  'window-close': false,
  'bid-response': true,
  'incoming-bid': true,
  'youth-intake': true,
  'staff-report': false,
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
 * One tick of the clock. A multi-day step lands on a match eve instead of running through the
 * match day, and the host ends it early on the day an enabled event arrives.
 */
function command(pace: Pace, stopOn: StopOn, w: World): Command {
  const until = daysUntilNextMatch(w),
    days = PACE_DAYS[pace];
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
    pace: 'daily',
    watching: false,
    reason: '',
    stopOn: storedStopOn(),
  }));
  /** A fixture the owner chose to play through without watching. */
  private passedMatch?: string;
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private inFlight = false;
  private suspensionSources = new Set<string>();
  private get suspended() {
    return this.suspensionSources.size > 0;
  }
  private worldId?: string;
  private year?: number;
  private finishedId?: string;

  constructor(private client: GameClient) {
    this.worldId = gameStore.getSnapshot().view?.world.id;
    this.year = gameStore.getSnapshot().view?.world.year;
    this.unsubscribe = gameStore.subscribe((state) => {
      const id = state.view?.world.id,
        year = state.view?.world.year;
      if (this.worldId !== id) {
        this.worldId = id;
        this.year = year;
        this.finishedId = undefined;
        this.stop('');
        this.store.setState({ seasonEnd: undefined });
      } else if (year !== undefined && this.year !== undefined && year > this.year) {
        // However the season closed (clock, watching or a bulk action), its review comes first.
        const closed = year - 1;
        this.year = year;
        this.stop('시즌이 끝났어요');
        this.store.setState({ seasonEnd: closed, matchEve: undefined });
      } else if (year !== undefined) this.year = year;
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
  /** The owner has seen the closed season's review. */
  clearSeasonEnd() {
    this.store.setState({ seasonEnd: undefined });
  }
  setWatching(watching: boolean) {
    const previous = this.store.getState().watching;
    if (previous === watching) return;
    this.store.setState({ watching });
    if (watching && this.store.getState().running) void this.tick();
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
    this.store.setState({ running: true, reason: '', matchEve: undefined });
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
    this.inFlight = true;
    try {
      const reply = await this.client.command(
        progress.watching ? { type: 'next-match' } : command(progress.pace, progress.stopOn, w),
        { background: true, automatic: true },
      );
      // A cancelled tick after an explicit stop (e.g. to watch) keeps that stop's reason.
      if (!reply?.ok || reply.cancelled || reply.view?.world.critical) {
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
