import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import { simulatedWorld } from '../fixtures/worlds';
import {
  FIXTURE_BACKGROUND,
  FIXTURE_LOCALE,
  FIXTURE_THEME,
  readPresentationBaselines,
  routeSyntheticPresentation,
  STORED_KOREAN_DETAIL,
  STORED_KOREAN_TITLE,
} from '../fixtures/presentation';
import { chooseOption, selectOptions } from './select';
import { continueSlot, seedSlot } from './slots';
import { committedRaw, savedWorld } from './club-identity-helpers';
import { expectHomeBounds, expectHomeSceneRatio, settle } from './layout';
import { textContrast } from './contrast';
import { openSaveMenu } from './save-menu';

const PREFERENCE_KEY = 'haeram-soccor:presentation';
const baseline = readPresentationBaselines();

for (const entry of baseline.localeRegistry.entries.filter(
  ({ id }) => id !== baseline.localeRegistry.defaultId,
)) {
  const pack = JSON.parse(
    readFileSync(
      new URL(`../../apps/web/public/presentation/locales/${entry.resource}`, import.meta.url),
      'utf8',
    ),
  );
  for (const width of [390, 1380])
    test(`shipped ${entry.id}: selection and reload at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
      await page.goto('/game');
      const founding = page.getByTestId('club-founding');
      await expect(founding).toBeVisible();
      const name = founding.getByLabel('클럽 이름', { exact: true });
      await name.fill('언어 변경 뒤에도 남을 이름');
      await openSettings(page, 'locale');
      const control = page.getByTestId('presentation-locale');
      expect(await selectOptions(control)).toEqual(
        baseline.localeRegistry.entries.map(({ id, label }) => ({
          value: id,
          label,
          disabled: false,
        })),
      );
      await chooseOption(control, entry.id);
      await expect(page.locator('html')).toHaveAttribute('lang', entry.id);
      await expect(page.locator('html')).toHaveAttribute('dir', entry.direction);
      await expect(control).toContainText(entry.label);
      await expect(control).toHaveAccessibleName(pack.messages['presentation.language']);
      await expect(page.getByRole('dialog')).toHaveAccessibleName(
        pack.messages['presentation.title'],
      );
      await closeSettings(page);
      await expect(name).toHaveValue('언어 변경 뒤에도 남을 이름');
      await expect(page.getByTestId('presentation-settings-trigger')).toHaveText(
        pack.messages['presentation.open'],
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
      await page.reload();
      await expect(founding).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', entry.id);
      await expect(page.locator('html')).toHaveAttribute('dir', entry.direction);
      await expect(page.getByTestId('presentation-settings-trigger')).toHaveText(
        pack.messages['presentation.open'],
      );
      expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
    });
}

type Field = 'theme' | 'locale';
const pickerRow = { theme: /^테마 변경/, locale: /^언어 변경/ };
/** Founding and slots open both preferences; the HUD menu hands one to a centered picker. */
async function openSettings(page: Page, field: Field = 'theme') {
  const trigger = page.getByTestId('presentation-settings-trigger');
  if (await trigger.isVisible()) await trigger.click();
  else {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '설정', exact: true });
    await menu.getByRole('button', { name: pickerRow[field] }).click();
    await expect(menu).toHaveCount(0);
  }
  const content = page.getByTestId('presentation-settings');
  await expect(content).toBeVisible();
  return page.getByRole('dialog').filter({ has: content });
}
async function closeSettings(page: Page) {
  const content = page.getByTestId('presentation-settings');
  await page
    .getByRole('dialog')
    .filter({ has: content })
    .getByRole('button', { name: '창 닫기', exact: true })
    .click();
  await expect(content).toHaveCount(0);
}
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());

for (const { id: theme } of baseline.themeRegistry.entries)
  for (const width of [390, 1380])
    test(`${theme}: readable transport choices and inset settings rows at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
      await page.addInitScript((themeId) => {
        localStorage.setItem(
          'haeram-soccor:presentation',
          JSON.stringify({ localeId: 'ko-KR', themeId }),
        );
      }, theme);
      await loadPausedGame(page);
      const saveMenu = await openSaveMenu(page);
      const importControl = saveMenu.locator('label:has(input[type="file"])');
      await settle(page);
      expect((await importControl.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
      await saveMenu.getByRole('button', { name: '창 닫기', exact: true }).click();
      await page.getByRole('button', { name: /진행 방식 변경/ }).click();
      await page.getByRole('button', { name: '자동 모드로 변경', exact: true }).click();
      const date = await page.getByTestId('game-date').innerText();
      const pace = page.getByRole('combobox', { name: '자동 진행 배속', exact: true });
      await chooseOption(pace, 'x10');
      await pace.hover();
      await expect
        .poll(async () => (await pace.evaluate(textContrast)).ratio)
        .toBeGreaterThanOrEqual(4.5);
      expect(
        await pace
          .locator('span')
          .first()
          .evaluate((value) => value.scrollWidth - value.clientWidth),
      ).toBeLessThanOrEqual(1);
      await pace.press('ArrowDown');
      const list = page.getByRole('listbox', { name: '자동 진행 배속', exact: true });
      await expect(list).toBeVisible();
      const checked = list.getByRole('option', { selected: true });
      for (const item of [checked, checked.locator('small')])
        await expect
          .poll(async () => (await item.evaluate(textContrast)).ratio)
          .toBeGreaterThanOrEqual(4.5);
      await pace.press('Home');
      const highlighted = list.locator('[role="option"][data-highlighted]');
      await expect(highlighted).toHaveAttribute('data-state', 'unchecked');
      for (const item of [highlighted, highlighted.locator('small')])
        await expect
          .poll(async () => (await item.evaluate(textContrast)).ratio)
          .toBeGreaterThanOrEqual(4.5);
      await pace.press('Escape');
      await expect(pace).toBeFocused();

      await page.getByRole('button', { name: '설정', exact: true }).click();
      const menu = page.getByTestId('app-menu');
      await settle(page);
      const rows = menu.locator('[data-ui="menu-row"]');
      const spacing = await rows.evaluateAll((items) => {
        const first = items[0].getBoundingClientRect(),
          second = items[1].getBoundingClientRect();
        const style = getComputedStyle(items[0]);
        return {
          gap: second.top - first.bottom,
          inset: parseFloat(style.paddingLeft),
          height: first.height,
        };
      });
      // Firefox can report an 8px gap as 7.99998px; allow one layout subpixel.
      expect(spacing.gap).toBeGreaterThanOrEqual(8 - 1 / 64);
      expect(spacing.inset).toBeGreaterThanOrEqual(8);
      expect(spacing.height).toBeGreaterThanOrEqual(44);
      await expect
        .poll(async () => (await rows.first().locator('small').evaluate(textContrast)).ratio)
        .toBeGreaterThanOrEqual(4.5);
      await rows.filter({ hasText: '테마 변경' }).click();
      const choice = page.getByTestId('presentation-theme');
      await expect(choice).toBeVisible();
      await page
        .getByRole('dialog')
        .filter({ has: choice })
        .getByRole('button', { name: '창 닫기', exact: true })
        .focus();
      await page.keyboard.press('Tab');
      await expect(choice).toBeFocused();
      await choice.press('ArrowDown');
      await choice.press('Escape');
      const focus = await choice.evaluate((control) => ({
        style: getComputedStyle(control).outlineStyle,
        width: parseFloat(getComputedStyle(control).outlineWidth),
        parent: getComputedStyle(control.parentElement!).outlineStyle,
      }));
      expect(focus.style).toBe('solid');
      expect(focus.width).toBeGreaterThanOrEqual(2);
      expect(focus.parent).toBe('none');
      await closeSettings(page);
      await expect(page.getByTestId('game-date')).toHaveText(date);
    });

for (const width of [390, 1380])
  test(`image-built themes cover home, pinned table cells and detail sheets without advancing play ${width}`, async ({
    page,
  }) => {
    // Each case stages and revisits every shipped pack, including both bitmap font families.
    test.slow();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await observeCommands(page);
    await loadPausedGame(page);
    const date = await page.getByTestId('game-date').innerText();
    const sent = await commands(page);
    for (const { id: theme } of baseline.themeRegistry.entries) {
      await openSettings(page);
      await chooseOption(page.getByTestId('presentation-theme'), theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await closeSettings(page);
      const assetPath = `/art/${theme}/${theme === 'matchday-print' ? 'home' : 'ui'}/`;
      const homeSkin = await page.getByTestId('club-hub').evaluate((hub) => {
        const fixture = hub.querySelector('[data-home-part="fixture"]')!;
        const style = getComputedStyle(fixture);
        return { frame: style.borderImageSource, fill: style.backgroundImage };
      });
      expect(homeSkin.frame).toContain(assetPath);
      expect(homeSkin.fill).toContain(assetPath);
      await expectHomeSceneRatio(page);
      const stats = page.getByRole('button', { name: '시즌 상세', exact: true });
      await expect(stats.locator('[data-pixel-icon="chevronRight"]')).toHaveCount(1);
      await expect(stats.locator('[data-pixel-icon="play"]')).toHaveCount(0);
      await page.getByRole('button', { name: /^피로/ }).click();
      const remedies = page.getByRole('dialog', { name: '피로 관리', exact: true });
      await expect(remedies).toBeVisible();
      await settle(page);
      const choices = remedies.locator('li[data-surface="tile"]');
      expect(await choices.count()).toBeGreaterThan(0);
      expect(
        await choices.first().evaluate((row) => getComputedStyle(row).backgroundImage),
      ).toContain(assetPath);
      for (const copy of await remedies.locator('li[data-surface="tile"] > div > small, em').all())
        expect((await copy.evaluate(textContrast)).ratio).toBeGreaterThanOrEqual(4.5);
      await remedies.getByRole('button', { name: '창 닫기', exact: true }).click();

      await page.getByRole('navigation').getByRole('button', { name: '리그', exact: true }).click();
      await page.getByRole('tab', { name: '순위표', exact: true }).click();
      const table = page.getByRole('table', { name: '리그 순위표', exact: true });
      await expect(table).toBeVisible();
      for (const selector of ['thead th', 'tbody th']) {
        const fill = await table
          .locator(selector)
          .first()
          .evaluate((cell) => getComputedStyle(cell).backgroundImage);
        expect(fill).toContain(assetPath);
      }
      await table.locator('tbody th button').first().click();
      const detail = page.getByRole('dialog');
      await expect(detail).toBeVisible();
      const sheet = await detail.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          fill: getComputedStyle(element).backgroundImage,
          left: rect.left,
          right: rect.right,
          viewport: innerWidth,
        };
      });
      expect(sheet.fill).toContain(assetPath);
      expect(sheet.left).toBeGreaterThanOrEqual(0);
      expect(sheet.right).toBeLessThanOrEqual(sheet.viewport);
      await detail.getByRole('button', { name: '창 닫기', exact: true }).click();
      await expect(table).toBeVisible();
      await page.getByRole('tab', { name: '일정·결과', exact: true }).click();
      const ownBadge = page.getByText('우리 팀', { exact: true }).filter({ visible: true }).first();
      await expect(ownBadge).toBeVisible();
      await expect
        .poll(async () => (await ownBadge.evaluate(textContrast)).ratio)
        .toBeGreaterThanOrEqual(4.5);
      await page
        .getByRole('navigation')
        .getByRole('button', { name: '선수단·스태프', exact: true })
        .click();
      const roster = page.locator('section').filter({
        has: page.getByRole('heading', { name: '우리 클럽의 선수들', exact: true }),
      });
      await roster
        .locator('article')
        .first()
        .click({ position: { x: 8, y: 8 } });
      await expect(page.getByRole('region', { name: '선수 프로필', exact: true })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: '창 닫기', exact: true }).click();
      await page
        .getByRole('navigation')
        .getByRole('button', { name: '클럽 홈', exact: true })
        .click();
      await expect(page.getByTestId('club-hub')).toBeVisible();
      await expect(page.getByTestId('game-date')).toHaveText(date);
      expect(await commands(page)).toBe(sent);
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      baseline.themeRegistry.entries.at(-1)!.id,
    );
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByTestId('game-date')).toHaveText(date);
  });

