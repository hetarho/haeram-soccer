import type { Page } from '@playwright/test';
import { primaryEntry } from './competition-navigation';
import { dismissMatchReport } from './events';
import { settle } from './layout';
import { openClubSection } from './office';

/** Follow the final gameplay hierarchy through the visible navigation. */
export async function openPersonnel(
  page: Page,
  view: 'players' | 'market' | 'training' | 'academy' | 'manager' | 'coaches',
) {
  await dismissMatchReport(page);
  // The transfer market is a primary entry of its own, outside the rooms (→WEB-10).
  if (view === 'market') {
    await primaryEntry(page, 'switch').click();
    await settle(page);
    return;
  }
  // The club's section bar leads to each people and training section (→WEB-10/43).
  await openClubSection(
    page,
    view === 'academy'
      ? '유소년'
      : view === 'training'
        ? '훈련'
        : view === 'coaches'
          ? '코치진'
          : '1군',
  );
  // Click local tabs only after the incoming view stops moving; Firefox otherwise scrolls it.
  await settle(page);
  if (view === 'academy' || view === 'training') return;
  const hub = view === 'coaches' ? '코칭스태프실' : '감독 사무실';
  const label = { players: '선수 목록', manager: '감독', coaches: '스태프' }[view];
  const tab = page
    .getByRole('tablist', { name: hub, exact: true })
    .getByRole('tab', { name: label, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}
