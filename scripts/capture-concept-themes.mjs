import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = process.env.THEME_CAPTURE_ORIGIN || 'http://127.0.0.1:19501';
const server = process.env.THEME_CAPTURE_ORIGIN
  ? undefined
  : await createServer({
      configFile: 'apps/web/vite.config.ts',
      cacheDir: resolve('.tmp/theme-capture-vite'),
      server: { host: '127.0.0.1', port: 19501, strictPort: true },
    });
await server?.listen();
await mkdir('.tmp/theme-captures', { recursive: true });
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1380, height: 920 },
  reducedMotion: 'reduce',
});
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
try {
  await page.goto(origin);
  await page.getByLabel('클럽 이름', { exact: true }).fill('Haeram Athletic');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('print-sticker-theme-production');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('club-hub').waitFor({ timeout: 60000 });
  const pause = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await pause.isVisible()) await pause.click();
  await page
    .getByTestId('save-status')
    .filter({ hasText: '저장 완료' })
    .waitFor({ timeout: 60000 });
  const saved = await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'));
  const date = await page.getByTestId('calendar').innerText();
  for (const theme of ['matchday-print', 'sticker-club']) {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('dialog', { name: '설정', exact: true })
      .getByRole('button', { name: /^테마 변경/ })
      .click();
    const picker = page.getByTestId('presentation-theme');
    await picker.click();
    await page.locator(`[role="option"][data-value="${theme}"]`).click();
    await page.waitForFunction((id) => document.documentElement.dataset.theme === id, theme);
    await page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('presentation-settings') })
      .getByRole('button', { name: '창 닫기', exact: true })
      .click();
    await page.locator('[data-facility-art="stadium"] img').evaluate((image) => image.decode());
    await page.evaluate(() => document.fonts.ready);
    for (const [device, viewport] of Object.entries({
      desktop: { width: 1380, height: 920 },
      mobile: { width: 390, height: 844 },
    })) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `.tmp/theme-captures/${theme}-${device}.png` });
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        document: document.documentElement.scrollWidth,
        view: document.querySelector('[data-testid="view-scroller"]').scrollWidth,
        client: document.querySelector('[data-testid="view-scroller"]').clientWidth,
      }));
      const contrast = await page.evaluate(() => {
        const rgba = (value) => (value.match(/[\d.]+/g) || []).map(Number);
        const blend = (front, back) => {
          const a = front[3] ?? 1;
          return front.slice(0, 3).map((v, i) => v * a + back[i] * (1 - a));
        };
        const luminance = (rgb) =>
          rgb
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const readings = [];
        for (const element of document.querySelectorAll(
          'aside nav button[aria-current="page"], [data-testid="team-state"] li span, [data-testid="team-state"] li small, [data-testid="club-hub"] section[aria-label="다음 경기"] > div > button',
        )) {
          if (!element.getClientRects().length) continue;
          const chain = [];
          for (let p = element; p; p = p.parentElement) chain.push(p);
          let background = [255, 255, 255];
          for (const ancestor of chain.reverse())
            background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
          const foreground = blend(rgba(getComputedStyle(element).color), background);
          const a = luminance(foreground),
            b = luminance(background);
          readings.push({
            label: element.textContent.trim(),
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          });
        }
        return readings;
      });
      if (contrast.some((reading) => reading.ratio < 4.5))
        throw new Error(`Insufficient text contrast: ${JSON.stringify(contrast)}`);
      results.push({ theme, device, geometry, contrast });
      if (geometry.document > geometry.width || geometry.view > geometry.client)
        throw new Error(`Horizontal overflow: ${theme}/${device}`);
    }
    await page.reload();
    await page.getByTestId('club-hub').waitFor();
    const restored = await page.locator('html').getAttribute('data-theme');
    if (restored !== theme) throw new Error(`Preference lost: ${theme}`);
    if ((await page.getByTestId('calendar').innerText()) !== date)
      throw new Error('Game date changed');
    if ((await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))) !== saved)
      throw new Error('Save manifest changed');
    await page.setViewportSize({ width: 1380, height: 920 });
    await page.locator('aside').getByRole('button', { name: '1군', exact: true }).click();
    await page
      .getByRole('tablist', { name: '1군', exact: true })
      .getByRole('tab', { name: '훈련', exact: true })
      .click();
    const training = page.locator('[data-facility-art="training"] img');
    await training.waitFor({ state: 'visible' });
    await training.evaluate((image) => image.decode());
    if (!(await training.getAttribute('src')).includes(`/art/${theme}/`))
      throw new Error(`Training artwork did not change with the theme: ${theme}`);
    await page.screenshot({ path: `.tmp/theme-captures/${theme}-training.png` });
    await page.locator('aside').getByRole('button', { name: '클럽 홈', exact: true }).click();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    '.tmp/theme-captures/checks.json',
    JSON.stringify(
      { results, errors, themeReload: true, unchangedDate: true, unchangedManifest: true },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      results,
      errors,
      themeReload: true,
      unchangedDate: true,
      unchangedManifest: true,
    }),
  );
} finally {
  await browser.close();
  await server?.close();
}
