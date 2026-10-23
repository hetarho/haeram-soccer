import { savePrintCapture } from './capture-print-image.mjs';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.PRINT_HOME_ORIGIN || 'http://127.0.0.1:19501';
const destination = resolve('apps/web/design/home-print/captures');
const stateFile = resolve('.tmp/print-home-browser.json');
const scrollHome = async (page, bottom = false) =>
  page.getByTestId('club-hub').evaluate((hub, toBottom) => {
    for (let node = hub.parentElement; node && node !== document.body; node = node.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
        node.scrollTop = toBottom ? node.scrollHeight : 0;
    }
  }, bottom);
await mkdir(destination, { recursive: true });
await mkdir('.tmp', { recursive: true });
let storageState;
try {
  storageState = JSON.parse(await readFile(stateFile, 'utf8'));
} catch {
  // The first capture founds an isolated review career, without touching the user's browser.
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1536, height: 1024 },
  reducedMotion: 'reduce',
  storageState,
});
await context.addInitScript(() => {
  sessionStorage.setItem('haeram-soccor:in-game', '1');
  localStorage.setItem(
    'haeram-soccor:presentation',
    JSON.stringify({
      localeId: 'ko-KR',
      themeId: 'matchday-print',
    }),
  );
});
const page = await context.newPage();
const errors = [];
const failedResources = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400)
    failedResources.push({ url: response.url(), status: response.status() });
});
try {
  await page.goto(origin);
  if (!storageState) {
    await page.getByLabel('클럽 이름', { exact: true }).fill('Haeram Athletic');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill('print-home-image-skin');
    await page.getByRole('button', { name: '클럽 창단 →', exact: true }).click();
  } else {
    const enter = page.getByRole('button', { name: /이어하기|게임으로|게임 입장/ });
    if (await enter.count()) await enter.first().click();
  }
  await page.getByTestId('club-hub').waitFor({ timeout: 60000 });
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await stop.isVisible()) await stop.click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'matchday-print');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-facility-art="stadium"] img').evaluate((image) => image.decode());
  await page
    .getByTestId('save-status')
    .filter({ hasText: '저장 완료' })
    .waitFor({ timeout: 60000 });
  await context.storageState({ path: stateFile, indexedDB: true });
  const results = [];
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1536, height: 1024 },
    laptop: { width: 1380, height: 920 },
    tablet: { width: 820, height: 1180 },
    mobile: { width: 390, height: 844 },
    narrow: { width: 320, height: 740 },
  })) {
    await page.setViewportSize(viewport);
    await scrollHome(page);
    await page.waitForTimeout(400);
    await savePrintCapture(page, resolve(destination, `${name}.webp`));
    if (viewport.width <= 390) {
      await scrollHome(page, true);
      await savePrintCapture(page, resolve(destination, `${name}-bottom.webp`));
      await scrollHome(page);
    }
    results.push(
      await page.evaluate(
        ({ name, viewport }) => {
          const scroller = document.querySelector('[data-testid="view-scroller"]');
          const frame = document.querySelector('[data-home-part="fixture"]');
          const visible = (element) => {
            const rect = element.getBoundingClientRect();
            return { width: Math.round(rect.width), height: Math.round(rect.height) };
          };
          return {
            name,
            viewport,
            documentWidth: document.documentElement.scrollWidth,
            scroller: {
              width: scroller.clientWidth,
              contentWidth: scroller.scrollWidth,
              height: scroller.clientHeight,
              contentHeight: scroller.scrollHeight,
            },
            frame: { ...visible(frame), image: getComputedStyle(frame).borderImageSource },
            conditions: [...document.querySelectorAll('[data-condition]')].map((element) => ({
              name: element.dataset.condition,
              ...visible(element),
            })),
          };
        },
        { name, viewport },
      ),
    );
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.getByTestId('view-scroller').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  await page.getByRole('dialog').last().waitFor();
  await savePrintCapture(page, resolve(destination, 'preparation.webp'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '시즌 상세', exact: true }).click();
  await page.getByRole('dialog', { name: '시즌 상세와 클럽 소식', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^피로 .*대처 방법 보기$/ }).click();
  await page.getByRole('dialog').last().waitFor();
  await page.keyboard.press('Escape');
  // Match reports contain an aside too; sidebar artwork must not enter their content.
  await page.locator('[data-ui="progress-mode"]').click();
  await page.getByRole('button', { name: '수동 모드로 변경', exact: true }).click();
  const outcome = page.getByTestId('action-outcome');
  if (await outcome.isVisible())
    await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  const report = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
  await report.waitFor();
  const matchReports = [];
  for (const width of [320, 390, 1380]) {
    const height = width === 320 ? 740 : width === 390 ? 844 : 920;
    await page.setViewportSize({ width, height });
    const card = report.getByTestId('event-card');
    const actions = card.getByRole('button').filter({ hasText: /관전하기|결과만 보고 계속/ });
    const geometry = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const actions = [...element.querySelectorAll('button')].slice(-2).map((button) => {
        const bounds = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        return {
          label: button.textContent,
          bottom: bounds.bottom,
          height: bounds.height,
          reachable: button.contains(hit),
        };
      });
      const sidebarArt = [element, ...element.querySelectorAll('*')].some((node) =>
        ['::before', '::after'].some((pseudo) =>
          getComputedStyle(node, pseudo).backgroundImage.includes('sidebar-terrace.webp'),
        ),
      );
      return { height: rect.height, actions, sidebarArt };
    });
    if (
      (await actions.count()) !== 2 ||
      geometry.sidebarArt ||
      geometry.actions.some(
        (action) => !action.reachable || action.bottom > height || action.height < 44,
      )
    )
      throw new Error(`Match report actions are obscured at ${width}px`);
    await savePrintCapture(page, resolve(destination, `match-report-${width}.webp`));
    matchReports.push({ width, ...geometry });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await report.getByRole('button', { name: '창 닫기', exact: true }).click();
  await page.getByTestId('event-pill').waitFor();
  await savePrintCapture(page, resolve(destination, 'match-report-closed.webp'));
  await page.getByTestId('event-pill').click();
  await report.waitFor();
  const checks = {
    results,
    errors,
    failedResources,
    preparation: true,
    seasonDetail: true,
    remedies: true,
    matchReports,
    matchReportReopened: true,
  };
  await writeFile(resolve(destination, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify(checks, null, 2));
  if (
    errors.length ||
    failedResources.length ||
    results.some(
      (result) =>
        result.documentWidth > result.viewport.width ||
        result.scroller.contentWidth > result.scroller.width,
    )
  )
    throw new Error(
      'Print home has a runtime/resource/overflow issue; inspect captures/checks.json',
    );
} catch (error) {
  await page.screenshot({ path: resolve('.tmp/print-home-capture-error.png') });
  await writeFile(
    resolve('.tmp/print-home-capture-error.txt'),
    await page.locator('body').innerText(),
  );
  throw error;
} finally {
  await browser.close();
}