async function expectRegistryChoices(page: Page, fields: Field[] = ['locale', 'theme']) {
  if (fields.includes('locale')) {
    const locale = page.getByTestId('presentation-locale');
    expect((await selectOptions(locale)).map(({ value, label }) => ({ value, label }))).toEqual(
      baseline.localeRegistry.entries.map(({ id, label }) => ({ value: id, label })),
    );
    await expect(locale).toContainText(baseline.localeEntry.label);
  }
  if (fields.includes('theme')) {
    const theme = page.getByTestId('presentation-theme');
    expect((await selectOptions(theme)).map(({ value, label }) => ({ value, label }))).toEqual(
      baseline.themeRegistry.entries.map(({ id, label }) => ({ value: id, label })),
    );
    await expect(theme).toContainText(baseline.themeEntry.label);
  }
}
async function expectMenuRegistryChoices(page: Page) {
  for (const field of ['locale', 'theme'] as const) {
    await openSettings(page, field);
    const other = field === 'theme' ? 'locale' : 'theme';
    await expect(page.getByTestId(`presentation-${other}`)).toHaveCount(0);
    await expectRegistryChoices(page, [field]);
    await closeSettings(page);
  }
}

function pausedPresentationWorld() {
  const world = simulatedWorld({
    country: 'ENG',
    name: '화면 설정 FC',
    color: '#2e713d',
    seed: 'presentation-resource-only',
    level: 'easy',
  });
  world.settings!.mode = 'manual';
  world.settings!.observations.matchEve = true;
  world.events.push({
    year: world.year,
    round: world.round,
    kind: 'club',
    title: STORED_KOREAN_TITLE,
    detail: STORED_KOREAN_DETAIL,
  });
  return world;
}
async function loadPausedGame(page: Page) {
  await seedSlot(page, pausedPresentationWorld());
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
}

