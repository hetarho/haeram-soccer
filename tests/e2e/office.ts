import { expect, type Page } from '@playwright/test';
import type { World } from '../../packages/contracts/src/types';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { clubhouseTab } from './competition-navigation';
import { dismissFeedback } from './feedback';

/** The office's compact heading bar inside the shared management shell (→WEB-39). */
export const officeBar = (page: Page) => page.locator('[data-ui="office-bar"]');
/** The name the bar shows: 결재함 on the office's queue, else the reviewed request's work. */
export const officeTitle = (page: Page) => officeBar(page).getByRole('heading');
export const LOBBY = '결재함';
/** The clubhouse's one-line office entrance (→WEB-11). */
export const OFFICE = '구단주 사무실';
/** The office's queue (→WEB-39/100): every waiting request as a row of its list. */
export const approvalQueue = (page: Page) => page.getByTestId('approval-queue');
export const approvalRows = (page: Page) =>
  approvalQueue(page)
    .getByRole('list', { name: '결재 대기 업무', exact: true })
    .getByRole('listitem');
/** A waiting request's 검토 in the queue. */
export const reviewButton = (page: Page, id: string) =>
  approvalQueue(page).locator(`[data-review-id="${id}"]`);
/** The 결재함's order (→WEB-100): longest waiting first, so overdue first, then the request ID. */
export function approvalOrder(w: World) {
  const waits = w.approvalWaits ?? {};
  return pendingDecisions(w)
    .sort((a, b) => (waits[b.id] ?? 0) - (waits[a.id] ?? 0) || (a.id < b.id ? -1 : 1))
    .map((item) => item.id);
}
const OFFICE_PATH = /^\/(direction|business)(\/|$)/;

/**
 * Read the active route and its rendered office context together. A request can return home
 * between separate locator reads; a departing office heading must never become a return target.
 * A reload on an office route still waits for its real heading to mount, as long as a career
 * import may take to open (→ importResponsibilityCareer).
 */
