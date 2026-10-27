import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { pendingDecisions } from '../../../../packages/engine/src/stopping';
import { Select } from './Select';
import { PixelIcon } from './PixelIcon';
import { currentDay, seasonDate, seasonLength } from '../../../../packages/engine/src/calendar';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { useUnfinishedPlayback } from '../runtime/matchView';
import {
  pendingMatchReport,
  useProgression,
  type Pace,
  type ProgressionController,
} from '../runtime/progression';
import type { GameClient } from '../runtime/client';
import { ProgressModeSwitch } from './ProgressModeSwitch';
import { ownDivisionRound } from './league';
import { useLocale } from '../presentation/react';
import { Dialog } from './Dialog';
import p from './ProgressControls.module.css';

// The result notice's report loads only when opened, outside the main chunk (→ARCH-28).
const MatchReport = lazy(() =>
  import('./MatchReport').then((module) => ({ default: module.MatchReport })),
);

const PACES: [Pace, string, string][] = [
  ['x1', 'x1', '1초에 하루'],
  ['x2', 'x2', '0.5초에 하루'],
  ['x5', 'x5', '0.2초에 하루'],
  ['x10', 'x10', '0.1초에 하루'],
];

/**
 * Calendar information stays near the HUD while transport stays below the scrolling view. Home
 * reads the round in its season card (→WEB-11), so only other views show it here.
 */
export const ProgressOverview = memo(function ProgressOverview({
  compact = false,
}: {
  compact?: boolean;
}) {
  const w = useGameState((state) => state.view!.world);
  const { t } = useLocale();
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  const round = compact ? ownDivisionRound(w) : undefined;
  return (
    <section
      className={p.overview}
      data-ui="season-overview"
      aria-label="시즌 정보"
      data-testid={compact ? 'mini-clock' : undefined}
    >
      <header
        className={p.calendarSummary}
        data-ui="calendar-header"
        data-testid="calendar"
        data-season={w.year}
      >
        <small>
          {w.lower ? t('shell.amateurLeague') : t('shell.division', { division: club.tier + 1 })}
        </small>
        <span data-testid="game-date">{seasonDate(w)}</span>
      </header>
      {round && (
        <div
          className={p.round}
          aria-label={`우리 리그 ${round.total}라운드 중 ${round.played}라운드`}
        >
          <small>ROUND</small>
          <strong data-testid="game-round">{round.played}</strong>
          <small className={p.roundTotal} data-testid="game-round-total">
            / {round.total}
          </small>
        </div>
      )}
    </section>
  );
});

/** Play starts the shared clock; the dropdown only sets its pace (→WEB-18). */
export const ProgressControls = memo(function ProgressControls({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const state = useGameState((state) => state);
  const { running, pace, resultNotice } = useProgression(controller, (state) => state);
  const [report, setReport] = useState<string>();
  // When the clock stops itself (e.g. at a match eve) the toggle flips from stop to start; a
  // click landing just after that was aimed at the old label, so it must not start the clock.
  const userStop = useRef(false);
  const wasRunning = useRef(running);
  // Never stopped yet: a play right after the page opens counts (performance.now() starts at 0).
  const autoStoppedAt = useRef(-Infinity);
  useEffect(() => {
    if (wasRunning.current && !running && !userStop.current)
      autoStoppedAt.current = performance.now();
    userStop.current = false;
    wasRunning.current = running;
  }, [running]);
  const w = state.view!.world;
  const mode = settingsOf(w).mode;
  const manual = mode === 'manual';
  const unfinished = useUnfinishedPlayback();
  const pending = pendingDecisions(w).length > 0;
  const blocked = !!(state.readonly || state.error || w.critical || w.bankrupt);
  const buttons = manual ? (
    <div className={p.buttons} role="group" aria-label="수동 진행">
      <button
        data-ui="link"
        className={p.nextEvent}
        disabled={
          gameActionsBlocked(state) || blocked || (pending && !unfinished && !pendingMatchReport(w))
        }
        onClick={() => void controller.nextEvent()}
      >
        다음 이벤트
        <PixelIcon name="chevronRight" size={16} />
      </button>
    </div>
  ) : (
    <div className={p.buttons} role="group" aria-label="자동 진행 속도">
      <button
        data-ui="icon"
        className={`${p.toggle} ${running ? p.pause : ''}`}
        aria-label={running ? '자동 진행 정지' : '자동 진행 시작'}
        disabled={!running && (blocked || gameActionsBlocked(state))}
        onClick={() => {
          if (running) {
            userStop.current = true;
            controller.pause();
          } else if (performance.now() - autoStoppedAt.current >= 500) controller.start();
        }}
      >
        <PixelIcon name={running ? 'pause' : 'play'} size={16} />
      </button>
      <Select
        className={p.pace}
        aria-label="자동 진행 배속"
        value={pace}
        disabled={blocked || (!running && state.processing)}
        onValueChange={(value) => controller.setPace(value as Pace)}
      >
        {PACES.map(([value, label, description]) => (
          <option key={value} value={value} data-hint={description}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
  // Progression stays local to this row; global news lives in the HUD.
  const progress = Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 1000) / 10;
  const noticed = resultNotice && w.ownMatches.find((m) => m.id === resultNotice.matchId);
  const opened = report !== undefined ? w.ownMatches.find((m) => m.id === report) : undefined;
  const name = (id: string) => w.clubs.find((club) => club.id === id)?.name ?? id;
  return (
    <section className={p.controls} data-ui="season-transport" aria-label="시즌 진행">
      <div className={p.modeGroup}>
        <ProgressModeSwitch client={client} controller={controller} />
        <span
          className={p.modeStatus}
          data-testid="progression-mode"
          aria-label={`현재 진행 방식: ${manual ? '수동' : '자동'}`}
          aria-live="polite"
        >
          {manual ? 'MANUAL' : 'AUTO'}
        </span>
      </div>
      {noticed && (
        <button
          className={p.resultNotice}
          data-testid="result-notice"
          onClick={() => {
            setReport(noticed.id);
            controller.clearResultNotice();
          }}
        >
          {name(noticed.home)} {noticed.score.home}–{noticed.score.away} {name(noticed.away)}
        </button>
      )}
      {opened && (
        <Dialog label="경기 분석" onClose={() => setReport(undefined)} wide>
          <Suspense fallback={<p role="status">경기 기록을 펼치는 중…</p>}>
            <MatchReport record={opened} w={w} />
          </Suspense>
        </Dialog>
      )}
      <i
        className={p.progress}
        role="progressbar"
        aria-label="시즌 경과 일수"
        aria-valuenow={currentDay(w)}
        aria-valuemin={0}
        aria-valuemax={seasonLength(w)}
        style={{ width: `${progress}%` }}
      />
      {buttons}
    </section>
  );
});
