import { useLocale } from '../presentation/react';
import { useEffect, type ReactNode } from 'react';
import type { ClientState } from '../runtime/client';
import { FIRST_TEAM_TABS, STAFF_TABS } from './personnelNavigation';
import { openPersonnel, usePeopleView, type PeopleTab } from './state';
import { useTaskState } from './taskMemory';
import { TabList, TabPanel, useAddressTab } from './PageTabs';
import { FacilityOverview } from './FacilityOverview';
import { tacticLabel } from '../../../../packages/engine/src/tactics';

/** Small hub composition; contract desks render these same authoritative action panels. */
export function PersonnelHub({
  page,
  state,
  panel,
  market,
}: {
  page: 'firstTeam' | 'staff';
  state: ClientState;
  panel: (tab: PeopleTab, replace: () => void) => ReactNode;
  market: (close: () => void) => ReactNode;
}) {
  const { t } = useLocale();
  const w = state.view!.world;
  const tabs = page === 'firstTeam' ? FIRST_TEAM_TABS : STAFF_TABS;
  const [tab] = useAddressTab<string>('view', tabs, tabs[0][0], {
    world: w.id,
    key: `personnel-${page}`,
    path: page === 'firstTeam' ? '/first-team' : '/staff',
    keepFirst: true,
  });
  const request = usePeopleView((store) => store.request);
  const [showMarket, setMarket] = useTaskState(w.id, 'manager-market-open', false);
  useEffect(() => {
    if (page !== 'firstTeam') return;
    const restore = () => setMarket(new URLSearchParams(location.search).get('market') === '1');
    restore();
    if (request) usePeopleView.getState().take();
    window.addEventListener('popstate', restore);
    window.addEventListener('tasknavigate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('tasknavigate', restore);
    };
  }, [page, tab, request, setMarket]);
  const replace = () => {
    setMarket(true);
    openPersonnel({ page: 'firstTeam', view: 'manager' }, true);
  };
  const closeMarket = () => {
    setMarket(false);
    openPersonnel({ page: 'firstTeam', view: 'manager' });
  };
  return (
    <>
      <TabList
        tabs={tabs.map(([id]) => [id, t(`personnel.${id}`)] as const)}
        value={tab}
        onChange={(view) =>
          openPersonnel(
            page === 'firstTeam'
              ? { page, view: view as (typeof FIRST_TEAM_TABS)[number][0] }
              : { page, view: view as (typeof STAFF_TABS)[number][0] },
          )
        }
        label={t(`navigation.${page}`)}
        idPrefix={page}
      />
      <TabPanel idPrefix={page} value={tab}>
        {tab !== 'market' && (
          <FacilityOverview
            w={w}
            kind={tab === 'coaches' ? 'staff' : tab === 'manager' ? 'manager' : 'locker'}
            title={tab === 'players' ? '드레싱 룸' : tab === 'manager' ? '감독실' : '스태프 사무실'}
          >
            {tab === 'coaches'
              ? `스태프 ${w.staff?.length ?? 0}명 · 감독 ${w.manager.name}`
              : `감독 ${w.manager.name} · ${tacticLabel[w.tactic]}`}
          </FacilityOverview>
        )}
        {panel(tab as PeopleTab, replace)}
      </TabPanel>
      {page === 'firstTeam' && tab === 'manager' && showMarket && market(closeMarket)}
    </>
  );
}
