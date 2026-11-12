import type { GameSettings, ResponsibilityKey } from '../../packages/contracts/src/types';
import { expect, type Locator, type Page } from '@playwright/test';
import {
  approvalRequest,
  approvalRows,
  closeDecisionSettings,
  enterOffice,
  inOffice,
  openDecisionSettings,
  outsideOffice,
} from './office';

const LABELS: Record<ResponsibilityKey, string> = {
  manager: '감독 인사',
  staff: '스태프 인사',
  contracts: '선수 계약',
  recruitment: '선수 영입',
  sales: '선수 매각',
  academy: '유소년 운영',
  sponsors: '스폰서 계약',
};
/**
 * The match-eve report, found by its heading: CI's Chromium has caught it open with no accessible
 * name (run 39844474812), so a lookup by name missed it while its backdrop held the controls.
 */
export function matchReport(page: Page) {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'NEXT MATCH', exact: true }) });
}
/**
 * The next-match report's kit section, once the lazily loaded report shows it: the report's only
 * owner choice (→WEB-88); the manager's XI, tactic and matchday squad above it only read.
 */
export async function reportKit(dialog: Locator) {
  const section = dialog.getByRole('region', { name: '유니폼', exact: true });
  await expect(section).toBeVisible();
  return section;
}
export async function dismissMatchReport(page: Page) {
  const eve = matchReport(page);
  if (await eve.isVisible())
    await eve.getByRole('button', { name: '창 닫기', exact: true }).click();
}
/** Opens 위임 설정 over the current page (→WEB-79) and returns its owner-office content. */
export async function openOffice(page: Page) {
  await dismissMatchReport(page);
  const settings = await openDecisionSettings(page);
  return settings.getByTestId('owner-office');
}
async function confirmAuthority(page: Page, label: string, value: 'direct' | 'delegated') {
  const choice = page
    .getByTestId('owner-office')
    .getByRole('group', { name: label, exact: true })
    .getByRole('button', { name: value === 'delegated' ? '자동' : '직접', exact: true });
  if ((await choice.getAttribute('aria-pressed')) === 'true') return;
  await choice.click();
  const dialog = page.getByRole('dialog', {
    name: value === 'delegated' ? '자동으로 처리하겠습니다.' : '직접 결재하겠습니다.',
    exact: true,
  });
  await dialog
    .getByRole('button', {
      name: value === 'delegated' ? '자동으로 맡기기' : '직접 결재하기',
      exact: true,
    })
    .click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
}
/**
 * Change only requested office choices in 위임 설정, which opens over the current page (→WEB-79);
 * the office's own dialogs close for it and the 결재함 opens again afterwards.
 */
