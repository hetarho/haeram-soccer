import { PixelIcon } from './PixelIcon';
import type { DelegationKey, World } from '../../../../packages/contracts/src/types';
import { decisionOwner } from './intervention';
import { useInterventionDialog } from './state';
import s from './DecisionOwner.module.css';

/**
 * Who takes a decision at the current intervention level (→WEB-45, STAFF-13), shown in its home:
 * one line naming the level that opens the intervention dialog, never a switch of its own
 * (→WEB-71).
 */
export function DecisionOwner({
  w,
  decision,
  auto,
  owner,
  criteria = false,
  plain = false,
}: {
  w: World;
  decision: DelegationKey;
  /** What the staff do while the level hands them the decision. */
  auto: string;
  /** What the owner does while he takes it himself. */
  owner: string;
  /** The direction rows named below act only while the staff decide (→WEB-45). */
  criteria?: boolean;
  /** Inside a panel that already frames the decision: no frame of its own. */
  plain?: boolean;
}) {
  const { level, name, auto: on } = decisionOwner(w, decision);
  return (
    <div
      className={s.owner}
      data-auto={on || undefined}
      data-plain={plain || undefined}
      data-testid={`decision-owner-${decision}`}
    >
      <div className={s.row}>
        <span className={s.mode}>{on ? '자동 결정' : '직접 결정'}</span>
        <button
          type="button"
          className={s.level}
          aria-label={`개입 수준 바꾸기 · 지금 ${level}단계 ${name}`}
          onClick={useInterventionDialog.getState().show}
        >
          개입 {level} · {name}
          <PixelIcon name="chevronRight" size={14} />
        </button>
      </div>
      <p>
        {on ? auto : owner}
        {!on && criteria && ' 아래 방향은 개입 수준이 이 결정을 스태프에게 맡길 때만 쓰여요.'}
      </p>
    </div>
  );
}
