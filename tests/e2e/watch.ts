import type { Page } from '@playwright/test';

/** Observation is a home action; the full menu contains preferences and utilities. */
export async function openWatchAction(page: Page) {
  const home = page.getByTestId('club-hub');
  if (!(await home.isVisible()))
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '클럽 홈', exact: true })
      .click();
  return home.getByTestId('home-watch');
}

/** Continue from the theatre's next-match action, or open the contextual home action from another task. */
export async function watchNext(page: Page) {
  const next = page.getByRole('button', { name: '다음 경기 관전', exact: true });
  if (await next.isVisible()) await next.click();
  else await (await openWatchAction(page)).click();
  await page.getByTestId('match-theatre').waitFor({ state: 'visible' });
}
