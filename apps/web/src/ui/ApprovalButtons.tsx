import { approvalRequests, overdueSummary } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { openApprovalInbox, openOwnerOffice } from './state';
import p from './ProgressControls.module.css';

/** Shared by the controller and the owner's workspace toolbar. */
export function ApprovalButtons() {
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
        aria-label={`결재함 · 대기 ${requests.length}건${late ? ` · 지연 ${late}건` : ''}`}
        onClick={(event) => {
          event.currentTarget.focus();
          openApprovalInbox();
        }}
      >
        <span>결재함</span>
        <b data-ui="count" aria-hidden="true">
          {requests.length > 99 ? '99+' : requests.length}
        </b>
        {late > 0 && (
          <b className={p.late} aria-hidden="true">지연 {late}</b>
        )}
      </button>
      <button
        type="button"
        className={p.approvals}
        data-ui="secondary"
        aria-label="결재 설정"
        aria-haspopup="dialog"
        onClick={(event) => {
          event.currentTarget.focus();
          openOwnerOffice();
        }}
      >
        결재 설정
      </button>
    </>
  );
}
