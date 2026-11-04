import { expect, type Page } from '@playwright/test';
import type { World } from '../../packages/contracts/src/types';
import { pendingDecisions } from '../../packages/engine/src/stopping';
import { requestTitle } from '../../apps/web/src/ui/approvalOrder';
import { clubhouseTab } from './competition-navigation';
import { dismissFeedback } from './feedback';

export const LOBBY = '결재함';
/** The clubhouse's one-line office entrance (→WEB-11), and the office's own heading (→WEB-116). */
export const OFFICE = '구단주 사무실';
/** The office menu's and the shared controller's way to 결재라인 모아보기 (→WEB-10/79). */
export const SETTINGS = '결재 설정';
/**
 * The office menu over the owner office, training and the investment areas (→WEB-10/39): a way
 * home, then 오버뷰, 결재함 and 결재 설정, each opening its modal over the page. It never shows on
 * the home briefing, 팀 or the market.
 */
export const officeMenu = (page: Page) =>
  page.getByRole('group', { name: '사무실 메뉴', exact: true });
/**
 * The office's landing (→WEB-39/116): the effects in force under the office's heading. Home's
 * entrance shares the name without a heading.
 */
export const officeEffects = (page: Page) =>
  page.getByRole('region', { name: OFFICE, exact: true }).filter({
    has: page.getByRole('heading', { name: OFFICE, exact: true, level: 2 }),
  });
/** The office's modal on show (→WEB-39/100): the 결재함, or a request under review. */
export const officeDialog = (page: Page) =>
  page.getByRole('dialog').filter({
    has: page.locator('[data-testid="approval-queue"], [data-testid="approval-request"]'),
  });
/** The name the office's modal shows: 결재함 on the queue, else the reviewed request's work. */
export const officeTitle = (page: Page) =>
  officeDialog(page).locator('[data-ui="dialog-header"] h2');
/** 결재라인 모아보기, the modal 결재 설정 opens (→WEB-79). */
export const approvalSettings = (page: Page) =>
  page.getByRole('dialog', { name: SETTINGS, exact: true });
/** The office's queue (→WEB-39/100): every waiting request as a row under its title. */
export const approvalQueue = (page: Page) => page.getByTestId('approval-queue');
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
/** The office's own addresses: 구단 운영 with its areas, training and older office addresses. */
const OFFICE_PATH = /^\/(club-operations|training|direction|business)(\/|$)/;

/**
 * Whether the office is open: the active address is one of the office's and, once the deferred
 * view has caught up, its office menu is drawn (→WEB-10). Route and menu are read together, so a
 * departing office view never counts; a reload on an office route waits for its menu to mount, as
 * long as a career import may take to open (→ importResponsibilityCareer).
 */
