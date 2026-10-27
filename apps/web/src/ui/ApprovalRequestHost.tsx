import { useMemo, useState, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { stoppingEvents } from '../runtime/progression';
import { approvalClient } from './approvalClient';
import type { ApprovalRequest } from './eventRouting';
import { approvalId, approvalWorld, returnApprovalHome, useNavigation } from './state';
import { useTaskMemory } from './taskMemory';
import s from './EventCenter.module.css';
import { useGameState } from '../runtime/store';

const submitting = (state: ClientState) => !!(state.busy || state.pendingActions);

export function ApprovalRequestHost({
  request,
  client,
  controller,
  children,
}: {
  request: ApprovalRequest;
  client: GameClient;
  controller: ProgressionController;
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
        () => {
          returnApprovalHome(request);
          controller.eventDecided();
        },
        setError,
      ),
    [client, request, controller],
  );
  const w = client.state.view!.world;
  const pending =
    w.id === request.world && stoppingEvents(w).some((item) => item.id === request.item.id);
  return (
    <section
      data-surface="panel"
      className={s.card}
      data-testid="approval-request"
      data-request-id={request.item.id}
      aria-label="결재 요청"
    >
      <h2>{request.item.title}</h2>
      <p>{request.item.detail}</p>
      <div className={s.actions}>
        <button type="button" data-ui="link" disabled={pendingSubmission} onClick={leave}>
          홈으로
        </button>
        <button type="button" disabled={pendingSubmission} onClick={leave}>
          취소
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {pending ? (
        children(scoped, error)
      ) : (
        <p role="status">
          이미 처리되었거나 조건이 바뀐 요청이에요. 홈에서 최신 요청을 확인해 주세요.
        </p>
      )}
    </section>
  );
}
