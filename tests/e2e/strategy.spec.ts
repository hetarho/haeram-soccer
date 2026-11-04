import { expect, test, type Locator } from '@playwright/test';
import { horizontalOverflow } from './layout';
import { openArea } from './office';
import { openPersonnel } from './personnel-navigation';
import { startCareer } from './start';
import { importLegacyDirection } from './legacy-direction';

/** The ticket price control on 경기장, which reads the price in force (→ECON-17). */
const ticketInForce = (stadium: Locator) =>
  stadium.getByRole('region', { name: '티켓 가격', exact: true });

test('reads the direction taken over with on the pages that set it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // A saved preset remains effective after new takeovers stop offering the choice.
  await importLegacyDirection(page, 'local-pride');
  // 1군 reads the direction its squad runs on. The owner reads a direction, never a "build"
  // (빌드업 is the football phase of play).
  await openPersonnel(page, 'players');
  const areas = page.getByTestId('direction-areas');
  await expect(areas).not.toContainText(/빌드(?!업)/);
  await expect(areas.getByRole('heading', { level: 3 })).toHaveText('구단 방향 · 유스 순혈주의');
  // Each dial the preset set reads its level in force on its area's page (→WEB-14/117).
  const community = await openArea(page, '팬 · 마케팅');
  for (const [key, level] of [
    ['localInvest', '지역 상권 투자'],
    ['globalMarketing', '입소문'],
    ['tour', '안 함'],
  ])
    await expect(community.locator(`[data-control="policy:${key}"]`)).toContainText(
      `현재 적용 · ${level}`,
    );
  await expect(ticketInForce(await openArea(page, '경기장'))).toContainText('현재 · 저렴');
  await expect(
    (await openArea(page, '유소년')).locator('[data-control="policy:academy"]'),
  ).toContainText('현재 적용 · 기본 운영');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 1280, height: 800 },
]) {
  test(`keeps the direction in force readable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page);
    await openPersonnel(page, 'players');
    const areas = page.getByTestId('direction-areas');
    await expect(areas.getByRole('heading', { level: 3 })).toHaveText('구단 방향 · 기본 방향');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect(ticketInForce(await openArea(page, '경기장'))).toContainText('현재 · 보통');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
