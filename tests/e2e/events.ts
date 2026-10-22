import type { GameSettings, ResponsibilityKey } from '../../packages/contracts/src/types';
import { expect, type Page } from '@playwright/test';
const LABELS: Record<ResponsibilityKey, string> = {
  manager: '감독 인사',
  staff: '스태프 인사',
  contracts: '선수 계약',
  recruitment: '선수 영입',
  sales: '선수 매각',
  academy: '유소년 승격·방출',
  sponsors: '스폰서 계약',
};
export async function openOffice(page: Page) {
  const eve = page.getByRole('dialog', { name: 'NEXT MATCH', exact: true });
  if (await eve.isVisible())
    await eve.getByRole('button', { name: '창 닫기', exact: true }).click();
  if (!(await page.getByTestId('owner-office').isVisible())) {
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '구단 운영', exact: true })
      .click();
    await page.getByRole('tab', { name: '구단주 사무실', exact: true }).click();
  }
  await expect(page.getByTestId('owner-office')).toBeVisible();
  return page.getByTestId('owner-office');
}
export async function dismissSettingsToast(page: Page) {
  const toast = page.getByTestId('action-outcome');
  if (await toast.isVisible())
    await toast.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
}
async function confirmAuthority(page: Page, label: string, value: 'direct' | 'delegated') {
  const choice = page
    .getByTestId('owner-office')
    .getByRole('group', { name: label, exact: true })
    .getByRole('button', { name: value === 'delegated' ? '위임' : '직접 결정', exact: true });
  if ((await choice.getAttribute('aria-pressed')) === 'true') return;
  await choice.click();
  const dialog = page.getByRole('dialog', {
    name: value === 'delegated' ? '위임하겠습니다.' : '제가 관여하겠습니다.',
    exact: true,
  });
  await dialog
    .getByRole('button', {
      name: value === 'delegated' ? '위임하기' : '직접 결정하기',
      exact: true,
    })
    .click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await dismissSettingsToast(page);
}
/** Change only requested office choices, then return to the originating public task. */
export async function configureResponsibilities(
  page: Page,
  options: {
    responsibilities?: Partial<Record<ResponsibilityKey, 'direct' | 'delegated'>>;
    mode?: GameSettings['mode'];
    observations?: Partial<GameSettings['observations']>;
  },
) {
  const nav = page
    .getByRole('navigation')
    .getByRole('button')
    .and(page.locator('[aria-current="page"]'));
  const returnLabel = (await nav.count())
    ? await nav.first().getAttribute('aria-label')
    : undefined;
  const businessTab =
    returnLabel === '구단 운영'
      ? await page.getByRole('tab', { selected: true }).first().innerText()
      : undefined;
  const pause = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await pause.isVisible()) await pause.click();
  const office = await openOffice(page);
  const entries = Object.entries(options.responsibilities ?? {});
  if (
    entries.length === Object.keys(LABELS).length &&
    new Set(entries.map(([, value]) => value)).size === 1
  ) {
    const value = entries[0][1];
    const bulk = office.getByRole('button', {
      name: value === 'delegated' ? '전체 위임' : '전체 직접 결정',
      exact: true,
    });
    const labels = Object.values(LABELS);
    const selected = await Promise.all(
      labels.map((label) =>
        office
          .getByRole('group', { name: label, exact: true })
          .getByRole('button', { name: value === 'delegated' ? '위임' : '직접 결정', exact: true })
          .getAttribute('aria-pressed'),
      ),
    );
    if (selected.some((pressed) => pressed !== 'true')) {
      await bulk.click();
      const dialog = page.getByRole('dialog', {
        name: value === 'delegated' ? '위임하겠습니다.' : '제가 관여하겠습니다.',
        exact: true,
      });
      await dialog
        .getByRole('button', {
          name: value === 'delegated' ? '위임하기' : '직접 결정하기',
          exact: true,
        })
        .click();
      await expect(dialog).toHaveCount(0);
      await dismissSettingsToast(page);
    }
  } else
    for (const [key, value] of entries)
      await confirmAuthority(page, LABELS[key as ResponsibilityKey], value);
  if (options.mode) {
    const choice = office
      .getByRole('group', { name: '진행 모드', exact: true })
      .getByRole('button', {
        name: options.mode === 'manual' ? '수동 진행' : '자동 진행',
        exact: true,
      });
    if ((await choice.getAttribute('aria-pressed')) !== 'true') {
      await choice.click();
      const dialog = page.getByRole('dialog', {
        name: '게임 진행 방식이 변경됩니다.',
        exact: true,
      });
      if (await dialog.isVisible())
        await dialog
          .getByRole('button', {
            name: options.mode === 'manual' ? '수동 모드로 변경' : '자동 모드로 변경',
            exact: true,
          })
          .click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await dismissSettingsToast(page);
    }
  }
  // Explicit report choices are applied after the mode-entry default.
  for (const [key, value] of Object.entries(options.observations ?? {})) {
    const choice = office
      .getByRole('group', {
        name: key === 'matchEve' ? '경기 전날 보고' : '이적시장 개장 보고',
        exact: true,
      })
      .getByRole('button', { name: value ? '받기' : '받지 않기', exact: true });
    if ((await choice.getAttribute('aria-pressed')) !== 'true') {
      await choice.click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await dismissSettingsToast(page);
    }
  }
  if (businessTab) await page.getByRole('tab', { name: businessTab, exact: true }).click();
  else if (returnLabel)
    await page
      .getByRole('navigation')
      .getByRole('button', { name: returnLabel, exact: true })
      .click();
}
export async function chooseLevel(page: Page, level: 1 | 2 | 3 | 4) {
  const responsibilities: Partial<Record<ResponsibilityKey, 'direct' | 'delegated'>> = {};
  Object.keys(LABELS).forEach((key, i) => {
    responsibilities[key as ResponsibilityKey] =
      level === 4 || (level >= 3 && i !== 3 && i !== 4) || (level === 2 && (i === 2 || i === 5))
        ? 'delegated'
        : 'direct';
  });
  await configureResponsibilities(page, {
    responsibilities,
    mode: 'automatic',
    observations: { matchEve: level <= 2, windowOpen: level <= 3 },
  });
}
export const ALL_DELEGATED: Record<ResponsibilityKey, 'delegated'> = {
  manager: 'delegated',
  staff: 'delegated',
  contracts: 'delegated',
  recruitment: 'delegated',
  sales: 'delegated',
  academy: 'delegated',
  sponsors: 'delegated',
};

