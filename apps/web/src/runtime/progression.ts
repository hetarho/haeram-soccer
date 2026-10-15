import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type {
  Command,
  InboxKind,
  InterventionLevel,
  World,
} from '../../../../packages/contracts/src/types';
import {
  currentDay,
  dayCountedFrom,
  daysInSeason,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
} from '../../../../packages/engine/src/calendar';
import { interventionOf } from '../../../../packages/engine/src/intervention';
import { currentLeagueRank } from '../../../../packages/engine/src/projection';
import type { GameClient } from './client';
import { gameStore } from './store';

export type Pace = 'x1' | 'x2' | 'x5' | 'x10';
/** Real milliseconds per game day: x1 is one day a second, x10 one day every 0.1 s. */
export const PACE_MS: Record<Pace, number> = { x1: 1000, x2: 500, x5: 200, x10: 100 };
/**
 * A step normally advances one day and never waits for saving (→SAVE-8). When a step itself takes
 * longer than the pace allows, the next carries the days that piled up, at most this many, so the
 * calendar keeps the chosen rate.
 */
export const MAX_STEP_DAYS = 5;
/** Background play (→WEB-64): how far a page that slept or closed catches up on return. */
export type AwayLimit = 'off' | 'month' | 'season';
export interface BackgroundSettings {
  /** Keep the clock running while the tab is hidden. */
  hidden: boolean;
  away: AwayLimit;
}
export const AWAY_LIMITS: Record<AwayLimit, string> = {
  off: '끄기',
  month: '최대 30일',
  season: '최대 한 시즌',
};
/**
 * A tick this late after the last step means the page slept (frozen, discarded or closed), not
 * that the browser merely throttled a hidden tab, so the away limit applies to the days owed.
 */
export const AWAY_GAP_MS = 2 * 60 * 1000;
/** Days one catch-up step may carry; the host still ends it on any news or match day. */
export const CATCH_UP_STEP_DAYS = 30;
/** Hidden this long, the owner gets a summary of what happened on return. */
export const AWAY_SUMMARY_MS = 60 * 1000;
/** Where the club stood when the owner last looked, for the "자리를 비운 동안" card. */
export interface ClockMark {
  at: number;
  year: number;
  day: number;
  date: string;
  cash: string;
  matches: number;
  lastMatch?: string;
  rank: number;
}
/** `matches` counts the whole career; the view itself keeps only the latest own matches. */
export function clockMark(
  w: World,
  matches = gameStore.getSnapshot().view?.totalMatches,
): ClockMark {
  return {
    at: Date.now(),
    year: w.year,
    day: currentDay(w),
    date: seasonDate(w),
    cash: w.cash,
    matches: matches ?? w.ownMatches.length,
    lastMatch: w.ownMatches.at(-1)?.id,
    rank: currentLeagueRank(w).rank,
  };
}
export type StopOn = Record<InboxKind, boolean>;
export interface ProgressionState {
  running: boolean;
  pace: Pace;
  watching: boolean;
  reason: string;
  /** Tomorrow's own fixture the clock stopped for, until the owner watches or plays through. */
  matchEve?: string;
  background: BackgroundSettings;
  /** A finished run while the owner was away, waiting to be summarized (→WEB-64). */
  away?: ClockMark;
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
  'contract-talk': '선수 계약 협상',
  unhappy: '언해피 선수',
  'transfer-request': '선수 이적 요청',
  'sponsor-ending': '후원 계약 만료',
};
const WATCH_REASON = '관전 중에는 자동 진행을 잠시 멈춰요.';
/** Every event kind that can stop the clock. */
export const STOP_KINDS = Object.keys(STOP_LABELS) as InboxKind[];
/**
 * Where the clock stops at each intervention level (→WEB-45): the clock's half of the level; the
 * engine holds the half the staff decide.
 */
