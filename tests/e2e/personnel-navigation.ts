import type { Page } from '@playwright/test';
import { primaryEntry } from './competition-navigation';
import { dismissMatchReport } from './events';
import { settle } from './layout';
import { enterOffice, officeLobby } from './office';

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
  const hub =
    view === 'academy'
      ? '유소년 훈련장'
      : view === 'training'
        ? '훈련장'
        : view === 'coaches'
          ? '코칭스태프실'
          : '감독 사무실';
  // The rooms' doors stand in the owner's office lobby (→WEB-39).
  await enterOffice(page);
  await officeLobby(page);
  await page
    .getByRole('navigation', { name: '클럽하우스 시설', exact: true })
    .getByRole('button', { name: hub, exact: true })
    .click();
  // Click local tabs only after the incoming view stops moving; Firefox otherwise scrolls it.
  await settle(page);
  if (view === 'academy' || view === 'training') return;
  const label = {
    players: '선수 목록',
    training: '훈련',
    manager: '감독',
    coaches: '스태프',
  }[view];
  await page
    .getByRole('tablist', { name: hub, exact: true })
    .getByRole('tab', { name: label, exact: true })
    .click();
}
