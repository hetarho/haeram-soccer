import { expect, test, type Locator, type Page } from '@playwright/test';
import { COUNTRIES } from '../../packages/catalogs/src/index';

async function expectTouchControl(control: Locator, viewport: { width: number; height: number }) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const geometry = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      label: element.getAttribute('aria-label') || element.closest('label')?.textContent?.trim(),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      covered: !element.contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      ),
    };
  });
  const measured = JSON.stringify(geometry);
  expect(geometry.width, measured).toBeGreaterThanOrEqual(44);
  expect(geometry.height, measured).toBeGreaterThanOrEqual(44);
  expect(geometry.x, measured).toBeGreaterThanOrEqual(0);
  expect(geometry.y, measured).toBeGreaterThanOrEqual(0);
  expect(geometry.x + geometry.width, measured).toBeLessThanOrEqual(viewport.width);
  expect(geometry.y + geometry.height, measured).toBeLessThanOrEqual(viewport.height);
  expect(geometry.covered, measured).toBe(false);
}

async function expectCompactDocument(page: Page, viewport: { width: number; height: number }) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    scroll: scrollY,
  }));
  expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(viewport.width);
  expect(geometry.height, JSON.stringify(geometry)).toBeLessThanOrEqual(viewport.height + 2);
  expect(geometry.scroll).toBe(0);
}

async function found(page: Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps founding and match preparation selectors touchable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const country = page.getByLabel('창단 국가');
    await expectTouchControl(country, viewport);
    await country.selectOption('FRA');
    await expect(country).toHaveValue('FRA');
    await expectCompactDocument(page, viewport);
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(`native-preparation-${viewport.width}`);
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expectCompactDocument(page, viewport);
    await page.getByRole('button', { name: '진행 설정', exact: true }).click();
    const progress = page.getByRole('dialog', { name: '시즌 진행 설정' });
    for (const pace of ['1단계', '2단계', '3단계']) {
      await expectTouchControl(progress.getByRole('button', { name: pace }), viewport);
    }
    await progress.getByRole('button', { name: '2단계' }).click();
    await expect(progress.getByRole('button', { name: '2단계' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await progress.getByRole('button', { name: '설정 확인 마치기', exact: true }).click();
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '전술·선발 준비', exact: true })
      .click();
    const preparation = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    const tone = preparation.getByLabel('전술 요청 방식');
    await expectTouchControl(tone, viewport);
    await tone.focus();
    await expect(tone).toBeFocused();
    await tone.selectOption('demand');
    await expect(preparation.getByLabel('감독 예상 반응')).toContainText('신뢰 18 감소');
    await preparation.getByRole('tab', { name: '선발 선택', exact: true }).click();
    await preparation.getByText('선수별 교체', { exact: true }).click();
    const selectors = await preparation.getByRole('combobox').evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label'),
          width: bounds.width,
          height: bounds.height,
        };
      }),
    );
    expect(selectors).toHaveLength(11);
    for (const geometry of selectors) {
      expect(geometry.width, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
      expect(geometry.height, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
    }
    const keeper = preparation.getByLabel('선발 1 골키퍼', { exact: true });
    await expectTouchControl(keeper, viewport);
    const original = await keeper.inputValue();
    const replacement = await keeper
      .locator('option')
      .evaluateAll(
        (options, current) =>
          options
            .map((option) => (option as HTMLOptionElement).value)
            .find((value) => value && value !== current),
        original,
      );
    await keeper.selectOption(replacement!);
    const save = preparation.getByRole('button', { name: '이 선발로 다음 경기 준비', exact: true });
    await expectTouchControl(save, viewport);
    await save.click();
    await expect(preparation.getByRole('status')).toContainText('선발 11명을 저장했습니다.');
    await preparation.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '전술·선발 준비', exact: true })
      .click();
    await preparation.getByRole('tab', { name: '선발 선택', exact: true }).click();
    await preparation.getByText('선수별 교체', { exact: true }).click();
    await expect(keeper).toHaveValue(replacement!);
    await preparation.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await page.getByTestId('hub-play').click();
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await expectCompactDocument(page, viewport);
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    const player = page.getByLabel('살펴볼 선수');
    await expectTouchControl(player, viewport);
    await player.selectOption('1:4');
    await expect(player).toHaveValue('1:4');
  });

  test(`keeps scouting and league exploration selectors touchable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await found(page, `native-exploration-${viewport.width}`);
    await page
      .getByTestId('club-hub')
      .getByRole('button', { name: '선수 키우기·영입', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: '선수 성장과 훈련' })
      .getByRole('button', { name: '선수단·이적 시장', exact: true })
      .click();
    const scope = page.getByLabel('선수 지표 범위');
    await expectTouchControl(scope, viewport);
    await scope.selectOption('career');
    await expect(scope).toHaveValue('career');
    await page.getByRole('button', { name: '이적 시장', exact: true }).click();
    const order = page.getByLabel('영입 후보 정렬');
    await expectTouchControl(order, viewport);
    await order.selectOption('potential');
    await expect(order).toHaveValue('potential');
    await expect(
      page.getByRole('region', { name: '선수 영입 데스크' }).getByRole('article'),
    ).toHaveCount(8);
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '리그', exact: true })
      .click();
    const country = page.getByLabel('국가', { exact: true });
    const tier = page.getByRole('combobox', { name: '디비전', exact: true });
    await expectTouchControl(country, viewport);
    await expectTouchControl(tier, viewport);
    const regional = COUNTRIES.find((item) => item.groups.some((group) => group.length > 1))!;
    const regionalTier = regional.groups.findIndex((group) => group.length > 1);
    await country.selectOption(regional.code);
    await tier.selectOption(String(regionalTier));
    const group = page.getByRole('combobox', { name: '지역 그룹', exact: true });
    await expectTouchControl(group, viewport);
    await group.selectOption('1');
    await expect(group).toHaveValue('1');
    await expect(page.getByRole('table', { name: '리그 순위표' }).getByRole('row')).not.toHaveCount(
      1,
    );
    await expect(page.getByTestId('game-date')).toHaveText('1901년 8월 1일');
  });
}
