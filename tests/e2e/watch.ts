import { clubhouseTab } from './competition-navigation';
import { expect, type Page } from '@playwright/test';
import { acknowledgeEvents, configureResponsibilities, dismissMatchReport } from './events';
import { chooseOption } from './select';

/** Resume a live match, or progress through real public events to the match-eve dialog. */
export async function openWatchAction(page: Page) {
  const watch = page
    .getByTestId('event-card')
    .getByRole('button', { name: '관전하기 ▶', exact: true });
  const resume = page
    .getByRole('dialog', { name: '관전 이어보기', exact: true })
    .getByRole('button', { name: '관전 이어보기', exact: true });
  const home = clubhouseTab(page);
  for (let attempt = 0; ; attempt++) {
    if (await watch.isVisible()) return watch;
    if (await resume.isVisible()) return resume;
    await dismissMatchReport(page);
    try {
      await home.click({ timeout: 2000 });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      // The clock a finished match resumed can reach the next eve after the dismissal above, and
      // its backdrop takes the click (CI Firefox 40262705063, business:266): that eve is the one
      // this journey wants, so the next pass returns its watch action.
    }
  }
  await configureResponsibilities(page, { observations: { matchEve: true } });
  const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
  if (await pace.isVisible()) await chooseOption(pace, 'x10');
  for (let step = 0; step < 80; step++) {
    if (await resume.isVisible()) return resume;
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
        async () =>
          (await watch.isVisible()) ||
          (await resume.isVisible()) ||
          (await page.getByTestId('event-card').count()) > 0,
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
