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
  leaveOffice,
  openOwnerOffice,
  returnApprovalHome,
  type OfficeView,
} from './state';
import { OfficeBar } from './OfficeBar';
import { OfficeLobby } from './OfficeLobby';
import { DeskBody, DeskSettings, OfficeDeskScene } from './OfficeDesk';
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
  journal,
  controller,
  personnel,
}: {
  controller: ProgressionController;
  state: ClientState;
  client: GameClient;
  legacy: ReactNode;
  /** The season briefing and club news, opened from the lobby. */
  journal: ReactNode;
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
  // The overview is a modal over the lobby; an address that names it lands there with it open.
  useEffect(() => {
    if (view !== 'office') return;
    history.replaceState(history.state, '', officeAddress('lobby'));
    setView('lobby');
    openOwnerOffice();
  }, [view]);
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
  const toLobby = () => {
    if (requestId) {
      returnApprovalHome();
      return;
    }
    if (history.state?.officeLobbyDepth) {
      backToLobby = true;
      history.go(-history.state.officeLobbyDepth);
      return;
    }
    history.replaceState(null, '', officeAddress('lobby'));
    setView('lobby');
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
  };
  const area = BUSINESS_TABS.find(([id]) => id === view);
  if (!area)
    return (
      <>
        <OfficeBar back={{ label: '클럽하우스', onClick: leaveOffice }} title="구단주 사무실" />
        <OfficeLobby
          w={w}
          client={client}
          sponsors={state.view!.sponsors}
          pending={stoppingEvents(w).filter((item) => !!eventDesk(item))}
          journal={journal}
          onOpen={openArea}
          onOverview={openOwnerOffice}
        />
      </>
    );
  const [id, label] = area;
  const pending = stoppingEvents(w);
  return (
    <>
      <OfficeBar back={{ label: '사무실', onClick: toLobby }} title={label} />
      {/* The bar names the area; its own panels carry their regions. */}
      <DeskBody data-office-view={id}>
        {!requestId && id !== 'identity' && (
          <OfficeDeskScene
            w={w}
            view={id}
            title={label}
            sponsors={state.view!.sponsors}
            pending={pending}
          />
        )}
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
            {id !== 'players' && id !== 'staff' && id !== 'identity' && (
              <DeskSettings>
                {DESK_RESPONSIBILITIES[id].length > 0 && (
                  <Suspense fallback={null}>
                    <OwnerOffice
                      key={`${w.id}:${id}`}
                      client={client}
                      controller={controller}
                      scope={DESK_RESPONSIBILITIES[id]}
                    />
                  </Suspense>
                )}
                <AreaCriteria w={w} areas={DESK_AREAS[id]} />
              </DeskSettings>
            )}
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
      </DeskBody>
    </>
  );
}
