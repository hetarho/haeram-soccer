import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { clubMilestones } from '../../packages/engine/src/goals';
import type { World } from '../../packages/contracts/src/types';
import { expectHomeBounds, settle } from './layout';

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const download = await downloading;
  const raw = await readFile((await download.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

async function expectCompactHome(page: Page) {
  await expectHomeBounds(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`recognizes earned club milestones without changing the save at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(`milestone-ui-${viewport.width}`);
    await page.getByRole('button', { name: '넉넉한 출발' }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    await expectCompactHome(page);
    const before = await exportWorld(page);
    const initial = clubMilestones(before);
    expect(initial.total).toBe(8);
    expect(initial.completed).toBe(0);
    expect(initial.next).toBeDefined();
    expect(before.ownMatches).toHaveLength(0);
    const first = initial.next!;
    await expect(hub).toContainText(first.title);
    const opener = hub.getByRole('button', { name: '성장 목표 보기', exact: true });
    await opener.click();
    const collection = page.getByRole('dialog', { name: '클럽 성장 목표' });
    await expect(collection).toBeVisible();
    const goals = collection
      .getByRole('list', { name: '클럽 성장 목표 목록' })
      .getByRole('listitem');
    await expect(goals).toHaveCount(8);
    await expect(collection.getByLabel('달성한 성장 목표')).toContainText('0 / 8 달성');
    const debut = collection.getByTestId(`milestone-${first.id}`);
    await expect(debut.getByText('진행 중', { exact: true })).toBeVisible();
    await expect(debut).toContainText(first.action);
    await expect(debut.getByRole('progressbar')).toHaveAttribute('value', '0');
    const progress = await goals.locator('progress').evaluateAll((bars) =>
      bars.map((bar) => ({
        value: Number(bar.getAttribute('value')),
        max: Number(bar.getAttribute('max')),
      })),
    );
    expect(progress).toHaveLength(8);
    for (const bar of progress) {
      expect(bar.value).toBeGreaterThanOrEqual(0);
      expect(bar.value).toBeLessThanOrEqual(100);
      expect(bar.max).toBe(100);
    }
    const close = collection.getByRole('button', { name: '목표 확인 마치기', exact: true });
    await settle(page);
    const beforeScroll = await close.boundingBox();
    expect(beforeScroll!.height).toBeGreaterThanOrEqual(44);
    expect(beforeScroll!.y + beforeScroll!.height).toBeLessThanOrEqual(viewport.height);
    await collection.locator('[class*="modalBody"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const afterScroll = await close.boundingBox();
    expect(afterScroll!.y).toBe(beforeScroll!.y);
    await close.click();
    await expect(opener).toBeFocused();
    const afterBrowsing = await exportWorld(page);
    expect(afterBrowsing.revision).toBe(before.revision);
    expect(afterBrowsing.cash).toBe(before.cash);
    expect(afterBrowsing).toEqual(before);

    await page.getByTestId('hub-play').click();
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '클럽 홈', exact: true })
      .click();
    await page.reload();
    await expect(hub).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await expectCompactHome(page);
    const settled = await exportWorld(page);
    expect(settled.ownMatches).toHaveLength(1);
    const earned = clubMilestones(settled);
    expect(earned.goals.find((goal) => goal.id === first.id)?.done).toBe(true);
    expect(earned.completed).toBeGreaterThan(initial.completed);
    expect(earned.next?.id).not.toBe(first.id);
    if (earned.next) await expect(hub).toContainText(earned.next.title);
    await opener.click();
    await expect(debut.getByText('달성', { exact: true })).toBeVisible();
    await expect(debut.getByRole('progressbar')).toHaveAttribute('value', '100');
    await expect(collection.getByLabel('달성한 성장 목표')).toContainText(
      `${earned.completed} / 8 달성`,
    );
    await close.click();
  });
}
