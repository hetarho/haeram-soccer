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
 * Days the engine may compute ahead of the shown date while the page is shown, so a slow match
 * day is absorbed by the fast days before it (→WEB-18).
 */
export const RUN_AHEAD_DAYS: Record<Pace, number> = { x1: 3, x2: 3, x5: 5, x10: 7 };
/** How long the 경기 결과 알림 notice stays once our fixture's day is shown (→WEB-18). */
export const RESULT_NOTICE_MS = 4000;
/** Background play (→WEB-64): how far a page that slept or closed catches up on return. */
export type AwayLimit = 'off' | 'month' | 'season';
export interface BackgroundSettings {
  /** Keep the clock running while the tab is hidden. */
  hidden: boolean;
  away: AwayLimit;
  /** Show the own fixture's score once its day is shown (경기 결과 알림, →WEB-18). */
  resultNotice: boolean;
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
  /** The own match record a shown fixture day announces while 경기 결과 알림 is on. */
  resultNotice?: { matchId: string };
}
const WATCH_REASON = '관전 중에는 자동 진행을 잠시 멈춰요.';
const STOP_REASON = '자동 진행을 멈췄습니다.';
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
      resultNotice: raw.resultNotice === true,
    };
  } catch {
    return { hidden: true, away: 'season', resultNotice: false };
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
function command(days: number, w: World): Extract<Command, { type: 'advance-days' }> {
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
/** The stopping event a step from `before` to `after` brought, if any (→WEB-42). */
function freshEvent(before: World, after: World) {
  const seen = new Set(stoppingEvents(before).map((item) => item.id));
  return stoppingEvents(after).find((item) => !seen.has(item.id));
}
/** A day the engine computed that the client holds until it is shown (→WEB-18). */
interface Held {
  before: World;
  after: World;
  /** Real milliseconds it waits after the day before it: the faster of its pace and any since. */
  ms: number;
  /** It stops the clock once shown, so nothing is computed past it. */
  stops: boolean;
  /** When it landed: after its turn, it was late. */
  at: number;
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
  /** Entering the owner office stopped a running clock; leaving the office resumes it (→WEB-98). */
  private resumeAfterOffice = false;
  /** An event stopped a running clock; deciding the last one waiting plays on (→WEB-42). */
  private resumeAfterEvents = false;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe: () => void;
  private unsubscribeClock: () => void;
  private inFlight = false;
  /** Reads outside the command queue still unanswered: nothing is computed ahead meanwhile. */
  private reads = 0;
  /** Reads waiting until every held day is shown at the pace and no step is in flight (→WEB-18). */
  private waitingReads: (() => void)[] = [];
  /** The pace interval of the day being computed, which a pace change can shorten. */
  private sending?: { ms: number };
  /** Days computed ahead of the shown date, oldest first, as the client holds them. */
  private ahead: Held[] = [];
  /** The owner stopped and the days computed ahead are still shown at the pace (→WEB-97). */
  private draining = false;
  /** What the client was last told about the management lock. */
  private locked = false;
  /** Where the pace's beats start (its last change): a start shows its first day on one. */
  private beat = Date.now();
  /** When the next day is due (→WEB-18); unset until the clock shows days again. */
  private due?: number;
  private disposed = false;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private suspensionSources = new Set<string>();
  private get suspended() {
    return this.suspensionSources.size > 0;
  }
  private mode?: 'automatic' | 'manual';
  private worldId?: string;
  /**
   * When the calendar last moved: a day shown, or a hidden tab's step sent; unset while stopped so
   * a restart begins with one day.
   */
  private stepAt?: number;
  /** The next step plays the time a slept or closed page was away (→WEB-64). */
  private returning = false;
  private hidden = false;
  private hiddenAt?: number;
  /** Where the club stood when the owner last looked, until the run it started is summarized. */
  private seenMark?: ClockMark;
  /** A clock left running in an earlier visit of this world, waiting for the game to be shown. */
  private armed?: ClockRecord;
  private clockWrittenAt = 0;

  /** `runAhead` is RUN_AHEAD_DAYS; a test may compare it with computing one day at a time. */
  constructor(
    private client: GameClient,
    private runAhead: Record<Pace, number> = RUN_AHEAD_DAYS,
  ) {
    try {
      localStorage.removeItem(STOP_KEY);
    } catch {
      /* nothing was kept */
    }
    this.worldId = gameStore.getSnapshot().view?.world.id;
    const initial = gameStore.getSnapshot().view?.world;
    this.mode = initial ? settingsOf(initial).mode : undefined;
    this.armed = this.worldId ? this.recordToResume(this.worldId) : undefined;
    this.client.readGate = () => this.beforeRead();
    this.unsubscribeClock = this.store.subscribe((state, previous) => {
      if (state.running !== previous.running) this.lock();
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
        this.returning = false;
        this.armed = undefined;
        this.seenMark = undefined;
        this.hiddenAt = undefined;
        this.resumeAfterWatch = false;
        this.resumeAfterEvents = false;
        this.resumeAfterOffice = false;
        this.passedMatch = undefined;
        this.store.setState({ matchEve: undefined, away: undefined });
        this.writeClock(true);
      }
      if (this.worldId !== id) {
        // The world leaving play records its clock stopped: parked games never progress.
        this.stop('');
        this.worldId = id;
        this.resumeAfterOffice = false;
        this.seenMark = undefined;
        this.store.setState({ away: undefined });
        // A clock this world left running resumes once the game is on screen (→WEB-64).
        this.armed = id ? this.recordToResume(id) : undefined;
      }
      // A critical alert or bankruptcy stops the clock once its day is shown.
      if (
        (this.store.getState().running || this.draining) &&
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
  /**
   * A pace applies to the days computed from now on; days computed already are shown at the faster
   * of their pace and this one (→WEB-18). Its beats start now.
   */
  setPace(pace: Pace) {
    if (this.store.getState().pace === pace) return;
    this.store.setState({ pace });
    for (const day of this.ahead) day.ms = Math.min(day.ms, PACE_MS[pace]);
    if (this.sending) this.sending.ms = Math.min(this.sending.ms, PACE_MS[pace]);
    this.beat = Date.now();
    if (this.due !== undefined)
      this.due = this.stepAt === undefined ? this.firstBeat() : this.stepAt + this.interval();
    this.writeClock(true);
    this.schedule();
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
   * chose otherwise, showing at once the days computed ahead; coming back after a minute or more
   * brings a summary of the run.
   */
  setHidden(hidden: boolean) {
    if (this.hidden === hidden) return;
    if (hidden && this.mode === 'automatic') {
      if (this.store.getState().running) this.flush();
      else if (this.draining) this.stop();
    }
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
    // A hidden tab steps on its (throttled) timer; a shown one shows its next day on the next beat.
    this.due = undefined;
    if (this.store.getState().running) this.wake(hidden ? PACE_MS[this.store.getState().pace] : 0);
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
    this.returning = true;
    this.seenMark = record.mark;
    void this.tick();
  }
  /** The owner read the summary. */
  clearAway() {
    this.store.setState({ away: undefined });
  }
  /** The owner opened or dismissed the result notice. */
  clearResultNotice() {
    if (this.noticeTimer !== undefined) clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    if (this.store.getState().resultNotice) this.store.setState({ resultNotice: undefined });
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
  /**
   * The owner sat down in the office: a running automatic clock stops as the owner's own stop,
   * since office work is locked while the calendar runs, showing at once the days computed ahead
   * (→WEB-97/98). A day among them that stops the clock stops it for its own reason instead.
   */
  enterOffice() {
    if (this.mode !== 'automatic') return;
    if (this.store.getState().running) this.flush();
    if (this.store.getState().running) {
      this.resumeAfterWatch = false;
      this.stop();
      this.resumeAfterOffice = true;
    } else if (this.draining) this.stop();
  }
  /** Leaving the office starts the clock again only when entering stopped it. */
  leaveOffice() {
    if (!this.resumeAfterOffice) return;
    this.resumeAfterOffice = false;
    this.start();
  }
  /**
   * A read the engine answers outside the command queue answers from its newest computed day: a
   * shown clock computes nothing ahead from its start until it is answered, and posts it once every
   * held day has been shown at the pace and no step is in flight, so no view shows a day early and
   * the calendar never jumps; a running clock keeps running (→WEB-18). Stopped, hidden or in manual
   * mode the shown date is the engine's and the read goes at once.
   */
  private beforeRead() {
    if (this.disposed || this.hidden || (!this.store.getState().running && !this.draining))
      return undefined;
    this.reads++;
    let open = true;
    const settled = () => {
      if (!open) return;
      open = false;
      this.reads--;
      if (!this.reads && !this.hidden && this.store.getState().running) this.wake();
    };
    if (!this.ahead.length && !this.inFlight) return { settled };
    return { ready: new Promise<void>((post) => this.waitingReads.push(post)), settled };
  }
  /**
   * Posts the waiting reads once every held day is shown and no step is in flight: on each day
   * revealed, each step landed and on dispose.
   */
  private postReads() {
    if (!this.disposed && (this.ahead.length || this.inFlight)) return;
    for (const post of this.waitingReads.splice(0)) post();
  }
  /**
   * The owner's own stop: nothing resumes it until the owner starts it again. The days computed
   * ahead are shown at the pace first, and management stays locked until they are; the stop's save
   * follows the last of them (→WEB-18/97, SAVE-8). `leaving` play (the slot screen) shows them at
   * once instead, as entering the office does, so the slot card and the save hold the same date.
   */
  pause(leaving = false) {
    this.resumeAfterWatch = false;
    if (
      leaving ||
      !this.store.getState().running ||
      this.hidden ||
      (!this.ahead.length && !this.inFlight)
    )
      return this.stop();
    this.resumeAfterEvents = false;
    this.clearResultNotice();
    this.draining = true;
    this.store.setState({ running: false, reason: STOP_REASON });
    if (this.inFlight) this.client.cancel();
    this.writeClock(true);
    this.schedule();
  }
  /**
   * Pauses ticks while a source holds it and resumes when released. Only watching a match
   * (an explicit stop) or a blocker ends the run; menus and sheets never pause the clock.
   */
  setSuspended(suspended: boolean, source = 'feature') {
    const was = this.suspended;
    if (suspended) this.suspensionSources.add(source);
    else this.suspensionSources.delete(source);
    if (was && !this.suspended && (this.store.getState().running || this.draining)) this.wake();
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
    // A restart shows its first day on the pace's next beat; days still held keep their turn.
    if (!this.ahead.length) this.due = undefined;
    this.draining = false;
    this.store.setState({ running: true, reason: '', matchEve: undefined });
    this.writeClock(true);
    // Computing starts at once; a hidden tab steps on its next tick.
    this.wake(this.hidden ? PACE_MS[this.store.getState().pace] : 0);
  }
  /**
   * Stops the clock for an event or a blocker: the days computed ahead are shown at once, so the
   * world stops on the date shown (→WEB-18).
   */
  stop(reason = STOP_REASON) {
    const was = this.store.getState().running || this.draining;
    this.resumeAfterEvents = false;
    this.clearResultNotice();
    this.draining = false;
    this.store.setState({ running: false, reason });
    if (this.inFlight) this.client.cancel();
    this.flush();
    this.lock();
    if (!was) return;
    this.writeClock(true);
    // A clock that stops for any reason saves its automatic progress at once (→SAVE-8).
    this.client.saveSoon();
  }
  /** Management stays locked while the clock runs and until every computed day is shown (→WEB-97). */
  private lock() {
    const locked = this.store.getState().running || this.draining;
    if (locked === this.locked) return;
    this.locked = locked;
    this.client.setClockRunning(locked);
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
    if (gap > AWAY_GAP_MS || this.returning) {
      // The page slept: the time away is played up to the away limit, then the run carries on.
      const limit = { off: 1, month: 30, season: daysInSeason(w.year) }[progress.background.away];
      if (!this.seenMark) this.seenMark = clockMark(w);
      return { days: Math.max(1, Math.min(days, limit)), catchUp: true };
    }
    // A hidden tab's throttled timer pays every day it owes. A shown calendar owes nothing: a late
    // day is waited for, so it never skips a day (→WEB-18).
    if (this.hidden) return { days: Math.max(1, days), catchUp: true };
    return { days: 1, catchUp: false };
  }
  private wake(ms = 0) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), Math.max(0, ms));
  }
  /** How long the next day waits after the one before it: its own interval, else the pace's. */
  private interval() {
    return this.ahead[0]?.ms ?? this.sending?.ms ?? PACE_MS[this.store.getState().pace];
  }
  /** The pace's first beat from now, where a start or a return shows its first day. */
  private firstBeat() {
    const interval = PACE_MS[this.store.getState().pace];
    return this.beat + (Math.floor((Date.now() - this.beat) / interval) + 1) * interval;
  }
  /** Wakes for the next day's turn; a step in flight wakes the clock itself when it lands. */
  private schedule() {
    const running = this.store.getState().running;
    if (this.due === undefined || (!running && !this.draining)) return;
    const wait = this.due - Date.now();
    if (this.ahead.length) return this.wake(wait);
    if (this.inFlight || !running) return;
    // Still waiting on admitted work for a day already due: look again a pace interval later.
    this.wake(wait > 0 ? wait : PACE_MS[this.store.getState().pace]);
  }
  private async tick() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const progress = this.store.getState();
    if (
      this.disposed ||
      this.mode !== 'automatic' ||
      (!progress.running && !this.draining) ||
      progress.watching ||
      this.suspended
    ) {
      // Time spent stopped or behind a sheet is not owed to the calendar.
      this.stepAt = undefined;
      this.due = undefined;
      return;
    }
    if (
      this.hidden ||
      this.returning ||
      (this.stepAt !== undefined && Date.now() - this.stepAt > AWAY_GAP_MS)
    ) {
      // Hidden or away nothing is computed ahead: the days owed are shown as they land (→WEB-64).
      this.flush();
      if (!this.store.getState().running) return this.drained();
      this.wake(PACE_MS[progress.pace]);
      return this.catchUp();
    }
    // Shown, a computed day is shown on its beat, or as soon as it lands when late (→WEB-18).
    this.due ??= this.firstBeat();
    if (this.ahead.length && Date.now() >= this.due) this.reveal(false);
    if (this.store.getState().running) this.compute();
    else this.drained();
    this.schedule();
  }
  /**
   * Computes the next day while fewer than the pace's run-ahead days wait to be shown, never past
   * one that stops the clock or while a read is unanswered (→WEB-18). Without days held ahead it is
   * computed once it is due.
   */
  private compute() {
    const state = gameStore.getSnapshot(),
      shown = state.view?.world,
      last = this.ahead.at(-1);
    if (this.inFlight || this.reads || state.processing || !shown || state.readonly || state.error)
      return;
    if (last?.stops) return;
    const head = last?.after ?? shown;
    if (head.critical || head.bankrupt) return;
    const depth = this.runAhead[this.store.getState().pace];
    if (this.ahead.length >= Math.max(depth, Date.now() >= this.due! ? 1 : 0)) return;
    // The day on screen may itself stop the clock: a start on a match eve.
    if (!last && this.eveStop(head)) return;
    void this.step(head);
  }
  /** One day computed ahead; it is shown on its turn. */
  private async step(before: World) {
    const reply = await this.send(before, 1);
    if (this.disposed) return;
    const world = reply?.ok ? reply.view?.world : undefined;
    const progress = this.store.getState();
    if (!world) {
      // An error or a refused step stops a running clock; a stop's cancelled request shows nothing.
      if (progress.running) this.stop();
      else this.drained();
    } else if (
      world.id !== this.worldId ||
      this.mode !== 'automatic' ||
      settingsOf(world).mode !== 'automatic'
    ) {
      // Another world or mode took over: what the step computed is shown and the clock stops.
      this.flush();
      this.draining = false;
      this.store.setState({ running: false });
      this.lock();
    } else if (this.hidden || (!progress.running && !this.draining)) {
      // Nobody waits for the pace: hidden, in the office or after a blocker it is shown at once,
      // and a stopped clock saves what it played.
      this.flush();
      if (!progress.running) this.client.saveSoon();
    } else void this.tick();
    this.summarize();
  }
  /**
   * Asks the engine for `days` from `before`; the client holds the day reached until it is shown,
   * and this keeps what showing it means beside it.
   */
  private async send(before: World, days: number) {
    const sending = { ms: PACE_MS[this.store.getState().pace] };
    this.inFlight = true;
    this.sending = sending;
    let reply: Awaited<ReturnType<GameClient['command']>>;
    try {
      reply = await this.client.command(command(days, before), {
        background: true,
        automatic: true,
      });
    } finally {
      this.inFlight = false;
      this.sending = undefined;
    }
    const after = reply?.ok ? reply.view?.world : undefined;
    if (after && after.id === this.worldId)
      this.ahead.push({
        before,
        after,
        ms: sending.ms,
        stops: this.stopsAt(before, after),
        at: Date.now(),
      });
    // A step that brought no day to show (refused, cancelled or failed) no longer holds a read.
    this.postReads();
    return reply;
  }
  /**
   * Whether a computed day stops the clock once shown: a new stopping event or pending decision,
   * a critical alert, bankruptcy or a match eve that stops for observation.
   */
  private stopsAt(before: World, after: World) {
    if (after.critical || after.bankrupt || freshEvent(before, after)) return true;
    const eve = pendingMatchReport(after);
    return !!eve && eve.id !== this.passedMatch;
  }
  /**
   * Shows the next computed day on its beat, or all of them at once; a read waiting for the last
   * of them goes then.
   */
  private reveal(all: boolean) {
    const days = this.ahead.splice(0, all ? this.ahead.length : 1);
    // The client no longer holds them when another load replaced its views.
    if (!days.length || !this.client.reveal(all)) return this.postReads();
    if (!all) {
      // The next day follows one interval after this one: after its turn when it was ready on
      // time, so a timer firing a little late does not slow the pace, else after it showed.
      const now = Date.now(),
        interval = this.interval(),
        due = this.due ?? now,
        late = days[0].at > due || now - due >= interval / 2;
      this.stepAt = now;
      this.due = (late ? now : due) + interval;
    }
    for (const day of days) this.shown(day, !all);
    this.writeClock();
    this.postReads();
  }
  /** Shows every computed day at once: in the office, as the tab hides and for a blocker. */
  private flush() {
    this.reveal(true);
  }
  /**
   * A computed day is on screen: it stops the clock where it would have without computing ahead,
   * and a day shown at the pace announces our result.
   */
  private shown({ before, after }: Held, paced: boolean) {
    // The client state stops the clock for these (constructor).
    if (after.critical || after.bankrupt) return;
    const running = this.store.getState().running,
      fresh = freshEvent(before, after);
    if (fresh) {
      if (running) {
        this.stop(fresh.title);
        this.resumeAfterEvents = true;
      } else {
        // A stopped clock now waits on the event, not on leaving the office or the match.
        this.store.setState({ reason: fresh.title });
        this.resumeAfterEvents = this.resumeAfterOffice;
        this.resumeAfterOffice = false;
        this.resumeAfterWatch = false;
      }
      if (fresh.kind === 'match') this.store.setState({ matchEve: fresh.ref });
      return;
    }
    if (running && !this.eveStop(after) && paced)
      this.announce(after, before.ownMatches.at(-1)?.id);
  }
  /** The owner's stop ends once every computed day is shown; its save holds that date (→SAVE-8). */
  private drained() {
    if (!this.draining || this.ahead.length || this.inFlight) return;
    this.draining = false;
    this.lock();
    this.client.saveSoon();
  }
  /**
   * Hidden or away: the days owed are played in steps, each shown as it lands, ending on news and
   * match days and stopping for the configured events (→WEB-64).
   */
  private async catchUp() {
    const state = gameStore.getSnapshot();
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
    this.returning = false;
    this.stepAt = Date.now();
    let debt = owed.days;
    while (debt > 0) {
      const days = owed.catchUp ? Math.min(debt, CATCH_UP_STEP_DAYS) : debt;
      const reply = await this.send(w, days);
      if (this.disposed) return;
      const next = reply?.ok ? reply.view?.world : undefined;
      if (!next) {
        if (this.store.getState().running) this.stop();
        break;
      }
      // Shown as it lands; a day that stops the clock stops it here.
      this.flush();
      if (
        reply!.cancelled ||
        next.id !== this.worldId ||
        this.mode !== 'automatic' ||
        settingsOf(next).mode !== 'automatic'
      ) {
        this.store.setState({ running: false });
        break;
      }
      // A season close skips the empty summer, which pays for those days too.
      debt -= Math.max(1, dayCountedFrom(next, w.year) - currentDay(w));
      w = next;
      if (!owed.catchUp || !this.store.getState().running || this.suspended) break;
    }
    // A shown tab's next day comes on the pace's next beat; a hidden tab keeps its next tick, and a
    // tick that came while the step ran is taken again.
    this.due = undefined;
    this.writeClock();
    const progress = this.store.getState();
    if (progress.running) {
      if (this.timer === undefined) this.wake(this.hidden ? PACE_MS[progress.pace] : 0);
    }
    // A stop that came while the step ran saved before the step landed; save what it played.
    else this.client.saveSoon();
    this.summarize();
  }
  /**
   * The step that played our fixture landed and its day is shown: with 경기 결과 알림 on, the
   * match record it added shows for RESULT_NOTICE_MS. A stopped clock or hidden tab announces nothing.
   */
  private announce(w: World, before: string | undefined) {
    const progress = this.store.getState(),
      latest = w.ownMatches.at(-1)?.id;
    if (!progress.running || this.hidden || !progress.background.resultNotice) return;
    if (!latest || latest === before) return;
    this.clearResultNotice();
    this.store.setState({ resultNotice: { matchId: latest } });
    this.noticeTimer = setTimeout(() => this.clearResultNotice(), RESULT_NOTICE_MS);
  }
  dispose() {
    // Leaving the page keeps the stored clock as it was, so a return can resume it.
    this.disposed = true;
    this.clearResultNotice();
    this.draining = false;
    this.store.setState({ running: false, reason: '' });
    if (this.inFlight) this.client.cancel();
    clearTimeout(this.timer);
    this.unsubscribe();
    this.unsubscribeClock();
    this.suspensionSources.clear();
    this.client.readGate = undefined;
    this.postReads();
  }
}
export function useProgression<T>(
  controller: ProgressionController,
  selector: (state: ProgressionState) => T,
) {
  return useStore(controller.store, selector);
}
