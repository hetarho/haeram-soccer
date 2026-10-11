import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import { BuildBoard } from './BuildBoard';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import s from './App.module.css';

/**
 * Club operations as one tab bar instead of a long scroll (→WEB-39): the build first (strategy
 * cards with their dials), then money, then each kind of one-off deal.
 */
const TABS = [
  ['build', '구단 빌드'],
  ['finance', '재정'],
  ['facility', '시설'],
  ['sponsor', '후원'],
  ['marketing', '캠페인'],
] as const;
type Tab = (typeof TABS)[number][0];

export function OperationsView({
  state,
  client,
  legacy,
}: {
  state: ClientState;
  client: GameClient;
  legacy: ReactNode;
}) {
  const w = state.view!.world;
  const [tab, setTab] = useState<Tab>(() => {
    const saved = new URLSearchParams(location.search).get('view');
    return TABS.find(([id]) => id === saved)?.[0] || 'build';
  });
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('view', tab);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tab]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next][0]);
    document.getElementById(`operations-tab-${TABS[next][0]}`)?.focus();
  };
  return (
    <>
      <div
        className={`${s.seasonTabs} ${s.operationsTabs}`}
        role="tablist"
        aria-label="구단 운영 보기"
      >
        {TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`operations-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="operations-panel"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => keyboard(event, index)}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="operations-panel" role="tabpanel" aria-labelledby={`operations-tab-${tab}`}>
        {tab === 'build' ? (
          <BuildBoard w={w} client={client} />
        ) : tab === 'finance' ? (
          <>
            <FinanceOutlook w={w} />
            <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
          </>
        ) : (
          <BusinessWorkbench state={state} client={client} part={tab} legacy={legacy} />
        )}
      </div>
    </>
  );
}