/** Observes actual messages to the existing engine worker, without adding an app debug API. */
async function observeCommands(page: Page) {
  await page.addInitScript(() => {
    const probe = { count: 0 };
    (
      window as typeof window & { presentationCommandProbe: typeof probe }
    ).presentationCommandProbe = probe;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      message: unknown,
      transfer?: Transferable[] | StructuredSerializeOptions,
    ) {
      const request = message as { body?: { type?: string } } | null;
      if (request?.body?.type === 'command') probe.count++;
      Reflect.apply(post, this, transfer === undefined ? [message] : [message, transfer]);
    } as typeof post;
  });
}
const commands = (page: Page) =>
  page.evaluate(
    () =>
      (window as typeof window & { presentationCommandProbe: { count: number } })
        .presentationCommandProbe.count,
  );

for (const width of [390, 1380])
  for (const entry of baseline.themeRegistry.entries.filter(({ id }) => id !== baseline.theme.id))
    test(`shipped ${entry.id} theme replaces art and reloads while preserving facts at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await loadPausedGame(page);
      const raw = await committedRaw(page);
      const date = await page.getByTestId('calendar').innerText();
      const art = page.locator('[data-facility-art="stadium"] img');
      const artwork = await art.getAttribute('src');
      const pack = await (await page.request.get(`/presentation/themes/${entry.resource}`)).json();
      const picker = await openSettings(page);
      await chooseOption(page.getByTestId('presentation-theme'), entry.id);
      await expect.poll(() => background(page)).toBe(pack.tokens.palette.bg);
      await expect(page.locator('html')).toHaveAttribute('data-theme', entry.id);
      await expect(picker).toBeVisible();
      await expect(art).not.toHaveAttribute('src', artwork!);
      expect(
        (await art.getAttribute('src'))?.startsWith(pack.images.facility.pattern.split('{')[0]),
      ).toBe(true);
      await expect
        .poll(() =>
          art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      await closeSettings(page);
      await expectHomeBounds(page);
      await expect(page.getByTestId('calendar')).toHaveText(date, { useInnerText: true });
      await page.reload();
      await expect(page.getByTestId('club-hub')).toBeVisible();
      expect(await background(page)).toBe(pack.tokens.palette.bg);
      await expect(page.getByTestId('calendar')).toHaveText(date, { useInnerText: true });
      expect(await committedRaw(page)).toBe(raw);
      await openSettings(page);
      await chooseOption(page.getByTestId('presentation-theme'), baseline.theme.id);
      await expect.poll(() => background(page)).toBe(baseline.theme.tokens.palette.bg);
      await expect(art).toHaveAttribute('src', artwork!);
      await expect(picker).toBeVisible();
      await closeSettings(page);
      await page.reload();
      await expect(page.getByTestId('club-hub')).toBeVisible();
      expect(await background(page)).toBe(baseline.theme.tokens.palette.bg);
      expect(await committedRaw(page)).toBe(raw);
      await expectHomeBounds(page);
    });

test('pending theme resources add no feedback row or picker layout shift', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('club-founding').waitFor();
  await openSettings(page);
  const content = page.getByTestId('presentation-settings');
  await settle(page);
  const before = await content.boundingBox();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/presentation/themes/pixel.json', async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await chooseOption(page.getByTestId('presentation-theme'), 'pixel');
    await expect(content).toHaveAttribute('aria-busy', 'true');
    await expect(content.getByTestId('presentation-pending')).toHaveCount(0);
    expect(await content.boundingBox()).toEqual(before);
  } finally {
    release();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'pixel');
  await expect(content).toHaveAttribute('aria-busy', 'false');
});

test('theme reveal keeps controls in the composited dialog and backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = (update) => {
      const transition = start(
        typeof update === 'function'
          ? () => {
              const result = update();
              // The new root must capture the selected art in this callback, before returning.
              document.documentElement.dataset.themeSnapshotArt =
                document.querySelector('[data-facility-art="stadium"] img')?.getAttribute('src') ??
                '';
              return result;
            }
          : update,
      );
      void transition.ready
        .then(() => {
          document.documentElement.dataset.themeSnapshotControls = String(
            [...document.querySelectorAll('button,input,[data-select-trigger]')].filter(
              (control) => getComputedStyle(control).viewTransitionName !== 'none',
            ).length,
          );
        })
        .catch(() => {});
      return transition;
    };
  });
  await loadPausedGame(page);
  test.skip(
    !(await page.evaluate(() => typeof document.startViewTransition === 'function')),
    'The browser uses the immediate fallback without native snapshots.',
  );
  const dialog = await openSettings(page);
  const closePaths = () =>
    dialog
      .locator('[data-pixel-icon="close"] path')
      .evaluateAll((paths) => paths.map((path) => path.getAttribute('d')).join('|'));
  const standardClose = await closePaths();
  await chooseOption(page.getByTestId('presentation-theme'), 'pixel');
  await expect(page.locator('html')).toHaveAttribute('data-theme-snapshot-controls', '0');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'pixel');
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme-snapshot-art',
    (await page.locator('[data-facility-art="stadium"] img').getAttribute('src'))!,
  );
  await expect.poll(closePaths).not.toBe(standardClose);
  await expect(dialog).toBeVisible();
  await closeSettings(page);
  await expectHomeBounds(page);
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
])
  test(`registry settings before founding, on slots and in the HUD at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const founding = page.getByTestId('club-founding');
    await expect(founding).toBeVisible();
    await founding.getByLabel('클럽 이름', { exact: true }).fill('설정 뒤에도 남을 초안');
    const dialog = await openSettings(page);
    await expect(dialog).toHaveAccessibleName('언어·테마 설정');
    await expectRegistryChoices(page);
    await settle(page);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    for (const id of ['presentation-locale', 'presentation-theme'])
      expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await closeSettings(page);
    await expect(founding.getByLabel('클럽 이름', { exact: true })).toHaveValue(
      '설정 뒤에도 남을 초안',
    );
    await expectHomeBounds(page);
    await expect(page.locator('html')).toHaveAttribute('lang', baseline.localeEntry.id);
    await expect(page.locator('html')).toHaveAttribute('dir', baseline.localeEntry.direction);
    expect(await background(page)).toBe(baseline.theme.tokens.palette.bg);
    await founding.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expectMenuRegistryChoices(page);
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('dialog', { name: '설정', exact: true })
      .getByRole('button', { name: '게임 슬롯', exact: true })
      .click();
    await expect(page.getByTestId('game-slots')).toBeVisible();
    await openSettings(page);
    await expectRegistryChoices(page);
    await closeSettings(page);
    // Slots keep /journal; reloading resumes the game already played in this tab (WEB-62).
    await page.reload();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expectMenuRegistryChoices(page);
  });

