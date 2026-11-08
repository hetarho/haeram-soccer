import { expect, test, type Locator, type Page } from '@playwright/test';
import type { World } from '../../packages/contracts/src/types';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { requestTitle } from '../../apps/web/src/ui/approvalOrder';
import { clubhouseTab } from './competition-navigation';
import { dismissFeedback } from './feedback';

export const LOBBY = '결재함';
/** The clubhouse's illustrated office entrance and the office's page (→WEB-11/39). */
export const OFFICE = '구단주 사무실';
/** Who decides each title and what is reported (→WEB-79), the modal 결재 설정 opens. */
export const SETTINGS = '결재 설정';
/**
 * The bottom controls on every playing page but a match (→WEB-18): the mode, 결재함 and
 * 결재 설정, and the clock.
 */
export const seasonTransport = (page: Page) => page.locator('[data-ui="season-transport"]');
/**
 * The office's dialog over the current page (→WEB-39/100): the 결재함, or a request it or home
 * opened for review. One shows at a time.
 */
export const officeDialog = (page: Page) =>
  page
    .getByRole('dialog')
    .filter({ has: page.getByTestId('approval-queue').or(page.getByTestId('approval-request')) });
/** The dialog's name: 결재함 on the queue, else the reviewed request's work. */
export const officeTitle = (page: Page) =>
  officeDialog(page).locator('[data-ui="dialog-header"] h2');
/**
 * The 결재함's queue (→WEB-39/100): every waiting request as a row under its title. Dialogs are
 * read by role, so a closing dialog's inert exit copy never counts.
 */
export const approvalQueue = (page: Page) => page.getByRole('dialog').getByTestId('approval-queue');
/** The request under review (→WEB-39/100). */
export const approvalRequest = (page: Page) =>
  page.getByRole('dialog').getByTestId('approval-request');
/** Every waiting request's row, title by title in the order the 결재함 shows them. */
export const approvalRows = (page: Page) =>
  approvalQueue(page)
    .getByRole('list', { name: '결재 대기 업무', exact: true })
    .getByRole('listitem');
/** A waiting request's 검토 in the queue. */
export const reviewButton = (page: Page, id: string) =>
  approvalQueue(page).locator(`[data-review-id="${id}"]`);
/**
 * The 결재함's row order (→WEB-100): titles with waiting requests first, by their longest wait,
 * and each title's requests longest waiting first, so overdue first, then the request ID.
 */
export function approvalOrder(w: World) {
  const waits = w.approvalWaits ?? {};
  const ordered = pendingDecisions(w).sort(
    (a, b) => (waits[b.id] ?? 0) - (waits[a.id] ?? 0) || (a.id < b.id ? -1 : 1),
  );
  const titles = [...new Set(ordered.map(requestTitle))];
  return titles.flatMap((title) =>
    ordered.filter((item) => requestTitle(item) === title).map((item) => item.id),
  );
}

/** Whether the office's dialog is open over the page. */
export async function inOffice(page: Page) {
  return (await officeDialog(page).count()) > 0;
}

const celebrationBanner = (page: Page) =>
  page.getByTestId('celebration').locator('[role="status"]');

/**
 * An achievement banner (→WEB-52) clears itself; a tap closes it at once. Banners arriving together
 * queue, as a season close's promotion headlines do, and each tap brings up the next one.
 */