export const LEVEL_STOPS: Record<InterventionLevel, readonly InboxKind[]> = {
  1: STOP_KINDS,
  2: [
    'match',
    'window-open',
    'bid-response',
    'incoming-bid',
    'youth-intake',
    'staff-renewal',
    'finance',
    'sponsor-ending',
  ],
  3: ['window-open', 'bid-response', 'incoming-bid', 'finance'],
  4: ['finance'],
};
/** The kinds the world's intervention level stops for; nothing else sets them (→WEB-18). */
export function stopsOf(w: Pick<World, 'intervention'>): StopOn {
  const on = LEVEL_STOPS[interventionOf(w)];
  return Object.fromEntries(STOP_KINDS.map((kind) => [kind, on.includes(kind)])) as StopOn;
}
/** Per-browser stops kept before the level decided them; removed once on start. */
const STOP_KEY = 'haeram-soccor:stop-on';
const BACKGROUND_KEY = 'haeram-soccor:background';
/** Per world: whether the clock ran, its pace and when it last stepped, for a later return. */
const CLOCK_KEY = 'haeram-soccor:clock';
interface ClockRecord {
  running: boolean;
  pace: Pace;
  at: number;
  mark?: ClockMark;
}
function storedBackground(): BackgroundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(BACKGROUND_KEY) || '{}');
    return {
      hidden: typeof raw.hidden === 'boolean' ? raw.hidden : true,
      away: raw.away in AWAY_LIMITS ? raw.away : 'season',
    };
  } catch {
    return { hidden: true, away: 'season' };
  }
}
function storedClocks(): Record<string, ClockRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOCK_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
/** Unread attention items the intervention level stops for. */
export function stoppingEvents(w: World) {
  const stopOn = stopsOf(w);
  return (w.inbox || []).filter((item) => item.attention && !item.read && stopOn[item.kind]);
}
/**
 * One tick of the clock. A multi-day catch-up step lands on a match eve instead of running
 * through the match day, and the host ends it early on the day an enabled event arrives.
 */
