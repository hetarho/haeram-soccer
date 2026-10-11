import { test, expect } from '@playwright/test';
import { horizontalOverflow } from './layout';

async function found(page: import('@playwright/test').Page, seed: string) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(seed);
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

test.describe('cups, transfer stance, coaching and club trends at 390x844', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('shows the drawn domestic cup with our tie and the road to Europe', async ({ page }) => {
    await found(page, 'cups-journey');
    await page.getByRole('button', { name: '컵 대회', exact: true }).click();
    await expect(page.getByRole('tab', { name: '잉글랜드 컵', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const cup = page.getByRole('region', { name: '잉글랜드 컵' });
    // A new amateur club enters the cup in its first round, drawn before the season starts.
    await expect(cup.getByRole('heading', { name: '1라운드' })).toBeVisible();
    await expect(cup.getByText('우리 팀')).toBeVisible();
    await expect(cup).toContainText('다음');
    await expect(page.getByText(/유러피언컵은 5년 후\(1955\/56\) 창설돼요/)).toBeVisible();
    await page.getByRole('tab', { name: '역사', exact: true }).click();
    await expect(page.getByRole('region', { name: '컵 대회 역사' })).toContainText(
      '아직 기록된 대회가 없어요',
    );
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('switches a player transfer stance from the roster badge and sets coaching per department', async ({
    page,
  }) => {
    await found(page, 'listing-journey');
    await page.getByRole('button', { name: '선수단', exact: true }).click();
    const open = page.getByRole('button', { name: /이적 상태 · 협상 가능 · 바꾸기$/ });
    await expect(open.first()).toBeVisible();
    const total = await open.count();
    expect(total).toBeGreaterThan(14);
    await open.first().click();
    const sheet = page.getByRole('dialog', { name: '이적 상태' });
    await expect(sheet.getByRole('radio', { name: /협상 가능/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(sheet.getByRole('radio', { name: /이적 명단 · 적극 매도/ })).toContainText(
      '첫 제안까지 평균 약',
    );
    await expect(sheet.getByRole('radio', { name: /이적 불가/ })).toContainText('150%');
    await sheet.getByRole('radio', { name: /이적 명단 · 적극 매도/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('button', { name: /이적 상태 · 이적 명단 · 바꾸기$/ })).toHaveCount(
      1,
    );
    await open.first().click();
    await page
      .getByRole('dialog', { name: '이적 상태' })
      .getByRole('radio', { name: /이적 불가/ })
      .click();
    await expect(page.getByRole('button', { name: /이적 상태 · 이적 불가 · 바꾸기$/ })).toHaveCount(
      1,
    );
    await expect(open).toHaveCount(total - 2);
    expect(await horizontalOverflow(page)).toBe(0);

    // Below level 4 the owner hires coaches himself; the department dials appear once delegated.
    await page.getByRole('button', { name: '스태프', exact: true }).click();
    await expect(page.getByTestId('coaching-mode')).toContainText('직접');
    const dial = page.getByRole('radiogroup', { name: '공격 코치 투자 수준' });
    await expect(dial).toHaveCount(0);
    await page.getByRole('checkbox', { name: /코치 고용·재계약/ }).check();
    await expect(page.getByTestId('coaching-mode')).toContainText('자동');
    await expect(dial.getByRole('radio', { name: /균형/ })).toHaveAttribute('aria-checked', 'true');
    await dial.getByRole('radio', { name: /최고/ }).click();
    await expect(dial.getByRole('radio', { name: /최고/ })).toHaveAttribute('aria-checked', 'true');
    // The other departments keep their own level.
    await expect(
      page
        .getByRole('radiogroup', { name: '수비 코치 투자 수준' })
        .getByRole('radio', { name: /균형/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test('charts league position, Elo and values in the records room', async ({ page }) => {
    await found(page, 'trends-journey');
    await page.getByRole('button', { name: '클럽 기록실', exact: true }).click();
    await expect(page.getByRole('heading', { name: '리그 위치' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '클럽 Elo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '선수단 가치' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '구단 가치' })).toBeVisible();
    await expect(page.getByRole('table', { name: '시즌별 기록' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
