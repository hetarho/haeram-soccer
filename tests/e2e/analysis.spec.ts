import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

test('compares tactical rules as previews while the applied tactic and date stay unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const appliedText = await page
    .getByTestId('club-hub')
    .locator('[aria-label="다음 경기 준비"] p')
    .innerText();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await sheet.getByText('전술 실험실 · 네 가지 비교', { exact: true }).click();
  const lab = sheet.getByRole('region', { name: '전술 실험실', exact: true });
  await expect(lab.getByRole('article')).toHaveCount(4);
  await expect(lab).toContainText('0.0 pp');
  const press = lab.getByRole('button', { name: /압박 실험 미리보기$/ });
  await press.click();
  await expect(press).toHaveAttribute('aria-pressed', 'true');
  expect((await press.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(page.getByTestId('club-hub').locator('[aria-label="다음 경기 준비"] p')).toHaveText(
    appliedText,
  );
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
});

test('opens evidence-based opponent scouting without progressing the world', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  const toggle = sheet.getByText('상대 스카우팅 노트', { exact: true });
  await toggle.click();
  const dossier = sheet.getByRole('region', { name: '상대 스카우팅' });
  await expect(dossier).toContainText('최근 30경기 안의 맞대결 · 0경기');
  await expect(dossier).toContainText('아직 완료한 리그 경기가 없어요.');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await sheet.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(742);
});
