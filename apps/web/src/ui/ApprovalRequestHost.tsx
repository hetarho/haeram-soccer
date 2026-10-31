import { useMemo, useState, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import { approvalRequests, approvalStanding } from '../runtime/progression';
import { approvalClient } from './approvalClient';
import type { ApprovalRequest } from './eventRouting';
import { approvalId, approvalWorld, returnApprovalHome, useNavigation } from './state';
import { useTaskMemory } from './taskMemory';
import s from './EventCenter.module.css';
import { useGameState } from '../runtime/store';

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
          approvalId() === request.item.id &&
          useNavigation.getState().page === 'business',
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
      aria-label="결재 요청"
    >
      <header>
        <h2>{title}</h2>
        {standing && (
          <span className={standing.overdue ? s.overdue : s.due} data-testid="approval-deadline">
            {standing.label}
          </span>
        )}
      </header>
      {detail && detail !== title && <p>{detail}</p>}
      {/* The one way back: the 결재함 with its context, the request still waiting (→WEB-100). */}
      <button
        type="button"
        data-ui="link"
        className={s.return}
        disabled={pendingSubmission}
        onClick={leave}
      >
        결재함으로
      </button>
      {error && <p role="alert">{error}</p>}
      {pending ? (
        children(scoped, error)
      ) : (
        <p role="status">
          이미 처리되었거나 조건이 바뀐 요청이에요. 결재함에서 남은 요청을 확인해 주세요.
        </p>
      )}
    </section>
  );
}
