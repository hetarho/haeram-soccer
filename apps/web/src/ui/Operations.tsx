import type { ProgressionController } from '../runtime/progression';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useTaskMemory } from './taskMemory';
import { ApprovalRequestHost } from './ApprovalRequestHost';
import { stoppingEvents } from '../runtime/progression';
import { eventDesk, type ApprovalRequest } from './eventRouting';
import type { ClientState, GameClient } from '../runtime/client';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import {
  BUSINESS_TABS,
  officeAddress,
  officeView,
  approvalId,
  approvalWorld,
  returnApprovalHome,
  type OfficeView,
} from './state';
import { OfficeBar } from './OfficeBar';
import { OfficeLobby } from './OfficeLobby';
import { AreaCriteria } from './DirectionLines';
import { DESK_AREAS, DESK_RESPONSIBILITIES } from './officeDesks';

/**
 * Five working desks compose the authoritative command panels and scoped criteria (→WEB-39).
 */
/** The direction board and its composer load on first visit, outside the entry (→ARCH-28). */
const StrategyBoard = lazy(() =>
  import('./StrategyBoard').then((module) => ({ default: module.StrategyBoard })),
);

const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((module) => ({ default: module.OwnerOffice })),
);

const LOBBY_SCROLL = '/direction';
/** Set on ← 사무실 so the lobby that history brings back stands where it was left. */
let backToLobby = false;
const scroller = () => document.querySelector<HTMLElement>('[data-testid="view-scroller"]');

export function OperationsView({
  state,
  client,
  legacy,
  controller,
  personnel,
}: {
  controller: ProgressionController;
  state: ClientState;
  client: GameClient;
  legacy: ReactNode;
  personnel: (
    desk: 'players' | 'staff',
    client: GameClient,
    request?: ApprovalRequest,
    error?: string,
  ) => ReactNode;
}) {
  const w = state.view!.world;
  const requests = useTaskMemory((memory) => memory.approvalRequests);
  const requestId = approvalId();
  const liveRequest = requestId
    ? stoppingEvents(w).find((item) => item.id === requestId)
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
  // An area opened from the lobby returns there through history, so browser back agrees.
  useEffect(() => {
    if (view !== 'lobby' || !backToLobby) return;
    backToLobby = false;
    const top = useTaskMemory.getState().scrolls[LOBBY_SCROLL] ?? 0;
    requestAnimationFrame(() => scroller()?.scrollTo({ top }));
  }, [view]);
  const openArea = (next: OfficeView) => {
    useTaskMemory.setState((memory) => ({
      scrolls: { ...memory.scrolls, [LOBBY_SCROLL]: scroller()?.scrollTop ?? 0 },
    }));
    backToLobby = true;
    history.pushState({ officeLobbyDepth: 1 }, '', officeAddress(next));
    setView(next);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
  };
  const area = BUSINESS_TABS.find(([id]) => id === view);
  if (view === 'office')
    return (
      <>
        <OfficeBar title="결재라인 모아보기" />
        <section aria-label="결재라인 모아보기">
          <Suspense fallback={<p role="status">결재라인을 여는 중…</p>}>
            <OwnerOffice key={w.id} client={client} controller={controller} />
          </Suspense>
        </section>
      </>
    );
  if (!area)
    return (
      <>
        <OfficeBar title="구단주 사무실" />
        <OfficeLobby
          w={w}
          sponsors={state.view!.sponsors}
          pending={stoppingEvents(w).filter((item) => !!eventDesk(item))}
          onOpen={openArea}
          onOverview={() => openArea('office')}
        />
      </>
    );
  const [id, label] = area;
  return (
    <>
      <OfficeBar title={label} />
      {/* The bar names the area; its own panels carry their regions. */}
      <div data-office-view={id}>
        {requestId ? (
          request && request.world === w.id && request.desk === id ? (
            <ApprovalRequestHost
              key={`${w.id}:${requestId}`}
              request={request}
              client={client}
              controller={controller}
            >
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
          )
        ) : null}
        {!requestId && (
          <>
            {id !== 'players' && id !== 'staff' && DESK_RESPONSIBILITIES[id].length > 0 && (
              <Suspense fallback={null}>
                <OwnerOffice
                  key={`${w.id}:${id}`}
                  client={client}
                  controller={controller}
                  scope={DESK_RESPONSIBILITIES[id]}
                />
              </Suspense>
            )}
            {id !== 'players' && id !== 'staff' && <AreaCriteria w={w} areas={DESK_AREAS[id]} />}
            {id === 'players' || id === 'staff' ? (
              personnel(id, client)
            ) : id === 'investment' ? (
              <>
                <FinanceOutlook w={w} />
                <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
                <BusinessWorkbench state={state} client={client} part="build" />
                {w.campaigns.length > 0 && (
                  <BusinessWorkbench
                    state={state}
                    client={client}
                    part="marketing"
                    legacy={legacy}
                  />
                )}
                <details data-ui="disclosure" data-testid="office-library">
                  <summary>구단 전체 방향·저장 설정</summary>
                  <Suspense fallback={<p role="status">방향을 여는 중…</p>}>
                    <StrategyBoard w={w} client={client} />
                  </Suspense>
                </details>
              </>
            ) : (
              <BusinessWorkbench state={state} client={client} part={id} legacy={legacy} />
            )}
          </>
        )}
      </div>
    </>
  );
}
