import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useMemo, useState, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../../../runtime/client';
import { approvalRequests, approvalStanding } from '../../../runtime/progression';
import { approvalClient } from '../lib/approvalClient';
import type { ApprovalRequest } from '../../../shared/routing/eventRouting';
import { approvalId, approvalWorld, returnApprovalHome } from '../../../shared/routing/state';
import { useTaskMemory } from '../../../shared/routing/taskMemory';
import s from '../../../shared/ui/styles/EventCenter.module.css';
import { useGameState } from '../../../runtime/store';

const submitting = (state: ClientState) => !!(state.busy || state.pendingActions);

/**
 * A selected request's review (→WEB-39/100): its one heading with the 결재 기한 it still runs
 * against, any detail the heading does not already say, one named return to the 결재함 and the
 * request's own authoritative form. Leaving never answers it.
 */
export function ApprovalRequestHost({
  request,
  client,
  children,
}: {
  request: ApprovalRequest;
  client: GameClient;
  children: (client: GameClient, error: string) => ReactNode;
}) {
  useTextLocale();
  const [error, setError] = useState('');
  const pendingSubmission = useGameState(submitting);
  const leave = () => {
    if (!submitting(client.state)) returnApprovalHome(request);
  };
  const scoped = useMemo(
    () =>
      approvalClient(
        client,
        request,
        () =>
          useTaskMemory.getState().world === request.world &&
          approvalWorld() === request.world &&
          approvalId() === request.item.id,
        // Answering an approval neither starts nor stops the clock (→WEB-42).
        () => returnApprovalHome(request),
        setError,
      ),
    [client, request],
  );
  const w = client.state.view!.world;
  const pending =
    w.id === request.world && approvalRequests(w).some((item) => item.id === request.item.id);
  const standing = pending ? approvalStanding(w, request.item.id) : undefined;
  const { title, detail } = request.item;
  return (
    <section
      data-surface="panel"
      className={`${s.card} ${s.inlineCard}`}
      data-testid="approval-request"
      data-request-id={request.item.id}
      aria-label={displayMessage('copy.ApprovalRequestHost.2058f4ceba')}
    >
      <header>
        <h2>{localizeValue(title)}</h2>
        {localizeValue(
          standing && (
            <span className={standing.overdue ? s.overdue : s.due} data-testid="approval-deadline">
              {localizeValue(standing.label)}
            </span>
          ),
        )}
      </header>
      {localizeValue(detail && detail !== title && <p>{localizeValue(detail)}</p>)}
      {/* The one way back: the 결재함 with its context, the request still waiting (→WEB-100). */}
      <button
        type="button"
        data-ui="link"
        className={s.return}
        disabled={pendingSubmission}
        onClick={leave}
      >
        {richMessage('copy.ApprovalRequestHost.0bcb104073')}
      </button>
      {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
      {localizeValue(
        pending ? (
          children(scoped, error)
        ) : (
          <p role="status">{richMessage('copy.ApprovalRequestHost.46413142a5')}</p>
        ),
      )}
    </section>
  );
}
