import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LINES, POSITIONS, type Line } from '../../packages/contracts/src/player';
import { lineOf } from '../../packages/engine/src/player';
import { textContrast } from './contrast';
import { horizontalOverflow, settle } from './layout';
import { closeMarketPanel, marketFilters, marketRows } from './market';
import { openPersonnel } from './personnel-navigation';

// The theme registry is the sole list of themes (→ARCH-32), so a new pack is checked too.
const themes = (
  JSON.parse(
    readFileSync(
      new URL('../../apps/web/public/presentation/themes/index.json', import.meta.url),
      'utf8',
    ),
  ) as { entries: { id: string }[] }
).entries.map(({ id }) => id);

const viewports = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1380, height: 920 },
];

for (const themeId of themes)
  test(`${themeId}: market rows show readable position family badges on phones and desktop`, async ({
    page,
  }) => {
    // Four family filters at three widths after one founding.
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((themeId) => {
      localStorage.setItem(
        'haeram-soccor:presentation',
        JSON.stringify({ themeId, localeId: 'ko-KR' }),
      );
    }, themeId);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await openPersonnel(page, 'market');
    const rows = marketRows(page);
    const fills = new Map<Line, string>();

    for (const line of LINES) {
      const filters = await marketFilters(page);
      await filters
        .getByRole('group', { name: '영입 포지션 선택', exact: true })
        .getByRole('button', { name: line, exact: true })
        .click();
      await closeMarketPanel(page, '영입 필터');
      // The line filter also lists players whose second positions reach the line; the badge
      // follows each player's main position, as the engine classifies it (→WEB-113, →PLAYER-3).
      const row = rows
        .filter({ has: page.locator(`[data-ui="position-badge"][data-line="${line}"]`) })
        .first();
      await expect(row).toBeVisible();

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await settle(page);
        const measured = `${themeId} ${line} ${viewport.width}px`;
        // Every row carries one badge inside its name target, with the engine's family.
        const badges = await rows.evaluateAll((elements) =>
          elements.map((row) => {
            const badges = row.querySelectorAll('[data-ui="position-badge"]');
            const badge = badges[0];
            return {
              count: badges.length,
              insideName: !!badge?.closest('button[aria-label$=" 상세 보기"]'),
              row: row.getAttribute('data-line'),
              line: badge?.getAttribute('data-line'),
              code: badge?.lastChild?.textContent,
              family: badge?.firstElementChild?.textContent?.trim(),
              targets: badge?.querySelectorAll('button, a, [tabindex]').length,
            };
          }),
        );
        expect(badges.length, measured).toBeGreaterThan(0);
        for (const one of badges) {
          expect(one.count, measured).toBe(1);
          expect(one.insideName, measured).toBe(true);
          expect(one.targets, measured).toBe(0);
          expect(POSITIONS, measured).toContain(one.code);
          expect(one.line, measured).toBe(lineOf(one.code as (typeof POSITIONS)[number]));
          expect(one.row, measured).toBe(one.line);
          expect(one.family, measured).toBeTruthy();
        }

        const badge = row.locator('[data-ui="position-badge"]');
        await expect(badge, measured).toBeVisible();
        await expect(badge, measured).toBeInViewport();
        const paint = await badge.evaluate((element) => {
          const css = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return {
            fill: css.backgroundColor,
            image: css.backgroundImage,
            fontSize: parseFloat(css.fontSize),
            width: box.width,
            height: box.height,
            clipped: element.scrollWidth - element.clientWidth,
          };
        });
        // The family fill is the badge's own: no theme material laid over it.
        expect(paint.image, measured).toBe('none');
        expect(paint.fontSize, measured).toBeGreaterThanOrEqual(12);
        expect(paint.width, measured).toBeGreaterThanOrEqual(24);
        expect(paint.height, measured).toBeGreaterThanOrEqual(20);
        expect(paint.clipped, measured).toBeLessThanOrEqual(0);
        expect((await badge.evaluate(textContrast)).ratio, measured).toBeGreaterThanOrEqual(4.5);
        // One family colour at every width.
        expect(paint.fill, measured).toBe(fills.get(line) ?? paint.fill);
        fills.set(line, paint.fill);
        expect(await horizontalOverflow(page), measured).toBeLessThanOrEqual(0);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await settle(page);
    }

    // Four families stay visibly apart in this theme.
    const channels = [...fills.values()].map((fill) => fill.match(/\d+/g)!.slice(0, 3).map(Number));
    expect(channels).toHaveLength(4);
    for (let a = 0; a < channels.length; a++)
      for (let b = a + 1; b < channels.length; b++)
        expect(
          Math.hypot(...channels[a].map((value, index) => value - channels[b][index])),
          `${themeId}: ${[...fills.entries()].map(([line, fill]) => `${line} ${fill}`).join(', ')}`,
        ).toBeGreaterThanOrEqual(60);
  });
