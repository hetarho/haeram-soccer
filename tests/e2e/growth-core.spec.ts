import { watchNext } from './watch';
import { expect, test, type Locator } from '@playwright/test';
import { expectHomeBounds, settle, viewGeometry } from './layout';
import { createWorld } from '../../packages/engine/src/index';
import { activePlayers } from '../../packages/engine/src/world';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { enterOffice, leaveOffice } from './office';

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
  test(`19-player warning opens from its office tile at ${viewport.width}x${viewport.height}`, async ({
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
    // Home's 훈련·육성 quick actions answer the thin squad; its state reads in the office.
    await expect(page.getByTestId('quick-warning-development')).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expectHomeBounds(page);
    await enterOffice(page);
    const state = page.getByTestId('team-state');
    const squad = state.locator('[data-condition="squad"]');
    const warning = squad.getByTestId('state-warning-squad');
    const button = squad.getByRole('button', { name: /선수단.*주의.*대처 방법 보기/ });
    await expect(warning).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(state).not.toContainText('선수 19명');
    await expectTouchSize(button);
    // Clicking the badge uses the existing full-size tile button.
    await warning.click();
    const remedies = page.getByRole('dialog', { name: '선수단 채우기', exact: true });
    await expect(remedies).toBeVisible();
    await expect(remedies).toContainText('선수 19명');
    await expect(remedies).toContainText('선발을 채우기 어려워요.');
    await expect(remedies.getByRole('button', { name: '열기', exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(remedies).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(warning).toBeVisible();
    await button.press('Enter');
    await expect(remedies).toBeVisible();
    await remedies.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(button).toBeFocused();
    await leaveOffice(page);
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
    // Home groups the owner's quick actions by topic (→WEB-107).
    const quick = page.getByTestId('quick-actions');
    for (const group of ['분위기', '피로', '훈련·육성'])
      await expect(quick.getByText(group, { exact: true })).toBeVisible();
    // Team state and the journal live in the owner office lobby (→WEB-39/44).
    await enterOffice(page);
    const state = page.getByRole('region', { name: '팀 상태' });
    // Strength changes with the lineup, fatigue and morale, so it leads team state (→WEB-44).
    for (const chip of ['팀 전력', '피로', '분위기', '감독 입지', '선수단'])
      await expect(state.getByText(chip, { exact: true })).toBeVisible();

    const journalButton = page
      .getByTestId('office-lobby')
      .getByRole('button', { name: '클럽 소식·시즌 브리핑', exact: true });
    // A click while the lobby still slides in makes Firefox scroll the moving button into view.
    await settle(page);
    await journalButton.click();
    const dialog = page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' });
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
    await expect(journalButton).toBeFocused();
    // Closing returns focus to the journal without moving the lobby.
    expect((await viewGeometry(page)).scroll).toBe(opened);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await leaveOffice(page);

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
