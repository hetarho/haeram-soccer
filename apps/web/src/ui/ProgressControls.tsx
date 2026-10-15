import { PixelIcon } from './PixelIcon';
import {
  currentDay,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { InterventionLevel } from '../../../../packages/contracts/src/types';
import { delegated, interventionOf } from '../../../../packages/engine/src/intervention';
import { transferWindow } from '../../../../packages/engine/src/transfers';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  AWAY_LIMITS,
  useProgression,
  type AwayLimit,
  type Pace,
  type ProgressionController,
} from '../runtime/progression';
import { Dialog } from './Dialog';
import { applyInterventionLevel, INTERVENTION_LEVELS, levelName } from './intervention';
import { play } from './motion';
import s from './App.module.css';
import p from './ProgressControls.module.css';

const PACES: [Pace, string, string][] = [
  ['x1', 'x1', '1초에 하루'],
  ['x2', 'x2', '0.5초에 하루'],
  ['x5', 'x5', '0.2초에 하루'],
  ['x10', 'x10', '0.1초에 하루'],
];

/** Game-speed controls: play starts the shared clock; a speed chip only sets its pace (→WEB-18). */
export const ProgressControls = memo(function ProgressControls({
  client,
  controller,
  compact = false,
  bare = false,
  className = '',
}: {
  client: GameClient;
  controller: ProgressionController;
  /** Away from home the same one-row clock keeps running, labelled as a whole for the region. */
  compact?: boolean;
  /** Buttons only, for rows that already say where the season stands (the match header). */
  bare?: boolean;
  className?: string;
}) {
  const state = useGameState((state) => state);
  const { running, pace, watching, reason } = useProgression(controller, (state) => state);
  const [levelsOpen, setLevelsOpen] = useState(false);
  // The level waits for the worker; until then the chosen one stands in so the label never
  // flickers back.
  const [chosen, setChosen] = useState<InterventionLevel>();
  const levelTrigger = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const acting = !!state.pendingActions || !!state.readonly;
  const level =
    chosen !== undefined && state.pendingActions ? chosen : interventionOf(state.view!.world);
  useEffect(() => {
    if (!state.pendingActions) setChosen(undefined);
  }, [state.pendingActions]);
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
      {!watching && (
        // Paces sit in one recessed track beside the play toggle: secondary, but each still
        // takes the track's full height as its touch area.
        <span className={p.paces} data-running={running || undefined}>
          {PACES.map(([value, label, description]) => (
            <button
              key={value}
              aria-label={`${description} 속도 선택`}
              aria-pressed={pace === value}
              className={p.pace}
              disabled={blocked || (!running && state.processing)}
              onClick={() => controller.setPace(value)}
            >
              {label}
            </button>
          ))}
        </span>
      )}
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
  const name = levelName(level);
  const closeLevels = (focusTrigger: boolean) => {
    setLevelsOpen(false);
    if (focusTrigger) levelTrigger.current?.focus({ preventScroll: true });
  };
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
      <button
        ref={levelTrigger}
        type="button"
        className={p.trigger}
        aria-label={`개입 수준 · ${name}`}
        aria-haspopup="dialog"
        aria-expanded={levelsOpen}
        aria-controls={levelsOpen ? popoverId : undefined}
        data-testid="intervention-trigger"
        onClick={() => (levelsOpen ? closeLevels(false) : setLevelsOpen(true))}
      >
        <span className={p.badge} aria-hidden="true">
          <LevelMeter level={level} />
          <b>개입 {level}</b>
        </span>
        <span className={p.triggerName} aria-hidden="true">
          {name}
        </span>
        <PixelIcon name="chevronDown" size={14} className={p.chevron} />
      </button>
      {levelsOpen && (
        <InterventionPopover
          id={popoverId}
          anchor={levelTrigger}
          level={level}
          acting={acting}
          onChoose={(next) => {
            if (acting) return;
            setChosen(next);
            void applyInterventionLevel(client, next);
            // The trigger shows the new level at once, so the choice itself is the confirmation.
            closeLevels(true);
          }}
          onClose={closeLevels}
        />
      )}
    </section>
  );
});