function command(days: number, w: World): Command {
  const until = daysUntilNextMatch(w),
    stopOn = stopsOf(w);
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
    background: storedBackground(),
  }));
  /** A fixture the owner chose to play through without watching. */
  private passedMatch?: string;
  /** Watching stopped a running clock (or answered a match eve); leaving the match resumes it. */
  private resumeAfterWatch = false;
  /** An event stopped a running clock; deciding the last one waiting plays on (→WEB-42). */
  private resumeAfterEvents = false;
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
  /** The next step owes the days since stepAt: the last step itself ran late, or time away. */
  private owing = false;
  private hidden = false;
  private hiddenAt?: number;
  /** Where the club stood when the owner last looked, until the run it started is summarized. */
  private seenMark?: ClockMark;
  /** A clock left running in an earlier visit of this world, waiting for the game to be shown. */
  private armed?: ClockRecord;
  private clockWrittenAt = 0;

  constructor(private client: GameClient) {
    try {
      localStorage.removeItem(STOP_KEY);
    } catch {
      /* nothing was kept */
    }
    this.worldId = gameStore.getSnapshot().view?.world.id;
    this.armed = this.worldId ? this.recordToResume(this.worldId) : undefined;
    // A season close is recorded, not a stop: its review waits in the league's season list, so a
    // running clock plays on into the next season (→WEB-47).
    this.unsubscribe = gameStore.subscribe((state) => {
      const id = state.view?.world.id;
      if (this.worldId !== id) {
        // The world leaving play records its clock stopped: parked games never progress.
        this.stop('');
        this.worldId = id;
        this.finishedId = undefined;
        this.seenMark = undefined;
        this.store.setState({ away: undefined });
        // A clock this world left running resumes once the game is on screen (→WEB-64).
        this.armed = id ? this.recordToResume(id) : undefined;
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
  private recordToResume(id: string) {
    const record = storedClocks()[id];
    return record?.running &&
      record.pace in PACE_MS &&
      Number.isFinite(record.at) &&
      !gameStore.getSnapshot().readonly
      ? record
      : undefined;
  }
  setPace(pace: Pace) {
    if (this.store.getState().pace === pace) return;
    this.store.setState({ pace });
    clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), PACE_MS[pace]);
    this.writeClock(true);
  }
  setBackground(settings: Partial<BackgroundSettings>) {
    const background = { ...this.store.getState().background, ...settings };
    this.store.setState({ background });
    try {
      localStorage.setItem(BACKGROUND_KEY, JSON.stringify(background));
    } catch {
      /* the setting still applies for this session */
    }
    this.setSuspended(this.hidden && !background.hidden, 'visibility');
  }
  /**
   * The tab was hidden or shown. A hidden tab plays on at its wall-clock pace unless the owner
   * chose otherwise; coming back after a minute or more brings a summary of the run.
   */
  setHidden(hidden: boolean) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    const w = gameStore.getSnapshot().view?.world;
    if (hidden) {
      this.hiddenAt = Date.now();
      if (w && !this.seenMark) this.seenMark = clockMark(w);
      this.writeClock(true);
    } else {
      const away = this.hiddenAt !== undefined && Date.now() - this.hiddenAt >= AWAY_SUMMARY_MS;
      this.hiddenAt = undefined;
      if (!away) this.seenMark = undefined;
    }
    this.setSuspended(hidden && !this.store.getState().background.hidden, 'visibility');
    if (!hidden) this.summarize();
  }
  /**
   * Called when the game is on screen: a clock this world left running when its page slept or
   * closed plays the time away (within the away limit), then carries on.
   */
  resumeAway() {
    const record = this.armed;
    this.armed = undefined;
    if (!record || this.store.getState().running) return;
    this.setPace(record.pace);
    this.start();
    if (!this.store.getState().running) return;
    this.stepAt = record.at;
    this.owing = true;
    this.seenMark = record.mark;
    void this.tick();
  }
  /** The owner read the summary. */
  clearAway() {
    this.store.setState({ away: undefined });
  }
  /** Publishes the summary of a finished run once the owner is looking again. */
  private summarize() {
    if (!this.seenMark || this.hidden || this.inFlight) return;
    const from = this.seenMark;
    this.seenMark = undefined;
    this.store.setState({ away: from });
  }
  /** Keeps this world's clock on disk (at most once a second unless forced) for a later return. */
  writeClock(force = false) {
    const id = this.worldId;
    if (!id || gameStore.getSnapshot().readonly) return;
    const now = Date.now();
    if (!force && now - this.clockWrittenAt < 1000) return;
    this.clockWrittenAt = now;
    const { running, pace } = this.store.getState();
    const w = gameStore.getSnapshot().view?.world;
    const record: ClockRecord = {
      running,
      pace,
      at: this.stepAt ?? now,
      mark: this.seenMark ?? (w ? clockMark(w) : undefined),
    };
    try {
      // Only the newest few worlds are kept; one per game slot is all a return needs.
      const clocks = Object.entries({ ...storedClocks(), [id]: record })
        .sort(([, a], [, b]) => b.at - a.at)
        .slice(0, 5);
      localStorage.setItem(CLOCK_KEY, JSON.stringify(Object.fromEntries(clocks)));
    } catch {
      /* without storage a return simply starts stopped */
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
  /**
   * The owner decided an event card: a clock an event stopped plays on once no stopping event is
   * left to decide (→WEB-42).
   */
  eventDecided() {
    if (!this.resumeAfterEvents || this.store.getState().running) return;
    const w = gameStore.getSnapshot().view?.world;
    if (!w || stoppingEvents(w).length) return;
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
    this.resumeAfterEvents = false;
    this.stepAt = undefined;
    this.store.setState({ running: true, reason: '', matchEve: undefined });
    this.writeClock(true);
    // Date progression starts on the next tick of the pace. Watching starts without an empty wait.
    if (this.store.getState().watching) void this.tick();
  }
  stop(reason = '자동 진행을 멈췄습니다.') {
    const was = this.store.getState().running;
    this.resumeAfterEvents = false;
    this.store.setState({ running: false, reason });
    if (this.inFlight) this.client.cancel();
    if (!was) return;
    this.writeClock(true);
    // A clock that stops for any reason saves its automatic progress at once (→SAVE-8).
    this.client.saveSoon();
  }
  finishMatch(id: string) {
    if (this.finishedId === id) return;
    this.finishedId = id;
    if (this.store.getState().running && this.store.getState().watching) void this.tick();
  }
  beginMatch(id: string) {
    if (this.finishedId === id) this.finishedId = undefined;
  }
  /** Stops on the eve of an own match the owner wants to decide; true when it stopped. */
  private eveStop(w: World) {
    const progress = this.store.getState();
    if (progress.watching || !stopsOf(w).match || daysUntilNextMatch(w) !== 1) return false;
    const next = nextOwnFixture(w);
    if (!next || next.id === this.passedMatch) return false;
    this.stop('내일 경기가 있어요');
    this.store.setState({ matchEve: next.id });
    return true;
  }
  /** How many days the clock owes now, and whether it must catch them up step after step. */
  private owed(w: World) {
    const now = Date.now(),
      progress = this.store.getState();
    if (this.stepAt === undefined) return { days: 1, catchUp: false };
    const gap = now - this.stepAt,
      days = Math.floor(gap / PACE_MS[progress.pace]);
    if (gap > AWAY_GAP_MS) {
      // The page slept: the time away is played up to the away limit, then the run carries on.
      const limit = { off: 1, month: 30, season: daysInSeason(w.year) }[progress.background.away];
      if (!this.seenMark) this.seenMark = clockMark(w);
      return { days: Math.max(1, Math.min(days, limit)), catchUp: true };
    }
    // A hidden tab's throttled timer pays every day it owes; a visible one at most a few, and only
    // after a step that itself ran late: an ordinary step is one day whatever its timer did.
    if (this.hidden) return { days: Math.max(1, days), catchUp: true };
    if (!this.owing) return { days: 1, catchUp: false };
    return { days: Math.max(1, Math.min(MAX_STEP_DAYS, days)), catchUp: false };
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
    // Saving runs in the background (→SAVE-8): an unsaved revision never holds the next step.
    if (
      progress.watching &&
      state.playback?.frames.length &&
      this.finishedId !== state.playback.record.id
    )
      return;
    let w = state.view.world;
    if (this.eveStop(w)) return;
    const owed = progress.watching ? { days: 1, catchUp: false } : this.owed(w);
    const stepAt = (this.stepAt = Date.now());
    this.inFlight = true;
    try {
      let debt = owed.days;
      while (debt > 0) {
        const seen = new Set(stoppingEvents(w).map((item) => item.id));
        const days = owed.catchUp ? Math.min(debt, CATCH_UP_STEP_DAYS) : debt;
        const reply = await this.client.command(
          progress.watching ? { type: 'next-match' } : command(days, w),
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
          break;
        }
        if (!reply.view) break;
        const fresh = stoppingEvents(reply.view.world).find((item) => !seen.has(item.id));
        if (fresh) {
          this.stop(fresh.title);
          this.resumeAfterEvents = true;
          break;
        }
        const next = reply.view.world;
        // A season close skips the empty summer, which pays for those days too.
        debt -= Math.max(1, dayCountedFrom(next, w.year) - currentDay(w));
        w = next;
        if (!owed.catchUp || !this.store.getState().running || this.suspended) break;
        if (this.eveStop(w)) break;
      }
      this.writeClock();
    } finally {
      this.inFlight = false;
      this.owing = Date.now() - stepAt > PACE_MS[this.store.getState().pace];
      // A stop that came while the step ran saved before the step landed; save what it played.
      if (!this.store.getState().running) this.client.saveSoon();
      this.summarize();
    }
  }
  dispose() {
    // Leaving the page keeps the stored clock as it was, so a return can resume it.
    this.store.setState({ running: false, reason: '' });
    if (this.inFlight) this.client.cancel();
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
