import { useEffect } from 'react';
import {
  currentDay,
  daysUntilNextMatch,
  fixtureDate,
  nextOwnFixture,
  seasonDate,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { useProgression, type ProgressionController } from '../runtime/progression';
import s from './App.module.css';

export function ProgressControls({
  client,
  controller,
  suspended,
}: {
  client: GameClient;
  controller: ProgressionController;
  suspended: boolean;
}) {
  const state = useGameState((state) => state);
  const { running, pace, watching, reason } = useProgression(controller, (state) => state);
  const w = state.view!.world;
  const next = nextOwnFixture(w);
  const blocked = !!(state.readonly || state.error || w.critical || suspended);
  useEffect(() => {
    controller.setSuspended(suspended);
  }, [controller, suspended]);
  return (
    <section className={s.seasonControls} aria-label="시즌 진행">
      <div className={s.calendarSummary}>
        <span className={s.eyebrow}>시즌 캘린더</span>
        <strong data-testid="game-date">{seasonDate(w)}</strong>
        <small>
          {watching
            ? '관전 모드 · 현재 경기 종료 후 다음 경기를 바로 시작합니다'
            : next
              ? `다음 경기 ${fixtureDate(w, next)} · ${daysUntilNextMatch(w)}일 후`
              : '시즌 정산과 다음 시즌을 준비합니다'}
        </small>
        <progress aria-label="시즌 경과 일수" value={currentDay(w)} max={seasonLength(w)} />
      </div>
      <div className={s.progressActions}>
        {watching ? (
          <div className={s.watchProgressMode}>
            <b>경기 종료 → 다음 경기</b>
            <small>경기장에서 관전 속도를 조절하세요</small>
          </div>
        ) : (
          <div className={s.paceSwitch} role="group" aria-label="자동 진행 속도">
            {(
              [
                ['daily', '1단계', '1초에 1일'],
                ['three-days', '2단계', '1초에 3일'],
                ['match', '3단계', '1초에 다음 경기'],
              ] as const
            ).map(([value, label, detail]) => (
              <button
                key={value}
                aria-pressed={pace === value}
                className={pace === value ? s.selectedPace : undefined}
                onClick={() => controller.setPace(value)}
                disabled={blocked}
              >
                <b>{label}</b>
                <small>{detail}</small>
              </button>
            ))}
          </div>
        )}
        <div className={s.autoButtons}>
          {!watching && (
            <button
              disabled={blocked || state.processing || running}
              onClick={() =>
                void client.command({ type: 'advance-days', days: 1 }, { background: true })
              }
            >
              하루 진행
            </button>
          )}
          <button
            className={running ? s.coral : s.primary}
            disabled={!running && (blocked || state.processing)}
            onClick={() => (running ? controller.stop() : controller.start())}
          >
            {running ? '자동 진행 정지' : '자동 진행 시작'}
          </button>
        </div>
        <span className={s.autoStatus} aria-live="polite" aria-atomic="true">
          {running
            ? watching
              ? '자동 관전 중 · 경기 종료를 기다립니다'
              : '자동 진행 중 · 경기 결과와 순위가 갱신됩니다'
            : reason || '자동 진행을 시작하고 원하는 탭에서 시즌을 지켜보세요'}
        </span>
      </div>
    </section>
  );
}