async function dismissCelebration(page: Page) {
  const banner = celebrationBanner(page);
  while (await banner.isVisible()) {
    // One that cleared itself first leaves nothing to tap.
    const tapped = await banner
      .click({ timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!tapped) return;
  }
}

/**
 * Clears what can cover the controls: a banner, an observation's report (dismissing never
 * resolves its work) and a decision's feedback.
 */
async function uncover(page: Page) {
  await dismissCelebration(page);
  const covering = page.getByRole('dialog').filter({ has: page.getByTestId('event-group') });
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  await dismissFeedback(page);
}

/** A dialog's own close in its header, never one of the controls inside it. */
const closeOf = (dialog: Locator) =>
  dialog.locator('[data-ui="dialog-header"]').getByRole('button', { name: '창 닫기', exact: true });

/** The 들어가기 of the clubhouse's illustrated office entrance (→WEB-11). */
export const officeEntrance = (page: Page) =>
  page
    .getByRole('region', { name: OFFICE, exact: true })
    .getByRole('button', { name: '들어가기', exact: true });

/** One of the bottom controls, from the clubhouse when the page has none (a match). */
async function transportButton(page: Page, button: Locator) {
  if (!(await button.isVisible())) await clubhouseTab(page).click();
  for (let attempt = 0; ; attempt++) {
    try {
      await button.click({ timeout: 2000 });
      return;
    } catch (error) {
      // Leaving a watched match may resume the clock and open the next eve after our dismissal,
      // and an achievement earned meanwhile raises its banner over the controls.
      if (attempt >= 2) throw error;
      await uncover(page);
    }
  }
}

/**
 * Opens the 결재함 (→WEB-18/39/100) from the bottom controls over the current page. A request under
 * review goes back to the queue, unresolved.
 */
export async function enterOffice(page: Page): Promise<void> {
  await closeDecisionSettings(page);
  if (await inOffice(page)) return officeLobby(page);
  await uncover(page);
  await transportButton(page, seasonTransport(page).getByTestId('approval-inbox'));
  await expect(approvalQueue(page)).toBeVisible();
}

/** Back to the queue from a review by its named 결재함으로 (→WEB-100); a no-op on the queue. */
export async function officeLobby(page: Page): Promise<void> {
  await closeDecisionSettings(page);
  await dismissFeedback(page);
  if (!(await inOffice(page))) return enterOffice(page);
  const review = officeDialog(page).getByTestId('approval-request');
  if (await review.count())
    await review.getByRole('button', { name: '결재함으로', exact: true }).click();
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/**
 * Closes the office's dialogs (→WEB-39): a review returns to the 결재함 (→WEB-100), which closes
 * over the page it opened on.
 */
export async function leaveOffice(page: Page) {
  await closeDecisionSettings(page);
  for (let step = 0; step < 2 && (await inOffice(page)); step++) {
    const reviewing = (await officeDialog(page).getByTestId('approval-request').count()) > 0;
    await closeOf(officeDialog(page)).click();
    if (reviewing) await expect(approvalQueue(page)).toBeVisible();
  }
  await expect(officeDialog(page)).toHaveCount(0);
}

/** Steps out of the office's dialogs when one is open, for helpers that need the page. */
export async function outsideOffice(page: Page) {
  if (await inOffice(page)) await leaveOffice(page);
  await closeDecisionSettings(page);
}

/**
 * Runs a menu action (an export, a save retry) with the office's dialogs closed and opens the
 * 결재함 again afterwards; a review is left by its queue, unresolved (→WEB-100). 결재 설정 and its
 * sheets close for good. Outside the office the action runs in place, keeping a page's place and
 * draft.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  await closeDecisionSettings(page);
  if (!(await inOffice(page))) return action();
  await leaveOffice(page);
  const result = await action();
  await enterOffice(page);
  return result;
}

/** The 결재 설정 modal (→WEB-79). */
export const decisionSettings = (page: Page) =>
  page.getByRole('dialog', { name: SETTINGS, exact: true });

export async function closeDecisionSettings(page: Page) {
  const settings = decisionSettings(page);
  // A sheet it opened (a decision's workbench, a confirmation) sits above it: the top closes first.
  // The clock still showing the days it computed ahead can reach a match eve meanwhile, whose
  // report opens above it, so a close the newer dialog covers gives way and the top is found
  // again (→WEB-18).
  for (let step = 0; step < 6 && (await settings.isVisible()); step++)
    await closeOf(page.getByRole('dialog').last())
      .click({ timeout: 5000 })
      .catch(() => undefined);
  await expect(settings).toHaveCount(0);
}

/** Opens 결재 설정 from the bottom controls over the current page (→WEB-18/79). */
export async function openDecisionSettings(page: Page) {
  const settings = decisionSettings(page);
  if (await settings.isVisible()) return settings;
  await outsideOffice(page);
  await uncover(page);
  await transportButton(
    page,
    seasonTransport(page).getByRole('button', { name: SETTINGS, exact: true }),
  );
  await expect(settings.getByTestId('owner-office')).toBeVisible();
  return settings;
}

/**
 * The office menu over the office's pages (→WEB-10): 오버뷰, 결재함 and 결재 설정, beside its
 * link home (or back to the office from an area).
 */
export const officeMenu = (page: Page) =>
  page.getByRole('group', { name: '사무실 메뉴', exact: true });
/** 구단주 사무실's page (→WEB-39/116): the effects in force. */
export const officePage = (page: Page) => page.getByRole('region', { name: OFFICE, exact: true });

/** Goes to the clubhouse's briefing, once it shows. */
async function clubhouse(page: Page) {
  await outsideOffice(page);
  await uncover(page);
  if (new URL(page.url()).pathname !== '/journal') await clubhouseTab(page).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await uncover(page);
}

/** Enters 구단주 사무실 through the clubhouse's illustrated entrance (→WEB-11/39). */
export async function openOfficePage(page: Page) {
  const office = officePage(page);
  if (
    new URL(page.url()).pathname === '/club-operations' &&
    !new URL(page.url()).searchParams.has('area') &&
    (await office.isVisible())
  )
    return office;
  await clubhouse(page);
  const entrance = officeEntrance(page);
  await entrance.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await entrance.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/club-operations' && !url.searchParams.has('area'),
  );
  await expect(office.getByTestId('office-effects')).toBeVisible();
  return office;
}

/** 우리 팀 오버뷰 (→WEB-44), the modal the office menu's 오버뷰 opens over the office. */
export async function openClubOverview(page: Page) {
  await openOfficePage(page);
  // T714 diagnostic: the view scroller's offset at each step of the click (Playwright's scroll,
  // the browser's own focus, the app's handler), printed with a failing journey.
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="view-scroller"]');
    const readings = [`before ${scroller?.scrollTop}`];
    (window as unknown as { overviewScroll: string[] }).overviewScroll = readings;
    const note = (label: string) => () => readings.push(`${label} ${scroller?.scrollTop}`);
    window.addEventListener('pointerdown', note('pointerdown'), { capture: true, once: true });
    window.addEventListener('click', note('click before the handler'), {
      capture: true,
      once: true,
    });
    window.addEventListener('click', note('click after the handler'), { once: true });
  });
  await officeMenu(page).getByRole('button', { name: '오버뷰', exact: true }).click();
  const readings = await page.evaluate(() =>
    (window as unknown as { overviewScroll: string[] }).overviewScroll.join('\n'),
  );
  await test.info().attach('T714 view-scroller offsets', {
    body: readings,
    contentType: 'text/plain',
  });
  const overview = page.getByRole('dialog', { name: '우리 팀 오버뷰', exact: true });
  await expect(overview.getByRole('region', { name: '우리 팀 오버뷰', exact: true })).toBeVisible();
  return overview;
}

