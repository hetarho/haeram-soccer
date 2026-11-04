import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { horizontalOverflow } from './layout';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`explains gameplay outcomes, causal factors and actions at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/constants');
    await expect(
      page.getByRole('heading', { name: '게임플레이 영향 요소', exact: true }),
    ).toBeVisible();
    const search = page.getByRole('searchbox', { name: '결과·요인·행동으로 검색' });
    await expect(search).toBeVisible();
    await search.fill('재계약 수락 여부');
    // Related outcomes can match the same causal search; inspect the requested result.
    const card = page.locator('#renewal-acceptance');
    await expect(card).toHaveCount(1);
    const surfaces = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      const heading = element.querySelector('h3')!.parentElement!;
      return {
        page: getComputedStyle(document.body).backgroundColor,
        card: style.backgroundColor,
        heading: getComputedStyle(heading).backgroundColor,
        border: style.borderTopStyle,
        borderWidth: parseFloat(style.borderTopWidth),
      };
    });
    // Missing page tokens used to leave every surface transparent on the browser's dark canvas.
    expect(surfaces.card).not.toBe('rgba(0, 0, 0, 0)');
    expect(surfaces.card).not.toBe(surfaces.page);
    expect(surfaces.heading).not.toBe(surfaces.card);
    expect(surfaces.border).toBe('solid');
    expect(surfaces.borderWidth).toBeGreaterThan(0);
    await expect(card).toContainText('최소 수락 연봉');
    await expect(card).toContainText('추첨하지 않습니다');
    await expect(card).toContainText('우리 팀 평균 OVR');
    await expect(card.locator('ol ol')).toHaveCount(1);
    await card.getByText('구현 근거 확인', { exact: true }).click();
    await expect(card.getByText('offerContract', { exact: true })).toBeVisible();
    await card.getByRole('link', { name: '연봉·시설 유지·운영 경비', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page).toHaveURL(/#operating-cost$/);
    await expect(
      page.getByRole('heading', { name: '연봉·시설 유지·운영 경비', exact: true }),
    ).toBeInViewport();
    await page.getByText('행동부터 보기 — 내가 이걸 하면 무엇이 바뀌나?', { exact: true }).click();
    await expect(page.getByText('제시 연봉을 올려 재계약하기', { exact: true })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name: /정리된 목록 내려받기/ }).click();
    const download = await downloaded;
    const markdown = await readFile((await download.path())!, 'utf8');
    expect(markdown).toContain('1. **선수의 재계약 수락 여부**');
    expect(markdown).toContain('      1. **시장 연봉**');
    expect(markdown).toContain('## 행동부터 보기');
  });
}
