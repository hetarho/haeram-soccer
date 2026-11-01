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
  // 팀's lists lead to each people page by a named management link, and the office's section
  // bar to 훈련 (→WEB-10/43/112): 1군 is the roster, and the manager stands with his staff in
  // 코치진. Neither has local tabs.
  await openClubSection(
    page,
    view === 'academy'
      ? '유소년'
      : view === 'training'
        ? '훈련'
        : view === 'coaches' || view === 'manager'
          ? '코치진'
          : '1군',
  );
  // Wait for the incoming view to stop moving; Firefox otherwise scrolls it under a click.
  await settle(page);
}

/** 코치진's manager card, the head of the club's coaching directory (→WEB-43). */
export const managerCard = (page: Page) => page.getByTestId('manager-card');
