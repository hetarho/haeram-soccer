import type { Page } from '@playwright/test';

/** General watching lives in the HUD menu; match-eve journeys use their event card explicitly. */
export async function openWatchMenu(page: Page) {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  return page.getByRole('dialog', { name: '전체 메뉴', exact: true }).getByTestId('menu-watch');
}

/** Continue from the theatre's next-match action, or open the public menu action from a task. */
export async function watchNext(page: Page) {
  const next = page.getByRole('button', { name: '다음 경기 관전', exact: true });
  if (await next.isVisible()) await next.click();
  else await (await openWatchMenu(page)).click();
}
