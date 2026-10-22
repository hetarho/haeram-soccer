import { PixelIcon } from './PixelIcon';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import { decisionOwner } from './intervention';
import { openOwnerOffice } from './state';
import s from './DecisionOwner.module.css';

/**
 * Who takes a decision at the current intervention level (→WEB-45, STAFF-13), shown in its home:
 * one line opening the owner office, never a switch of its own
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
  decision: ResponsibilityKey;
  /** What the staff do while the level hands them the decision. */
  auto: string;
  /** What the owner does while he takes it himself. */
  owner: string;
  /** The direction rows named below act only while the staff decide (→WEB-45). */
  criteria?: boolean;
  /** Inside a panel that already frames the decision: no frame of its own. */
  plain?: boolean;
}) {
  const { name, auto: on } = decisionOwner(w, decision);
  return (
    <div
      className={s.owner}
      data-auto={on || undefined}
      data-plain={plain || undefined}
      data-testid={`decision-owner-${decision}`}
    >
      <div className={s.row}>
        <span className={s.mode}>{on ? '위임' : '직접 결정'}</span>
        <button
          type="button"
          className={s.level}
          aria-label={`${name} · ${on ? '위임' : '직접 결정'} · 구단주 사무실 열기`}
          onClick={openOwnerOffice}
        >
          구단주 사무실
          <PixelIcon name="chevronRight" size={14} />
        </button>
      </div>
      <p>
        {on ? auto : owner}
        {!on && criteria && ' 아래 방침은 이 업무를 위임할 때 사용해요.'}
      </p>
    </div>
  );
}
