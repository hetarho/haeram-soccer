import { watchNext } from './watch';
import { delegateSales } from './events';
import { expect, test } from '@playwright/test';
import { chooseOption, optionList } from './select';
import { horizontalOverflow, settle } from './layout';

test('selects by keyboard, exposes selection and dismisses without committing previews', async ({
  page,
}) => {
  await page.goto('/');
  const country = page.getByRole('combobox', { name: '창단 국가', exact: true });
  await country.focus();
  await country.press('End');
  const list = page.getByRole('listbox', { name: '창단 국가' });
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
  // skips ordinary buttons, so its next target is the advanced-settings summary.
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
  await page.getByRole('heading', { name: '당신의 클럽, 첫 시즌.' }).click();
  await expect(country).toHaveAttribute('aria-expanded', 'false');
  await expect(country).toHaveAttribute('data-value', 'POR');
  await expect(page.getByTestId('club-founding')).toBeVisible();
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps long dropdowns within the viewport and Escape inside preparation at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await delegateSales(page);
    await page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비' }).click();
    const sheet = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    const tone = sheet.getByRole('combobox', { name: '전술 요청 방식', exact: true });
    const list = await optionList(tone);
    await tone.press('End');
    await tone.press('Escape');
    await expect(sheet).toBeVisible();
    await expect(tone).toBeFocused();
    await expect(tone).toHaveAttribute('data-value', 'evidence');
    await chooseOption(tone, 'demand');
    await expect(sheet.getByLabel('감독 예상 반응')).toContainText('신뢰 18 감소');
    await sheet.getByRole('button', { name: '준비 마치고 돌아가기' }).click();
    await watchNext(page);
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    const inspector = page.getByRole('combobox', { name: '살펴볼 선수', exact: true });
    const players = await optionList(inspector);
    // Both sides on the pitch: 22, fewer after a dismissal in the founded world's random match.
    await expect.poll(() => players.getByRole('option').count()).toBeGreaterThanOrEqual(20);
    await settle(page);
    const bounds = await players.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(
      (await players.getByRole('option').first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await inspector.press('End');
    const last = players.getByRole('option').last();
    await expect(last).toBeInViewport();
    await inspector.press('Enter');
    await expect(inspector).toHaveAttribute('data-value', '1:10');
    await expect(inspector).toBeFocused();
    await expect(list).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
