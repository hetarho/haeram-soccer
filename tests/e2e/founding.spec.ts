import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { createWorld, operatingCost } from '../../packages/engine/src/index';
import type { World } from '../../packages/contracts/src/types';

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
    const countries = founding.getByLabel('창단 국가');
    await expect(countries).toHaveValue('ENG');
    await expect(countries.locator('option')).toHaveCount(8);
    expect(
      (
        await countries
          .locator('option')
          .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
      ).sort(),
    ).toEqual(['BEL', 'ENG', 'ESP', 'FRA', 'GER', 'ITA', 'NED', 'POR']);
    const input = {
      country: viewport.country,
      name: `우리 동네 FC ${viewport.width}`,
      color: '#477c9a',
      seed: `quick-founding-${viewport.width}`,
      difficulty: 0.5,
    };
    await founding.getByLabel('클럽 이름').fill(input.name);
    await countries.selectOption(input.country);
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
