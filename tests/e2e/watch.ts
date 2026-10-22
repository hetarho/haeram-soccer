import { expect, type Page } from '@playwright/test';
import { acknowledgeEvents, configureResponsibilities } from './events';
import { chooseOption } from './select';

/** Resume a live match, or progress through real public events to the match-eve dialog. */
export async function openWatchAction(page: Page) {
  const watch = page
    .getByTestId('event-card')
    .getByRole('button', { name: '관전하기 ▶', exact: true });
  if (await watch.isVisible()) return watch;
  const eve = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
  if (await eve.isVisible())
    await eve.getByRole('button', { name: '창 닫기', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '클럽 홈', exact: true }).click();
  const resume = page.getByTestId('home-watch');
  if (await resume.isVisible()) return resume;
  await configureResponsibilities(page, { observations: { matchEve: true } });
  const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  if (await pace.isVisible()) await chooseOption(pace, 'x10');
  for (let step = 0; step < 80; step++) {
    const pill = page.getByTestId('event-pill');
    if (await pill.isVisible()) await pill.click();
    if (await watch.isVisible()) return watch;
    await acknowledgeEvents(page);
    if (await watch.isVisible()) return watch;
    const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
    if (await next.isVisible()) await next.click();
    else {
      const play = page.getByRole('button', { name: '자동 진행 시작', exact: true });
      if (await play.isVisible()) await play.click();
    }
    await expect
      .poll(
        async () => (await watch.isVisible()) || (await page.getByTestId('event-card').count()) > 0,
        { timeout: 20000 },
      )
      .toBe(true);
  }
  throw new Error('No match eve after eighty public progression events');
}

export async function watchNext(page: Page, { manual = false } = {}) {
  if (manual) await configureResponsibilities(page, { mode: 'manual' });
  await (await openWatchAction(page)).click();
  await page.getByTestId('match-theatre').waitFor({ state: 'visible' });
}
