import { watchNext } from './watch';
import { expect, test, type Locator } from '@playwright/test';
import { expectHomeBounds, settle, viewGeometry } from './layout';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { activePlayers } from '../../packages/engine/src/world';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { openClubOverview } from './office';
import { clubhouseTab } from './competition-navigation';
import { startCareer } from './start';

async function expectTouchSize(target: Locator) {
  // Firefox's protocol subtracts rounded quad coordinates: a 44px target at a fractional y
  // becomes 43.999984px. The native DOM rectangle preserves its actual CSS pixel dimensions, but
  // while the advice still rises in, its translateY maps that rectangle through float32 math and
  // Chromium reads 43.99994px near y=700. Layout itself works in 1/64px units, so snap to them:
  // the float noise (under 0.008px) goes, while any real shortfall of a layout unit still fails.
  const size = await target.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    const snap = (value: number) => Math.round(value * 64) / 64;
    return { width: snap(width), height: snap(height) };
  });
  const label = await target.innerText();
  expect(size.width, label).toBeGreaterThanOrEqual(44);
  expect(size.height, label).toBeGreaterThanOrEqual(44);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`19-player warning reads in the office summary at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const world = careerWorld({ country: 'ENG', seed: 'thin-squad-alert' });
    for (const player of activePlayers(world).slice(19)) player.status = 'sold';
    world.cash = '999999999';
    world.manager.trust = 80;
    world.morale = 80;
    for (const player of activePlayers(world)) player.fatigue = 0;
    await importResponsibilityCareer(page, world);
    const alert = page.getByTestId('team-state-alert');
    // Home keeps only its briefing and the office entrance (→WEB-11).
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await expect(hub.getByTestId('club-situation')).toHaveCount(0);
    // The office's 오버뷰 reads the thin squad, warned plainly, with no quick action (→WEB-39/44).
    const overview = await openClubOverview(page);
    await expect(overview.getByTestId('quick-actions')).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await expectHomeBounds(page);
    await expect(overview.getByTestId('situation-warning-squad')).toHaveText('· 주의');
    await expect(alert).toHaveCount(0);
    await overview
      .locator('[data-ui="dialog-header"]')
      .getByRole('button', { name: '창 닫기', exact: true })
      .click();
    // The progress timeline lives on Home; the overview stays in the office.
    await clubhouseTab(page).click();
    await expect(hub).toBeVisible();
    await chooseOption(page.getByRole('combobox', { name: '자동 진행 배속', exact: true }), 'x10');
    await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await expect(page.getByTestId('event-group')).toBeVisible({ timeout: 15000 });
    await expect(alert).toHaveCount(0);
  });

  test(`growing club fits ${viewport.width}x${viewport.height} and opens real play and details`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    // The club's home with its first checkpoint saved.
    await startCareer(page, { seed: `growth-core-${viewport.width}` });
    const hub = page.getByTestId('club-hub');
    await expectHomeBounds(page);
    const menu = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    const menuBounds = await menu.boundingBox();
    expect(menuBounds).not.toBeNull();
    // Home may scroll inside its column; every control is reachable above the tab bar.
    for (const target of await hub.getByRole('button').all()) {
      await target.scrollIntoViewIfNeeded();
      const bounds = await target.boundingBox();
      expect(bounds, await target.innerText()).not.toBeNull();
      await expectTouchSize(target);
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
      await expectTouchSize(target);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    await expect(page.getByTestId('hud-cash')).toContainText('구단 자금');
    await expect(page.getByTestId('hud-cash')).toBeVisible();
    const season = hub.getByRole('region', { name: '이번 시즌', exact: true });
    for (const figure of ['라운드', '리그 순위', '승점 0'])
      await expect(season.getByText(figure, { exact: true })).toBeVisible();
    await expect(page.getByTestId('hub-record')).toHaveText('0-0-0');
    // The club's situation lives in the office (→WEB-11/39).
    await expect(hub.getByRole('region', { name: '클럽 현황', exact: true })).toHaveCount(0);

    const reportButton = hub.getByRole('button', { name: '상세 리포트', exact: true });
    // A click while home still slides in makes Firefox scroll the moving button into view.
    await settle(page);
    await reportButton.click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
    await expect(dialog).toBeVisible();
    const opened = (await viewGeometry(page)).scroll;
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
    await expect(reportButton).toBeFocused();
    // Closing returns focus to the report without moving home.
    expect((await viewGeometry(page)).scroll).toBe(opened);
    expect(await page.evaluate(() => scrollY)).toBe(0);

    // The office's 오버뷰 reads the club as it stands, with no quick actions (→WEB-39/44): its
    // condition reads the starters' fatigue, 분위기, injuries and suspensions, the unhappy and the
    // manager's standing.
    const overview = await openClubOverview(page);
    await expect(overview.getByTestId('quick-actions')).toHaveCount(0);
    const condition = overview.locator('dl').filter({ hasText: '선발 평균 피로' });
    await expect(condition.locator('dt')).toHaveText([
      '선발 평균 피로',
      '팀 분위기',
      '부상 / 출장 정지',
      '불만 선수',
      '감독 입지',
    ]);
    await expectHomeBounds(page);
    await overview
      .locator('[data-ui="dialog-header"]')
      .getByRole('button', { name: '창 닫기', exact: true })
      .click();
    await clubhouseTab(page).click();
    await expect(hub).toBeVisible();

    await watchNext(page, { manual: true });
    await expect(
      page.getByTestId('match-theatre').getByRole('heading', { name: '매치데이' }),
    ).toBeVisible();
    await expect(page.getByLabel('22명의 선수와 공으로 표현하는 경기')).toBeVisible();
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    await expect(page.getByTestId('match-result-summary')).toBeVisible();
    // The standing after the match shows once it ends, without opening its details (→WEB-50).
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
    await page.getByRole('button', { name: '홈으로', exact: true }).click();
    await expect(page.getByTestId('game-round')).toHaveText('1');
  });
}