test('a failed initial default resource offers retry without creating game data', async ({
  page,
}) => {
  let attempts = 0;
  await page.route(`**${baseline.localeUrl}`, async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, body: 'Retry this static resource' });
    return route.continue();
  });
  await page.goto('/');
  await expect(page.getByTestId('presentation-initial-error')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
  await page.getByTestId('presentation-retry').click();
  await expect(page.getByTestId('club-founding')).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
});

test('denied preference storage keeps data-only selections usable for this session', async ({
  page,
}) => {
  await routeSyntheticPresentation(page);
  await page.addInitScript((preferenceKey) => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === preferenceKey) throw new DOMException('Preferences denied', 'SecurityError');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === preferenceKey) throw new DOMException('Preferences denied', 'SecurityError');
      return set.call(this, key, value);
    };
  }, PREFERENCE_KEY);
  await page.goto('/');
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await openSettings(page);
  await expect(page.getByTestId('presentation-session-only')).toBeVisible();
  await chooseOption(page.getByTestId('presentation-locale'), FIXTURE_LOCALE);
  await chooseOption(page.getByTestId('presentation-theme'), FIXTURE_THEME);
  await expect(page.locator('html')).toHaveAttribute('lang', FIXTURE_LOCALE);
  await expect.poll(() => background(page)).toBe(FIXTURE_BACKGROUND);
  await closeSettings(page);
  expect(
    await page.evaluate(() => {
      localStorage.setItem('presentation-unrelated-storage', 'usable');
      return localStorage.getItem('presentation-unrelated-storage');
    }),
  ).toBe('usable');
  await page.reload();
  await expect(page.getByTestId('club-founding')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', baseline.localeEntry.id);
});