/** The office's investment areas (→WEB-14), in the order home lists them. */
export const AREAS = {
  '1군': 'firstTeam',
  유소년: 'youth',
  코치진: 'coaches',
  경기장: 'stadium',
  스카우팅: 'scouting',
  '팬 · 마케팅': 'community',
  '재정 · 사업': 'finance',
  '구단 디자인': 'identity',
} as const;
export type Area = keyof typeof AREAS;
/** Home's area cards under the office entrance (→WEB-11). */
export const homeAreas = (page: Page) =>
  page.getByTestId('club-hub').getByRole('navigation', { name: '구단 운영 분야', exact: true });
/** An area's page, headed by its totals (→WEB-117). */
export const areaPage = (page: Page, area: Area) =>
  page.getByRole('region', { name: `${area} 투자`, exact: true });

/** Opens an investment area from its card on the clubhouse (→WEB-11/14), once its page shows. */
export async function openArea(page: Page, area: Area) {
  const view = areaPage(page, area);
  const url = new URL(page.url());
  if (url.pathname === '/club-operations' && url.searchParams.get('area') === AREAS[area]) {
    await outsideOffice(page);
    if (await view.isVisible()) return view;
  }
  await clubhouse(page);
  const card = homeAreas(page).getByRole('button', { name: `${area} 투자 관리`, exact: true });
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page).toHaveURL((url) => url.searchParams.get('area') === AREAS[area]);
  await expect(view).toBeVisible();
  return view;
}

/**
 * Our people's detailed pages, each reached from its 팀 list by a named management link
 * (→WEB-112).
 */
export const TEAM_WORK: Record<
  string,
  { page: string; path: string; tab: string; manage: string }
> = {
  '1군': { page: 'firstTeam', path: '/first-team', tab: '1군', manage: '1군 관리' },
  유소년: { page: 'academy', path: '/academy', tab: '유소년', manage: '유소년 관리' },
  코치진: { page: 'staff', path: '/staff', tab: '코치', manage: '코치진 관리' },
};
export const TEAM_TABS = ['1군', '유소년', '코치'];
/** The primary 팀 entry (→WEB-10), the one entry drawn with the people icon. */
export const teamEntry = (page: Page) =>
  page
    .getByRole('navigation')
    .getByRole('button')
    .filter({ has: page.locator('[data-pixel-icon="people"]') })
    .filter({ visible: true })
    .first();
