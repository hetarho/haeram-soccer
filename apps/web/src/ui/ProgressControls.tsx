import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { pendingDecisions } from '../../../../packages/engine/src/stopping';
import { Select } from './Select';
import { PixelIcon } from './PixelIcon';
import { currentDay, seasonDate, seasonLength } from '../../../../packages/engine/src/calendar';
import { memo, useEffect, useRef } from 'react';
import { gameActionsBlocked, useGameState } from '../runtime/store';
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
import p from './ProgressControls.module.css';

const PACES: [Pace, string, string][] = [
  ['x1', 'x1', '1초에 하루'],
  ['x2', 'x2', '0.5초에 하루'],
  ['x5', 'x5', '0.2초에 하루'],
  ['x10', 'x10', '0.1초에 하루'],
];

/** Calendar information stays near the HUD while transport stays below the scrolling view. */
export const ProgressOverview = memo(function ProgressOverview({
  client,
  controller,
  compact = false,
}: {
  client: GameClient;
  controller: ProgressionController;
  compact?: boolean;
}) {
  const w = useGameState((state) => state.view!.world);
  const { t } = useLocale();
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  const manual = settingsOf(w).mode === 'manual';
  const round = ownDivisionRound(w);
  return (
    <section
      className={p.overview}
      aria-label="시즌 정보"
      data-testid={compact ? 'mini-clock' : undefined}
    >
      <div className={p.calendarSummary} data-testid="calendar" data-season={w.year}>
        <small>
          {w.lower ? t('shell.amateurLeague') : t('shell.division', { division: club.tier + 1 })}
        </small>
        <span data-testid="game-date">{seasonDate(w)}</span>
      </div>
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
      {compact ? (
        <span className={p.modeStatus}>{manual ? 'MANUAL · 수동 진행' : 'AUTO · 자동 진행'}</span>
      ) : (
        <ProgressModeSwitch client={client} controller={controller} />
      )}
    </section>
  );
});

/** Play starts the shared clock; the dropdown only sets its pace (→WEB-18). */
export const ProgressControls = memo(function ProgressControls({
  controller,
}: {
  controller: ProgressionController;
}) {
  const state = useGameState((state) => state);
  const { running, pace, reason } = useProgression(controller, (state) => state);
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
  const pending = pendingDecisions(w).length > 0;
  const blocked = !!(state.readonly || state.error || w.critical || w.bankrupt);
  const detail = PACES.find(([value]) => value === pace)![2];
  const status = running
    ? `진행 중 · ${detail}`
    : manual
      ? '수동 진행 · 다음 이벤트를 선택하세요'
      : reason || '재생하면 날짜가 흐릅니다';
  const buttons = manual ? (
    <div className={p.buttons} role="group" aria-label="수동 진행">
      <button
        disabled={gameActionsBlocked(state) || blocked || (pending && !pendingMatchReport(w))}
        onClick={() => void controller.nextEvent()}
      >
        다음 이벤트
      </button>
    </div>
  ) : (
    <div className={p.buttons} role="group" aria-label="자동 진행 속도">
      <button
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
  return (
    <section className={`${p.controls} ${running ? p.running : ''}`} aria-label="시즌 진행">
      <div className={p.transportSummary}>
        <small className={p.status} aria-live="polite" aria-atomic="true">
          {status}
        </small>
      </div>
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
