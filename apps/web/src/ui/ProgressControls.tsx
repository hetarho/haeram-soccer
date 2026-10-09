import {
  currentDay,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import { useEffect, useRef, useState } from 'react';
import type { DelegationKey, InboxKind, World } from '../../../../packages/contracts/src/types';
import { transferWindow } from '../../../../packages/engine/src/transfers';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  STOP_LABELS,
  useProgression,
  type Pace,
  type ProgressionController,
  type StopOn,
} from '../runtime/progression';
import { Dialog } from './Dialog';
import s from './App.module.css';

const PACES: [Pace, string, string][] = [
  ['daily', '1일', '1초에 하루'],
  ['three-days', '3일', '1초에 3일'],
  ['five-days', '5일', '1초에 5일'],
];

/** Game-speed controls: tapping a speed starts the shared clock at that pace. */
export function ProgressControls({
  client,
  controller,
  compact = false,
  bare = false,
  className = '',
}: {
  client: GameClient;
  controller: ProgressionController;
  /** Away from home the same one-row clock keeps running, without the intervention gear. */
  compact?: boolean;
  /** Buttons only, for rows that already say where the season stands (the match header). */
  bare?: boolean;
  className?: string;
}) {
  const state = useGameState((state) => state);
  const { running, pace, watching, reason, stopOn } = useProgression(controller, (state) => state);
  const [settings, setSettings] = useState(false);
  const level = interventionLevel(stopOn, state.view!.world);
  // When the clock stops itself (e.g. at a match eve) the toggle flips from stop to start; a
  // click landing just after that was aimed at the old label, so it must not start the clock.
  const userStop = useRef(false);
  const wasRunning = useRef(running);
  const autoStoppedAt = useRef(0);
  useEffect(() => {
    if (wasRunning.current && !running && !userStop.current)
      autoStoppedAt.current = performance.now();
    userStop.current = false;
    wasRunning.current = running;
  }, [running]);
  const w = state.view!.world;
  const next = nextOwnFixture(w);
  const days = daysUntilNextMatch(w);
  const blocked = !!(state.readonly || state.error || w.critical);
  const detail = PACES.find(([value]) => value === pace)![2];
  const status = running
    ? watching
      ? '자동 관전 중 · 경기 후 다음 경기'
      : `진행 중 · ${detail}`
    : reason ||
      (next
        ? `${days ? `다음 경기 D-${days}` : '오늘 경기'} · ${transferWindow(w).label}`
        : '시즌 정산을 기다려요');
  const buttons = (
    <div className={s.clockButtons} role="group" aria-label="자동 진행 속도">
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
      {!watching &&
        PACES.map(([value, label, description]) => (
          <button
            key={value}
            aria-label={`${description} 속도로 자동 진행`}
            aria-pressed={pace === value}
            className={pace === value ? s.selectedPace : undefined}
            disabled={blocked || (!running && state.processing)}
            onClick={() => {
              controller.setPace(value);
              if (!running) controller.start();
            }}
          >
            {label}
          </button>
        ))}
    </div>
  );
  if (bare)
    return (
      <section
        className={`${s.miniClock} ${running ? s.clockRunning : ''} ${className}`}
        data-testid="mini-clock"
        aria-label={`시즌 진행 · ${seasonDate(w)} · ${status}`}
      >
        <span className={s.srOnly} data-testid="game-date">
          {seasonDate(w)}
        </span>
        {buttons}
      </section>
    );
  // One packed row on every view: where the season stands on the left, the speed buttons right.
  const progress = Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 1000) / 10;
  return (
    <section
      className={`${s.seasonControls} ${running ? s.clockRunning : ''} ${className}`}
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
      {compact ? null : (
        <button
          className={s.interventionButton}
          aria-label={`개입 수준 · ${level >= 0 ? INTERVENTION_LEVELS[level].name : '사용자 지정'}`}
          onClick={(event) => {
            event.currentTarget.focus();
            setSettings(true);
          }}
        >
          <span aria-hidden="true">⚙</span>
          <i aria-hidden="true">{level >= 0 ? level + 1 : '·'}</i>
        </button>
      )}
      {settings && (
        <InterventionSettings
          client={client}
          controller={controller}
          onClose={() => setSettings(false)}
        />
      )}
    </section>
  );
}

const ALL_KINDS = Object.keys(STOP_LABELS) as InboxKind[];
const stops = (on: InboxKind[]): StopOn =>
  Object.fromEntries(ALL_KINDS.map((kind) => [kind, on.includes(kind)])) as StopOn;
