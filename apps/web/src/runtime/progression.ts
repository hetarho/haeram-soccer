import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Command, World } from '../../../../packages/contracts/src/types';
import {
  currentDay,
  dayCountedFrom,
  daysInSeason,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
} from '../../../../packages/engine/src/calendar';
import { pendingDecisions, stoppingReasons } from '../../../../packages/engine/src/stopping';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { currentLeagueRank } from '../../../../packages/engine/src/projection';
import type { GameClient } from './client';
import { gameStore } from './store';
import { unfinishedPlayback, useMatchView } from './matchView';

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
export interface ProgressionState {
  running: boolean;
  pace: Pace;
  watching: boolean;
  reason: string;
  /** Requests the current dated report again without advancing the game. */
  eventRequest: number;
  /** Tomorrow's own fixture the clock stopped for, until the owner watches or plays through. */
  matchEve?: string;
  background: BackgroundSettings;
  /** A finished run while the owner was away, waiting to be summarized (→WEB-64). */
  away?: ClockMark;
}
const WATCH_REASON = '관전 중에는 자동 진행을 잠시 멈춰요.';
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
/** Dated live decisions and enabled observations, independent of notification read state. */
export function stoppingEvents(w: World) {
  return stoppingReasons(w);
}
/** An enabled pre-match report still awaiting the owner's explicit match choice. */
export function pendingMatchReport(w: World) {
  return settingsOf(w).observations.matchEve && daysUntilNextMatch(w) === 1
    ? nextOwnFixture(w)
    : undefined;
}
/**
 * One tick of the clock. A multi-day catch-up step lands on a match eve instead of running
 * through the match day, and the host ends it early on the day an enabled event arrives.
 */
function command(days: number, w: World): Command {
  const until = daysUntilNextMatch(w),
    observations = settingsOf(w).observations;
  return {
    type: 'advance-days',
    days:
      observations.matchEve && until !== undefined && until > 1 && until <= days ? until - 1 : days,
    stop: [
      ...(observations.matchEve ? ['match' as const] : []),
      ...(observations.windowOpen ? ['window-open' as const] : []),
    ],
  };
}