/** The card shown when the clock stops for a match eve or an attention event. */
export const eventCard = (page: Page) => page.getByTestId('event-card');

/**
 * Reads every pending attention card with '확인', e.g. after importing a career mid-season; an
 * offer that waits for an answer instead (another club's bid) is declined.
 */
export async function acknowledgeEvents(page: Page) {
  const card = eventCard(page).first();
  // The whole card text, so two events that share a title still count as a change.
  // Read without auto-waiting: the card may leave between a count and a text query.
  const title = () =>
    card.evaluateAll((cards) => (cards[0] as HTMLElement | undefined)?.innerText ?? '');
  for (let i = 0; i < 20; i++) {
    const current = await title();
    const count = await eventCard(page).count();
    // An observation is not a dismissible report; the caller can prepare or watch the match.
    if (!current || current.includes('내일 경기')) return;
    const mediation = card.getByRole('button', { name: '영입 중재 검토', exact: true });
    if (await mediation.count()) {
      await mediation.click();
      const review = page.getByRole('dialog', { name: '영입 중재 검토', exact: true });
      await review.getByRole('radio', { name: '단장 우선', exact: true }).check();
      await review.getByRole('button', { name: '이번 중재 결정 확정', exact: true }).click();
    } else {
      const read = card.getByRole('button', { name: '확인', exact: true });
      await (
        (await read.count()) ? read : card.getByRole('button', { name: '거절', exact: true })
      ).click();
    }
    await expect
      .poll(async () => [await eventCard(page).count(), await title()], { timeout: 10000 })
      .not.toEqual([count, current]);
  }
  throw new Error('Too many pending events to acknowledge');
}

/**
 * Reads a decision's result card and closes it. The card stays up to 8 s over the top of the view
 * (tab bars, the market's info trigger), so a journey that goes on there closes it as a player would.
 */
export async function closeOutcome(page: Page, text: string) {
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText(text);
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await expect(outcome).toHaveCount(0);
}

/** Keep unrelated navigation journeys from stopping on random offers. */
export async function setResponsibility(page: Page, label: string, value: 'direct' | 'delegated') {
  const key = (Object.keys(LABELS) as ResponsibilityKey[]).find((key) => LABELS[key] === label);
  if (!key) throw new Error(`Unknown responsibility ${label}`);
  await configureResponsibilities(page, { responsibilities: { [key]: value } });
}
export async function delegateSales(page: Page) {
  await setResponsibility(page, '선수 매각', 'delegated');
}