/** From watching every decision to leaving the whole club to the manager and staff. */
export const INTERVENTION_LEVELS: {
  name: string;
  summary: string;
  stopOn: StopOn;
  delegation: Record<DelegationKey, boolean>;
}[] = [
  {
    name: '모든 결정 확인',
    summary:
      '경기 전날, 이적시장, 협상, 영입 제안, 유소년, 스태프 보고, 자금 경고까지 모두 멈춰서 직접 결정해요.',
    stopOn: stops(ALL_KINDS),
    delegation: { training: false, academy: false, transfers: false, business: false },
  },
  {
    name: '중요한 결정만',
    summary:
      '경기 전날과 이적 협상·제안, 유소년 입단, 자금 경고에서만 멈춰요. 훈련과 유소년 승격은 스태프가 맡아요.',
    stopOn: stops([
      'match',
      'window-open',
      'bid-response',
      'incoming-bid',
      'youth-intake',
      'finance',
    ]),
    delegation: { training: true, academy: true, transfers: false, business: false },
  },
  {
    name: '이적만 직접',
    summary:
      '경기는 결과로 넘기고 이적시장 개장과 협상·제안, 자금 경고에서만 멈춰요. 훈련과 유소년은 스태프가 맡아요.',
    stopOn: stops(['window-open', 'bid-response', 'incoming-bid', 'finance']),
    delegation: { training: true, academy: true, transfers: false, business: false },
  },
  {
    name: '운영진에 모두 맡기기',
    summary:
      '감독과 스태프가 경기·훈련·유소년·영입 제안·후원 계약까지 처리하고, 자금 경고에서만 멈춰요. 결과는 소식함에 남아요.',
    stopOn: stops(['finance']),
    delegation: { training: true, academy: true, transfers: true, business: true },
  },
];
/** The level matching the current stops and delegation, or -1 for a custom mix. */
export function interventionLevel(stopOn: StopOn, w: World) {
  return INTERVENTION_LEVELS.findIndex(
    (level) =>
      ALL_KINDS.every((kind) => level.stopOn[kind] === stopOn[kind]) &&
      (Object.keys(level.delegation) as DelegationKey[]).every(
        (key) => level.delegation[key] === !!w.delegation?.[key],
      ),
  );
}

/** How much the owner steps in: one choice sets stops and staff delegation together. */
export function InterventionSettings({
  client,
  controller,
  onClose,
}: {
  client: GameClient;
  controller: ProgressionController;
  onClose: () => void;
}) {
  const stopOn = useProgression(controller, (state) => state.stopOn);
  const w = useGameState((state) => state.view?.world);
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  if (!w) return null;
  const current = interventionLevel(stopOn, w);
  const choose = (index: number) => {
    const level = INTERVENTION_LEVELS[index];
    controller.setStopOnAll(level.stopOn);
    for (const key of Object.keys(level.delegation) as DelegationKey[])
      if (!!w.delegation?.[key] !== level.delegation[key])
        void client.command({ type: 'delegate', key, value: level.delegation[key] });
  };
  return (
    <Dialog label="개입 수준" onClose={onClose}>
      <p className={s.muted}>
        구단주가 얼마나 직접 결정할지 골라요. 아래로 갈수록 감독과 스태프가 더 많이 맡아요.
      </p>
      <div className={s.levels} role="radiogroup" aria-label="개입 수준">
        {INTERVENTION_LEVELS.map((level, index) => (
          <button
            key={level.name}
            role="radio"
            aria-checked={current === index}
            className={current === index ? s.levelOn : undefined}
            disabled={acting}
            onClick={() => choose(index)}
          >
            <span className={s.levelMeter} aria-hidden="true">
              {INTERVENTION_LEVELS.map((_, dot) => (
                <i
                  key={dot}
                  className={dot <= INTERVENTION_LEVELS.length - 1 - index ? s.dotOn : ''}
                />
              ))}
            </span>
            <b>
              {index + 1}. {level.name}
            </b>
            <small>{level.summary}</small>
          </button>
        ))}
      </div>
      {current < 0 && <p className={s.muted}>지금은 세부 설정으로 고른 사용자 지정 상태예요.</p>}
      <details className={s.detailStops}>
        <summary>이벤트별 세부 설정</summary>
        <div className={s.toggles}>
          {ALL_KINDS.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={stopOn[kind]}
                onChange={(event) => controller.setStopOn(kind, event.target.checked)}
              />
              {STOP_LABELS[kind]}에서 멈춤
            </label>
          ))}
        </div>
      </details>
      <div className={s.actions}>
        <button className={s.primary} onClick={onClose}>
          설정 완료
        </button>
      </div>
    </Dialog>
  );
}
