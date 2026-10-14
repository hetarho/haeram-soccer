import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import { BusinessWorkbench } from './BusinessWorkbench';
import { FinanceOutlook } from './FinanceOutlook';
import { PageTabs, TabPanel } from './PageTabs';
import { BUSINESS_TABS, businessTab, type BusinessView } from './state';
import s from './App.module.css';

/**
 * 방향 as one page-tab bar (→WEB-39, →WEB-69): the direction board first (→WEB-60), then
 * building, money with any campaign started before rules 1.19, and sponsors.
 */
/** The direction board and its composer load on first visit, outside the entry (→ARCH-28). */
const StrategyBoard = lazy(() =>
  import('./StrategyBoard').then((module) => ({ default: module.StrategyBoard })),
);

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
  const [tab, setTab] = useState<BusinessView>(() =>
    businessTab(new URLSearchParams(location.search).get('view')),
  );
  return (
    <>
      <PageTabs
        tabs={BUSINESS_TABS}
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
