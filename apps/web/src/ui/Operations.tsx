import type { ProgressionController } from '../runtime/progression';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTaskMemory } from './taskMemory';
import type { ClientState, GameClient } from '../runtime/client';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import {
  BUSINESS_TABS,
  leaveOffice,
  officeAddress,
  officeView,
  type BusinessView,
  type OfficeView,
} from './state';
import { OfficeBar } from './OfficeBar';
import { OfficeLobby } from './OfficeLobby';
import s from './App.module.css';

/**
 * The owner office (→WEB-39): a lobby of six areas, each opening full-screen under the office bar
 * — the direction board (→WEB-60), building, money with any campaign started before rules 1.19,
 * sponsors, the club design and 결재 라인.
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
}: {
  controller: ProgressionController;
  state: ClientState;
  client: GameClient;
  legacy: ReactNode;
}) {
  const w = state.view!.world;
  const [view, setView] = useState<OfficeView>(() =>
    officeView(new URLSearchParams(location.search).get('view')),
  );
  // An area opened from the lobby returns there through history, so browser back agrees.
  const fromLobby = useRef(false);
  useEffect(() => {
    if (view !== 'lobby' || !backToLobby) return;
    backToLobby = false;
    const top = useTaskMemory.getState().scrolls[LOBBY_SCROLL] ?? 0;
    requestAnimationFrame(() => scroller()?.scrollTo({ top }));
  }, [view]);
  const openArea = (next: BusinessView) => {
    useTaskMemory.setState((memory) => ({
      scrolls: { ...memory.scrolls, [LOBBY_SCROLL]: scroller()?.scrollTop ?? 0 },
    }));
    fromLobby.current = true;
    history.pushState(null, '', officeAddress(next));
    setView(next);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
  };
  const toLobby = () => {
    if (fromLobby.current) {
      backToLobby = true;
      history.back();
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
        <OfficeBar
          back={{ label: '나가기', onClick: leaveOffice }}
          title="구단주 사무실"
          client={client}
        />
        <OfficeLobby w={w} sponsors={state.view!.sponsors} onOpen={openArea} />
      </>
    );
  const [id, label] = area;
  return (
    <>
      <OfficeBar back={{ label: '사무실', onClick: toLobby }} title={label} client={client} />
      {/* The bar names the area; its own panels carry their regions. */}
      <div data-office-view={id}>
        {id === 'office' ? (
          <Suspense fallback={null}>
            <OwnerOffice key={w.id} client={client} controller={controller} />
          </Suspense>
        ) : id === 'strategy' ? (
          <Suspense
            fallback={
              <div className={s.loading} role="status">
                방향을 여는 중…
              </div>
            }
          >
            <StrategyBoard w={w} client={client} />
          </Suspense>
        ) : id === 'finance' ? (
          <>
            <FinanceOutlook w={w} />
            <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
            {w.campaigns.length > 0 && (
              <BusinessWorkbench state={state} client={client} part="marketing" legacy={legacy} />
            )}
          </>
        ) : (
          <BusinessWorkbench state={state} client={client} part={id} legacy={legacy} />
        )}
      </div>
    </>
  );
}
