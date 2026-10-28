import type { Page } from '@playwright/test';
import { dismissMatchReport } from './events';
import { settle } from './layout';

/** Follow the final gameplay hierarchy through the visible navigation. */
export async function openPersonnel(
  page: Page,
  view: 'players' | 'market' | 'training' | 'academy' | 'manager' | 'coaches',
) {
  await dismissMatchReport(page);
  const hub =
    view === 'academy'
      ? '유소년 훈련장'
      : view === 'training'
        ? '훈련장'
        : view === 'coaches'
          ? '코칭스태프실'
          : '감독 사무실';
  const mobile = (page.viewportSize()?.width ?? 1280) <= 760;
  await page
    .getByRole('navigation', { name: mobile ? '모바일 게임 메뉴' : '게임 메뉴', exact: true })
    .getByRole('button', { name: hub, exact: true })
    .click();
  // Click local tabs only after the incoming view stops moving; Firefox otherwise scrolls it.
  await settle(page);
  if (view === 'academy' || view === 'training') return;
  const label = {
    players: '선수 목록',
    market: '이적시장',
    training: '훈련',
    manager: '감독',
    coaches: '스태프',
  }[view];
  await page
    .getByRole('tablist', { name: hub, exact: true })
    .getByRole('tab', { name: label, exact: true })
    .click();
}
