import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { PixelIcon } from './PixelIcon';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import { decisionOwner } from './intervention';
import { openOwnerOffice } from './state';
import s from './DecisionOwner.module.css';

/**
 * Who takes a decision under the settings in force (→WEB-45, STAFF-13), shown in its home:
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
  useTextLocale();
  const { name, auto: on } = decisionOwner(w, decision);
  return (
    <div
      className={s.owner}
      data-surface={plain ? undefined : 'inset'}
      data-auto={on || undefined}
      data-plain={plain || undefined}
      data-testid={`decision-owner-${decision}`}
    >
      <div className={s.row}>
        <span className={s.mode}>
          {localizeValue(
            on
              ? sourceMessage('copy.ControllerBackgrounds.ca7eb2ef0a')
              : sourceMessage('copy.ApprovalQueue.20c483bdda'),
          )}
        </span>
        <button
          type="button"
          className={s.level}
          aria-label={displayMessage('copy.DecisionOwner.2cd5994d1d', {
            p0: name,
            p1: on
              ? sourceMessage('copy.ControllerBackgrounds.ca7eb2ef0a')
              : sourceMessage('copy.ApprovalQueue.20c483bdda'),
          })}
          onClick={openOwnerOffice}
        >
          {richMessage('copy.DecisionOwner.a08f541833', {
            p0: <PixelIcon name="chevronRight" size={14} />,
          })}
        </button>
      </div>
      <p>
        {localizeValue(on ? auto : owner)}
        {localizeValue(!on && criteria && sourceMessage('copy.DecisionOwner.6cc64c34e3'))}
      </p>
    </div>
  );
}
