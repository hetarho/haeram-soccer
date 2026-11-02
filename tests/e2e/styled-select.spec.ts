import { openClubRecords, openLeague } from './competition-navigation';
import { delegateSales } from './events';
import { expect, test, type Locator } from '@playwright/test';
import { chooseOption, optionList } from './select';
import { horizontalOverflow, settle } from './layout';
import { generateWorld, startCareer } from './start';

async function controlGeometry(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element),
      bounds = element.getBoundingClientRect();
    const value = element.querySelector('span')!;
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      border: style.borderTopWidth,
      frame: style.borderImageSource,
      filter: style.filter,
      transform: style.transform,
      whiteSpace: getComputedStyle(value).whiteSpace,
      lineHeight: parseFloat(getComputedStyle(value).lineHeight),
      valueWidth: value.clientWidth,
      textWidth: value.scrollWidth,
      valueHeight: value.clientHeight,
      textHeight: value.scrollHeight,
    };
  });
}

test('selects by keyboard, exposes selection and dismisses without committing previews', async ({
  page,
}) => {
  await page.goto('/');
  // The takeover list's country filter: 모든 국가, then the countries from 잉글랜드 to 벨기에.
  const listing = await generateWorld(page);
  const country = listing.getByRole('combobox', { name: '국가', exact: true });
  await country.focus();
  await country.press('End');
  const list = page.getByRole('listbox', { name: '국가', exact: true });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option', { selected: true })).toContainText('잉글랜드');
  await expect(country).toHaveAttribute('data-value', 'ENG');
  await country.press('Enter');
  await expect(country).toHaveAttribute('data-value', 'BEL');
  await expect(country).toBeFocused();
  await country.press('Home');
  await country.press('Escape');
  await expect(country).toHaveAttribute('data-value', 'BEL');
  await expect(list).toHaveCount(0);
  await country.press('P');
  await country.press('Enter');
  await expect(country).toHaveAttribute('data-value', 'POR');
  // An open select must follow the same native Tab order as a closed one. macOS WebKit
  // skips ordinary buttons, so its next target is the list's 인수 가능만 checkbox.
  await country.press('Tab');
  await expect(country).not.toBeFocused();
  const nativeNext = await page.evaluateHandle(() => document.activeElement);
  await country.focus();
  await country.press('ArrowDown');
  await country.press('Tab');
  await expect(country).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() => nativeNext.evaluate((element) => element === document.activeElement))
    .toBe(true);
  await nativeNext.dispose();
  await country.click();
  await listing.getByRole('heading', { name: '인수할 구단' }).click();
  await expect(country).toHaveAttribute('aria-expanded', 'false');
  await expect(country).toHaveAttribute('data-value', 'POR');
  await expect(listing).toBeVisible();
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps text season controls steady and selected competition on one line at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page);
    await openClubRecords(page);
    await page.getByRole('button', { name: '1930/31 구단 시즌 기록 보기', exact: true }).click();
    const season = page.getByRole('combobox', { name: '기록 시즌', exact: true });
    const competition = page.getByRole('combobox', { name: '기록 대회 범위', exact: true });
    await settle(page);
    for (const trigger of [season, competition]) {
      const before = await controlGeometry(trigger);
      await trigger.hover();
      const immediate = await controlGeometry(trigger);
      await settle(page);
      const settled = await controlGeometry(trigger);
      await page.mouse.down();
      const pressed = await controlGeometry(trigger);
      await page.mouse.up();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const opened = await controlGeometry(trigger);
      for (const state of [before, immediate, settled, pressed, opened]) {
        expect(state.width).toBe(before.width);
        expect(state.height).toBe(before.height);
        expect(state.x).toBe(before.x);
        expect(state.y).toBe(before.y);
        expect(state.height).toBe(44);
        expect(state.border).toBe('0px');
        expect(state.frame).toBe('none');
        expect(state.filter).toBe('none');
        expect(state.transform).toBe('none');
        expect(state.whiteSpace).toBe('nowrap');
        expect(state.textWidth).toBeLessThanOrEqual(state.valueWidth);
        expect(state.textHeight).toBeLessThanOrEqual(state.valueHeight);
        expect(state.valueHeight).toBeLessThanOrEqual(Math.ceil(state.lineHeight));
      }
      await trigger.press('Escape');
    }
    await chooseOption(competition, 'playoff');
    await expect(competition).toContainText('승격 플레이오프');
    const long = await controlGeometry(competition);
    expect(long.height).toBe(44);
    expect(long.whiteSpace).toBe('nowrap');
    expect(long.valueHeight).toBeLessThanOrEqual(Math.ceil(long.lineHeight));
    expect(long.textWidth).toBeLessThanOrEqual(long.valueWidth);
    expect(long.textHeight).toBeLessThanOrEqual(long.valueHeight);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test(`keeps long dropdowns within the viewport and Escape inside a dialog at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page);
    await delegateSales(page);
    // Escape closes only the open list, never the dialog around it: the HUD's theme picker.
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '설정', exact: true });
    await menu.getByRole('button', { name: /^테마 변경/ }).click();
    const sheet = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('presentation-settings') });
    await expect(sheet).toBeVisible();
    const theme = sheet.getByRole('combobox');
    const value = (await theme.getAttribute('data-value'))!;
    const list = await optionList(theme);
    await theme.press('End');
    await theme.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(theme).toBeFocused();
    await expect(theme).toHaveAttribute('data-value', value);
    await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    // A long list: every round of our league's season.
    await openLeague(page);
    await page.getByRole('tab', { name: '일정·결과', exact: true }).click();
    const round = page.getByRole('combobox', { name: '리그 라운드 선택', exact: true });
    const rounds = await optionList(round);
    await expect.poll(() => rounds.getByRole('option').count()).toBeGreaterThanOrEqual(20);
    await settle(page);
    const bounds = await rounds.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    // Phone option rows are the compact 36px of the dropdown design; the closed control is 44px.
    expect(
      Math.round((await rounds.getByRole('option').first().boundingBox())!.height),
    ).toBeGreaterThanOrEqual(36);
    await round.press('End');
    const last = rounds.getByRole('option').last();
    await expect(last).toBeInViewport();
    const lastRound = (await last.getAttribute('data-value'))!;
    await round.press('Enter');
    await expect(round).toHaveAttribute('data-value', lastRound);
    await expect(round).toBeFocused();
    await expect(rounds).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
