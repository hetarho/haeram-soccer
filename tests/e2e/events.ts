import { expect, type Page } from '@playwright/test';

/** Compatibility presets for older journeys, expressed only through the shared public dialog.
 * New responsibility tests select each category independently. */
export async function chooseLevel(page: Page, level: 1 | 2 | 3 | 4) {
  await page.getByTestId('intervention-trigger').click();
  const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  const labels = [
    '감독 인사',
    '스태프 인사',
    '선수 계약',
    '선수 영입',
    '선수 매각',
    '유소년 승격·방출',
    '스폰서 계약',
  ];
  for (let i = 0; i < labels.length; i++) {
    const delegated =
      level === 4 || (level >= 3 && i !== 3 && i !== 4) || (level === 2 && (i === 2 || i === 5));
    await dialog
      .getByRole('combobox', { name: labels[i], exact: true })
      .selectOption(delegated ? 'delegated' : 'direct');
  }
  await dialog.getByRole('combobox', { name: '진행 모드', exact: true }).selectOption('automatic');
  await dialog
    .getByRole('checkbox', { name: '경기 전날 이벤트', exact: true })
    .setChecked(level <= 2);
  await dialog
    .getByRole('checkbox', { name: '이적시장 개장 이벤트', exact: true })
    .setChecked(level <= 3);
  const apply = dialog.getByRole('button', { name: '적용', exact: true });
  if (await apply.isEnabled()) {
    await apply.click();
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toBeVisible();
    await outcome.getByRole('button', { name: '확인', exact: true }).click();
  } else await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** The card shown when the clock stops for a match eve or an attention event. */
export const eventCard = (page: Page) => page.getByTestId('event-card');

/**
 * Reads every pending attention card with '확인', e.g. after importing a career mid-season; an
 * offer that waits for an answer instead (another club's bid) is declined.
 */
export async function acknowledgeEvents(page: Page) {
  const card = eventCard(page);
  // The whole card text, so two events that share a title still count as a change.
  // Read without auto-waiting: the card may leave between a count and a text query.
  const title = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  for (let i = 0; i < 20; i++) {
    const current = await title();
    // An observation is not a dismissible report; the caller can prepare or watch the match.
    if (!current || current.includes('내일 경기')) return;
    const read = card.getByRole('button', { name: '확인', exact: true });
    await (
      (await read.count()) ? read : card.getByRole('button', { name: '거절', exact: true })
    ).click();
    await expect.poll(title, { timeout: 10000 }).not.toBe(current);
  }
  throw new Error('Too many pending events to acknowledge');
}

/** Keep unrelated match/navigation journeys from stopping on random incoming offers. */
export async function setResponsibility(page: Page, label: string, value: 'direct' | 'delegated') {
  await page.getByTestId('intervention-trigger').click();
  const dialog = page.getByRole('dialog', { name: '위임·진행 설정', exact: true });
  await dialog.getByRole('combobox', { name: label, exact: true }).selectOption(value);
  const apply = dialog.getByRole('button', { name: '적용', exact: true });
  if (await apply.isEnabled()) {
    await apply.click();
    const outcome = page.getByTestId('action-outcome');
    await expect(outcome).toBeVisible();
    await outcome.getByRole('button', { name: '확인', exact: true }).click();
  } else await dialog.getByRole('button', { name: '닫기', exact: true }).click();
}

export async function delegateSales(page: Page) {
  await setResponsibility(page, '선수 매각', 'delegated');
}