/** Four bars: the more lit, the more the owner decides personally. */
function LevelMeter({ level }: { level: InterventionLevel }) {
  const lit = INTERVENTION_LEVELS.length + 1 - level;
  return (
    <span className={p.meter}>
      {INTERVENTION_LEVELS.map((_, bar) => (
        <i key={bar} className={bar < lit ? p.lit : undefined} />
      ))}
    </span>
  );
}

/**
 * The quick level picker anchored under the clock's trigger. It sits in the top layer so the
 * clock row's clipping never cuts it, never pauses the clock, and closes once a level is chosen
 * or on Escape (both hand focus back to the trigger), an outside tap, focus leaving it or any
 * modal sheet opening.
 */
function InterventionPopover({
  id,
  anchor,
  level,
  acting,
  onChoose,
  onClose,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  level: InterventionLevel;
  acting: boolean;
  onChoose: (level: InterventionLevel) => void;
  onClose: (focusTrigger: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [focused, setFocused] = useState(level - 1);
  useLayoutEffect(() => {
    const popup = panel.current!;
    const layered = typeof popup.showPopover === 'function';
    if (layered) popup.showPopover();
    const place = () => {
      const target = anchor.current;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      // Right edges line up with the trigger, but never closer than 8px to the screen edge.
      const right = Math.max(8, width - rect.right);
      const top = rect.bottom + 8;
      popup.style.top = `${top}px`;
      popup.style.right = `${right}px`;
      popup.style.setProperty('--room', `${Math.max(160, innerHeight - top - 12)}px`);
      popup.style.setProperty(
        '--caret',
        `${Math.max(14, width - right - (rect.left + rect.width / 2) - 7)}px`,
      );
    };
    place();
    play(
      popup,
      [
        { opacity: 0, transform: 'translateY(-6px) scale(0.96)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 180 },
    );
    const radios = Array.from(popup.querySelectorAll<HTMLElement>('[role="radio"]'));
    (radios.find((radio) => radio.getAttribute('aria-checked') === 'true') || radios[0])?.focus({
      preventScroll: true,
    });
    const away = (event: Event) => {
      const target = event.target as Node;
      if (!popup.contains(target) && !anchor.current?.contains(target)) close.current(false);
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close.current(true);
    };
    const sheet = (event: Event) => {
      if ((event as CustomEvent<{ open: boolean }>).detail?.open) close.current(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.addEventListener('haeram:dialog', sheet);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('focusin', away);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.removeEventListener('haeram:dialog', sheet);
      if (layered && popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [anchor]);
  // Arrows only move focus: choosing sends staff commands, so Enter or Space commits a level.
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const count = INTERVENTION_LEVELS.length;
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : step === undefined
            ? undefined
            : (focused + step + count) % count;
    if (target === undefined) return;
    event.preventDefault();
    setFocused(target);
    panel.current
      ?.querySelectorAll<HTMLElement>('[role="radio"]')
      [target]?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={panel}
      id={id}
      className={p.popover}
      popover="manual"
      role="dialog"
      aria-label="개입 수준 빠른 선택"
      data-testid="intervention-popover"
    >
      <div className={p.popoverBody}>
        <header className={p.popoverHead}>
          <b>개입 수준</b>
          <small>아래로 갈수록 감독과 스태프가 더 많이 맡아요</small>
        </header>
        <div className={p.choices} role="radiogroup" aria-label="개입 수준" onKeyDown={move}>
          {INTERVENTION_LEVELS.map((choice, index) => (
            <button
              key={choice.name}
              type="button"
              role="radio"
              className={p.choice}
              aria-checked={level === choice.level}
              aria-disabled={acting || undefined}
              tabIndex={index === focused ? 0 : -1}
              onFocus={() => setFocused(index)}
              onClick={() => onChoose(choice.level)}
            >
              <LevelMeter level={choice.level} />
              <span className={p.choiceText}>
                <b>
                  {choice.level}. {choice.name}
                </b>
                <small>{choice.short}</small>
              </span>
              <i className={p.radio} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * How much the owner steps in (→WEB-45): one level sets the stops and what the staff decide, with
 * background play beside it (→WEB-64).
 */
export function InterventionSettings({
  client,
  controller,
  onClose,
}: {
  client: GameClient;
  controller: ProgressionController;
  onClose: () => void;
}) {
  const background = useProgression(controller, (state) => state.background);
  const w = useGameState((state) => state.view?.world);
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  if (!w) return null;
  const current = interventionOf(w);
  return (
    <Dialog label="개입 수준" onClose={onClose}>
      <p className={s.muted}>
        구단 전체의 결정 권한과 자동 진행이 멈추는 조건을 함께 바꿔요. 훈련 방향은 어느 단계에서나
        코치가 정하고, 구단주는 제안하거나 강행할 수 있어요.
      </p>
      <table className={s.responsibilities} aria-label="현재 구단 결정 담당">
        <thead>
          <tr>
            <th>업무</th>
            <th>현재 담당</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['academy', '유소년 승격·방출'],
              ['contracts', '선수 계약 협상'],
              ['transfers', '이적·영입'],
              ['manager', '감독 선임'],
              ['coach:assistant', '스태프 선임'],
              ['business', '후원'],
            ] as const
          ).map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{delegated(w, key) ? '운영진 자동 결정' : '구단주 직접 결정'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={s.levels} role="radiogroup" aria-label="개입 수준">
        {INTERVENTION_LEVELS.map(({ level, name, summary }) => (
          <button
            key={name}
            role="radio"
            aria-checked={current === level}
            className={current === level ? s.levelOn : undefined}
            disabled={acting}
            onClick={() => void applyInterventionLevel(client, level)}
          >
            <span className={s.levelMeter} aria-hidden="true">
              {INTERVENTION_LEVELS.map((_, dot) => (
                <i key={dot} className={dot <= INTERVENTION_LEVELS.length - level ? s.dotOn : ''} />
              ))}
            </span>
            <b>
              {level}. {name}
            </b>
            <small>{summary}</small>
          </button>
        ))}
      </div>
      <p className={s.muted}>
        각 화면의 기준(계약 협상·코치 선임·감독 선임 등)은 언제든 바꿀 수 있고, 개입 수준이 그
        결정을 스태프에게 맡길 때만 쓰여요.
      </p>
      <section className={p.background} aria-label="백그라운드 진행">
        <h3>백그라운드 진행</h3>
        <div className={s.toggles}>
          <label>
            <input
              type="checkbox"
              checked={background.hidden}
              onChange={(event) => controller.setBackground({ hidden: event.target.checked })}
            />
            다른 탭을 보거나 창을 내려도 계속 진행
          </label>
        </div>
        <span className={p.awayLabel} id="away-limit-label">
          창을 닫았다 다시 열면 비운 시간만큼 진행
        </span>
        <div className={p.awayChoices} role="radiogroup" aria-labelledby="away-limit-label">
          {(Object.keys(AWAY_LIMITS) as AwayLimit[]).map((limit) => (
            <button
              key={limit}
              type="button"
              role="radio"
              aria-checked={background.away === limit}
              onClick={() => controller.setBackground({ away: limit })}
            >
              {AWAY_LIMITS[limit]}
            </button>
          ))}
        </div>
        <p className={s.muted}>
          브라우저가 절전 모드나 휴대폰 백그라운드에서 탭을 재우면 그동안은 멈춰요. 다시 열면 비운
          시간만큼 위 한도까지 한꺼번에 진행하고, 무슨 일이 있었는지 요약해 드려요. 개입 수준의
          멈춤은 그대로 지켜요. 방치형으로 두려면 4단계 운영진에 모두 맡기기를 고르세요. 경기
          전날에도 멈추지 않아요.
        </p>
      </section>
      <div className={s.actions}>
        <button className={s.primary} onClick={onClose}>
          설정 완료
        </button>
      </div>
    </Dialog>
  );
}
