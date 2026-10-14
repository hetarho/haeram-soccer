import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import { PageTabs, TabPanel } from './PageTabs';
import s from './App.module.css';

/**
 * 방향 as one page-tab bar (→WEB-39, →WEB-69): the direction board first (→WEB-60), then
 * building, money with any campaign started before rules 1.19, and sponsors.
 */
/** The direction board and its composer load on first visit, outside the entry (→ARCH-28). */
const StrategyBoard = lazy(() =>
  import('./StrategyBoard').then((module) => ({ default: module.StrategyBoard })),
);
const TABS = [
  ['strategy', '방향'],
  ['build', '증축'],
  ['finance', '자금'],
  ['sponsor', '후원'],
] as const;
type Tab = (typeof TABS)[number][0];
/** Addresses from before 방향 open the tab that now holds their content. */
const OLDER: Record<string, Tab> = { facility: 'build', marketing: 'finance' };

/** The page tab an address asks for: 방향 without a view, an older view's new home, else 방향. */
export function operationsTab(view: string | null): Tab {
  if (!view) return 'strategy';
  return TABS.find(([id]) => id === view)?.[0] ?? OLDER[view] ?? 'strategy';
}

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
  const [tab, setTab] = useState<Tab>(() =>
    operationsTab(new URLSearchParams(location.search).get('view')),
  );
  return (
    <>
      <PageTabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label="구단 방향 보기"
        idPrefix="operations"
      />
      <TabPanel idPrefix="operations" value={tab}>
        {tab === 'strategy' ? (
          <Suspense
            fallback={
              <div className={s.loading} role="status">
                방향을 여는 중…
              </div>
            }
          >
            <StrategyBoard w={w} client={client} />
          </Suspense>
        ) : tab === 'finance' ? (
          <>
            <FinanceOutlook w={w} />
            <BusinessWorkbench state={state} client={client} part="finance" legacy={legacy} />
            {w.campaigns.length > 0 && (
              <BusinessWorkbench state={state} client={client} part="marketing" legacy={legacy} />
            )}
          </>
        ) : (
          <BusinessWorkbench state={state} client={client} part={tab} legacy={legacy} />
        )}
      </TabPanel>
    </>
  );
}
