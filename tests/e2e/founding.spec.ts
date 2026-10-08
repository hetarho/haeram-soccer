import { chooseOption, selectOptions } from './select';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { createWorld, operatingCost } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';

async function completeFoundingGeometry(page: Page) {
  return page.evaluate(() => {
    const founding = document.querySelector('[data-testid="club-founding"]')!;
    const tools = document.querySelector('main [class*="startTools"]')!;
    const footer = document.querySelector('main [class*="footer"]')!;
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
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scroll: scrollY,
      controls: required.map(measure),
      footer: measure(footer),
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
}

function expectCompleteFoundingFits(
  geometry: Awaited<ReturnType<typeof completeFoundingGeometry>>,
) {
  const measured = JSON.stringify(geometry);
  expect(geometry.width, measured).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.height, measured).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.scroll, measured).toBe(0);
  for (const bounds of [...geometry.controls, geometry.footer]) {
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

async function exportWorld(page: Page): Promise<World> {
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '더보기', exact: true })
    .click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
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
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    const measured = JSON.stringify({ ...geometry, create: bounds });
    expect(geometry.width, measured).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.height, measured).toBeLessThanOrEqual(geometry.viewportHeight + 2);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(founding.getByRole('button', { name: '넉넉한 출발' })).toHaveAttribute(
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
      difficulty: 0.5,
    };
    await founding.getByLabel('클럽 이름').fill(input.name);
    await chooseOption(countries, input.country);
    await founding.getByRole('button', { name: '작은 출발' }).click();
    await founding.getByText('고급 설정', { exact: true }).click();
    await founding.getByLabel('세계 생성 시드').fill(input.seed);
    await founding.getByLabel('클럽 색상').fill(input.color);
    await create.click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('hub-play')).toBeEnabled();
    const actual = await exportWorld(page);
    const reference = createWorld(input);
    const club = actual.clubs.find((candidate) => candidate.id === actual.playerClub)!;
    expect(club.country).toBe(input.country);
    expect(club.name).toBe(input.name);
    expect(club.color).toBe(input.color);
    expect(actual.seed).toBe(input.seed);
    expect(actual.difficulty).toBe(input.difficulty);
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
    await founding.getByRole('button', { name: '작은 출발' }).click();
    await expect(founding.getByRole('button', { name: '작은 출발' })).toHaveAttribute(
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

test('starts with generous capital and shows a fact-aware guide without changing the save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '넉넉한 출발' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '클럽 창단' }).click();
  const before = await exportWorld(page);
  expect(before.difficulty).toBe(2);
  expect(BigInt(before.cash)).toBe(BigInt(operatingCost(before)) * 2n);
  const openGuide = async () => {
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '더보기', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: '전체 메뉴' })
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
  await expect(guide).toContainText('반복 비용');
  await expect(guide.getByText('완료 ✓', { exact: true })).toHaveCount(0);
  const close = guide.getByRole('button', { name: '가이드 확인 마치기', exact: true });
  const bounds = await close.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await close.click();
  const afterGuide = await exportWorld(page);
  expect(afterGuide).toEqual(before);
  await page.getByTestId('hub-play').click();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await page
    .getByRole('navigation', { name: '모바일 게임 메뉴' })
    .getByRole('button', { name: '클럽 일지', exact: true })
    .click();
  const played = await exportWorld(page);
  expect(played.ownMatches).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await openGuide();
  await expect(
    guide.getByRole('heading', { name: '한 번 눌러 경기로 완료 ✓', exact: true }),
  ).toBeVisible();
  await close.click();
  expect(await exportWorld(page)).toEqual(played);
});