test('a failed theme selection retains the usable pack and retries without losing a founding draft', async ({
  page,
}) => {
  const fixture = await routeSyntheticPresentation(page, { failThemeOnce: true });
  await page.goto('/');
  const name = page.getByTestId('club-founding').getByLabel('클럽 이름', { exact: true });
  await name.fill('실패 뒤에도 남을 초안');
  await openSettings(page);
  await chooseOption(page.getByTestId('presentation-theme'), FIXTURE_THEME);
  await expect(page.getByTestId('presentation-error')).toBeVisible();
  expect(await background(page)).toBe(baseline.theme.tokens.palette.bg);
  await expect(page.getByTestId('presentation-theme')).toContainText(baseline.themeEntry.label);
  await page.getByTestId('presentation-retry').click();
  await expect.poll(() => background(page)).toBe(FIXTURE_BACKGROUND);
  await expect(page.getByTestId('presentation-error')).toHaveCount(0);
  await closeSettings(page);
  await expect(name).toHaveValue('실패 뒤에도 남을 초안');
  expect(fixture.requests.get(fixture.themeUrl)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => localStorage.getItem('haeram-soccor:manifest'))).toBeNull();
});

test('unseen routed locale and theme change actual resources while game facts, draft and Korean prose stay exact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await routeSyntheticPresentation(page);
  await observeCommands(page);
  await loadPausedGame(page);
  const raw = (await committedRaw(page))!;
  const world = (await decode(raw)).world;
  const date = await page.getByTestId('calendar').innerText();
  const sent = await commands(page);
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '구단 운영', exact: true })
    .click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  const design = page.getByRole('region', { name: '구단 디자인', exact: true });
  const colour = design.getByLabel('홈 색 코드', { exact: true });
  await colour.fill('#00A6A6');
  await expect(design.getByRole('status')).toContainText('적용 전 초안');
  const address = page.url();
  await openSettings(page, 'locale');
  await chooseOption(page.getByTestId('presentation-locale'), fixture.locale.id);
  await expect(page.locator('html')).toHaveAttribute('lang', fixture.locale.id);
  await closeSettings(page);
  await openSettings(page);
  await chooseOption(page.getByTestId('presentation-theme'), fixture.theme.id);
  await expect.poll(() => background(page)).toBe(FIXTURE_BACKGROUND);
  await closeSettings(page);
  expect(page.url()).toBe(address);
  await expect(colour).toHaveValue('#00A6A6');
  await expect(design.getByRole('status')).toContainText('적용 전 초안');
  await expect(page.getByTestId('calendar')).toHaveText(date, { useInnerText: true });
  await expect(page.getByTestId('hud-cash')).toContainText('Budget de test');
  expect(await commands(page)).toBe(sent);
  expect(await committedRaw(page)).toBe(raw);
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: 'Resource-only club home', exact: true })
    .click();
  const image = page.locator('[data-facility-art="stadium"] img');
  await expect(image).toHaveAttribute(
    'src',
    /\/__presentation-fixtures\/scenes\/heritage\/stadium-0\.svg$/,
  );
  await expect(image).toHaveAttribute('alt', 'Ère de test Tribune 1 Signal de test');
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) => element.complete && element.naturalWidth === 240,
      ),
    )
    .toBe(true);
  await expect(page.locator('img[src$="/__presentation-fixtures/home.svg"]:visible')).toBeVisible();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--presentation-fixture-loaded')
        .trim(),
    ),
  ).toBe('1');
  for (const path of [
    fixture.localeUrl,
    fixture.themeUrl,
    fixture.theme.stylesheet!,
    '/__presentation-fixtures/scenes/heritage/stadium-0.svg',
    '/__presentation-fixtures/home.svg',
  ])
    expect(fixture.requests.get(path), path).toBeGreaterThan(0);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PREFERENCE_KEY),
  ).toEqual({ localeId: FIXTURE_LOCALE, themeId: FIXTURE_THEME });
  const after = (await decode((await committedRaw(page))!)).world;
  expect(after).toEqual(world);
  expect(after.events).toContainEqual(
    expect.objectContaining({ title: STORED_KOREAN_TITLE, detail: STORED_KOREAN_DETAIL }),
  );
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', FIXTURE_LOCALE);
  await expect.poll(() => background(page)).toBe(FIXTURE_BACKGROUND);
  expect((await savedWorld(page)).events).toEqual(world.events);
});

