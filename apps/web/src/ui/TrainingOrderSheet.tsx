import { useState } from 'react';
import type {
  TrainingCoach,
  TrainingFocus,
  World,
  YouthFocus,
} from '../../../../packages/contracts/src/types';
import {
  coachFocuses,
  focusLabel,
  forceRisk,
  strainOf,
  suggestionChance,
  suggestionWait,
  trainingCall,
} from '../../../../packages/engine/src/coach-training';
import { ORDER_ROUNDS } from '../../../../packages/engine/src/orders';
import { YOUTH_FOCUS_INFO } from '../../../../packages/engine/src/academy';
import { STAFF_INFO, staffMember } from '../../../../packages/engine/src/staff';
import { trainingFocusInfo } from '../../../../packages/engine/src/training';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import s from './TrainingOrderSheet.module.css';

type Focus = TrainingFocus | YouthFocus;
const percent = (chance: number) => `${Math.round(chance * 100)}%`;
const BY_LABEL = {
  rule: '코치 판단',
  suggestion: '구단주 제안 수락',
  order: '구단주 지시',
} as const;

/** What a focus does, in the owner's words (→CLUB-11, CLUB-31). */
function focusEffect(coach: TrainingCoach, focus: Focus) {
  if (coach === 'assistant') {
    const info = trainingFocusInfo[focus as TrainingFocus];
    return `피로 회복 ${info.recovery} · ${info.developmentMultiplier ? `성장 ×${info.developmentMultiplier}` : '라운드 성장 쉼'}`;
  }
  const growth = YOUTH_FOCUS_INFO[focus as YouthFocus].growth;
  return `U-17 ×${growth.u17} · U-19 ×${growth.u19} · U-21 ×${growth.u21}`;
}

/** Who sets this coach's focus now and why, in one line (→STAFF-19). */
export function callLine(w: World, coach: TrainingCoach) {
  const call = trainingCall(w, coach);
  return {
    focus: focusLabel(coach, call.focus),
    by: BY_LABEL[call.by],
    reason: call.reason,
  };
}

/**
 * 훈련 제안 (→STAFF-19): the coach's focus in force and why, then each focus he can set with the
 * chance he takes a suggestion of it and the chance he resigns after an order, stated before.
 */
export function TrainingOrderSheet({
  w,
  client,
  coach,
  ready,
  onClose,
}: {
  w: World;
  client: GameClient;
  coach: TrainingCoach;
  /** A focus asked for from elsewhere, shown first. */
  ready?: Focus;
  onClose: () => void;
}) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const [sending, setSending] = useState(false);
  const member = staffMember(w, coach),
    title = STAFF_INFO[coach].label,
    call = callLine(w, coach),
    wait = suggestionWait(w, coach),
    risk = forceRisk(w, coach),
    strain = strainOf(w, coach);
  const focuses = coachFocuses(coach);
  const ordered = ready ? [ready, ...focuses.filter((focus) => focus !== ready)] : focuses;
  const send = (focus: Focus, force: boolean) => {
    setSending(true);
    void client
      .command({ type: 'coach-training', coach, focus, force })
      .then((reply) => {
        if (reply?.ok) onClose();
      })
      .finally(() => setSending(false));
  };
  const blocked = acting || sending || !member;
  return (
    <Dialog label={`${title} 훈련 제안`} onClose={onClose}>
      <p className={s.now} data-testid={`training-call-${coach}`}>
        <span>
          <b>지금 {call.focus}</b> · {call.by}
        </span>
        <small>{call.reason}</small>
      </p>
      {!member ? (
        <p className={s.note}>{title} 자리가 비어 있어요. 코치를 선임하면 제안할 수 있어요.</p>
      ) : (
        <p className={s.note}>
          받아들이거나 지시하면 다음 {ORDER_ROUNDS}라운드 동안 그 방향으로 훈련해요.
          {wait > 0 && ` 제안은 ${wait}라운드 뒤에 다시 할 수 있어요.`}
          {BigInt(member.wage) > 0n
            ? ` 이번 시즌 강행 ${strain}번 · 강행할 때마다 사임 확률이 15%p씩 올라요(최대 60%).`
            : ' 무급 자원봉사 코치는 강행해도 떠나지 않아요.'}
        </p>
      )}
      <ul className={s.focuses}>
        {ordered.map((focus) => {
          const chance = suggestionChance(w, coach, focus);
          return (
            <li key={focus} data-ready={focus === ready || undefined}>
              <span className={s.focusText}>
                <b>{focusLabel(coach, focus)}</b>
                <small>{focusEffect(coach, focus)}</small>
              </span>
              <span className={s.focusActions}>
                <button
                  type="button"
                  disabled={blocked || wait > 0}
                  aria-label={`${focusLabel(coach, focus)} 제안 · 수락 확률 ${percent(chance)}`}
                  onClick={() => send(focus, false)}
                >
                  제안 <small>수락 {percent(chance)}</small>
                </button>
                <button
                  type="button"
                  className={s.force}
                  disabled={blocked}
                  aria-label={`${focusLabel(coach, focus)} 강행 · 사임 확률 ${percent(risk)}`}
                  onClick={() => send(focus, true)}
                >
                  강행 <small>사임 {percent(risk)}</small>
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
