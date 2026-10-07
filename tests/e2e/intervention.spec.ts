import { test, expect } from '@playwright/test';

test('changes a real starting XI through the mobile preparation sheet, saves it and shows earned finances', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('lineup-ui-regression');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '경기 관전' })
    .click();
  await page.getByRole('tab', { name: '전술·선발', exact: true }).click();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByText('선수별 교체', { exact: true }).click();
  const keeper = dialog.getByLabel('선발 1 골키퍼', { exact: true });
  const selected = await keeper.inputValue();
  const other = await keeper
    .locator('option')
    .evaluateAll(
      (options, current) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .find((value) => value && value !== current),
      selected,
    );
  expect(other).toBeTruthy();
  await keeper.selectOption(other!);
  const keeperName = (await keeper.locator('option:checked').innerText()).split(' · ')[0];
  const save = dialog.getByRole('button', { name: '이 선발로 다음 경기 준비' });
  const rect = await save.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(48);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(844);
  await save.click();
  await expect(
    dialog.getByText('선발 11명을 저장했습니다. 다음 경기부터 변경할 때까지 적용합니다.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await page.reload();
  await page.getByRole('tab', { name: '전술·선발', exact: true }).click();
  await expect(
    page.getByRole('tabpanel', { name: '전술·선발', exact: true }).getByText(/직접 선택한 선발/),
  ).toBeVisible();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByText('선수별 교체', { exact: true }).click();
  await expect(keeper).toHaveValue(other!);
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
  await page.getByRole('tab', { name: '경기', exact: true }).click();
  await page.getByRole('button', { name: '다음 경기 관전', exact: true }).click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
  const inspector = page.getByLabel('살펴볼 선수');
  await inspector.selectOption({ label: `1. ${keeperName} · GK` });
  await expect(inspector.locator('option:checked')).toContainText(keeperName);
  await page.getByRole('tab', { name: '전술·선발', exact: true }).click();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByRole('button', { name: '감독의 자동 선발로 전환', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(
    '매 경기 능력과 피로에 따라 선발을 자동 구성합니다.',
  );
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: '전술·선발', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: '전술·선발', exact: true })).toContainText(
    '감독의 자동 선발',
  );
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽 경영' })
    .click();
  await page.getByRole('button', { name: '수입·지출 장부', exact: true }).click();
  await expect(page.getByRole('region', { name: '수입과 지출 장부' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '돈이 들어오고 나간 이유' })).toBeVisible();
  await expect(page.getByText('다음 라운드 고정 지출')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