/** Owns the clock outside React, so changing or hiding a view cannot restart it. */
export class ProgressionController {
  readonly store = createStore<ProgressionState>(() => ({
    running: false,
    pace: 'x1',
    watching: false,
    reason: '',
    eventRequest: 0,
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
  private unsubscribeClock: () => void;
  private inFlight = false;
  private suspensionSources = new Set<string>();
  private get suspended() {
    return this.suspensionSources.size > 0;
  }
  private mode?: 'automatic' | 'manual';
  private worldId?: string;
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
    const initial = gameStore.getSnapshot().view?.world;
    this.mode = initial ? settingsOf(initial).mode : undefined;
    this.armed = this.worldId ? this.recordToResume(this.worldId) : undefined;
    this.unsubscribeClock = this.store.subscribe((state, previous) => {
      if (state.running !== previous.running) this.client.setClockRunning(state.running);
    });
    // A season close is recorded, not a stop: its review waits in the league's season list, so a
    // running clock plays on into the next season (→WEB-47).
    this.unsubscribe = gameStore.subscribe((state) => {
      const id = state.view?.world.id;
      const mode = state.view ? settingsOf(state.view.world).mode : undefined;
      if (mode !== this.mode) {
        this.mode = mode;
        this.stop('');
        this.stepAt = undefined;
        this.owing = false;
        this.armed = undefined;
        this.seenMark = undefined;
        this.hiddenAt = undefined;
        this.resumeAfterWatch = false;
        this.resumeAfterEvents = false;
        this.passedMatch = undefined;
        this.store.setState({ matchEve: undefined, away: undefined });
        this.writeClock(true);
      }
      if (this.worldId !== id) {
        // The world leaving play records its clock stopped: parked games never progress.
        this.stop('');
        this.worldId = id;
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
    });
    this.timer = setInterval(() => void this.tick(), PACE_MS.x1);
  }
  private recordToResume(id: string) {
    const record = storedClocks()[id];
    return this.mode === 'automatic' &&
      record?.running &&
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
    if (this.mode === 'manual') {
      this.hiddenAt = undefined;
      this.seenMark = undefined;
      this.setSuspended(hidden && !this.store.getState().background.hidden, 'visibility');
      return;
    }
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
    // A loaded view can arrive before its loading command settles.
    const state = gameStore.getSnapshot();
    if (state.busy || state.processing || state.pendingActions) return;
    const record = this.armed;
    this.armed = undefined;
    if (this.mode !== 'automatic' || !record || this.store.getState().running) return;
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
      running: running && this.mode === 'automatic',
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
  async playThrough() {
    if (this.mode === 'manual') {
      const state = gameStore.getSnapshot(),
        w = state.view?.world;
      if (
        !w ||
        this.inFlight ||
        state.processing ||
        state.readonly ||
        state.error ||
        w.critical ||
        w.bankrupt ||
        pendingDecisions(w).length ||
        daysUntilNextMatch(w) !== 1
      )
        return;
      this.inFlight = true;
      try {
        const reply = await this.client.command(
          { type: 'advance-days', days: 1 },
          { background: true },
        );
        if (reply?.ok && w.id === this.worldId && this.mode === 'manual')
          this.store.setState({ matchEve: undefined });
      } finally {
        this.inFlight = false;
      }
      return;
    }
    const world = gameStore.getSnapshot().view?.world;
    const id =
      this.store.getState().matchEve ??
      (world && daysUntilNextMatch(world) === 1 ? nextOwnFixture(world)?.id : undefined);
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
    if (watching && this.store.getState().running) this.beginWatch();
    if (!watching) this.endWatch();
  }
  /**
   * The owner chose to watch the next match: stop the clock for it and remember whether to resume
   * once the owner leaves the match view. A match-eve card always resumes, as playing through would.
   */
  beginWatch(fromEve = false) {
    this.resumeAfterWatch = this.mode === 'automatic' && (fromEve || this.store.getState().running);
    this.stop(WATCH_REASON);
  }
  /** Leaving the match view (or a watch that produced no match) resumes a clock watching stopped. */
  endWatch() {
    if (this.store.getState().reason === WATCH_REASON) this.store.setState({ reason: '' });
    if (this.mode !== 'automatic' || !this.resumeAfterWatch) return;
    this.resumeAfterWatch = false;
    this.start();
  }
  /**
   * The owner decided an event card: a clock an event stopped plays on once no stopping event is
   * left to decide (→WEB-42).
   */
  eventDecided() {
    if (this.mode !== 'automatic' || !this.resumeAfterEvents || this.store.getState().running)
      return;
    const w = gameStore.getSnapshot().view?.world;
    if (!w || stoppingEvents(w).length) return;
    this.start();
  }
  /** A single explicit manual request; the client saves its final decision boundary. */
  async nextEvent() {
    const state = gameStore.getSnapshot(),
      w = state.view?.world;
    if (
      this.mode !== 'manual' ||
      !w ||
      this.inFlight ||
      state.processing ||
      state.readonly ||
      state.error ||
      w.critical ||
      w.bankrupt ||
      state.pendingActions
    )
      return;
    if (unfinishedPlayback(state.playback, useMatchView.getState())) {
      this.store.setState((progress) => ({ eventRequest: progress.eventRequest + 1 }));
      return;
    }
    const report = pendingMatchReport(w);
    if (report) {
      this.store.setState((progress) => ({
        matchEve: report.id,
        eventRequest: progress.eventRequest + 1,
      }));
      return;
    }
    if (pendingDecisions(w).length) return;
    this.inFlight = true;
    try {
      const reply = await this.client.command({ type: 'next-event' }, { background: true });
      const world = reply?.view?.world;
      if (
        reply?.ok &&
        world &&
        world.id === this.worldId &&
        this.mode === 'manual' &&
        settingsOf(world).mode === 'manual'
      ) {
        this.store.setState({
          running: false,
          matchEve: daysUntilNextMatch(world) === 1 ? nextOwnFixture(world)?.id : undefined,
          reason: world.critical || (world.bankrupt ? '구단이 파산했어요.' : ''),
        });
      }
    } finally {
      this.inFlight = false;
    }
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
      this.mode !== 'automatic' ||
      this.store.getState().watching ||
      this.suspended ||
      state.processing ||
      state.busy ||
      state.pendingActions ||
      state.readonly ||
      state.error ||
      state.view?.world.critical ||
      state.view?.world.bankrupt ||
      (state.view && pendingDecisions(state.view.world).length > 0) ||
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
    // Date progression starts on the next tick of the pace.
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
  /** Stops on the eve of an own match the owner wants to decide; true when it stopped. */
  private eveStop(w: World) {
    const progress = this.store.getState();
    if (progress.watching) return false;
    const next = pendingMatchReport(w);
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
    if (this.mode !== 'automatic' || !progress.running || progress.watching || this.suspended) {
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
    let w = state.view.world;
    if (this.eveStop(w)) return;
    const owed = this.owed(w);
    const stepAt = (this.stepAt = Date.now());
    this.inFlight = true;
    try {
      let debt = owed.days;
      while (debt > 0) {
        const seen = new Set(stoppingEvents(w).map((item) => item.id));
        const days = owed.catchUp ? Math.min(debt, CATCH_UP_STEP_DAYS) : debt;
        const reply = await this.client.command(command(days, w), {
          background: true,
          automatic: true,
        });
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
        if (
          reply.view.world.id !== this.worldId ||
          this.mode !== 'automatic' ||
          settingsOf(reply.view.world).mode !== 'automatic'
        ) {
          this.store.setState({ running: false });
          break;
        }
        const fresh = stoppingEvents(reply.view.world).find((item) => !seen.has(item.id));
        if (fresh) {
          this.stop(fresh.title);
          if (fresh.kind === 'match') this.store.setState({ matchEve: fresh.ref });
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
    this.unsubscribeClock();
    this.suspensionSources.clear();
  }
}
export function useProgression<T>(
  controller: ProgressionController,
  selector: (state: ProgressionState) => T,
) {
  return useStore(controller.store, selector);
}
