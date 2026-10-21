import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { pendingDecisions } from '../../../../packages/engine/src/stopping';
import { Select } from './Select';
import { CommunicationsButton } from './EventCenter';
import {
  currentDay,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import { memo, useEffect, useRef } from 'react';
import { useGameState } from '../runtime/store';
import { useProgression, type Pace, type ProgressionController } from '../runtime/progression';
import { transferWindow } from '../../../../packages/engine/src/transfers';
import { useInterventionDialog } from './state';
import s from './App.module.css';
import p from './ProgressControls.module.css';

const PACES: [Pace, string, string][] = [
  ['x1', 'x1', '1초에 하루'],
  ['x2', 'x2', '0.5초에 하루'],
  ['x5', 'x5', '0.2초에 하루'],
  ['x10', 'x10', '0.1초에 하루'],
];

/** Game-speed controls: play starts the shared clock; the dropdown only sets its pace (→WEB-18). */
export const ProgressControls = memo(function ProgressControls({
  controller,
  compact = false,
}: {
  controller: ProgressionController;
  /** Away from home the same one-row clock keeps running, labelled as a whole for the region. */
  compact?: boolean;
}) {
  const state = useGameState((state) => state);
  const { running, pace, watching, reason } = useProgression(controller, (state) => state);
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
  const next = nextOwnFixture(w);
  const days = daysUntilNextMatch(w);
  const blocked = !!(state.readonly || state.error || w.critical || w.bankrupt);
  const detail = PACES.find(([value]) => value === pace)![2];
  const status = running
    ? watching
      ? '자동 관전 중 · 경기 후 다음 경기'
      : `진행 중 · ${detail}`
    : reason ||
      (next
        ? `${days ? `다음 경기 D-${days}` : '오늘 경기'} · ${transferWindow(w).label}`
        : '시즌 정산을 기다려요');
  const buttons = manual ? (
    <div className={`${s.clockButtons} ${p.buttons}`} role="group" aria-label="수동 진행">
      <button
        disabled={blocked || state.processing || pending}
        onClick={() => void controller.nextEvent()}
      >
        다음 이벤트
      </button>
    </div>
  ) : (
    <div className={`${s.clockButtons} ${p.buttons}`} role="group" aria-label="자동 진행 속도">
      <button
        className={`${s.clockToggle} ${running ? s.clockPause : ''}`}
        aria-label={running ? '자동 진행 정지' : '자동 진행 시작'}
        disabled={!running && (blocked || state.processing)}
        onClick={() => {
          if (running) {
            userStop.current = true;
            controller.pause();
          } else if (performance.now() - autoStoppedAt.current >= 500) controller.start();
        }}
      >
        <span aria-hidden="true" />
      </button>
      {!watching && (
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
      )}
    </div>
  );
  // One packed row on every view: where the season stands on the left, the speed buttons right.
  const progress = Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 1000) / 10;
  return (
    <section
      className={`${s.seasonControls} ${p.controls} ${running ? s.clockRunning : ''}`}
      aria-label={compact ? `시즌 진행 · ${seasonDate(w)} · ${status}` : '시즌 진행'}
      data-testid={compact ? 'mini-clock' : undefined}
    >
      <div className={s.calendarSummary}>
        <strong data-testid="game-date">{seasonDate(w)}</strong>
        <small className={s.autoStatus} aria-live="polite" aria-atomic="true">
          {status}
        </small>
      </div>
      <i
        className={s.seasonProgress}
        role="progressbar"
        aria-label="시즌 경과 일수"
        aria-valuenow={currentDay(w)}
        aria-valuemin={0}
        aria-valuemax={seasonLength(w)}
        style={{ width: `${progress}%` }}
      />
      {buttons}
      <div className={p.settingsActions} role="group" aria-label="설정과 알림">
        <button
          type="button"
          className={p.trigger}
          aria-label="위임·진행 설정"
          aria-haspopup="dialog"
          data-testid="intervention-trigger"
          onClick={useInterventionDialog.getState().show}
        >
          <b>설정</b>
        </button>
        <CommunicationsButton />
      </div>
    </section>
  );
});
