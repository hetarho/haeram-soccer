import { PlaceActivities } from './PlaceActivities';
import { useEffect, type ReactNode } from 'react';
import type { ClientState, GameClient } from '../runtime/client';
import { FIRST_TEAM_TABS, STAFF_TABS } from './personnelNavigation';
import { openPersonnel, usePeopleView, type PeopleTab } from './state';
import { useTaskState } from './taskMemory';
import { useAddressTab } from './PageTabs';

/**
 * 1군 and 코치진 (→WEB-43): each opens on its actual people under their rooms' illustrations,
 * which the panel places beside them, with no room menu or office-return bar; the office's
 * section bar leads between them (→WEB-10). 1군 is the roster, its market view the primary
 * 이적시장 entry. 코치진 is the manager with his staff, the manager's replacement market over it,
 * and after them the requests the manager and the coaches take from the owner (→WEB-102). Both
 * compose the same authoritative panels the office's request reviews use; neither copies a
 * command.
 */
export function PersonnelHub({
  page,
  state,
  client,
  panel,
  market,
}: {
  page: 'firstTeam' | 'staff';
  state: ClientState;
  client: GameClient;
  panel: (tab: PeopleTab, replace: () => void) => ReactNode;
  market: (close: () => void) => ReactNode;
}) {
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
    if (page !== 'staff') return;
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
    openPersonnel({ page: 'staff', view: 'coaches' }, true);
  };
  const closeMarket = () => {
    setMarket(false);
    openPersonnel({ page: 'staff', view: 'coaches' });
  };
  return (
    <>
      {panel(tab as PeopleTab, replace)}
      {page === 'staff' && (
        <>
          <PlaceActivities place="manager" state={state} client={client} />
          <PlaceActivities place="coaching" state={state} client={client} />
        </>
      )}
      {page === 'staff' && showMarket && market(closeMarket)}
    </>
  );
}
