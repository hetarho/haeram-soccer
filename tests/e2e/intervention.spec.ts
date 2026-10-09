import { chooseOption, selectOptions } from './select';
import { stopOnlyFor } from './events';
import { test, expect } from '@playwright/test';
import { horizontalOverflow, settle } from './layout';

test('changes a real starting XI through the mobile preparation sheet, saves it and shows earned finances', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('lineup-ui-regression');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  // Before the first match the preparation sheet opens from home's next-match card.
  const hub = page.getByTestId('club-hub');
  const prepare = hub.getByRole('button', { name: '전술·선발 준비', exact: true });
  await prepare.click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByText('선수별 교체', { exact: true }).click();
  const keeper = dialog.getByRole('combobox', { name: '선발 1 골키퍼', exact: true });
  const selected = await keeper.getAttribute('data-value');
  const other = (await selectOptions(keeper)).find(
    (option) => option.value && option.value !== selected,
  )?.value;
  expect(other).toBeTruthy();
  await chooseOption(keeper, other!);
  const keeperName = (await keeper.innerText()).split(' · ')[0];
  const save = dialog.getByRole('button', { name: '이 선발로 다음 경기 준비' });
  await settle(page);
  const rect = await save.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(48);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
  await save.click();
  await expect(
    dialog.getByText('선발 11명을 저장했습니다. 다음 경기부터 변경할 때까지 적용합니다.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await page.reload();
  const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
  await expect(page.getByTestId('hub-preparation')).toContainText('직접 고른 선발');
  await prepare.click();
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByText('선수별 교체', { exact: true }).click();
  await expect(keeper).toHaveAttribute('data-value', other!);
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
  const inspector = page.getByRole('combobox', { name: '살펴볼 선수', exact: true });
  await chooseOption(inspector, { label: `1. ${keeperName} · GK` });
  await expect(inspector).toContainText(keeperName);
  await page
    .getByTestId('match-theatre')
    .getByRole('button', { name: '전술·선발 준비', exact: true })
    .click();
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByRole('button', { name: '감독의 자동 선발로 전환', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(
    '매 경기 능력과 피로에 따라 선발을 자동 구성합니다.',
  );
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await page.reload();
  await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await expect(page.getByTestId('hub-preparation')).toContainText('감독 자동 선발');
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영' })
    .click();
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
    // Only the match eve may stop the clock here, so an incoming offer cannot interrupt it.
    await stopOnlyFor(page, ['match']);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    const nav = page.getByRole('navigation', {
      name: viewport.width < 760 ? '모바일 게임 메뉴' : '게임 메뉴',
      exact: true,
    });
    await nav.getByRole('button', { name: '리그', exact: true }).click();
    await page.getByRole('tab', { name: '순위표', exact: true }).click();
    const country = page.getByRole('combobox', { name: '국가', exact: true });
    await chooseOption(country, 'FRA');
    const contextUrl = page.url();
    // The clock runs on home; sheets opened there never pause it.
    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    const date = page.getByTestId('game-date');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(date).toHaveText('1901년 8월 2일');
    const menuButton = page.getByRole('button', { name: '전체 메뉴', exact: true });
    await menuButton.click();
    const menu = page.getByRole('dialog', { name: '전체 메뉴' });
    await expect(menu).toBeVisible();
    const opened = await date.innerText();
    await expect(date).not.toHaveText(opened);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(menuButton).toBeFocused();
    const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
    await expect(stop).toBeVisible();
    await stop.click();
    await nav.getByRole('button', { name: '리그', exact: true }).click();
    await expect(page).toHaveURL(contextUrl);
    await expect(country).toHaveAttribute('data-value', 'FRA');

    await nav.getByRole('button', { name: '구단 운영', exact: true }).click();
    const review = page.getByRole('button', { name: '시설 투자 검토', exact: true });
    await review.click();
    const plan = page.getByRole('dialog', { name: '시설 투자 확인' });
    await expect(plan).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(plan).toHaveCount(0);
    await expect(review).toBeFocused();
    await nav.getByRole('button', { name: '리그', exact: true }).click();
    await expect(page).toHaveURL(contextUrl);
    await expect(country).toHaveAttribute('data-value', 'FRA');

    await nav.getByRole('button', { name: '클럽 홈', exact: true }).click();
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '시즌 상세', exact: true })
      .click();
    const journal = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
    await expect(
      journal.getByRole('button', { name: '시즌 끝까지 진행', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^\d+시즌 진행$/ })).toHaveCount(0);
  });
}

test('prepares a subsequent match from the theatre while keeping the recorded score and playback context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const contextUrl = page.url();
  const score = await page.getByTestId('match-score').locator('strong').innerText();
  const date = await page.getByTestId('game-date').innerText();
  await page
    .getByTestId('match-theatre')
    .getByRole('button', { name: '전술·선발 준비', exact: true })
    .click();
  const preparation = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await preparation.getByRole('tab', { name: '선발 선택' }).click();
  await preparation.getByRole('button', { name: '피로 회복 우선으로 선택' }).click();
  await preparation.getByRole('button', { name: '이 선발로 다음 경기 준비' }).click();
  await expect(preparation.getByRole('status')).toContainText(
    '선발 11명을 저장했습니다. 다음 경기부터 변경할 때까지 적용합니다.',
  );
  await preparation.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await expect(page).toHaveURL(contextUrl);
  await expect(page.getByTestId('match-score').locator('strong')).toHaveText(score);
  await expect(page.getByTestId('game-date')).toHaveText(date);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
});
