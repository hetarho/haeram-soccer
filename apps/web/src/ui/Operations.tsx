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
  approvalId,
  approvalWorld,
  leaveDesk,
  openOwnerOffice,
  returnApprovalHome,
  type OfficeView,
} from './state';
import { OfficeBar } from './OfficeBar';
import { ApprovalQueue } from './ApprovalQueue';
import { DeskBody, OfficeOverview } from './OfficeDesk';
import { OfficeTeam } from './ClubHub';

/**
 * The owner office (→WEB-39): the live 결재함 leads the moment it opens, then the read-only club
 * summary (→WEB-44); a selected request's review composes the authoritative
 * form of its work. Proactive work lives in the club's sections (→WEB-110), so a desk opened
 * without a request leaves for them.
 */
export function OperationsView({
  state,
  client,
  controller,
  personnel,
}: {
  state: ClientState;
  client: GameClient;
  controller: ProgressionController;
  personnel: (
    desk: 'players' | 'staff',
    client: GameClient,
    request: ApprovalRequest,
    error?: string,
  ) => ReactNode;
}) {
  const w = state.view!.world;
  const requests = useTaskMemory((memory) => memory.approvalRequests);
  const requestId = approvalId();
  const liveRequest = requestId
    ? approvalRequests(w).find((item) => item.id === requestId)
    : undefined;
  const [request] = useState(() =>
    requestId && approvalWorld() === w.id
      ? (requests[requestId] ??
        (liveRequest && eventDesk(liveRequest)
          ? { world: w.id, desk: eventDesk(liveRequest)!, item: liveRequest }
          : undefined))
      : undefined,
  );
  const [view, setView] = useState<OfficeView>(() =>
    officeView(new URLSearchParams(location.search).get('view')),
  );
  const area = BUSINESS_TABS.find(([id]) => id === view);
  // The overview is a modal over the queue; an address that names it lands there with it open.
  useEffect(() => {
    if (view !== 'office') return;
    history.replaceState(history.state, '', officeAddress('lobby'));
    setView('lobby');
    openOwnerOffice();
  }, [view]);
  useEffect(() => {
    if (area && !requestId) leaveDesk();
  }, [area, requestId]);
  if (!area)
    return (
      <OfficeOverview>
        <ApprovalQueue
          w={w}
          pending={approvalRequests(w)}
          client={client}
          controller={controller}
        />
        <OfficeTeam w={w} />
      </OfficeOverview>
    );
  if (!requestId) return null;
  const [id, label] = area;
  return (
    <>
      <OfficeBar title={label} />
      {/* The bar names the request's work; the review carries its return and its own form. */}
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
    </>
  );
}
