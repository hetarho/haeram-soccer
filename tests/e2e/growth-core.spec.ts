import { watchNext } from './watch';
import { expect, test, type Locator } from '@playwright/test';
import { expectHomeBounds, settle, viewGeometry } from './layout';
import { createWorld } from '../../packages/engine/src/index';
import { activePlayers } from '../../packages/engine/src/world';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { enterOffice } from './office';
import { clubhouseTab } from './competition-navigation';

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
  test(`19-player warning opens from its office quick action at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const world = createWorld({
      country: 'ENG',
      name: 'Synthetic Thin Squad',
      color: '#24543b',
      seed: 'thin-squad-alert',
      level: 'easy',
    });
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
    for (const moved of ['quick-actions', 'club-situation', 'quick-warning-development'])
      await expect(hub.getByTestId(moved)).toHaveCount(0);
    // The office's 훈련·육성 quick actions answer the thin squad; its state reads beside them.
    await enterOffice(page);
    await expect(page.getByTestId('quick-warning-development')).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expectHomeBounds(page);
    // The current-club summary reads the thin squad in plain words; it has nothing to press.
    const situation = page.getByTestId('club-situation');
    const squad = situation.locator('[data-fact="squad"]');
    await expect(squad).toContainText('19/19');
    await expect(squad.getByTestId('situation-warning-squad')).toHaveText('· 주의');
    await expect(situation.getByRole('button')).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await expect(situation).not.toContainText('선수 19명');
    // Its advice comes on request, from the quick action that answers it (→WEB-44/107).
    const button = page
      .getByTestId('quick-actions')
      .getByRole('button', { name: /^훈련·육성 .* · 주의 · 바로 할 수 있는 일/ });
    await expectTouchSize(button);
    await button.click();
    const remedies = page.getByRole('dialog', { name: '훈련·육성', exact: true });
    await expect(remedies).toBeVisible();
    await expect(remedies).toContainText('선수 19명');
    await expect(remedies).toContainText('선발을 채우기 어려워요.');
    await page.keyboard.press('Escape');
    await expect(remedies).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.press('Enter');
    await expect(remedies).toBeVisible();
    await remedies.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(button).toBeFocused();
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
    await expect(page.getByTestId('hud-cash')).toContainText('운영 자금');
    await expect(page.getByTestId('hud-cash')).toBeVisible();
    const season = hub.getByRole('region', { name: '이번 시즌', exact: true });
    for (const figure of ['라운드', '리그 순위', '승점 0'])
      await expect(season.getByText(figure, { exact: true })).toBeVisible();
    await expect(page.getByTestId('hub-record')).toHaveText('0-0-0');
    // The club's situation and the quick actions moved into the office (→WEB-11/39).
    await expect(hub.getByTestId('quick-actions')).toHaveCount(0);
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

    // The office groups the owner's quick actions by topic beside the club's situation, below its
    // 결재함 (→WEB-39/44/107).
    await enterOffice(page);
    const quick = page.getByTestId('quick-actions');
    for (const group of ['분위기', '피로', '훈련·육성'])
      await expect(quick.getByText(group, { exact: true })).toBeVisible();
    const situation = page.getByRole('region', { name: '클럽 현황', exact: true });
    // Strength changes with the lineup, fatigue and morale, so it leads the summary (→WEB-44).
    await expect(situation.locator('dt')).toHaveText([
      '팀 전력',
      '출전 가능',
      '선발 피로',
      '분위기',
      '감독 입지',
    ]);
    await expect(situation.getByRole('button')).toHaveCount(0);
    await expectHomeBounds(page);
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
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
    await page.getByRole('button', { name: '홈으로', exact: true }).click();
    await expect(page.getByTestId('game-round')).toHaveText('1');
  });
}
