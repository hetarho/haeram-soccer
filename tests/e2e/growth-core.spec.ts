import { expect, test } from '@playwright/test';
import { expectHomeBounds, viewGeometry } from './layout';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`growing club fits ${viewport.width}x${viewport.height} and opens real play and details`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(`growth-core-${viewport.width}`);
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await expectHomeBounds(page);
    const menu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const menuBounds = await menu.boundingBox();
    expect(menuBounds).not.toBeNull();
    // Home may scroll inside its column; every control is reachable above the tab bar.
    for (const target of await hub.getByRole('button').all()) {
      await target.scrollIntoViewIfNeeded();
      const bounds = await target.boundingBox();
      expect(bounds, await target.innerText()).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height, await target.innerText()).toBeLessThanOrEqual(
        menuBounds!.y,
      );
    }
    await hub.evaluate((element) => element.parentElement?.scrollTo(0, 0));
    for (const target of await menu.getByRole('button').all()) {
      const bounds = await target.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    await expect(page.getByTestId('hud-cash')).toContainText('운영 자금');
    await expect(page.getByTestId('hud-cash')).toBeVisible();
    await expect(hub.getByText('리그 순위', { exact: true })).toBeVisible();
    await expect(hub.getByText('팀 전력', { exact: true })).toBeVisible();
    await expect(hub.getByText('시즌 전적', { exact: true })).toBeVisible();
    await expect(page.getByTestId('hub-record')).toHaveText('0-0-0');
    const state = page.getByRole('region', { name: '팀 상태' });
    for (const chip of ['피로', '분위기', '감독 입지', '선수단'])
      await expect(state.getByText(chip, { exact: true })).toBeVisible();

    const journalButton = hub.getByRole('button', { name: '시즌 상세', exact: true });
    await journalButton.click();
    const dialog = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    const body = dialog.locator('[class*="modalBody"]');
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(journalButton).toBeFocused();
    expect((await viewGeometry(page)).scroll).toBe(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);

    await page.getByTestId('hub-play').click();
    await expect(
      page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
    ).toBeVisible();
    await expect(page.getByTestId('calendar')).toContainText('라운드 1');
    await expect(page.getByLabel('22명의 선수와 공으로 표현하는 경기')).toBeVisible();
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
    await expect(page.getByTestId('match-result-summary')).toBeVisible();
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
  });
}