/** 팀's 1군/유소년/코치 tabs. */
export const teamTabs = (page: Page) => page.getByRole('tablist', { name: '팀 명단', exact: true });
/** 팀's list on show, with its management link. */
export const teamDirectory = (page: Page) => page.locator('[data-ui="team-directory"]');
/** A detailed people page's way back to its 팀 list. */
export const teamReturn = (page: Page) =>
  page.locator('[data-ui="team-return"]').getByRole('button');

/**
 * Opens one of 팀's lists (1군, 유소년, 코치) through the primary 팀 entry and its tabs, once
 * the list agrees with the address's ?view=.
 */
export async function openTeamTab(page: Page, tab: string, options: { timeout?: number } = {}) {
  await outsideOffice(page);
  await dismissCelebration(page);
  const view = { '1군': 'players', 유소년: 'academy', 코치: 'coaches' }[tab];
  if (!view) throw new Error(`팀 has no ${tab} list`);
  if (new URL(page.url()).pathname !== '/team') await teamEntry(page).click(options);
  await expect(page).toHaveURL((url) => url.pathname === '/team');
  const target = teamTabs(page).getByRole('tab', { name: tab, exact: true });
  await expect(teamTabs(page)).toBeVisible();
  if ((await target.getAttribute('aria-selected')) !== 'true') await target.click(options);
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL((url) => url.searchParams.get('view') === view);
  await expect(teamDirectory(page).getByTestId(`team-${view}`)).toBeVisible();
}

/**
 * Opens a people page (1군, 유소년, 코치진) through 팀's list and its named management link
 * (→WEB-112), observation reports covering it dismissed.
 */
export async function openTeamWork(
  page: Page,
  section: string,
  options: { timeout?: number } = {},
) {
  const people = TEAM_WORK[section];
  if (!people) throw new Error(`팀 has no ${section} page`);
  await outsideOffice(page);
  await uncover(page);
  const url = new URL(page.url());
  if (
    url.pathname === people.path &&
    url.searchParams.get('view') !== 'market' &&
    (await teamReturn(page).isVisible())
  )
    return;
  await openTeamTab(page, people.tab, options);
  await teamDirectory(page)
    .getByRole('button', { name: people.manage, exact: true })
    .click(options);
  await expect(page).toHaveURL((url) => url.pathname === people.path);
  await expect(teamReturn(page)).toBeVisible();
}

/**
 * Opens first-team training (→WEB-39/116): the office's growth value lists the training focus among
 * its factors, and the focus opens the training page.
 */
export async function openTraining(page: Page) {
  const focus = page.getByTestId('training-focus');
  if (new URL(page.url()).pathname === '/training' && (await focus.isVisible())) return;
  const office = await openOfficePage(page);
  await office.locator('[data-effect="growth"]').click();
  await page
    .getByTestId('effect-factors')
    .getByRole('button', { name: /^훈련 방향/ })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === '/training');
  await expect(focus).toBeVisible();
}

/**
 * 후원 (→WEB-110): the sponsor slots, offers, signatures and who signs them, as the sheet 결재 설정's
 * 스폰서 계약 opens (→WEB-79).
 */
export async function openSponsors(page: Page) {
  const settings = await openDecisionSettings(page);
  await settings.getByRole('button', { name: '스폰서 계약 선택 열기', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '스폰서 계약 선택', exact: true });
  await expect(sheet.getByRole('region', { name: '후원', exact: true })).toBeVisible();
  return sheet;
}

/**
 * Opens where an office area's work lives now (→WEB-39/110/112): the investment areas from the
 * clubhouse (재정·투자's finance and facilities in 재정 · 사업), sponsors through 결재 설정, player
 * and staff contracts with the roster and the coaches, 결재 설정 as its modal and 결재함 as the
 * office's queue.
 */
export async function openOfficeArea(page: Page, area: string) {
  if (area === SETTINGS) return void (await openDecisionSettings(page));
  if (area === LOBBY) return enterOffice(page);
  if (area === '투자' || area === '재정·투자') area = '재정 · 사업';
  if (area === '후원') return void (await openSponsors(page));
  if (area === '선수 계약') return openTeamWork(page, '1군');
  if (area === '스태프 계약') return openTeamWork(page, '코치진');
  if (area in AREAS) return void (await openArea(page, area as Area));
  throw new Error(`The owner office has no ${area} area`);
}
