import type { Page } from '@playwright/test';
import { primaryEntry } from './competition-navigation';
import { dismissMatchReport } from './events';
import { settle } from './layout';
import { openTeamWork, openTraining } from './office';

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
  // 팀's lists lead to each people page by a named management link (→WEB-112): 1군 is the roster,
  // and the manager stands with his staff in 코치진. First-team training is read from the card of
  // the coach who sets it (→WEB-39/43).
  if (view === 'training') await openTraining(page);
  else
    await openTeamWork(
      page,
      view === 'academy' ? '유소년' : view === 'coaches' || view === 'manager' ? '코치진' : '1군',
    );
  // Wait for the incoming view to stop moving; Firefox otherwise scrolls it under a click.
  await settle(page);
}

/** 코치진's manager card, the head of the club's coaching directory (→WEB-43). */
export const managerCard = (page: Page) => page.getByTestId('manager-card');
