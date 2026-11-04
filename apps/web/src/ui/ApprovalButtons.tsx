import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { approvalRequests, overdueSummary } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { openApprovalInbox, openOwnerOffice } from './state';
import p from './ProgressControls.module.css';

/** Shared by the controller and the owner's workspace toolbar. */
export function ApprovalButtons() {
  useTextLocale();
  const w = useGameState((state) => state.view!.world);
  const requests = approvalRequests(w);
  const late = overdueSummary(w, requests).overdue;
  return (
    <>
      <button
        type="button"
        className={`${p.approvals} ${p.inbox}`}
        data-ui="secondary"
        data-testid="approval-inbox"
        data-overdue={late > 0 || undefined}
        aria-haspopup="dialog"
        aria-label={displayMessage('copy.ApprovalButtons.db3f925b1f', {
          p0: requests.length,
          p1: late ? sourceMessage('copy.ApprovalButtons.51598323eb', { p0: late }) : '',
        })}
        onClick={(event) => {
          event.currentTarget.focus();
          openApprovalInbox();
        }}
      >
        <span>{richMessage('copy.ApprovalButtons.216a759610')}</span>
        <b data-ui="count" aria-hidden="true">
          {localizeValue(requests.length > 99 ? '99+' : requests.length)}
        </b>
        {localizeValue(
          late > 0 && (
            <b className={p.late} aria-hidden="true">
              {richMessage('copy.ApprovalButtons.12b1f0f7b7', { p0: late })}
            </b>
          ),
        )}
      </button>
      <button
        type="button"
        className={p.approvals}
        data-ui="secondary"
        aria-label={displayMessage('copy.ApprovalButtons.df74662f55')}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.currentTarget.focus();
          openOwnerOffice();
        }}
      >
        {richMessage('copy.ApprovalButtons.df74662f55')}
      </button>
    </>
  );
}
