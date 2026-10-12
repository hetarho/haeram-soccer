import {
  currentDay,
  daysUntilNextMatch,
  nextOwnFixture,
  seasonDate,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { DelegationKey, InboxKind, World } from '../../../../packages/contracts/src/types';
import { transferWindow } from '../../../../packages/engine/src/transfers';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  AWAY_LIMITS,
  STOP_LABELS,
  useProgression,
  type AwayLimit,
  type Pace,
  type ProgressionController,
  type StopOn,
} from '../runtime/progression';
import { Dialog } from './Dialog';
import { play } from './motion';
import s from './App.module.css';
import p from './ProgressControls.module.css';

const PACES: [Pace, string, string][] = [
  ['x1', 'x1', '1초에 하루'],
  ['x2', 'x2', '0.5초에 하루'],
  ['x5', 'x5', '0.2초에 하루'],
  ['x10', 'x10', '0.1초에 하루'],
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
  /** Away from home the same one-row clock keeps running, labelled as a whole for the region. */
  compact?: boolean;
  /** Buttons only, for rows that already say where the season stands (the match header). */
  bare?: boolean;
  className?: string;
}) {
  const state = useGameState((state) => state);
  const { running, pace, watching, reason, stopOn } = useProgression(controller, (state) => state);
  const [settings, setSettings] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  // The stops change at once but delegation waits for the worker; until then the chosen level
  // stands in for the brief "custom" mix so the label and the check never flicker.
  const [chosen, setChosen] = useState<number>();
  const levelTrigger = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const acting = !!state.pendingActions || !!state.readonly;
  const matched = interventionLevel(stopOn, state.view!.world);
  const level = matched < 0 && chosen !== undefined && state.pendingActions ? chosen : matched;
  useEffect(() => {
    if (!state.pendingActions) setChosen(undefined);
  }, [state.pendingActions]);
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
              aria-label={`${description} 속도로 자동 진행`}
              aria-pressed={pace === value}
              className={p.pace}
              disabled={blocked || (!running && state.processing)}
              onClick={() => {
                controller.setPace(value);
                if (!running) controller.start();
              }}
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
  const levelName = level >= 0 ? INTERVENTION_LEVELS[level].name : '사용자 지정';
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
        aria-label={`개입 수준 · ${levelName}`}
        aria-haspopup="dialog"
        aria-expanded={levelsOpen}
        aria-controls={levelsOpen ? popoverId : undefined}
        data-testid="intervention-trigger"
        onClick={() => (levelsOpen ? closeLevels(false) : setLevelsOpen(true))}
      >
        <span className={p.badge} aria-hidden="true">
          <LevelMeter level={level} />
          <b>개입 {level >= 0 ? level + 1 : '·'}</b>
        </span>
        <span className={p.triggerName} aria-hidden="true">
          {levelName}
        </span>
        <svg className={p.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {levelsOpen && (
        <InterventionPopover
          id={popoverId}
          anchor={levelTrigger}
          level={level}
          acting={acting}
          onChoose={(index) => {
            if (acting) return;
            setChosen(index);
            applyInterventionLevel(client, controller, w, index);
            // The trigger shows the new level at once, so the choice itself is the confirmation.
            closeLevels(true);
          }}
          onDetails={() => {
            // The dialog hands focus back to the trigger, not to the vanished popover.
            levelTrigger.current?.focus({ preventScroll: true });
            setLevelsOpen(false);
            setSettings(true);
          }}
          onClose={closeLevels}
        />
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

/** Four bars: the more lit, the more the owner decides personally; none for a custom mix. */
function LevelMeter({ level }: { level: number }) {
  const lit = level >= 0 ? INTERVENTION_LEVELS.length - level : 0;
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
  onDetails,
  onClose,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  level: number;
  acting: boolean;
  onChoose: (index: number) => void;
  onDetails: () => void;
  onClose: (focusTrigger: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [focused, setFocused] = useState(Math.max(0, level));
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
              aria-checked={level === index}
              aria-disabled={acting || undefined}
              tabIndex={index === focused ? 0 : -1}
              onFocus={() => setFocused(index)}
              onClick={() => onChoose(index)}
            >
              <LevelMeter level={index} />
              <span className={p.choiceText}>
                <b>
                  {index + 1}. {choice.name}
                </b>
                <small>{choice.short}</small>
              </span>
              <i className={p.radio} aria-hidden="true" />
            </button>
          ))}
        </div>
        {level < 0 && <p className={p.custom}>지금은 세부 설정으로 고른 사용자 지정 상태예요.</p>}
        <button type="button" className={p.details} onClick={onDetails}>
          세부 설정…
        </button>
      </div>
    </div>
  );
}

const ALL_KINDS = Object.keys(STOP_LABELS) as InboxKind[];
const stops = (on: InboxKind[]): StopOn =>
  Object.fromEntries(ALL_KINDS.map((kind) => [kind, on.includes(kind)])) as StopOn;
/** From watching every decision to leaving the whole club to the manager and staff. */
export const INTERVENTION_LEVELS: {
  name: string;
  /** One line for the clock's quick picker. */
  short: string;
  summary: string;
  stopOn: StopOn;
  delegation: Record<DelegationKey, boolean>;
}[] = [
  {
    name: '모든 결정 확인',
    short: '모든 이벤트에서 멈추고 직접 결정해요',
    summary:
      '경기 전날, 이적시장, 협상, 영입 제안, 유소년, 컵 대진, 스태프 보고, 감독·코치 재계약, 자금 경고까지 모두 멈춰서 직접 결정해요.',
    stopOn: stops(ALL_KINDS),
    delegation: {
      training: false,
      academy: false,
      transfers: false,
      business: false,
      staff: false,
      contracts: false,
      manager: false,
    },
  },
  {
    name: '중요한 결정만',
    short: '경기·이적·유소년·코치·자금에서 멈춰요',
    summary:
      '경기 전날과 이적 협상·제안, 유소년 입단, 감독·코치 재계약, 자금·후원 경고에서만 멈춰요. 훈련, 유소년 승격과 선수 재계약 협상은 스태프가 맡아요.',
    stopOn: stops([
      'match',
      'window-open',
      'bid-response',
      'incoming-bid',
      'youth-intake',
      'staff-renewal',
      'finance',
      'sponsor-ending',
    ]),
    delegation: {
      training: true,
      academy: true,
      transfers: false,
      business: false,
      staff: false,
      contracts: true,
      manager: false,
    },
  },
  {
    name: '이적만 직접',
    short: '이적·재계약·자금에서만 멈춰요',
    summary:
      '경기는 결과로 넘기고 이적시장 개장과 협상·제안, 감독·코치 재계약, 자금·후원 경고에서만 멈춰요. 훈련, 유소년과 선수 재계약 협상은 스태프가 맡아요.',
    stopOn: stops([
      'window-open',
      'bid-response',
      'incoming-bid',
      'staff-renewal',
      'finance',
      'sponsor-ending',
    ]),
    delegation: {
      training: true,
      academy: true,
      transfers: false,
      business: false,
      staff: false,
      contracts: true,
      manager: false,
    },
  },
  {
    name: '운영진에 모두 맡기기',
    short: '운영진이 처리하고 자금·후원 경고만 멈춰요',
    summary:
      '감독과 스태프가 경기·훈련·유소년·선수 재계약·영입 제안·후원 계약·코치 고용·감독 선임까지 처리하고, 자금·후원 경고에서만 멈춰요. 결과는 소식함에 남아요.',
    stopOn: stops(['finance', 'sponsor-ending']),
    delegation: {
      training: true,
      academy: true,
      transfers: true,
      business: true,
      staff: true,
      contracts: true,
      manager: true,
    },
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
/** Applies a level: its clock stops at once, then every staff delegation that differs. */
export function applyInterventionLevel(
  client: GameClient,
  controller: ProgressionController,
  w: World,
  index: number,
) {
  const level = INTERVENTION_LEVELS[index];
  controller.setStopOnAll(level.stopOn);
  for (const key of Object.keys(level.delegation) as DelegationKey[])
    if (!!w.delegation?.[key] !== level.delegation[key])
      void client.command({ type: 'delegate', key, value: level.delegation[key] });
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
  const background = useProgression(controller, (state) => state.background);
  const w = useGameState((state) => state.view?.world);
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  if (!w) return null;
  const current = interventionLevel(stopOn, w);
  const choose = (index: number) => applyInterventionLevel(client, controller, w, index);
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
          시간만큼 위 한도까지 한꺼번에 진행하고, 무슨 일이 있었는지 요약해 드려요. 멈춤 설정은
          그대로 지켜요. 방치형으로 두려면 개입 4(운영진에 모두 맡기기)를 고르세요. 경기 전날에도
          멈추지 않아요.
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
