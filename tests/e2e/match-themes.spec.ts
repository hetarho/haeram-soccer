import { expect, test, type Page } from '@playwright/test';
import { canonical } from '../../packages/contracts/src/index';
import { createWorld } from '../../packages/engine/src/index';
import { readPresentationBaselines } from '../fixtures/presentation';
import { savedWorld } from './club-identity-helpers';
import { textContrast } from './contrast';
import { expectStablePossessionLayout, horizontalOverflow } from './layout';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { watchNext } from './watch';

async function themePicker(page: Page, theme: string) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByRole('dialog', { name: '설정', exact: true })
    .getByRole('button', { name: /^테마 변경/ })
    .click();
  await chooseOption(page.getByTestId('presentation-theme'), theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page
    .getByRole('dialog')
    .filter({ has: page.getByTestId('presentation-settings') })
    .getByRole('button', { name: '창 닫기', exact: true })
    .click();
}

for (const width of [360, 1380])
  test(`match themes paint their grounds, frame controls and preserve a paused instant at ${width}`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width, height: width === 360 ? 740 : 920 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const world = createWorld({
      country: 'ENG',
      name: 'Theme Match',
      color: '#224466',
      seed: 'match-theme-details',
      level: 'easy',
    });
    world.settings!.mode = 'manual';
    world.settings!.responsibilities.sales = 'delegated';
    await importResponsibilityCareer(page, world);
    await watchNext(page, { manual: true });

    // Native range input pauses at a recorded sample through the public observer control.
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    const scrubber = page.getByRole('slider', {
      name: '경기 시간',
      exact: true,
      includeHidden: true,
    });
    await scrubber.press('ArrowRight');
    const instant = await scrubber.inputValue();
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    const date = await page.getByTestId('game-date').innerText();
    const before = canonical(await savedWorld(page));
    const grounds = new Set<string>();
    const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기', { exact: true });

    let previousGround: string | undefined;
    for (const { id } of readPresentationBaselines().themeRegistry.entries) {
      await themePicker(page, id);
      await page.getByTestId('view-scroller').evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect
        .poll(async () =>
          canvas.evaluate((element) => {
            const c = element as HTMLCanvasElement;
            return [...c.getContext('2d')!.getImageData(3, 3, 1, 1).data].join(',');
          }),
        )
        .not.toBe(previousGround);
      // Pixel sampling checks the actual opaque Canvas, rather than only its CSS tokens.
      const ground = await canvas.evaluate((element) => {
        const c = element as HTMLCanvasElement;
        return [...c.getContext('2d')!.getImageData(3, 3, 1, 1).data].join(',');
      });
      grounds.add(ground);
      previousGround = ground;
      const theatre = page.getByTestId('pitch-theatre');
      for (const element of [
        theatre,
        page.getByTestId('match-feedback'),
        page.getByRole('region', { name: '경기 흐름 그래프', exact: true }),
      ]) {
        expect(await element.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
          '/art/',
        );
      }
      const back = page.getByTestId('match-score').getByRole('button', { name: '홈', exact: true });
      const bounds = (await back.boundingBox())!;
      // Firefox can report a 44px target as 43.999992 at a fractional layout position.
      expect(bounds.width).toBeGreaterThanOrEqual(44 - 1 / 64);
      expect(bounds.height).toBeGreaterThanOrEqual(44 - 1 / 64);
      const icon = (await back.locator('[data-pixel-icon="chevronLeft"]').boundingBox())!;
      expect(icon.width).toBeGreaterThanOrEqual(20);
      expect(icon.width).toBeLessThanOrEqual(24);
      expect(Math.abs(icon.x + icon.width / 2 - bounds.x - bounds.width / 2)).toBeLessThanOrEqual(
        1,
      );
      for (const text of [
        page.getByTestId('match-score').locator('b').filter({ visible: true }).first(),
        page.getByRole('button', { name: '경기 상세', exact: true }),
        page.getByTestId('match-readiness'),
      ]) {
        expect((await text.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
      }
      const cue = page.getByTestId('possession-cue');
      await expectStablePossessionLayout(page);
      if (await cue.count()) {
        await expect(cue).toContainText('소유');
        expect((await cue.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
      }
      const ratio = await canvas.evaluate((node) => node.clientWidth / node.clientHeight);
      expect(ratio).toBeCloseTo(1.9, 2);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      if (width === 360) await expect(page.getByTestId('match-next-action')).toBeInViewport();
      await expect(scrubber).toHaveValue(instant);
      await expect(page.getByTestId('game-date')).toHaveText(date);
      expect(canonical(await savedWorld(page))).toBe(before);
    }
    expect(grounds.size).toBe(readPresentationBaselines().themeRegistry.entries.length);
  });
