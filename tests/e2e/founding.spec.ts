import { openOfficeLibrary } from './office';
import { watchNext } from './watch';
import { delegateSales } from './events';
import { chooseOption, selectOptions } from './select';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { createWorld, operatingCost } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';
import { settle, viewGeometry } from './layout';

async function completeFoundingGeometry(page: Page) {
  const view = await viewGeometry(page);
  const controls = await page.evaluate(() => {
    const founding = document.querySelector('[data-testid="club-founding"]')!;
    const tools = document.querySelector('main [class*="startTools"]')!;
    const required = [
      ...founding.querySelectorAll('form > label input,form > label select,button,summary'),
      tools.querySelector('label')!,
    ].filter((element) => element.getClientRects().length);
    const measure = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return {
        label:
          element.getAttribute('aria-label') ||
          element.closest('label')?.textContent ||
          element.textContent,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      controls: required.map(measure),
      footerCount: document.querySelectorAll('main footer').length,
      notes: [
        founding.querySelector('header p')!,
        founding.querySelector('button[aria-pressed="true"] small')!,
        founding.querySelector('[class*="origin"] small')!,
      ].map((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      })),
    };
  });
  return { ...controls, view };
}

function expectCompleteFoundingFits(
  geometry: Awaited<ReturnType<typeof completeFoundingGeometry>>,
) {
  const measured = JSON.stringify(geometry);
  expect(geometry.view.documentWidth, measured).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.view.width, measured).toBeLessThanOrEqual(geometry.view.clientWidth);
  expect(geometry.view.documentHeight, measured).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.view.overflow, measured).toBeLessThanOrEqual(2);
  expect(geometry.view.scroll, measured).toBe(0);
  expect(geometry.view.documentScroll, measured).toBe(0);
  expect(geometry.footerCount, measured).toBe(0);
  for (const bounds of geometry.controls) {
    expect(bounds.x, measured).toBeGreaterThanOrEqual(0);
    expect(bounds.y, measured).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, measured).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(bounds.y + bounds.height, measured).toBeLessThanOrEqual(geometry.viewportHeight);
  }
  for (const control of geometry.controls) {
    expect(control.width, measured).toBeGreaterThanOrEqual(44);
    expect(control.height, measured).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Picks the club colour in the real design editor: the 홈 colour, which leads the stored
 * representative palette (→KIT-1/4, WEB-86).
 */
async function chooseClubColour(page: Page, colour: string) {
  await page
    .getByTestId('club-founding')
    .getByRole('button', { name: '구단 디자인 꾸미기', exact: true })
    .click();
  const editor = page.getByRole('dialog', { name: '구단 디자인' });
  await editor.getByLabel('홈 색 코드', { exact: true }).fill(colour);
  await editor.getByRole('button', { name: '이 디자인 사용', exact: true }).click();
  await expect(editor).toHaveCount(0);
}

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await downloading;
  const raw = await readFile((await file.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}

for (const viewport of [
  { width: 360, height: 740, country: 'FRA' as const },
  { width: 390, height: 844, country: 'NED' as const },
]) {
  test(`fits basic founding and saves advanced choices at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const founding = page.getByTestId('club-founding');
    await expect(founding).toBeVisible();
    const create = founding.getByRole('button', { name: '클럽 창단' });
    const bounds = await create.boundingBox();
    expectCompleteFoundingFits(await completeFoundingGeometry(page));
    const geometry = await viewGeometry(page);
    const measured = JSON.stringify({ ...geometry, create: bounds });
    expect(geometry.width, measured).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.overflow, measured).toBeLessThanOrEqual(2);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(founding.getByRole('button', { name: '쉬움' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const countries = founding.getByRole('combobox', { name: '창단 국가', exact: true });
    await expect(countries).toHaveAttribute('data-value', 'ENG');
    const countryChoices = await selectOptions(countries);
    expect(countryChoices).toHaveLength(8);
    expect(countryChoices.map((option) => option.value).sort()).toEqual([
      'BEL',
      'ENG',
      'ESP',
      'FRA',
      'GER',
      'ITA',
      'NED',
      'POR',
    ]);
    const input = {
      country: viewport.country,
      name: `우리 동네 FC ${viewport.width}`,
      color: '#477c9a',
      seed: `quick-founding-${viewport.width}`,
      level: 'hard' as const,
    };
    await founding.getByLabel('클럽 이름').fill(input.name);
    await chooseOption(countries, input.country);
    await founding.getByRole('button', { name: '어려움' }).click();
    await founding.getByText('고급 설정', { exact: true }).click();
    await founding.getByLabel('세계 생성 시드').fill(input.seed);
    await chooseClubColour(page, input.color);
    await create.click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비', exact: true }),
    ).toBeEnabled();
    const actual = await exportWorld(page);
    const reference = createWorld(input);
    const club = actual.clubs.find((candidate) => candidate.id === actual.playerClub)!;
    expect(club.country).toBe(input.country);
    expect(club.name).toBe(input.name);
    expect(club.color).toBe(input.color);
    expect(club.identity?.colours[0]).toBe(input.color);
    expect(actual.seed).toBe(input.seed);
    expect(actual.level).toBe(input.level);
    expect(actual.cash).toBe(reference.cash);
    expect(actual.players).toEqual(reference.players);

    await page.addInitScript(() => {
      const audit = { seenFounding: false, samples: 0 };
      (window as typeof window & { warmFoundingAudit: typeof audit }).warmFoundingAudit = audit;
      const check = () => {
        audit.samples++;
        const panel = document.querySelector('[data-testid="club-founding"]');
        if (panel?.getClientRects().length) audit.seenFounding = true;
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', check);
      check();
    });
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    const audit = await page.evaluate(
      () =>
        (
          window as typeof window & {
            warmFoundingAudit: { seenFounding: boolean; samples: number };
          }
        ).warmFoundingAudit,
    );
    expect(audit.samples).toBeGreaterThan(0);
    expect(audit.seenFounding).toBe(false);
    await expect(page.getByTestId('club-founding')).toHaveCount(0);
    expect(await exportWorld(page)).toEqual(actual);
  });

  test(`fits all founding controls and recovery tools with wrapped fallback text at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('club-founding')).toBeVisible();
    await expect(page.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
    await page.addStyleTag({
      content:
        'body { font-family: monospace !important; letter-spacing: 0.75px; word-spacing: 0.15em; }',
    });
    const geometry = await completeFoundingGeometry(page);
    expect(
      geometry.notes.some((note) => note.height >= note.lineHeight * 1.5),
      JSON.stringify(geometry.notes),
    ).toBe(true);
    expect(
      geometry.notes.every((note) => note.fontSize >= 12),
      JSON.stringify(geometry.notes),
    ).toBe(true);
    expectCompleteFoundingFits(geometry);
    const founding = page.getByTestId('club-founding');
    await founding.getByRole('button', { name: '어려움' }).click();
    await expect(founding.getByRole('button', { name: '어려움' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await founding.getByText('고급 설정', { exact: true }).click();
    await founding.getByLabel('세계 생성 시드').fill(`wrapped-font-${viewport.width}`);
    await founding.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  });
}

test('founds with a preset as its direction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const founding = page.getByTestId('club-founding');
  const direction = founding.getByRole('combobox', { name: '구단 운영' });
  // 기본 방향 shows selected; each choice states its idea and the rows it fills (→WEB-15).
  await expect(direction).toContainText('기본 방향');
  const options = await selectOptions(direction);
  expect(options.map((option) => option.value)).toEqual([
    'default',
    'local-pride',
    'youth-academy',
    'trading',
    'commercial',
    'global',
    'ambition',
    'shoestring',
  ]);
  expect(options[2].label).toContain('유스 명가');
  expect(options[2].label).toContain('엘리트 아카데미');
  await chooseOption(direction, 'youth-academy');
  await expect(direction).toHaveText(/유스 명가/);
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const w = await exportWorld(page);
  expect(w.build).toEqual({ youth: 'elite', culture: 'meritocracy' });
  expect(w.policy).toMatchObject({ academy: 4, recruitment: 1 });
  expect(w.direction).toMatchObject({ debut: 'early', coaches: 'elite' });
  // The applied direction remains available in investment's secondary configuration.
  await openOfficeLibrary(page);
  await expect(page.getByTestId('current-strategy')).toHaveText('유스 명가');
});

test('starts with generous capital and shows a fact-aware guide without changing the save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '쉬움' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  const before = await exportWorld(page);
  expect(before.level).toBe('easy');
  expect(BigInt(before.cash)).toBe(BigInt(operatingCost(before)) * 2n);
  const openGuide = async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page
      .getByRole('dialog', { name: '설정' })
      .getByRole('button', { name: '클럽 키우기 가이드', exact: true })
      .click();
  };
  await openGuide();
  const guide = page.getByRole('dialog', { name: '클럽 키우기 가이드' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(guide.getByRole('listitem')).toHaveCount(3);
  await expect(
    guide.getByRole('heading', { name: '한 번 눌러 경기로', exact: true }),
  ).toBeVisible();
  await expect(guide).toContainText('비용과 효과를 먼저 보여주고');
  await expect(guide.getByText('완료 ✓', { exact: true })).toHaveCount(0);
  const close = guide.getByRole('button', { name: '가이드 확인 마치기', exact: true });
  await settle(page);
  const bounds = await close.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await close.click();
  const afterGuide = await exportWorld(page);
  expect(afterGuide).toEqual(before);
  await delegateSales(page);
  await watchNext(page, { manual: true });
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽 홈', exact: true })
    .click();
  const played = await exportWorld(page);
  expect(played.ownMatches).toHaveLength(1);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await openGuide();
  await expect(
    guide.getByRole('heading', { name: '한 번 눌러 경기로 완료 ✓', exact: true }),
  ).toBeVisible();
  await close.click();
  expect(await exportWorld(page)).toEqual(played);
});