test('a read-only game tab changes presentation without claiming ownership or issuing game commands', async ({
  page,
  context,
}) => {
  await routeSyntheticPresentation(page);
  await loadPausedGame(page);
  const raw = await committedRaw(page);
  const viewer = await context.newPage();
  await routeSyntheticPresentation(viewer);
  await observeCommands(viewer);
  await viewer.goto('/');
  // The second tab can continue the current slot for inspection without taking its lock.
  await viewer.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="game-slots"], [data-testid="club-hub"]',
      ),
    ].some((element) => element.getClientRects().length > 0),
  );
  if (await viewer.getByTestId('game-slots').isVisible()) await continueSlot(viewer);
  await expect(viewer.getByRole('button', { name: '읽기 전용', exact: true })).toBeVisible();
  const sent = await commands(viewer);
  await openSettings(viewer, 'locale');
  await chooseOption(viewer.getByTestId('presentation-locale'), FIXTURE_LOCALE);
  await expect(viewer.locator('html')).toHaveAttribute('lang', FIXTURE_LOCALE);
  await closeSettings(viewer);
  await openSettings(viewer);
  await chooseOption(viewer.getByTestId('presentation-theme'), FIXTURE_THEME);
  await expect(viewer.locator('html')).toHaveAttribute('lang', FIXTURE_LOCALE);
  await expect.poll(() => background(viewer)).toBe(FIXTURE_BACKGROUND);
  await closeSettings(viewer);
  await expect(viewer.getByRole('button', { name: '읽기 전용', exact: true })).toBeVisible();
  expect(await commands(viewer)).toBe(sent);
  expect(await committedRaw(viewer)).toBe(raw);
  await viewer.close();
});
