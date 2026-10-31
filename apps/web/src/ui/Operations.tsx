import { useEffect, useState, type ReactNode } from 'react';
import { useTaskMemory } from './taskMemory';
import { ApprovalRequestHost } from './ApprovalRequestHost';
import { approvalRequests } from '../runtime/progression';
import { eventDesk, type ApprovalRequest } from './eventRouting';
import type { ClientState, GameClient } from '../runtime/client';
import { BusinessWorkbench } from './BusinessWorkbench';
import {
  BUSINESS_TABS,
  officeAddress,
  officeView,
  approvalId,
  approvalWorld,
  leaveDesk,
  leaveOffice,
  openBusiness,
  openOwnerOffice,
  returnApprovalHome,
  type OfficeView,
} from './state';
import { OfficeBar } from './OfficeBar';
import { OfficeLobby } from './OfficeLobby';
import { DeskBody } from './OfficeDesk';

/**
 * The owner office (→WEB-39): its lobby and the review of a selected request, which composes the
 * authoritative form of its work. Proactive work lives in the club's sections (→WEB-110), so a
 * desk opened without a request leaves for them.
 */
export function OperationsView({
  state,
  client,
  journal,
  personnel,
}: {
  state: ClientState;
  client: GameClient;
  /** The season briefing and club news, opened from the lobby. */
  journal: ReactNode;
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
  // The overview is a modal over the lobby; an address that names it lands there with it open.
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
      <>
        <OfficeBar back={{ label: '클럽하우스', onClick: leaveOffice }} title="구단주 사무실" />
        <OfficeLobby
          w={w}
          client={client}
          sponsors={state.view!.sponsors}
          pending={approvalRequests(w)}
          journal={journal}
          onOpen={openBusiness}
          onOverview={openOwnerOffice}
        />
      </>
    );
  if (!requestId) return null;
  const [id, label] = area;
  return (
    <>
      <OfficeBar back={{ label: '사무실', onClick: () => returnApprovalHome() }} title={label} />
      {/* The bar names the request's work; its own form carries its regions. */}
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
            <button onClick={() => returnApprovalHome()}>홈으로</button>
          </section>
        )}
      </DeskBody>
    </>
  );
}