async function officeContext(page: Page) {
  const current: { value?: string | null } = {};
  await expect
    .poll(
      async () => {
        current.value = await officeTitle(page).evaluateAll((headings, officePath) => {
          if (!new RegExp(officePath).test(location.pathname)) return null;
          return headings[0]?.textContent?.trim() || undefined;
        }, OFFICE_PATH.source);
        return current.value !== undefined;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return current.value ?? null;
}

/** Whether the active route and its office landmark identify an open office. */
export async function inOffice(page: Page) {
  return (await officeContext(page)) !== null;
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
 * The 들어가기 of the clubhouse's illustrated office entrance (→WEB-11); the bottom controls'
 * 결재함 and the office section bar's 사무실 open the same queue (→WEB-10/18).
 */
export const officeEntrance = (page: Page) =>
  page
    .getByRole('region', { name: OFFICE, exact: true })
    .getByRole('button', { name: '들어가기', exact: true });

/**
 * Enters the owner office's 결재함 through the clubhouse's office entrance (→WEB-11/39). Dismiss an
 * observation dialog before navigating; dismissing never resolves its work. Inside the office it
 * leaves a review for the queue, unresolved.
 */
export async function enterOffice(page: Page, options: { timeout?: number } = {}) {
  if (await inOffice(page)) {
    if (!new URL(page.url()).searchParams.has('request')) return;
    await page
      .getByTestId('approval-request')
      .getByRole('button', { name: '결재함으로', exact: true })
      .click();
    await expect(approvalQueue(page)).toBeVisible();
    return;
  }
  await dismissCelebration(page);
  const covering = page.getByRole('dialog').filter({ has: page.getByTestId('event-group') });
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  // The selected tab decides, not what is drawn: a deferred view can still show home.
  if (new URL(page.url()).pathname !== '/journal') await clubhouseTab(page).click(options);
  const hub = page.getByTestId('club-hub');
  await expect(hub).toBeVisible();
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  await dismissFeedback(page);
  await dismissCelebration(page);
  const entrance = officeEntrance(page);
  await entrance.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  for (let attempt = 0; ; attempt++) {
    try {
      await entrance.click({ ...options, timeout: 2000 });
      break;
    } catch (error) {
      // Leaving a watched match may resume the clock and open the next eve after our dismissal,
      // and an achievement earned meanwhile raises its banner over the entrance.
      const celebrating = await celebrationBanner(page).isVisible();
      if (attempt >= 2 || !(celebrating || (await covering.isVisible()))) throw error;
      if (celebrating) await dismissCelebration(page);
      if (await covering.isVisible())
        await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
    }
  }
  await expect(officeBar(page)).toBeVisible();
}

export async function closeOfficeOverview(page: Page) {
  const overview = page.getByRole('dialog', { name: '결재라인 모아보기', exact: true });
  if (await overview.isVisible())
    await overview.getByRole('button', { name: '창 닫기', exact: true }).click();
}

/** Back to the queue from a review by its named 결재함으로; a no-op on the queue. */
export async function officeLobby(page: Page) {
  await closeOfficeOverview(page);
  await dismissFeedback(page);
  if ((await officeTitle(page).innerText()).trim() !== LOBBY)
    await page
      .getByTestId('approval-request')
      .getByRole('button', { name: '결재함으로', exact: true })
      .click();
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/** The club's section bar over the owner office and its working pages (→WEB-10). */
export const clubSections = (page: Page) =>
  page.getByRole('tablist', { name: '구단 섹션', exact: true });
/** 구단 운영's own section tabs (→WEB-110). */
export const operationsTabs = (page: Page) =>
  page.getByRole('tablist', { name: '구단 운영', exact: true });
export const OPERATIONS_SECTIONS = ['재정·투자', '후원', '구단 디자인'];
/** The office's section bar, 사무실 first (→WEB-10). */
export const CLUB_SECTION_LABELS = ['사무실', '1군', '코치진', '훈련', '유소년', '운영'];
const CLUB_SECTIONS: Record<string, string> = {
  business: '사무실',
  firstTeam: '1군',
  staff: '코치진',
  training: '훈련',
  academy: '유소년',
  operations: '운영',
};

/**
 * The office section the active address shows, read once the rendered view agrees with it: the
 * deferred view has caught up (its container is no longer busy) and the section bar selects the
 * address's section, or neither has one. 사무실 on the office's own addresses, its reviews
 * included; null outside the office and its working pages (the home briefing, competitions,
 * records, the market). A reload or a lazy first render waits for its view to mount, so a
 * departing view's selection is never taken for the destination's.
 */
export async function settledClubSection(page: Page) {
  const current: { value?: string | null } = {};
  await expect
    .poll(
      async () => {
        current.value = await page.evaluate((sections) => {
          const views = document.querySelector('[data-testid="view-scroller"] > [aria-busy]');
          if (views?.getAttribute('aria-busy') !== 'false') return undefined;
          const { pathname, search } = location;
          const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
          const view = new URLSearchParams(search).get('view');
          // The home briefing (/journal, or its start alias `/` →WEB-62) has no section bar.
          const expected =
            at('/business') || at('/direction')
              ? 'business'
              : at('/first-team')
                ? view === 'market'
                  ? null
                  : 'firstTeam'
                : at('/staff')
                  ? 'staff'
                  : at('/training')
                    ? 'training'
                    : at('/academy')
                      ? 'academy'
                      : at('/club-operations')
                        ? 'operations'
                        : null;
          const selected =
            document
              .querySelector('[role="tablist"] [id^="club-section-tab-"][aria-selected="true"]')
              ?.id.slice('club-section-tab-'.length) ?? null;
          if (selected !== expected) return undefined;
          return expected === null ? null : sections[expected];
        }, CLUB_SECTIONS);
        return current.value !== undefined;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return current.value ?? null;
}

/**
 * Opens one office section (사무실, 1군, 코치진, 훈련, 유소년, 운영) through the office's section
 * bar, entering the office through the clubhouse's illustrated entrance first when the page has no
 * bar (the home briefing, the market, competitions); observation reports covering it are
 * dismissed. 사무실 is the office's queue, so a review is left for it unresolved. Each decision
 * reads the settled view (→ settledClubSection), and the visible clicks remain.
 */
export async function openClubSection(
  page: Page,
  section: string,
  options: { timeout?: number } = {},
) {
  await closeOfficeOverview(page);
  await dismissCelebration(page);
  const covering = page.getByRole('dialog').filter({ has: page.getByTestId('event-group') });
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  // A click pushes its address at once, so the old view never agrees with the new address.
  let current = await settledClubSection(page);
  if (current === null || (section === '사무실' && current === section)) {
    await enterOffice(page, options);
    current = await settledClubSection(page);
  }
  const tab = clubSections(page).getByRole('tab', { name: section, exact: true });
  if (current !== section) await tab.click(options);
  expect(await settledClubSection(page)).toBe(section);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/**
 * Opens one section of 구단 운영 (재정·투자, 후원, 구단 디자인) through the club's sections. Its
 * tabs mount with the lazy operations view; their selection is read once it agrees with the
 * address's ?view=, never from a departing section.
 */
export async function openOperations(
  page: Page,
  section = '재정·투자',
  options: { timeout?: number } = {},
) {
  await closeOfficeOverview(page);
  if ((await settledClubSection(page)) !== '운영') await openClubSection(page, '운영', options);
  const tabs = operationsTabs(page);
  await expect
    .poll(
      () =>
        tabs
          .evaluate(
            (list) => {
              const view = new URLSearchParams(location.search).get('view') ?? 'investment';
              return (
                list.querySelector('[role="tab"][aria-selected="true"]')?.id ===
                `club-operations-tab-${view}`
              );
            },
            undefined,
            { timeout: 1000 },
          )
          .catch(() => false),
      { timeout: 15000 },
    )
    .toBe(true);
  const tab = tabs.getByRole('tab', { name: section, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click(options);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/**
 * Opens where an office area's work lives now (→WEB-39/110): 재정·투자, 후원 and 구단 디자인 in
 * 구단 운영, player and staff contracts with the roster and the coaches, 결재라인 모아보기 as the
 * office's modal and 결재함 as the office itself, which has no other areas.
 */
export async function openOfficeArea(page: Page, area: string, options: { timeout?: number } = {}) {
  if (area === '투자') area = '재정·투자';
  if (OPERATIONS_SECTIONS.includes(area)) return openOperations(page, area, options);
  if (area === '선수 계약') return openClubSection(page, '1군', options);
  if (area === '스태프 계약') return openClubSection(page, '코치진', options);
  if (area === '결재라인 모아보기') {
    const overview = page.getByRole('dialog', { name: area, exact: true });
    if (await overview.isVisible()) return;
    await enterOffice(page, options);
    await officeLobby(page);
    await page
      .locator('[data-ui="season-transport"]')
      .getByRole('button', { name: area, exact: true })
      .click(options);
    await expect(overview).toBeVisible();
    return;
  }
  if (area !== LOBBY) throw new Error(`The owner office has no ${area} area`);
  await closeOfficeOverview(page);
  await enterOffice(page, options);
  await officeLobby(page);
}

/** Whole-club configuration is a secondary disclosure within 구단 운영's investment. */
export async function openOfficeLibrary(page: Page) {
  await openOperations(page, '재정·투자');
  const library = page.getByTestId('office-library');
  if ((await library.getAttribute('open')) === null)
    await library.locator(':scope > summary').click();
  await expect(page.getByTestId('strategy-board')).toBeVisible();
}

/** Leaves through a contextual return or the shared primary navigation. */
export async function leaveOffice(page: Page) {
  await closeOfficeOverview(page);
  if (!(await inOffice(page))) return;
  await officeLobby(page);
  const contextualReturn = page
    .getByRole('button', { name: /^← 돌아가기 ·/ })
    .filter({ visible: true })
    .first();
  if (await contextualReturn.isVisible()) await contextualReturn.click();
  else await clubhouseTab(page).click();
  await expect(officeBar(page)).toHaveCount(0);
}

/** Steps out of the office when inside it, for helpers that need the HUD or the menus. */
export async function outsideOffice(page: Page) {
  await closeOfficeOverview(page);
  if (await inOffice(page)) await leaveOffice(page);
}

/**
 * Runs a menu action (an export, a save retry) from outside the office and returns to its 결재함
 * afterwards. Leaving passes through the queue — a review is left by 결재함으로, unresolved — so
 * the queue is where the office resumes (→WEB-100); outside the office the action runs in place,
 * keeping a club section's place and draft.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  if (!(await inOffice(page))) return action();
  await leaveOffice(page);
  const result = await action();
  await enterOffice(page);
  return result;
}
