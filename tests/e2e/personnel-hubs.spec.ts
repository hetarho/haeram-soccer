import { expect, test } from '@playwright/test';
import { preparedWorld } from '../fixtures/prepared-world';
import { seedSlot, continueSlot } from './slots';
import { managerCard, openPersonnel } from './personnel-navigation';
import { openLeague, openClubRecords } from './competition-navigation';
import { horizontalOverflow, settle } from './layout';
import { clubSections } from './office';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`five gameplay entries and personnel workflows at ${viewport.width}px`, async ({ page }) => {
    // Every club section is reached through the shared section bar (→WEB-10).
    test.slow();
    await page.setViewportSize(viewport);
    const world = preparedWorld('manager-journey');
    world.settings!.mode = 'manual';
    await seedSlot(page, world);
    await page.goto('/');
    await continueSlot(page);
    const nav = page.getByRole('navigation', {
      name: viewport.width <= 760 ? '모바일 게임 메뉴' : '게임 메뉴',
      exact: true,
    });
    // The sidebar's clubhouse entry also carries the office's pending count after its label.
    expect(
      (
        await nav
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map(
              (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
            ),
          )
      ).map((label) => label.replace(/\d*( · 결재 대기 \d+건)?$/, '')),
    ).toEqual(
      viewport.width <= 760
        ? ['리그', '컵', '클럽하우스', '이적시장', '기록']
        : ['클럽하우스', '리그', '컵', '이적시장', '기록'],
    );
    for (const button of await nav.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await openLeague(page);
    await expect(page.getByRole('tablist', { name: '리그 보기', exact: true })).toBeVisible();
    await openClubRecords(page);
    await expect(page.getByRole('tablist', { name: '기록실 보기', exact: true })).toBeVisible();
    await openPersonnel(page, 'players');
    // 1군 is the actual roster under its current locker room (→WEB-43/72): no local tabs, room
    // menu or office-return bar above it.
    const rooms = page.getByTestId('facility-overview');
    await expect(page.getByRole('tablist', { name: '감독 사무실', exact: true })).toHaveCount(0);
    await expect(rooms).toHaveCount(1);
    await expect(rooms).toHaveAccessibleName('드레싱 룸');
    await expect(page.locator('[data-ui="office-bar"]')).toHaveCount(0);
    const active = world.players.filter((player) => player.status === 'active');
    // Who can play leads it, counted from the whole first team with the injured and suspended.
    await expect(page.getByTestId('roster-availability')).toHaveText(
      new RegExp(`^출전 가능 \\d+/${active.length}명 · 부상 \\d+명 · 출장 정지 \\d+명$`),
    );
    const locker = (await rooms.boundingBox())!;
    expect(locker.y + locker.height).toBeLessThanOrEqual(
      (await page.getByTestId('roster-availability').boundingBox())!.y,
    );
    const search = page.getByRole('textbox', { name: '선수 찾기' });
    // A fixture player is on the roster under his own name.
    await search.fill(active[0].name);
    await expect(page.getByText(active[0].name, { exact: true }).first()).toBeVisible();
    // The first team's tactics and culture follow the roster on the same page.
    await expect(
      page.getByTestId('tactics-talk').getByRole('button', { name: '감독에게 제안하기' }),
    ).toBeVisible();
    await search.fill('Retained work');
    const date = await page.getByTestId('game-date').innerText();
    const trigger = page
      .getByRole('region', { name: '시즌 진행', exact: true })
      .getByRole('button', { name: '결재라인 모아보기', exact: true });
    await trigger.click();
    const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
    const contracts = overview.getByRole('group', { name: '선수 계약', exact: true });
    const applied = contracts.locator('button[aria-pressed="true"]');
    const appliedLabel = await applied.innerText();
    await contracts.locator('button[aria-pressed="false"]').click();
    const confirmation = page.getByRole('dialog', {
      name: /^(자동으로 처리하겠습니다.|직접 결재하겠습니다.)$/,
    });
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    await expect(
      contracts.getByRole('button', { name: appliedLabel, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(overview).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(search).toHaveValue('Retained work');
    await expect(page.getByTestId('game-date')).toHaveText(date);
    await expect(page.getByTestId('progression-mode')).toHaveText('MANUAL');
    await openPersonnel(page, 'market');
    await expect(page.getByRole('region', { name: '선수 영입 데스크' })).toBeVisible();
    await openPersonnel(page, 'training');
    await expect(page).toHaveURL(/training$/);
    await expect(page.getByTestId('training-focus')).toBeVisible();
    // 훈련 opens on its own workflow: the focus and the coach's suggestion, no office-return bar.
    await expect(page.locator('[data-ui="office-bar"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /수석코치에게 훈련 제안·강행/ })).toBeVisible();
    // From the market a section opens through the office, entered by the clubhouse's illustrated
    // entrance, so browser back returns to the office's queue; it has no room doors (→WEB-10/39).
    await page.goBack();
    await expect(page.getByTestId('approval-queue')).toBeVisible();
    await expect(
      clubSections(page).getByRole('tab', { name: '사무실', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(page.getByTestId('training-focus')).toBeVisible();
    await openPersonnel(page, 'academy');
    await expect(page.getByTestId('facility-overview')).toHaveAccessibleName('유소년 아카데미');
    await expect(page.getByTestId('youth-focus')).toBeVisible();
    await expect(page.locator('[data-ui="office-bar"]')).toHaveCount(0);
    // 코치진 leads with the actual manager under his office, on the first viewport, and every post
    // under the coaching workroom (→WEB-43/72).
    await openPersonnel(page, 'coaches');
    await expect(rooms).toHaveCount(2);
    await expect(rooms.nth(0)).toHaveAccessibleName('감독실');
    await expect(rooms.nth(1)).toHaveAccessibleName('스태프 사무실');
    const manager = managerCard(page);
    await expect(
      page.getByRole('heading', { name: world.manager.name, exact: true }),
    ).toBeVisible();
    await expect(manager).toBeInViewport();
    for (const member of world.staff ?? [])
      await expect(page.locator(`#staff-post-${member.role}`)).toContainText(member.name);
    const managerBox = (await manager.boundingBox())!;
    const directorBox = (await page.locator('#staff-post-director').boundingBox())!;
    const officeBox = (await rooms.nth(0).boundingBox())!,
      workroomBox = (await rooms.nth(1).boundingBox())!;
    expect(officeBox.y + officeBox.height).toBeLessThanOrEqual(managerBox.y);
    expect(managerBox.y + managerBox.height).toBeLessThanOrEqual(workroomBox.y);
    expect(workroomBox.y + workroomBox.height).toBeLessThanOrEqual(directorBox.y);
    // The owner's requests to the manager and the staff follow the people, never precede them.
    const requests = (await page.getByTestId('place-activities-manager').boundingBox())!;
    expect(directorBox.y).toBeLessThan(requests.y);
    await expect(page.getByTestId('place-activities-coaching')).toBeAttached();
    await openPersonnel(page, 'players');
    await expect(search).toHaveValue('Retained work');
    await openPersonnel(page, 'coaches');
    await page.reload();
    await expect(
      clubSections(page).getByRole('tab', { name: '코치진', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(managerCard(page)).toBeVisible();
    await settle(page);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test('an older manager address opens the same manager workflow in 코치진', async ({ page }) => {
  const world = preparedWorld('manager-journey');
  world.settings!.mode = 'manual';
  await seedSlot(page, world);
  await page.goto('/');
  await continueSlot(page);
  await page.goto('/first-team?view=manager');
  await expect(page).toHaveURL(/\/staff\?view=coaches$/);
  await expect(managerCard(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: world.manager.name, exact: true })).toBeVisible();
  // Asking for candidates opens the replacement market over it.
  await page.goto('/manager?view=candidates');
  await expect(page).toHaveURL(/\/staff\?view=coaches&market=1$/);
  await expect(page.getByRole('dialog', { name: '감독 교체', exact: true })).toBeVisible();
});

test('a vacant manager post reads as an interim in charge with 감독 선임', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const world = preparedWorld('manager-journey');
  world.settings!.mode = 'manual';
  world.manager.interim = true;
  await seedSlot(page, world);
  await page.goto('/');
  await continueSlot(page);
  await openPersonnel(page, 'coaches');
  const manager = managerCard(page);
  await expect(manager).toBeInViewport();
  await expect(manager).toContainText('새 감독을 뽑을 때까지 대행');
  await expect(page.getByText('INTERIM MANAGER · 감독 공석', { exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: '감독 선임', exact: true })).toBeVisible();
});
