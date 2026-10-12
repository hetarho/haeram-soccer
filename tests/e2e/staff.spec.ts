import { test, expect, type Page } from '@playwright/test';
import { stopOnlyFor } from './events';
import { horizontalOverflow } from './layout';

/** This seed's first season offers a firefighter among the four candidates. */
async function found(page: Page) {
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('short-contract');
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}

const tab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: '스태프 보기' }).getByRole('tab', { name, exact: true });

/** Reads a decision's result card and closes it, so it no longer covers the tab bar. */
async function closeOutcome(page: Page, text: string) {
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText(text);
  await outcome.getByRole('button', { name: '확인', exact: true }).click();
  await expect(outcome).toHaveCount(0);
}

/** Hires the free-agent firefighter from the candidates tab, checking what the dialog promises. */
async function hireFirefighter(page: Page) {
  await tab(page, '감독 후보').click();
  const free = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '자유계약 감독', exact: true }) });
  await expect(page.getByRole('heading', { name: '다른 구단 감독 · 보상금 필요' })).toBeVisible();
  const card = free.getByRole('article').filter({ hasText: '소방수' });
  await expect(card).toContainText('계약 이번 시즌(1950/51) 끝까지');
  await expect(card).toContainText('선발 성향');
  await expect(card).not.toContainText('야망');
  const name = await card.getByRole('heading').innerText();
  await card.getByRole('button', { name: /^감독 선임 · / }).click();
  const dialog = page.getByRole('dialog', { name: '감독 선임 확인' });
  await expect(dialog).toContainText('시즌 종료까지 단기 계약');
  await expect(dialog).toContainText(
    '계약 이번 시즌(1950/51) 끝까지 · 남기려면 4월에 1시즌씩 재계약해요',
  );
  await dialog.getByRole('button', { name: '선임 확정', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // The man just hired leaves the market (→STAFF-17).
  await expect(page.getByRole('article').filter({ hasText: name })).toHaveCount(0);
  await closeOutcome(page, '새 감독을 선임했어요');
}

test.describe('the staff page at 360x740', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('splits the staff page into tabs and renews a firefighter one season', async ({ page }) => {
    await found(page);
    await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .getByRole('button', { name: '스태프', exact: true })
      .click();
    const tabs = page.getByRole('tablist', { name: '스태프 보기' }).getByRole('tab');
    await expect(tabs).toHaveText(['감독', '감독 후보', '코치진', '위임']);
    await expect(tab(page, '감독')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/manager$/);
    for (const box of await tabs.evaluateAll((all) =>
      all.map((button) => button.getBoundingClientRect().height),
    ))
      expect(box).toBeGreaterThanOrEqual(44);
    // The manager's office shows what 육성 means; the coaches and delegation wait in their tabs.
    await expect(page.getByText('27세 미만 선수 성장').first()).toBeVisible();
    await expect(page.getByRole('region', { name: '코치진', exact: true })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBe(0);
    // Arrow keys move along the tab bar like the operations tabs.
    await tab(page, '감독').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '감독 후보')).toBeFocused();
    await expect(tab(page, '감독 후보')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/manager\?view=candidates$/);
    expect(await horizontalOverflow(page)).toBe(0);

    await hireFirefighter(page);
    await tab(page, '감독').click();
    const renewal = page.getByTestId('manager-renewal');
    await expect(renewal).toContainText(
      '재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요.',
    );
    await expect(renewal).toContainText('계약 1951/52 시즌 끝까지');
    await expect(page.getByText(/1950년 부임 · 계약 이번 시즌\(1950\/51\) 끝까지/)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    await renewal.getByRole('button', { name: '재계약', exact: true }).click();
    await closeOutcome(page, '계약이 한 시즌 늘었어요');
    await expect(renewal).toHaveCount(0);
    await expect(page.getByText(/1950년 부임 · 계약 1951\/52 시즌 끝까지/)).toBeVisible();

    // A reload keeps the tab in the address.
    await tab(page, '코치진').click();
    await expect(page.getByTestId('coaching-mode')).toContainText('직접');
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(tab(page, '코치진')).toHaveAttribute('aria-selected', 'true');
    await tab(page, '위임').click();
    await expect(page.getByRole('region', { name: '스태프 위임' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test('an unrenewed firefighter leaves at the close and the alert opens the candidates', async ({
  page,
}) => {
  // Plays a whole season; slow CI browsers need longer.
  test.slow();
  await found(page);
  await page.getByRole('button', { name: '스태프', exact: true }).click();
  await hireFirefighter(page);
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await page
    .getByTestId('club-hub')
    .getByRole('button', { name: '시즌 상세', exact: true })
    .click();
  await page.getByRole('button', { name: '시즌 끝까지 진행', exact: true }).click();
  await expect(page.getByTestId('calendar')).toHaveText(/1951\/52 · 라운드 0$/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '시즌 상세와 클럽 소식' })).toHaveCount(0);
  const alert = page.getByRole('status').filter({ hasText: '감독이 떠났어요' });
  await expect(alert).toContainText('임시 감독이 팀을 맡고 있어요');
  await alert.getByRole('button', { name: '감독 선임하러 가기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '스태프', level: 2 })).toBeVisible();
  await expect(tab(page, '감독 후보')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/manager\?view=candidates$/);
  // The market keeps at least four free agents (→STAFF-17).
  const free = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '자유계약 감독', exact: true }) });
  expect(await free.getByRole('article').count()).toBeGreaterThanOrEqual(4);
});

test('the 1 April card renews the firefighter in one tap', async ({ page }) => {
  // Runs the clock from August to April at the fastest pace, stopping only for renewals.
  test.slow();
  await stopOnlyFor(page, ['staff-renewal']);
  await found(page);
  await page.getByRole('button', { name: '스태프', exact: true }).click();
  await hireFirefighter(page);
  await page.getByRole('button', { name: '클럽 홈', exact: true }).click();
  await page
    .getByRole('region', { name: '시즌 진행', exact: true })
    .getByRole('button', { name: '0.1초에 하루 속도로 자동 진행', exact: true })
    .click();
  const card = page.getByTestId('event-card');
  await expect(card).toContainText('감독 계약이 이번 시즌 끝에 끝나요', { timeout: 75000 });
  await expect(page.getByTestId('game-date')).toHaveText('1951년 4월 1일');
  await expect(card).toContainText('스태프 재계약');
  await expect(card).toContainText(
    '재계약하지 않으면 시즌이 끝날 때 떠나고 임시 감독이 팀을 맡아요',
  );
  await card.getByRole('button', { name: '감독 재계약', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: '스태프', exact: true }).click();
  await expect(page.getByText(/1950년 부임 · 계약 1951\/52 시즌 끝까지/)).toBeVisible();
  await expect(page.getByTestId('manager-renewal')).toHaveCount(0);
});
