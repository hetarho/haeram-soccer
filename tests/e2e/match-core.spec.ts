import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  advanceToNextMatch,
  clubOf,
  createWorld,
  lineupSummary,
  startingSquad,
  tacticLabel,
} from '../../packages/engine/src/index';

async function savedRaw(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return page.evaluate(() => {
    const manifest = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    return localStorage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)!;
  });
}

async function expectCompactMatch(page: Page, viewport: { width: number; height: number }) {
  await expect
    .poll(() =>
      page.getByLabel('22명의 선수와 공으로 표현하는 경기').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const bounds = canvas.getBoundingClientRect();
        return Math.abs(canvas.width / canvas.height - bounds.width / bounds.height);
      }),
    )
    .toBeLessThan(0.015);
  const geometry = await page.evaluate(() => {
    const theatre = document.querySelector('[data-testid="match-theatre"]')!;
    const menu = document.querySelector('nav[aria-label="모바일 게임 메뉴"]')!;
    const required = [
      theatre.querySelector('[data-testid="match-score"]')!,
      theatre.querySelector('canvas')!,
      theatre.querySelector('[data-testid="match-latest-event"]')!,
      theatre.querySelector('[data-testid="match-feedback"]')!,
    ];
    const controls = [...theatre.querySelectorAll('button,select')].filter(
      (element) => element.getClientRects().length,
    );
    const navigation = [
      ...document.querySelectorAll('[role="tablist"][aria-label="시즌 보기"] [role="tab"]'),
      document.querySelector('select[aria-label="시즌 통계 보기"]')!,
    ];
    const measure = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') || element.textContent || element.tagName,
        control: ['BUTTON', 'SELECT'].includes(element.tagName),
        visible:
          !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scroll: scrollY,
      menuTop: menu.getBoundingClientRect().top,
      targets: [...required, ...controls].map(measure),
      navigation: navigation.map(measure),
    };
  });
  expect(geometry.height, JSON.stringify(geometry)).toBeLessThanOrEqual(viewport.height + 2);
  expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(viewport.width);
  expect(geometry.scroll).toBe(0);
  for (const bounds of geometry.targets) {
    expect(bounds.visible, bounds.label).toBe(true);
    expect(bounds.x, bounds.label).toBeGreaterThanOrEqual(0);
    expect(bounds.y, bounds.label).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, bounds.label).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height, bounds.label).toBeLessThanOrEqual(geometry.menuTop);
    if (bounds.control) {
      expect(bounds.width, bounds.label).toBeGreaterThanOrEqual(44);
      expect(bounds.height, bounds.label).toBeGreaterThanOrEqual(44);
    }
  }
  for (const bounds of geometry.navigation) {
    expect(bounds.width, bounds.label).toBeGreaterThanOrEqual(44);
    expect(bounds.height, bounds.label).toBeGreaterThanOrEqual(44);
  }
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps the full match loop in ${viewport.width}x${viewport.height} and preserves actual seeded facts`, async ({
    page,
  }) => {
    const founding = {
      country: 'ENG' as const,
      name: 'Haeram Athletic',
      color: '#bf7956',
      seed: `match-core-${viewport.width}`,
      difficulty: 2,
    };
    const reference = createWorld(founding);
    const first = advanceToNextMatch(reference)!;
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(founding.seed);
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '경기 관전', exact: true })
      .click();
    await expect(page.getByRole('tablist', { name: '시즌 보기' }).getByRole('tab')).toHaveCount(3);
    expect(
      await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
        return new Set(ids).size === ids.length;
      }),
    ).toBe(true);
    await expect(page.getByRole('button', { name: '결과 보기', exact: true })).toBeDisabled();
    await expect(page.getByLabel('관전 속도')).toHaveValue('4');
    await expectCompactMatch(page, viewport);
    await page.evaluate(() => {
      (window as typeof window & { matchCanvas?: Element | null }).matchCanvas =
        document.querySelector('canvas');
    });
    await page.getByTestId('match-next-action').click();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expectCompactMatch(page, viewport);
    await expect(page.getByTestId('match-result-summary')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: '경기 시간', exact: true })).toBeHidden();
    await page.getByLabel('관전 속도').selectOption('12');
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90′ ·.*경기 종료/)).toBeVisible();
    await expectCompactMatch(page, viewport);
    const side = first.record.home === reference.playerClub ? 0 : 1;
    const ownGoals = side === 0 ? first.record.score.home : first.record.score.away;
    const otherGoals = side === 0 ? first.record.score.away : first.record.score.home;
    const result = page.getByTestId('match-result-summary');
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    await expect(result).toContainText(
      `슛 ${first.record.metrics[side][4]}–${first.record.metrics[1 - side][4]}`,
    );
    await expect(result).toContainText(
      `유효 슛 ${first.record.metrics[side][5]}–${first.record.metrics[1 - side][5]}`,
    );
    await expect(page.getByTestId('match-readiness')).toContainText(
      `${tacticLabel[reference.tactic]} · 피로 ${lineupSummary(startingSquad(reference, clubOf(reference))).fatigue}/100`,
    );
    const settled = await savedRaw(page);
    expect((await decode(settled)).world.ownMatches[0]).toEqual(reference.ownMatches[0]);
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expect(page.getByRole('slider', { name: '경기 시간', exact: true })).toBeVisible();
    const actionBounds = await page.getByTestId('match-next-action').boundingBox();
    const detailBounds = await page
      .getByRole('slider', { name: '경기 시간', exact: true })
      .boundingBox();
    const menuBounds = await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .boundingBox();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(menuBounds!.y);
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(detailBounds!.y);
    await expect(page.getByText('패스 성공', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    await expect(page.getByLabel('살펴볼 선수')).toBeVisible();
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expectCompactMatch(page, viewport);
    const matchTab = page.getByRole('tab', { name: '경기', exact: true });
    await matchTab.focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: '전술·선발', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(matchTab).toBeFocused();
    await page.getByLabel('시즌 통계 보기').selectOption('rank');
    await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
    await matchTab.click();
    await expectCompactMatch(page, viewport);
    await page.getByRole('button', { name: '다시 보기', exact: true }).click();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expect(page.getByTestId('match-result-summary')).toHaveCount(0);
    await expectCompactMatch(page, viewport);
    expect(await savedRaw(page)).toBe(settled);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { matchCanvas?: Element | null }).matchCanvas ===
          document.querySelector('canvas'),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    await page.getByRole('button', { name: '다음 경기 준비', exact: true }).click();
    await expect(page.getByRole('tab', { name: '전술·선발', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: '전술·선발', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: '전술·선발 준비', exact: true })).toBeVisible();
    await matchTab.click();
    advanceToNextMatch(reference);
    const beforeNext = await page.getByTestId('game-date').innerText();
    await page.getByTestId('match-next-action').click();
    await expect(page.getByTestId('game-date')).not.toHaveText(beforeNext);
    await expect(page.getByTestId('match-next-action')).toBeEnabled();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expectCompactMatch(page, viewport);
    await expect(page.getByRole('button', { name: '경기 상세', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(result).toBeVisible();
    const nextSaved = (await decode(await savedRaw(page))).world;
    expect(nextSaved.ownMatches).toHaveLength(2);
    expect(nextSaved.ownMatches[1]).toEqual(reference.ownMatches[1]);
    await expectCompactMatch(page, viewport);
  });
}
