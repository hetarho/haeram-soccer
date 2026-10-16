import { expect, test } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/index';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { horizontalOverflow } from './layout';

for (const width of [360, 390]) {
  test(`fixed pitch ratio ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const world = createWorld({
      country: 'ENG',
      name: 'Mobile Pitch',
      color: '#224466',
      seed: 'mobile-pitch',
      level: 'easy',
    });
    world.settings!.responsibilities.sales = 'delegated';
    await importResponsibilityCareer(page, world);
    const date = await page.getByTestId('game-date').boundingBox();
    const mode = await page.getByRole('combobox', { name: '진행 모드', exact: true }).boundingBox();
    expect(date!.width).toBeGreaterThan(140);
    expect(mode!.y).toBeGreaterThanOrEqual(date!.y + date!.height);
    await page.getByRole('button', { name: '다음 경기 관전', exact: true }).click();
    const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
    await expect(canvas).toBeVisible();
    for (const height of [844, 740, 920]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() =>
          canvas.evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width / rect.height;
          }),
        )
        .toBeCloseTo(1.9, 2);
      const action = page.getByTestId('match-next-action');
      await expect(action).toBeInViewport();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }
  });
}

test('mobile result-only continuation preserves the exiting card position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const world = createWorld({
    country: 'ENG',
    name: 'Mobile Events',
    color: '#224466',
    seed: 'intervention-levels',
    level: 'easy',
  });
  const settings = world.settings!;
  settings.mode = 'manual';
  settings.observations.windowOpen = false;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  await importResponsibilityCareer(page, world);
  const mode = page.getByRole('combobox', { name: '진행 모드', exact: true });
  await expect(mode).toHaveAttribute('data-select-trigger', '');
  await chooseOption(mode, 'automatic');
  await expect(mode).toHaveAttribute('data-value', 'automatic');
  await chooseOption(mode, 'manual');
  await expect(mode).toHaveAttribute('data-value', 'manual');
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
    const card = page.getByTestId('event-card').filter({ hasText: '내일 경기' });
    await expect(card).toBeVisible();
    await card.evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished));
      const rect = node.getBoundingClientRect();
      const className = node.className;
      const samples: { x: number; y: number; width: number; height: number }[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records)
          for (const added of record.addedNodes)
            if (
              added instanceof HTMLElement &&
              added.className === className &&
              added.getAttribute('aria-hidden') === 'true'
            ) {
              const bounds = added.getBoundingClientRect();
              samples.push({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              });
            }
      });
      observer.observe(document.body, { childList: true });
      Object.assign(window, {
        exitGeometry: {
          before: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          samples,
        },
        exitObserver: observer,
      });
    });
    await card.getByRole('button', { name: '결과만 보고 계속', exact: true }).click();
    await expect(page.getByTestId('event-group')).toHaveCount(0);
    const geometry = await page.evaluate(() => {
      const state = window as unknown as {
        exitGeometry: { before: Record<string, number>; samples: Record<string, number>[] };
        exitObserver: MutationObserver;
      };
      state.exitObserver.disconnect();
      return state.exitGeometry;
    });
    expect(geometry.samples).toHaveLength(1);
    for (const [key, value] of Object.entries(geometry.before))
      expect(Math.abs(geometry.samples[0][key] - value), key).toBeLessThan(2);
    await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeEnabled();
  }
});
