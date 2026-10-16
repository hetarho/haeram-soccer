import { test, expect } from '@playwright/test';
import { importSecondCareer } from './career-fixtures';
import { horizontalOverflow } from './layout';
test('qualitative-aptitude-visibility', async ({ page }) => {
  await importSecondCareer(page);
  const aptitude = page.getByTestId('profile-aptitude');
  await expect(aptitude).toContainText('코치 자질높음');
  await expect(aptitude).toContainText('감독 자질높음');
  await expect(aptitude).not.toContainText('OVR');
  await expect(aptitude).not.toContainText('4');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
test('once-only-encouragement', async ({ page }) => {
  const { player } = await importSecondCareer(page);
  await expect(page.getByRole('region', { name: '지도자 진로' })).toContainText('채용을 보장하지');
  await page.getByRole('button', { name: '지도자 진로 권유', exact: true }).click();
  await expect(page.getByText('진로 권유 사용 완료', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '지도자 진로 권유', exact: true })).toHaveCount(0);
  await page
    .getByRole('dialog', { name: player.name, exact: true })
    .getByRole('button', { name: '닫기', exact: true })
    .last()
    .click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await page
    .getByRole('button', { name: `${player.name} 선수 기록`, exact: true })
    .first()
    .click();
  await expect(page.getByText('진로 권유 사용 완료', { exact: false })).toBeVisible();
});
test('combined-playing-coach-review', async ({ page }) => {
  await importSecondCareer(page);
  await page.getByRole('button', { name: '지도자 진로 권유', exact: true }).click();
  await page.getByRole('button', { name: '플레잉 코치 계약안 보기', exact: true }).click();
  const review = page.getByLabel('선수·코치 통합 계약 검토');
  await expect(review).toContainText('선수 연봉');
  await expect(review).toContainText('코치 연봉');
  await expect(review).toContainText('합산 연봉');
  await expect(review).toContainText('즉시 지출');
  await expect(
    page.getByRole('region', { name: '지도자 진로' }).getByTestId('decision-owner-contracts'),
  ).toContainText('직접 결정');
  await expect(
    page.getByRole('region', { name: '지도자 진로' }).getByTestId('decision-owner-staff'),
  ).toContainText('직접 결정');
  await review.getByRole('button', { name: '선수·코치 계약 함께 승인', exact: true }).click();
  await expect(page.getByText('플레잉 코치 계약 승인 완료', { exact: false })).toBeVisible();
  await expect(review).toHaveCount(0);
});
