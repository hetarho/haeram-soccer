import { clubhouseTab, openLeague, resumeLeague } from './competition-navigation';
import { closeMatchDetails, openMatchDetails, watchNext } from './watch';
import { chooseOption } from './select';
import { chooseLevel, delegateSales } from './events';
import { test, expect } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';
import { leaveOffice, openOfficeArea } from './office';
import { savedWorld } from './club-identity-helpers';

test("reads the manager's XI on the mobile report, plays it and shows earned finances", async ({
  page,
}) => {
  // Reads the report before and after a watched match and visits the office; slow browsers need longer.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('lineup-ui-regression');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  // Before the first match the report opens from home's next-match card.
  const hub = page.getByTestId('club-hub');
  const prepare = hub.getByRole('button', { name: '상세 리포트', exact: true });
  await prepare.click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  await expect(dialog).toBeVisible();
  // The manager picks the XI (→CLUB-6): the report names him and draws his XI, nothing to edit.
  await expect(dialog.getByRole('region', { name: '감독 보고', exact: true })).toContainText(
    '선발은 능력과 피로를 보고 제가 고르겠습니다.',
  );
  const lineup = dialog.getByRole('region', { name: '감독의 선발', exact: true });
  const keeper = lineup.getByRole('button', { name: /^선발 1 · GK · / });
  const keeperName = (await keeper.getAttribute('aria-label'))!.split(' · ')[2]!;
  expect(keeperName).toBeTruthy();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  const close = dialog.getByRole('button', { name: '확인하고 홈으로', exact: true });
  await settle(page);
  const rect = await close.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
  await close.click();
  await watchNext(page);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  // The manager's keeper played: the details' report lists every own player who took part,
  // whether or not he finished the match.
  const details = await openMatchDetails(page);
  await expect(details.getByRole('region', { name: '경기 분석 리포트' })).toContainText(keeperName);
  await closeMatchDetails(page);
  await page
    .getByTestId('match-theatre')
    .getByRole('button', { name: '상세 리포트', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(lineup.getByTestId('formation-slot-0')).toBeVisible();
  await dialog.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await clubhouseTab(page).click();
  // No owner-chosen lineup is ever saved.
  expect('lineup' in (await savedWorld(page))).toBe(false);
  await openOfficeArea(page, '투자');
  await page.getByRole('button', { name: '수입·지출 장부', exact: true }).click();
  await expect(page.getByRole('region', { name: '수입과 지출 장부' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '돈이 들어오고 나간 이유' })).toBeVisible();
  await expect(page.getByText('다음 라운드 고정 지출')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

// Ported from the removed quick-action launcher: interventions now open from the pages and the
// full menu, and must still keep the player's context and never interrupt the shared clock.
for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`intervenes over the league without losing filters or interrupting progress at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await delegateSales(page);
    await expect(page.getByTestId('club-hub')).toBeVisible();
    // Level 4 stops only for money, so an incoming offer cannot interrupt the clock here.
    await chooseLevel(page, 4);
    await openLeague(page);
    await page.getByRole('tab', { name: '순위표', exact: true }).click();
    const country = page.getByRole('combobox', { name: '국가', exact: true });
    await chooseOption(country, 'FRA');
    const contextUrl = page.url();
    // The clock runs on home; sheets opened there never pause it.
    await clubhouseTab(page).click();
    const date = page.getByTestId('game-date');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).toHaveText('1950.08.02');
    const menuButton = page.getByRole('button', { name: '설정', exact: true });
    await menuButton.click();
    const menu = page.getByRole('dialog', { name: '설정' });
    await expect(menu).toBeVisible();
    const opened = await date.innerText();
    await expect(date).not.toHaveText(opened);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
    await expect(stop).toBeVisible();
    await stop.click();
    await resumeLeague(page);
    await expect(page).toHaveURL(contextUrl);
    await expect(country).toHaveAttribute('data-value', 'FRA');

    await openOfficeArea(page, '투자');
    const review = page.getByRole('button', { name: '경기장 공사 검토', exact: true });
    await review.click();
    const plan = page.getByRole('dialog', { name: '경기장 공사 확인' });
    await expect(plan).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(plan).toHaveCount(0);
    await expect(review).toBeFocused();
    await leaveOffice(page);
    await resumeLeague(page);
    await expect(page).toHaveURL(contextUrl);
    await expect(country).toHaveAttribute('data-value', 'FRA');

    await clubhouseTab(page).click();
    await expect(page.getByRole('button', { name: '자동 진행 시작', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^\d+시즌 진행$/ })).toHaveCount(0);
  });
}

test('opens the next report from the theatre while keeping the recorded score and playback context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await delegateSales(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await watchNext(page);
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  const contextUrl = page.url();
  const score = await page.getByTestId('match-score').locator('strong').innerText();
  const date = await page.getByTestId('game-date').innerText();
  await page
    .getByTestId('match-theatre')
    .getByRole('button', { name: '상세 리포트', exact: true })
    .click();
  const preparation = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  await expect(preparation).toBeVisible();
  await expect(preparation.getByRole('region', { name: '감독의 선발', exact: true })).toBeVisible();
  await preparation.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
  await expect(page).toHaveURL(contextUrl);
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(score);
  await expect(page.getByTestId('game-date')).toHaveText(date);
  await expect(page.getByRole('radiogroup', { name: '관전 속도', exact: true })).toBeVisible();
});
