import { useEffect, useId, useState } from 'react';
import type { GameSettings, ResponsibilityKey } from '../../../../packages/contracts/src/types';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import { pendingWorkPreview } from '../../../../packages/engine/src/pending-work-preview';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import {
  AWAY_LIMITS,
  useProgression,
  type AwayLimit,
  type BackgroundSettings,
  type ProgressionController,
} from '../runtime/progression';
import { useTaskState } from './taskMemory';
import { Dialog } from './Dialog';
import { applyResponsibilitySettings, RESPONSIBILITY_LABELS } from './intervention';
import s from './ResponsibilitySettings.module.css';

const DETAILS: Record<ResponsibilityKey, string> = {
  manager: '감독 선임·재계약',
  staff: '단장·스카우트·모든 코치진의 선임·재계약',
  contracts: '선수 재계약·계약 개선',
  recruitment: '선수 영입·영입 협상',
  sales: '우리 선수에게 온 제안·매각 방침',
  academy: '유소년 승격과 방출',
  sponsors: '자리별 스폰서 계약',
};
interface Draft {
  game: GameSettings;
  background: BackgroundSettings;
}
export function ResponsibilitySettings({
  client,
  controller,
  onClose,
}: {
  client: GameClient;
  controller: ProgressionController;
  onClose: () => void;
}) {
  const state = useGameState((state) => state),
    w = state.view!.world;
  const background = useProgression(controller, (state) => state.background);
  const [stored, setStored] = useTaskState<Draft | undefined>(
    w.id,
    'responsibility-settings-draft',
    undefined,
  );
  const draft = stored ?? { game: settingsOf(w), background };
  const [message, setMessage] = useState('');
  const statusId = useId();
  const acting = !!state.pendingActions || state.processing;
  useEffect(() => controller.pause(), [controller]);
  const update = (change: (game: GameSettings) => void) => {
    const next = structuredClone(draft);
    change(next.game);
    setStored(next);
    setMessage('');
  };
  const changeObservation = (key: 'matchEve' | 'windowOpen', value: boolean) => {
    if (key === 'matchEve' && !value && draft.game.mode === 'manual') {
      setMessage('수동 모드에는 경기 이벤트가 필요해요');
      return;
    }
    update((game) => {
      game.observations[key] = value;
    });
  };
  const manualInvalid = draft.game.mode === 'manual' && !draft.game.observations.matchEve;
  const blocked = state.readonly
    ? '읽기 전용 상태에서는 설정을 적용할 수 없어요.'
    : state.error
      ? '저장·진행 오류를 해결한 뒤 적용해 주세요.'
      : acting
        ? '진행 중인 처리가 끝나면 적용할 수 있어요.'
        : manualInvalid
          ? '수동 모드에는 경기 이벤트가 필요해요'
          : '';
  const guidance = message || blocked;
  const matchGuidance = manualInvalid || message.includes('경기 이벤트');
  const changed =
    JSON.stringify(draft.game) !== JSON.stringify(settingsOf(w)) ||
    JSON.stringify(draft.background) !== JSON.stringify(background);
  const pending = pendingWorkPreview(w, draft.game).filter(
    (item) => item.count > 0 || (item.held ?? 0) > 0,
  );
  const apply = async () => {
    if (blocked) return;
    setMessage('');
    const reply = await applyResponsibilitySettings(client, draft.game);
    if (!reply?.ok) {
      setMessage(reply?.error || '설정을 적용하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    if (gameStore.getSnapshot().view?.world.id !== w.id) return;
    controller.setBackground(draft.background);
    setStored(undefined);
    onClose();
  };
  return (
    <Dialog
      label="위임·진행 설정"
      onClose={onClose}
      actions={
        <>
          <button
            disabled={acting || !stored}
            onClick={() => {
              setStored(undefined);
              setMessage('');
            }}
          >
            변경 버리기
          </button>
          <button onClick={onClose}>닫기</button>
          <button
            disabled={!changed || !!blocked}
            aria-describedby={guidance ? statusId : undefined}
            onClick={() => void apply()}
          >
            적용
          </button>
        </>
      }
    >
      <p>
        업무마다 직접 결정하거나 맡길 수 있어요. 변경은 적용을 눌러야 반영됩니다. 훈련은 코치가
        맡아요.
      </p>
      {guidance && !matchGuidance && (
        <p id={statusId} role="status" className={s.message}>
          {guidance}
        </p>
      )}
      <div className={s.rows}>
        {RESPONSIBILITY_KEYS.map((key) => (
          <label className={s.row} key={key}>
            <span>
              <b>{RESPONSIBILITY_LABELS[key]}</b>
              <small>{DETAILS[key]}</small>
            </span>
            <select
              aria-label={RESPONSIBILITY_LABELS[key]}
              disabled={acting || state.readonly}
              value={draft.game.responsibilities[key]}
              onChange={(event) =>
                update((game) => {
                  game.responsibilities[key] = event.target.value as 'direct' | 'delegated';
                })
              }
            >
              <option value="direct">직접 결정</option>
              <option value="delegated">위임</option>
            </select>
          </label>
        ))}
      </div>
      <section className={s.section} aria-label="시간 진행 방식">
        <label className={s.row}>
          <b>진행 모드</b>
          <select
            aria-label="진행 모드"
            disabled={acting || state.readonly}
            value={draft.game.mode}
            onChange={(event) =>
              update((game) => {
                game.mode = event.target.value as GameSettings['mode'];
              })
            }
          >
            <option value="automatic">자동 진행 모드</option>
            <option value="manual">수동 진행 모드</option>
          </select>
        </label>
        <p>
          자동은 재생·정지와 속도로, 수동은 다음 이벤트 버튼으로 진행해요. 직접 결정할 일이 있으면
          두 모드 모두 멈춰요.
        </p>
        <label className={s.check}>
          <input
            type="checkbox"
            aria-label="경기 전날 이벤트"
            checked={draft.game.observations.matchEve}
            disabled={acting || state.readonly}
            onChange={(event) => changeObservation('matchEve', event.target.checked)}
          />
          경기 전날 멈추기
        </label>
        <label className={s.check}>
          <input
            type="checkbox"
            aria-label="이적시장 개장 이벤트"
            checked={draft.game.observations.windowOpen}
            disabled={acting || state.readonly}
            onChange={(event) => changeObservation('windowOpen', event.target.checked)}
          />
          이적시장 개장에 멈추기
        </label>
        <p>
          수동 모드에는 경기 이벤트가 반드시 필요해요. 다른 일을 모두 맡겨도 다음 경기 전날에
          도착합니다.
        </p>
        {matchGuidance && (
          <p id={statusId} role="status" className={s.message}>
            수동 모드에는 경기 이벤트가 필요해요
          </p>
        )}
        {matchGuidance && (
          <button
            disabled={acting || state.readonly}
            onClick={() =>
              update((game) => {
                game.observations.matchEve = true;
              })
            }
          >
            경기 전날 이벤트 켜기
          </button>
        )}
      </section>
      {pending.length > 0 && (
        <section className={s.section} aria-label="대기 업무 이관 미리보기">
          <h3>함께 넘길 대기 업무</h3>
          <ul>
            {pending.map((item) => (
              <li key={item.key}>
                {item.count > 0 && (
                  <>
                    대기 중인 {RESPONSIBILITY_LABELS[item.key]} {item.count}건도{' '}
                    {item.to === 'delegated' ? '위임됩니다' : '직접 결정으로 가져옵니다'}.
                  </>
                )}
                {(item.held ?? 0) > 0 && (
                  <> 공동 승인 {item.held}건은 다른 직접 결정이 남아 대기해요.</>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={s.section} aria-label="자동 모드의 백그라운드 진행">
        <h3>자동 모드의 백그라운드 진행</h3>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={draft.background.hidden}
            disabled={acting || state.readonly}
            onChange={(event) =>
              setStored({
                ...structuredClone(draft),
                background: { ...draft.background, hidden: event.target.checked },
              })
            }
          />
          다른 탭에서도 계속 진행
        </label>
        <label className={s.row}>
          <span>다시 열었을 때 따라갈 시간</span>
          <select
            aria-label="자리 비운 동안 진행 한도"
            disabled={acting || state.readonly}
            value={draft.background.away}
            onChange={(event) =>
              setStored({
                ...structuredClone(draft),
                background: { ...draft.background, away: event.target.value as AwayLimit },
              })
            }
          >
            {Object.entries(AWAY_LIMITS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p>수동 모드에서는 자리를 비워도 시간이 진행하지 않아요.</p>
      </section>
    </Dialog>
  );
}