export async function configureResponsibilities(
  page: Page,
  options: {
    responsibilities?: Partial<Record<ResponsibilityKey, 'direct' | 'delegated'>>;
    mode?: GameSettings['mode'];
    observations?: Partial<GameSettings['observations']>;
  },
) {
  const wasInOffice = await inOffice(page);
  await outsideOffice(page);
  // The running progression can open its match report over the controls at any moment, even
  // between closing one and pressing pause; close it and press again.
  const pause = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  for (let attempt = 0; ; attempt++) {
    await dismissMatchReport(page);
    if (!(await pause.isVisible())) break;
    try {
      await pause.click({ timeout: 3000 });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
  const entries = Object.entries(options.responsibilities ?? {});
  // The office opens only for changes to make there; a mode change alone stays outside it.
  const office = entries.length ? await openOffice(page) : undefined;
  // The bulk control is safe when all nine fields are explicitly requested. Otherwise preserve
  // unspecified report choices by changing only individual business responsibilities.
  const bulkValue =
    entries.length === Object.keys(LABELS).length &&
    new Set(entries.map(([, value]) => value)).size === 1 &&
    options.observations?.matchEve !== undefined &&
    options.observations?.windowOpen !== undefined
      ? entries[0][1]
      : undefined;
  if (bulkValue && office) {
    const choice = office.getByRole('button', {
      name: bulkValue === 'delegated' ? '전체 자동' : '전체 직접',
      exact: true,
    });
    if ((await choice.getAttribute('aria-pressed')) !== 'true') {
      await choice.click();
      const dialog = page.getByRole('dialog', {
        name: bulkValue === 'delegated' ? '자동으로 처리하겠습니다.' : '직접 결재하겠습니다.',
        exact: true,
      });
      await dialog
        .getByRole('button', {
          name: bulkValue === 'delegated' ? '자동으로 맡기기' : '직접 결재하기',
          exact: true,
        })
        .click();
      await expect(dialog).toHaveCount(0);
    }
  } else {
    for (const [key, value] of entries)
      await confirmAuthority(page, LABELS[key as ResponsibilityKey], value);
  }
  // The mode switch lives in the bottom controls under the modal (→WEB-96).
  if (options.mode) await closeDecisionSettings(page);
  if (options.mode) {
    const mode = page.getByTestId('progression-mode');
    const expected = options.mode === 'manual' ? 'MANUAL' : 'AUTO';
    if ((await mode.innerText()) !== expected) {
      await page.getByRole('button', { name: '진행 방식 변경', exact: true }).click();
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
      await expect(mode).toHaveText(expected);
      await dismissMatchReport(page);
    }
  }
  // Explicit report choices are applied after the mode-entry default.
  const observations = Object.entries(options.observations ?? {});
  const reports = observations.length ? await openOffice(page) : office;
  for (const [key, value] of observations) {
    const choice = reports!
      .getByRole('group', {
        name: key === 'matchEve' ? '경기 전날 보고' : '이적시장 개장 보고',
        exact: true,
      })
      .getByRole('button', { name: value ? '보고받기' : '위임', exact: true });
    if ((await choice.getAttribute('aria-pressed')) !== 'true') {
      // A report choice confirms like a business choice (→WEB-79).
      await choice.click();
      const dialog = page.getByRole('dialog', {
        name: value ? '직접 결재하겠습니다.' : '자동으로 처리하겠습니다.',
        exact: true,
      });
      await dialog
        .getByRole('button', { name: value ? '직접 결재하기' : '자동으로 맡기기', exact: true })
        .click();
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await closeDecisionSettings(page);
  if (wasInOffice) await enterOffice(page);
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
export const eventCard = (page: Page) =>
  page
    .getByTestId('event-card')
    .and(page.getByRole('complementary', { name: '이벤트', exact: true }));

/** Home only offers review; the actual command/form belongs to the selected office request. */
export async function reviewEvent(page: Page, card: Locator = eventCard(page).first()) {
  await card.getByRole('button', { name: '검토하기', exact: true }).click();
  const request = approvalRequest(page);
  await expect(request).toBeVisible();
  return request;
}

/** The rows of the office's 결재함 in its order (→WEB-39/100); home leaves office work out. */
export async function approvalTray(page: Page) {
  await enterOffice(page);
  return approvalRows(page);
}
/** Opens a waiting office request from the 결재함: the first, or the first with `title`. */
export async function reviewInOffice(page: Page, title?: string | RegExp) {
  const rows = await approvalTray(page);
  await (title === undefined ? rows : rows.filter({ hasText: title }))
    .first()
    .getByRole('button', { name: /· 검토하기$/ })
    .click();
  const request = approvalRequest(page);
  await expect(request).toBeVisible();
  return request;
}
/** Waiting office work, as home's office entrance counts it. */
const officeWaiting = (page: Page) =>
  page.getByTestId('club-hub').locator('[data-home-part="office"] [data-ui="count"]');

/** Answers an opened request or card: confirms a report, else declines (mediation: 단장 우선). */
async function answer(page: Page, work: Locator) {
  const mediation = page.getByRole('dialog', { name: '영입 중재 검토', exact: true });
  if (await mediation.isVisible()) {
    await mediation.getByRole('radio', { name: '단장 우선', exact: true }).check();
    await mediation.getByRole('button', { name: '이번 중재 결정 확정', exact: true }).click();
    return;
  }
  const contract = page.getByRole('dialog', { name: '계약 협상', exact: true });
  const controls = (await contract.isVisible()) ? contract : work;
  const read = controls.getByRole('button', { name: '확인', exact: true });
  await (
    (await read.count()) ? read : controls.getByRole('button', { name: '거절', exact: true })
  ).click();
}

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
    if (!current || current.includes('내일 경기')) return answerOffice(page);
    const reviewing = card.getByRole('button', { name: '검토하기', exact: true });
    const inDesk = (await reviewing.count()) > 0;
    await answer(page, inDesk ? await reviewEvent(page, card) : card);
    if (inDesk) await expect(approvalRequest(page)).toHaveCount(0);
    await expect
      .poll(async () => [await eventCard(page).count(), await title()], { timeout: 10000 })
      .not.toEqual([count, current]);
  }
  throw new Error('Too many pending events to acknowledge');
}

/** Answers the office's waiting requests one by one, then steps back out to home. */
async function answerOffice(page: Page) {
  if (!(await officeWaiting(page).count())) return;
  let last = Infinity;
  for (let i = 0; i < 20; i++) {
    const count = await (await approvalTray(page)).count();
    if (!count) return outsideOffice(page);
    expect(count, 'an answered request leaves the tray').toBeLessThan(last);
    last = count;
    const request = await reviewInOffice(page);
    await answer(page, request);
    await expect(request).toHaveCount(0);
  }
  throw new Error('Too many pending office requests to answer');
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
