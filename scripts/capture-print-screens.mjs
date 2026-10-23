import { savePrintCapture } from './capture-print-image.mjs';
import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.PRINT_HOME_ORIGIN || 'http://127.0.0.1:19501';
const engine = process.env.PRINT_CAPTURE_BROWSER || 'chromium';
const destination = resolve(
  'apps/web/design/home-print/screens',
  engine === 'chromium' ? '' : engine,
);
await mkdir(destination, { recursive: true });
const browser = await (engine === 'webkit' ? webkit : chromium).launch();
const errors = [];
const failedResources = [];
const captures = [];
const scope = [];
const surfaceChecks = [];
const recordErrors = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedResources.push({ url: response.url(), status: response.status() });
  });
};
const capture = async (page, id, device) => {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="view-scroller"]');
    if (!root) return true;
    const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node; (node = nodes.nextNode());) {
      if (
        /화면을 여는 중|불러오고 있어요|불러오는 중|펼치는 중|준비하는 중/.test(node.textContent) &&
        node.parentElement.getClientRects().length
      )
        return false;
    }
    return true;
  });
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator('[data-facility-art] img:visible')
    .evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.waitForTimeout(180);
  const materials = await page.evaluate(() => {
    if (document.documentElement.dataset.theme !== 'matchday-print') return {};
    for (const surface of document.querySelectorAll('[data-surface]')) {
      if (!surface.getClientRects().length) continue;
      const style = getComputedStyle(surface);
      if (!style.backgroundImage.includes('/art/matchday-print/home/paper'))
        throw new Error(`Plain semantic surface: ${surface.className} ${style.backgroundImage}`);
    }
    const read = (element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundImage, frame: style.borderImageSource };
    };
    const table = document.querySelector('table[aria-label="리그 순위표"]');
    const count = document.querySelector('[data-ui="count"]');
    const current = document.querySelector('[data-ui="choices"] button[aria-pressed="true"]');
    const apply = document.querySelector('[aria-label="구단 디자인 적용"]');
    return {
      heading: table?.querySelector('thead th') && read(table.querySelector('thead th')),
      pinned: table?.querySelector('tbody th') && read(table.querySelector('tbody th')),
      count: count && read(count),
      current: current && read(current),
      apply: apply && read(apply),
    };
  });
  for (const [role, surface] of Object.entries(materials)) {
    if (!surface) continue;
    const expected =
      role === 'heading'
        ? '/ink.webp'
        : role === 'count' || role === 'current'
          ? '/vermilion.webp'
          : '/paper';
    if (!surface.background.includes(expected))
      throw new Error(`Missing print material: ${id}/${device}/${role} ${JSON.stringify(surface)}`);
    if (['count', 'current', 'apply'].includes(role) && surface.frame === 'none')
      throw new Error(`Missing print frame: ${id}/${device}/${role}`);
  }
  surfaceChecks.push({ id, device, ...materials });
  const geometry = await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="view-scroller"]');
    return {
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      content: scroller?.scrollWidth,
      client: scroller?.clientWidth,
      verticalOverflow: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
    };
  });
  await savePrintCapture(page, resolve(destination, `${id}-${device}.webp`));
  const heading = page.getByTestId('view-scroller').getByRole('heading').first();
  const title = (await heading.count()) ? await heading.innerText() : id;
  captures.push({ id, title, device, ...geometry });
  if (geometry.document > geometry.width || geometry.content > geometry.client)
    throw new Error(`Horizontal overflow: ${id}/${device} ${JSON.stringify(geometry)}`);
  if (device === 'mobile' && id.startsWith('founding') && geometry.verticalOverflow > 2)
    throw new Error(`Founding overflow: ${id}/${device} ${JSON.stringify(geometry)}`);
};
const state = JSON.parse(await readFile('.tmp/print-home-browser.json', 'utf8'));
try {
  // A fresh browser follows the new default; explicit saved choices keep their stable IDs.
  for (const id of [undefined, 'standard', 'pixel', 'sticker-club', 'matchday-print']) {
    const page = await browser.newPage({
      viewport: { width: 1380, height: 920 },
      reducedMotion: 'reduce',
    });
    recordErrors(page);
    if (id)
      await page.addInitScript(
        (themeId) =>
          localStorage.setItem(
            'haeram-soccor:presentation',
            JSON.stringify({ localeId: 'ko-KR', themeId }),
          ),
        id,
      );
    await page.goto(origin);
    await page.getByTestId('club-founding').waitFor();
    const selected = await page.locator('html').getAttribute('data-theme');
    if (selected !== (id || 'matchday-print'))
      throw new Error(`Theme selection replaced: ${id}/${selected}`);
    scope.push({ requested: id ?? 'fresh', selected });
    if (!id) {
      await capture(page, 'founding', 'desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, 'founding', 'mobile');
      await page.setViewportSize({ width: 360, height: 740 });
      await capture(page, 'founding-compact', 'mobile');
      captures.at(-1).title = '작은 화면 창단 · 360 × 740';
      await page.addStyleTag({
        content:
          'body { font-family: monospace !important; letter-spacing: 0.75px; word-spacing: 0.15em; }',
      });
      await capture(page, 'founding-fallback', 'mobile');
      captures.at(-1).title = '대체 글꼴 창단 · 360 × 740';
    }
    await page.close();
  }
  const context = await browser.newContext({
    viewport: { width: 1380, height: 920 },
    reducedMotion: 'reduce',
    storageState: state,
  });
  await context.addInitScript(() => sessionStorage.setItem('haeram-soccor:in-game', '1'));
  const page = await context.newPage();
  recordErrors(page);
  await page.goto(origin);
  await page.getByTestId('club-hub').waitFor();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByRole('dialog', { name: '설정', exact: true })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await page.getByTestId('game-slots').waitFor();
  await capture(page, 'slots', 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'slots', 'mobile');
  await page.getByRole('button', { name: '이어하기', exact: true }).click();
  await page.getByTestId('club-hub').waitFor();
  const navigation = (label) =>
    page.getByRole('navigation').getByRole('button', { name: label, exact: true });
  const pages = [
    ['home', '클럽 홈'],
    ['league', '리그'],
    ['cups', '컵 대회'],
    ['people', '선수단·스태프'],
    ['training', '훈련·육성'],
    ['business', '구단 운영'],
    ['records', '클럽 기록실'],
  ];
  const date = await page.getByTestId('game-date').innerText();
  for (const [device, viewport] of Object.entries({
    desktop: { width: 1380, height: 920 },
    mobile: { width: 390, height: 844 },
  })) {
    await page.setViewportSize(viewport);
    for (const [id, label] of pages) {
      await navigation(label).click();
      await page.getByTestId('view-scroller').evaluate((element) => {
        element.scrollTop = 0;
      });
      await capture(page, id, device);
      if (id !== 'home') {
        const bar = page.getByRole('tablist').first();
        if (await bar.count()) {
          const tabs = await bar.getByRole('tab').allTextContents();
          for (const [index, text] of tabs.entries()) {
            const tab = bar.getByRole('tab', { name: text.trim(), exact: true });
            if (await tab.isDisabled()) continue;
            await tab.click();
            await page.getByTestId('view-scroller').evaluate((element) => {
              element.scrollTop = 0;
            });
            await capture(page, `${id}-tab-${index}`, device);
          }
        }
      }
    }
  }
  if ((await page.getByTestId('game-date').innerText()) !== date)
    throw new Error('Browsing advanced the game calendar');
  await navigation('구단 운영').click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  await page.getByRole('textbox', { name: '홈 색 코드', exact: true }).fill('#285443');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  const designOutcome = page.getByTestId('action-outcome');
  await designOutcome.waitFor();
  const outcomePosition = await designOutcome.evaluate(
    (element) => getComputedStyle(element).position,
  );
  if (outcomePosition !== 'fixed') throw new Error('Sidebar styling leaked into the result card');
  await capture(page, 'action-outcome', 'mobile');
  await designOutcome.getByRole('button', { name: '확인', exact: true }).click();
  await navigation('선수단·스태프').click();
  const peopleTabs = page.getByRole('tablist').first();
  await peopleTabs.getByRole('tab').first().click();
  const player = page.getByRole('button', { name: /선수 기록$/ }).first();
  await player.click();
  await page.getByRole('dialog').last().waitFor();
  await capture(page, 'player-sheet', 'mobile');
  await page.keyboard.press('Escape');
  await navigation('리그').click();
  const leagueTabs = page.getByRole('tablist').first();
  await leagueTabs.getByRole('tab').first().click();
  await page
    .getByRole('button', { name: /팀 정보$/ })
    .first()
    .click();
  await page.getByRole('dialog').last().waitFor();
  await capture(page, 'team-sheet', 'mobile');
  await page.keyboard.press('Escape');
  const select = page.locator('[data-select-trigger]:visible').first();
  if (await select.count()) {
    await select.click();
    const list = page.getByRole('listbox');
    await list.waitFor();
    await capture(page, 'dropdown', 'mobile');
    const bounds = await list.boundingBox();
    if (
      bounds.x < 0 ||
      bounds.x + bounds.width > 391 ||
      bounds.y < 0 ||
      bounds.y + bounds.height > 845
    )
      throw new Error('Dropdown leaves mobile viewport');
    await page.keyboard.press('Escape');
  }
  await navigation('클럽 홈').click();
  await page.getByTestId('communications-button').click();
  await page.getByRole('dialog').last().waitFor();
  await capture(page, 'news', 'mobile');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').last().waitFor({ state: 'hidden' });
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: '전술·선발 준비', exact: true }).click();
  await page.getByRole('dialog').last().waitFor();
  await capture(page, 'preparation', 'mobile');
  await page.keyboard.press('Escape');
  await page.locator('[data-ui="progress-mode"]').click();
  await page.getByRole('dialog').last().waitFor();
  await capture(page, 'confirmation', 'mobile');
  await page.getByRole('button', { name: '수동 모드로 변경', exact: true }).click();
  const outcome = page.getByTestId('action-outcome');
  if (await outcome.isVisible())
    await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await page.getByRole('button', { name: '다음 이벤트', exact: true }).click();
  const matchReport = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
  await matchReport.waitFor();
  await capture(page, 'match-report', 'mobile');
  await matchReport.getByRole('button', { name: '관전하기 ▶', exact: true }).click();
  await page.getByTestId('pitch-theatre').waitFor({ timeout: 60000 });
  await capture(page, 'match', 'mobile');
  await page.setViewportSize({ width: 1380, height: 920 });
  await capture(page, 'match', 'desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation('클럽 홈').click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('dialog', { name: '설정', exact: true }).waitFor();
  await capture(page, 'settings', 'mobile');
  await page
    .getByRole('dialog', { name: '설정', exact: true })
    .getByRole('button', { name: /^테마 변경/ })
    .click();
  await page.getByTestId('presentation-theme').click();
  await capture(page, 'theme-picker', 'mobile');
  await page.locator('[role="option"][data-value="standard"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'standard');
  await page
    .getByRole('dialog')
    .filter({ has: page.getByTestId('presentation-settings') })
    .getByRole('button', { name: '창 닫기', exact: true })
    .click();
  await capture(page, 'standard-alternative', 'mobile');
  await page.reload();
  await page.getByTestId('club-hub').waitFor();
  if ((await page.locator('html').getAttribute('data-theme')) !== 'standard')
    throw new Error('Explicit alternative preference did not survive reload');
  await context.close();
  const report = {
    captures,
    scope,
    surfaceChecks,
    errors,
    failedResources,
    browsingCalendarPreserved: true,
    alternativeReload: true,
  };
  await writeFile(resolve(destination, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ captures: captures.length, scope, errors, failedResources }));
  if (errors.length || failedResources.length)
    throw new Error('Runtime or asset failures in print screens');
} catch (error) {
  const open = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1);
  if (open) {
    await open.screenshot({ path: resolve('.tmp/print-screens-error.png') });
    await writeFile(
      resolve('.tmp/print-screens-error.txt'),
      await open.locator('body').innerText(),
    );
  }
  throw error;
} finally {
  await browser.close();
}
