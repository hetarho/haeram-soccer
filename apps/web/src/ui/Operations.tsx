import { useEffect, useState, type ReactNode } from 'react';
import { useTaskMemory } from './taskMemory';
import { ApprovalRequestHost } from './ApprovalRequestHost';
import { approvalRequests } from '../runtime/progression';
import { eventDesk, type ApprovalRequest } from './eventRouting';
import type { ClientState, GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { BusinessWorkbench } from './BusinessWorkbench';
import {
  BUSINESS_TABS,
  officeAddress,
  officeView,
  approvalWorld,
  leaveDesk,
  openOwnerOffice,
  returnApprovalHome,
  type OfficeView,
} from './state';
import { Dialog } from './Dialog';
import { DeskBody } from './OfficeDesk';
import { ClubOverview } from './ClubOverview';

/**
 * The workspace overview or a selected approval's authoritative work form in a dialog.
 */
export function OperationsView({
  state,
  client,
  personnel,
  selectedRequest,
}: {
  state: ClientState;
  client: GameClient;
  controller: ProgressionController;
  selectedRequest?: ApprovalRequest;
  personnel: (
    desk: 'players' | 'staff',
    client: GameClient,
    request: ApprovalRequest,
    error?: string,
  ) => ReactNode;
}) {
  const w = state.view!.world;
  const requests = useTaskMemory((memory) => memory.approvalRequests);
  const requestId =
    selectedRequest?.item.id ??
    new URLSearchParams(location.search).get('request') ??
    undefined;
  const liveRequest = requestId
    ? approvalRequests(w).find((item) => item.id === requestId)
    : undefined;
  const [request] = useState(() =>
    selectedRequest ??
    (requestId && approvalWorld() === w.id
      ? (requests[requestId] ??
        (liveRequest && eventDesk(liveRequest)
          ? { world: w.id, desk: eventDesk(liveRequest)!, item: liveRequest }
          : undefined))
      : undefined),
  );
  const [view, setView] = useState<OfficeView>(() =>
    officeView(new URLSearchParams(location.search).get('view')),
  );
  const area = BUSINESS_TABS.find(([id]) => id === (selectedRequest?.desk ?? view));
  // Older settings addresses still open the settings dialog over the workspace.
  useEffect(() => {
    if (selectedRequest || view !== 'office') return;
    history.replaceState(history.state, '', officeAddress('lobby'));
    setView('lobby');
    openOwnerOffice();
  }, [view, selectedRequest]);
  useEffect(() => {
    if (area && !requestId) leaveDesk();
  }, [area, requestId]);
  if (!area) return <ClubOverview w={w} />;
  if (!requestId) return null;
  const [id, label] = area;
  return (
    <Dialog
      label={label}
      wide
      onClose={() => {
        if (!state.busy && !state.pendingActions) returnApprovalHome(request);
      }}
    >
      <DeskBody data-office-view={id}>
        {request && request.world === w.id && request.desk === id ? (
          <ApprovalRequestHost key={`${w.id}:${requestId}`} request={request} client={client}>
            {(scoped, error) =>
              id === 'players' || id === 'staff' ? (
                personnel(id, scoped, request, error)
              ) : (
                <BusinessWorkbench
                  state={state}
                  client={scoped}
                  part={id === 'investment' ? 'finance' : 'sponsor'}
                  selectedSlot={request.item.ref}
                />
              )
            }
          </ApprovalRequestHost>
        ) : (
          <section data-testid="approval-request">
            <p role="status">이미 처리되었거나 조건이 바뀐 요청이에요.</p>
            <button type="button" data-ui="link" onClick={() => returnApprovalHome()}>
              결재함으로
            </button>
          </section>
        )}
      </DeskBody>
    </Dialog>
  );
}
