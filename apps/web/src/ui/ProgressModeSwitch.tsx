import { useRef, useState } from 'react';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { progressionPreferences } from '../adapters/progressionPreferences';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { PixelIcon } from './PixelIcon';
import { modeSwitchBlocked, switchProgressMode } from './progressMode';
import s from './ProgressControls.module.css';

export function ProgressModeSwitch({
  client,
  controller,
  choices = false,
}: {
  choices?: boolean;
  client: GameClient;
  controller: ProgressionController;
}) {
  const state = useGameState((state) => state);
  const w = state.view!.world;
  const mode = settingsOf(w).mode;
  const [request, setRequest] = useState<{ id: string; mode: typeof mode }>();
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const inFlight = useRef(false);
  const close = () => {
    if (!inFlight.current) {
      setRequest(undefined);
      setError('');
      setRemember(false);
    }
  };
  const apply = async (expected: { id: string; mode: typeof mode }, savePreference: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setApplying(true);
    setError('');
    try {
      await switchProgressMode(client, controller, expected);
      if (savePreference) progressionPreferences.remember();
      setRequest(undefined);
      setRemember(false);
    } catch (cause) {
      setRequest(expected);
      setError(cause instanceof Error ? cause.message : '전환하지 못했어요. 다시 시도해 주세요.');
    } finally {
      inFlight.current = false;
      setApplying(false);
    }
  };
  const manual = request?.mode === 'automatic';
  const choose = () => {
    const expected = { id: w.id, mode };
    setRemember(false);
    setError('');
    if (progressionPreferences.skipExplanation()) void apply(expected, false);
    else setRequest(expected);
  };
  return (
    <>
      {choices ? (
        <div className={s.modeChoices} role="group" aria-label="진행 모드">
          {(['automatic', 'manual'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              disabled={applying || modeSwitchBlocked(state)}
              onClick={() => {
                if (mode !== value) choose();
              }}
            >
              {value === 'automatic' ? '자동 진행' : '수동 진행'}
            </button>
          ))}
        </div>
      ) : (
        <button
          className={s.modeSwitch}
          aria-label={`진행 방식 변경 · 현재 ${mode === 'automatic' ? '자동' : '수동'} 모드`}
          aria-haspopup={progressionPreferences.skipExplanation() ? undefined : 'dialog'}
          disabled={applying || modeSwitchBlocked(state)}
          onClick={choose}
        >
          <span>
            <b>{mode === 'automatic' ? 'AUTO' : 'MANUAL'}</b>
            <small>{mode === 'automatic' ? '자동 진행' : '수동 진행'}</small>
          </span>
          <PixelIcon name="switch" size={18} />
        </button>
      )}
      {request && (
        <Dialog
          label="게임 진행 방식이 변경됩니다."
          onClose={close}
          actions={
            <div className={s.modeActions}>
              <button disabled={applying} onClick={close}>
                취소
              </button>
              <button
                disabled={
                  applying ||
                  modeSwitchBlocked(state) ||
                  w.id !== request.id ||
                  mode !== request.mode
                }
                onClick={() => void apply(request, remember)}
              >
                {manual ? '수동 모드로 변경' : '자동 모드로 변경'}
              </button>
            </div>
          }
        >
          <div className={s.modeExplanation} aria-busy={applying}>
            <strong>{manual ? 'AUTO → MANUAL' : 'MANUAL → AUTO'}</strong>
            <p>
              {manual
                ? '필요한 보고를 확인하고 다음 일정을 직접 결정합니다. 경기 전날에는 준비 현황을 보고받습니다.'
                : '재생 버튼을 누르면 선택한 배속으로 날짜가 흐릅니다. 결정이 필요하거나 설정한 알림이 도착하면 멈춰요.'}
            </p>
            <p>
              {manual
                ? '수동 모드로 바꾸면 경기 전날 보고를 켭니다. 다른 보고와 업무 위임 설정은 그대로 유지됩니다.'
                : '보고와 업무 위임 설정은 그대로 유지됩니다.'}
            </p>
            <p className={s.modeHint}>
              변경 후에는 정지 상태로 기다립니다. 날짜는 넘어가지 않으며, 위임 설정은 그대로
              유지됩니다.
            </p>
            <label className={s.remember}>
              <input
                type="checkbox"
                checked={remember}
                disabled={applying}
                onChange={(event) => setRemember(event.target.checked)}
              />
              다시 보지 않기
            </label>
            {error && <p role="alert">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
