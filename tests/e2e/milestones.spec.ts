import { watchNext } from './watch';
import { delegateSales, dismissMatchReport } from './events';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { clubMilestones } from '../../packages/engine/src/goals';
import type { World } from '../../packages/contracts/src/types';
import { expectHomeBounds, settle } from './layout';
import { currentDay, seasonLength } from '../../packages/engine/src/calendar';

async function exportWorld(page: Page): Promise<World> {
  await dismissMatchReport(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
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
  { width: 1280, height: 800 },
]) {
  test(`keeps a compact home with calendar progress and retained milestone facts at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    // Founding, three menu exports and a full observed match share this journey's budget.
    test.slow();
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(`milestone-ui-${viewport.width}`);
    await page.getByRole('button', { name: '쉬움' }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const hub = page.getByTestId('club-hub');
    await expect(hub).toBeVisible();
    // Measured on arrival: delegating goes through the owner office, whose entrance near the
    // bottom of a wide home is scrolled into view to be clicked, and leaving the office restores
    // that remembered scroll.
    await expectCompactHome(page);
    await delegateSales(page);
    const nextCard = hub.getByRole('region', { name: '다음 경기', exact: true });
    await expect(nextCard.getByTestId('home-watch')).toHaveCount(0);
    await expect(nextCard.getByRole('button', { name: '전술·선발 준비' })).toBeVisible();
    await settle(page);
    const cardBox = (await nextCard.boundingBox())!;
    const hubBox = (await hub.boundingBox())!;
    expect(Math.abs(cardBox.width - hubBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardBox.x - hubBox.x)).toBeLessThanOrEqual(1);
    const titleBox = (await nextCard.locator('h3').boundingBox())!;
    const prepare = nextCard.getByRole('button', { name: '전술·선발 준비', exact: true });
    const prepareBox = (await prepare.boundingBox())!;
    expect(cardBox.height).toBeLessThanOrEqual(152);
    const progressBox = (await hub
      .getByRole('progressbar', { name: '시즌 진행률', exact: true })
      .boundingBox())!;
    const conditionsBox = (await hub.getByTestId('team-state').boundingBox())!;
    expect(progressBox.y + progressBox.height).toBeLessThanOrEqual(conditionsBox.y);
    expect(conditionsBox.y + conditionsBox.height).toBeLessThanOrEqual(cardBox.y);
    expect(
      await nextCard.evaluate(
        (element) => element.previousElementSibling?.getAttribute('data-testid') === 'team-state',
      ),
    ).toBe(true);
    expect(prepareBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
    expect(prepareBox.y).toBeLessThan(titleBox.y + titleBox.height);
    expect(prepareBox.y + prepareBox.height).toBeGreaterThan(titleBox.y);
    // Firefox's protocol rounds 44px at fractional positions below 44; read the DOM size itself.
    expect(
      await prepare.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    // Notifications sit in the HUD; preparation stays usable across the full home content.
    await prepare.scrollIntoViewIfNeeded();
    await settle(page);
    await prepare.click({ trial: true });
    if (viewport.width < 760) {
      const contentBox = (await hub.locator('..').boundingBox())!;
      const viewBox = (await page.getByTestId('view-scroller').boundingBox())!;
      expect(
        Math.abs(viewBox.y + viewBox.height - contentBox.y - contentBox.height),
      ).toBeLessThanOrEqual(1);
      const prepareBox = (await prepare.boundingBox())!;
      const navBox = (await page
        .getByRole('navigation', { name: '모바일 게임 메뉴' })
        .boundingBox())!;
      expect(prepareBox.y + prepareBox.height).toBeLessThanOrEqual(navBox.y);
    }
    await page
      .locator('[class*="coreContent"]')
      .evaluateAll((elements) => elements.forEach((element) => (element.scrollTop = 0)));
    const before = await exportWorld(page);
    const initial = clubMilestones(before);
    expect(initial.total).toBe(8);
    expect(initial.completed).toBe(0);
    expect(initial.next).toBeDefined();
    expect(before.ownMatches).toHaveLength(0);
    const first = initial.next!;
    await expect(hub.getByRole('button', { name: '성장 목표 보기', exact: true })).toHaveCount(0);
    await expect(hub.getByTestId('news-headlines')).toHaveCount(0);
    await expect(
      hub.getByRole('heading', {
        name: before.clubs.find((club) => club.id === before.playerClub)!.name,
      }),
    ).toHaveCount(0);
    await expect(hub).not.toContainText('시즌 운영실');
    const progress = hub.getByRole('progressbar', { name: '시즌 진행률', exact: true });
    await expect(progress).toHaveAttribute('value', '0');
    await expect(hub).toContainText('시즌 진행률 0%');
    await settle(page);
    await page.screenshot({ path: test.info().outputPath(`home-${viewport.width}.png`) });
    const opener = page.getByTestId('communications-button');
    await opener.click();
    const sheet = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
    await sheet.getByRole('tab', { name: /^뉴스/ }).click();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(opener).toBeFocused();
    const afterBrowsing = await exportWorld(page);
    expect(afterBrowsing.revision).toBe(before.revision);
    expect(afterBrowsing.cash).toBe(before.cash);
    expect(afterBrowsing).toEqual(before);

    await watchNext(page, { manual: true });
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    await page
      .getByRole('navigation', { name: viewport.width < 760 ? '모바일 게임 메뉴' : '게임 메뉴' })
      .getByRole('button', { name: '클럽하우스', exact: true })
      .click();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
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
    const percent = Math.round((currentDay(settled) / seasonLength(settled)) * 100);
    expect(percent).toBeGreaterThan(0);
    await expect(progress).toHaveAttribute('value', String(percent));
    await expect(hub).toContainText(`시즌 진행률 ${percent}%`);
  });
}