export async function inOffice(page: Page) {
  const current: { value?: boolean } = {};
  await expect
    .poll(
      async () => {
        current.value = await page.evaluate((officePath) => {
          if (!new RegExp(officePath).test(location.pathname)) return false;
          const views = document.querySelector('[data-testid="view-scroller"] > [aria-busy]');
          if (views?.getAttribute('aria-busy') !== 'false') return undefined;
          return document.querySelector('[role="group"][aria-label="사무실 메뉴"]')
            ? true
            : undefined;
        }, OFFICE_PATH.source);
        return current.value !== undefined;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return current.value === true;
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
 * The 들어가기 of the clubhouse's illustrated office entrance (→WEB-11); it opens the office on its
 * effects in force (→WEB-116).
 */
export const officeEntrance = (page: Page) =>
  page
    .getByRole('region', { name: OFFICE, exact: true })
    .getByRole('button', { name: '들어가기', exact: true });

/** Closes 결재라인 모아보기 when it is open; reading it never applies a setting (→WEB-79). */
export async function closeOfficeOverview(page: Page) {
  const overview = approvalSettings(page);
  if (await overview.isVisible())
    await overview.getByRole('button', { name: '창 닫기', exact: true }).click();
}

/**
 * Closes the office's modals: 결재라인 모아보기, a review — left by its named 결재함으로, unresolved
 * (→WEB-100) — and the 결재함 it returns to. The page under them stays as it was.
 */
export async function closeOfficeModals(page: Page) {
  await closeOfficeOverview(page);
  const request = page.getByTestId('approval-request');
  if (await request.isVisible()) {
    await request.getByRole('button', { name: '결재함으로', exact: true }).click();
    await expect(approvalQueue(page)).toBeVisible();
  }
  const queue = page.getByRole('dialog').filter({ has: approvalQueue(page) });
  if (await queue.isVisible()) {
    await queue.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(queue).toHaveCount(0);
  }
}

/**
 * Enters 구단주 사무실 through the clubhouse's office entrance (→WEB-11/39): it opens on the
 * effects in force under the office menu (→WEB-10/116). Dismiss an observation dialog before
 * navigating; dismissing never resolves its work. Inside the office it leaves a review for the
 * 결재함, unresolved, and otherwise stays where it is.
 */
export async function enterOffice(page: Page, options: { timeout?: number } = {}) {
  if (await inOffice(page)) {
    const request = page.getByTestId('approval-request');
    if (!(await request.isVisible())) return;
    await request.getByRole('button', { name: '결재함으로', exact: true }).click();
    await expect(approvalQueue(page)).toBeVisible();
    return;
  }
  await dismissCelebration(page);
  // The 결재함 and 결재 설정 also open over other pages (→WEB-39) and would cover the navigation.
  await closeOfficeModals(page);
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
  await expect(officeMenu(page)).toBeVisible();
  await expect(officeEffects(page)).toBeVisible();
}

/**
 * Opens the 결재함 from the office menu (→WEB-39/100), entering the office first when it is not
 * open; back from a review by its named 결재함으로, and a no-op on the queue.
 */
export async function officeLobby(page: Page) {
  await closeOfficeOverview(page);
  await dismissFeedback(page);
  const request = page.getByTestId('approval-request');
  if (await request.isVisible())
    await request.getByRole('button', { name: '결재함으로', exact: true }).click();
  else if (!(await approvalQueue(page).isVisible())) {
    if (!(await officeMenu(page).isVisible())) await enterOffice(page);
    if (!(await approvalQueue(page).isVisible()))
      await officeMenu(page).getByTestId('approval-inbox').click();
  }
  await expect(officeTitle(page)).toHaveText(LOBBY);
}

/**
 * Opens 결재라인 모아보기 by 결재 설정 (→WEB-79): the shared controller's, over the page on show,
 * or the office menu's once inside the office where the controller is not drawn (a match). The
 * 결재함 and a review close first, a review left unresolved.
 */
export async function openApprovalSettings(page: Page, options: { timeout?: number } = {}) {
  const dialog = approvalSettings(page);
  if (await dialog.isVisible()) return dialog;
  await closeOfficeModals(page);
  const controller = page
    .locator('[data-ui="season-transport"]')
    .getByRole('button', { name: SETTINGS, exact: true });
  if (!(await controller.isVisible())) await enterOffice(page, options);
  await (
    (await controller.isVisible())
      ? controller
      : officeMenu(page).getByRole('button', { name: SETTINGS, exact: true })
  ).click(options);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Retired with the office's section tabs (→WEB-10): the office menu replaced 사무실·훈련·운영.
 * Journeys assert it is gone.
 */
export const clubSections = (page: Page) =>
  page.getByRole('tablist', { name: '구단 섹션', exact: true });
/** Retired with 구단 운영's page tabs: its work opens from the office and the home's area cards. */
export const operationsTabs = (page: Page) =>
  page.getByRole('tablist', { name: '구단 운영', exact: true });
export const OPERATIONS_SECTIONS = ['재정·투자', '후원', '구단 디자인'];
/**
 * The office's places as helpers name them (→WEB-10/39): 사무실 is the office, its effects in
 * force; 운영 the same page, 재정·투자 opening on them (→WEB-14); 훈련 the training page under the
 * office menu. Our people belong to 팀 (→WEB-112).
 */
export const CLUB_SECTION_LABELS = ['사무실', '훈련', '운영'];
/** 구단 운영's work held by an investment area, whose card sits under the home entrance (→WEB-11). */
const AREA_CARDS = ['구단 디자인'];
/**
 * Our people's detailed pages, each reached from its 팀 list by a named management link
 * (→WEB-112); helpers still name them as the sections they were.
 */
export const TEAM_WORK: Record<string, { page: string; tab: string; manage: string }> = {
  '1군': { page: 'firstTeam', tab: '1군', manage: '1군 관리' },
  유소년: { page: 'academy', tab: '유소년', manage: '유소년 관리' },
  코치진: { page: 'staff', tab: '코치', manage: '코치진 관리' },
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
 * The office place or people page the active address shows, read once the rendered view agrees
 * with it: the deferred view has caught up (its container is no longer busy) and the office menu
 * is drawn on the office's addresses — or, on a people page, its way back to 팀 is shown without
 * the menu — or neither has one. 사무실 on 구단 운영 and its areas (older office addresses land
 * there, reviews included); 훈련 on the training page; 1군, 코치진 or 유소년 on their detailed
 * pages; null elsewhere (the home briefing, 팀's lists, competitions, records, the market). A
 * reload or a lazy first render waits for its view to mount, so a departing view is never taken
 * for the destination.
 */
export async function settledClubSection(page: Page) {
  const current: { value?: string | null } = {};
  const people = Object.fromEntries(
    Object.entries(TEAM_WORK).map(([label, { page: id }]) => [id, label]),
  );
  await expect
    .poll(
      async () => {
        current.value = await page.evaluate(
          ({ people }) => {
            const views = document.querySelector('[data-testid="view-scroller"] > [aria-busy]');
            if (views?.getAttribute('aria-busy') !== 'false') return undefined;
            const { pathname, search } = location;
            const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
            const view = new URLSearchParams(search).get('view');
            const menu = !!document.querySelector('[role="group"][aria-label="사무실 메뉴"]');
            const person = at('/first-team')
              ? view === 'market'
                ? null
                : 'firstTeam'
              : at('/staff')
                ? 'staff'
                : at('/academy')
                  ? 'academy'
                  : null;
            if (person) {
              const back = document.querySelector('[data-ui="team-return"]');
              return back && !menu ? people[person] : undefined;
            }
            // The home briefing (/journal, or its start alias `/` →WEB-62) has no office menu.
            const expected =
              at('/club-operations') || at('/business') || at('/direction')
                ? '사무실'
                : at('/training')
                  ? '훈련'
                  : null;
            if (menu !== (expected !== null)) return undefined;
            return expected;
          },
          { people },
        );
        return current.value !== undefined;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return current.value ?? null;
}

/**
 * Opens one of 팀's lists (1군, 유소년, 코치) through the primary 팀 entry and its tabs, once
 * the list agrees with the address's ?view=.
 */
export async function openTeamTab(page: Page, tab: string, options: { timeout?: number } = {}) {
  await closeOfficeModals(page);
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
 * Opens one office place: 사무실 (and 운영, the same page) is the office on its effects in force,
 * entered through the clubhouse's illustrated entrance (→WEB-11/116); 훈련 opens from the
 * 수석코치's 훈련에서 보기 in 코치진, which reads the focus the coach sets (→WEB-43/70). 1군,
 * 코치진 and 유소년 open through 팀's list and its named management link instead (→WEB-112).
 * Observation reports covering it are dismissed and the office's modals closed, a review left
 * unresolved. Each decision reads the settled view (→ settledClubSection), and the visible
 * clicks remain.
 */
export async function openClubSection(
  page: Page,
  section: string,
  options: { timeout?: number } = {},
) {
  await closeOfficeModals(page);
  await dismissCelebration(page);
  const covering = page.getByRole('dialog').filter({ has: page.getByTestId('event-group') });
  if (await covering.isVisible())
    await covering.getByRole('button', { name: '창 닫기', exact: true }).click();
  if (section === '운영') section = '사무실';
  // A click pushes its address at once, so the old view never agrees with the new address.
  const current = await settledClubSection(page);
  const people = TEAM_WORK[section];
  if (people) {
    if (current === section) return;
    await openTeamTab(page, people.tab, options);
    await teamDirectory(page)
      .getByRole('button', { name: people.manage, exact: true })
      .click(options);
    expect(await settledClubSection(page)).toBe(section);
    await expect(teamReturn(page)).toBeVisible();
    return;
  }
  if (section === '훈련') {
    if (current === section) return;
    await openClubSection(page, '코치진', options);
    await page.getByRole('button', { name: '훈련에서 보기', exact: true }).first().click(options);
    expect(await settledClubSection(page)).toBe(section);
    return;
  }
  if (section !== '사무실') throw new Error(`The office has no ${section} place`);
  // An investment area's detail shares the address; its menu's way back leads to the landing.
  if (current === section && !(await officeEffects(page).isVisible()))
    await page.getByRole('button', { name: '구단주 사무실로', exact: true }).click(options);
  else if (current !== section) {
    if (current !== null) {
      await clubhouseTab(page).click(options);
      await expect(page).toHaveURL((url) => url.pathname === '/journal');
    }
    await enterOffice(page, options);
  }
  expect(await settledClubSection(page)).toBe(section);
  await expect(officeEffects(page)).toBeVisible();
}

/**
 * Opens where 구단 운영's work lives now: 재정·투자 is the office, opening on its effects in force
 * (→WEB-14/116), and 구단 디자인 its investment area, from its card under the home entrance
 * (→WEB-11). 후원 has no visible way in the office any more; a journey that needs it says so.
 */
export async function openOperations(
  page: Page,
  section = '재정·투자',
  options: { timeout?: number } = {},
) {
  await closeOfficeModals(page);
  if (section === '재정·투자') return openClubSection(page, '사무실', options);
  if (!AREA_CARDS.includes(section))
    throw new Error(`구단 운영's ${section} has no entry in the office (→WEB-110)`);
  await outsideOffice(page);
  if (new URL(page.url()).pathname !== '/journal') await clubhouseTab(page).click(options);
  await page
    .getByRole('navigation', { name: '구단 운영 분야', exact: true })
    .getByRole('button', { name: `${section} 투자 관리`, exact: true })
    .click(options);
  await expect(page.getByRole('region', { name: `${section} 투자`, exact: true })).toBeVisible();
  await expect(officeMenu(page)).toBeVisible();
}

/**
 * Opens where an office area's work lives now (→WEB-39/110/116): 재정·투자 as the office's
 * effects in force, 구단 디자인 as its investment area, player and staff contracts with the
 * roster and the coaches, 결재라인 모아보기 as the modal 결재 설정 opens and 결재함 as the office
 * menu's modal.
 */
export async function openOfficeArea(page: Page, area: string, options: { timeout?: number } = {}) {
  if (area === '투자') area = '재정·투자';
  if (OPERATIONS_SECTIONS.includes(area)) return openOperations(page, area, options);
  if (area === '선수 계약') return openClubSection(page, '1군', options);
  if (area === '스태프 계약') return openClubSection(page, '코치진', options);
  if (area === SETTINGS || area === '결재라인 모아보기') {
    await openApprovalSettings(page, options);
    return;
  }
  if (area !== LOBBY) throw new Error(`The owner office has no ${area} area`);
  await closeOfficeOverview(page);
  await enterOffice(page, options);
  await officeLobby(page);
}

/** The direction the club holds, read in 구단 운영's 재정·투자 (→WEB-14, WEB-110). */
export async function openDirectionInForce(page: Page) {
  await openOperations(page, '재정·투자');
  await expect(page.getByTestId('direction-areas')).toBeVisible();
}

/** Leaves the office for home past its modals, through a contextual return or the navigation. */
export async function leaveOffice(page: Page) {
  await closeOfficeModals(page);
  if (!(await inOffice(page))) return;
  const contextualReturn = page
    .getByRole('button', { name: /^← 돌아가기 ·/ })
    .filter({ visible: true })
    .first();
  if (await contextualReturn.isVisible()) await contextualReturn.click();
  else await clubhouseTab(page).click();
  await expect(officeMenu(page)).toHaveCount(0);
}

/** Steps out of the office when inside it, for helpers that need home or the menus uncovered. */
export async function outsideOffice(page: Page) {
  await closeOfficeModals(page);
  if (await inOffice(page)) await leaveOffice(page);
}

/**
 * Runs a menu action (an export, a save retry) with the office's modals closed and opens its
 * 결재함 again afterwards when it was open. Leaving passes through the queue — a review is left by
 * 결재함으로, unresolved — so the queue is where the office resumes (→WEB-100); otherwise the
 * action runs in place, keeping a page's place and draft.
 */
export async function aroundOffice<T>(page: Page, action: () => Promise<T>) {
  if (!(await officeDialog(page).isVisible())) return action();
  await closeOfficeModals(page);
  const result = await action();
  await officeLobby(page);
  return result;
}
