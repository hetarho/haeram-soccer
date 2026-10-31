import {
  FIRST_TEAM_TABS,
  STAFF_TABS,
  PERSONNEL_PATHS,
  personnelAddress,
  personnelHome,
  personnelRoute,
  type PersonnelHome,
} from './personnelNavigation';
import {
  COMPETITION_PATHS,
  competitionRoute,
  HISTORY_PAGES,
  SEASON_PAGES,
} from './competitionNavigation';
import { OFFICE_DESKS, resolveOffice, type WorkDesk } from './officeDesks';
import { isTaskDestination, rememberTask, taskAddress, useTaskMemory } from './taskMemory';
import { create } from 'zustand';
import { eventDesk, type ApprovalRequest } from './eventRouting';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { BoardRequest } from './board';
import type { AreaKey } from './areas';
import type {
  StaffRole,
  TrainingCoach,
  TrainingFocus,
  YouthFocus,
} from '../../../../packages/contracts/src/types';
import type { PlayerScope } from './playerAnalysis';
import type {
  ManagerHistoryPage,
  ManagerSourceSeason,
} from '../../../../packages/contracts/src/manager-history-view';
/** The six places and their retained competition and match views. */
export type Page =
  | 'dashboard'
  | 'match'
  | 'league'
  | 'europe'
  | 'firstTeam'
  | 'academy'
  | 'training'
  | 'staff'
  | 'business'
  | 'history'
  | 'leagueHistory'
  | 'cupHistory';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  ...COMPETITION_PATHS,
  ...PERSONNEL_PATHS,
  business: '/direction',
};

/** Compatibility requests resolve through the canonical personnel destinations. */
export type PeopleTab = 'players' | 'market' | 'manager' | 'coaches';
export type PeopleRequest = PeopleTab | 'candidates';
export type TrainingTab = 'training' | 'academy';
/** The owner office's areas (→WEB-39), in lobby order; each keeps its ?view= in the address. */
export const BUSINESS_TABS = OFFICE_DESKS;
export type BusinessView = WorkDesk;
/** `office` is the overview modal over the lobby, never a desk. */
export type OfficeView = 'lobby' | 'office' | BusinessView;
export const officeView = resolveOffice;
/** The office's address for a view: the lobby keeps no ?view=. */
export function officeAddress(view: OfficeView) {
  return `${paths.business}${view === 'lobby' ? '' : `?view=${view}`}`;
}
/** Where a setting lives (→WEB-71): a page and its tab. */
export type Home = PersonnelHome | { page: 'business'; view: BusinessView };

/** Where an address lands. */
export interface Route {
  page: Page;
  /** The personnel workflow or office view. */
  view?: PeopleTab | TrainingTab | OfficeView;
  /** The manager workflow opens with the replacement market. */
  market?: true;
  /** The address to show instead of the one asked for, for older and non-canonical ones. */
  address?: string;
}
/** Resolve canonical destinations and meaningful older deep links. */
export function routeOf(pathname: string, search: string): Route {
  const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const competition = competitionRoute(pathname, search);
  if (competition) return competition;
  const personnel = personnelRoute(pathname, search);
  if (personnel) return personnel;
  const asked = new URLSearchParams(search).get('view');
  if (!at(paths.business) && !at('/business'))
    return {
      page: (Object.entries(paths).find(([, path]) => at(path))?.[0] as Page) || 'dashboard',
    };
  const route: Route = { page: 'business', view: officeView(asked) };
  let address = officeAddress(route.view as OfficeView);
  const work = new URLSearchParams(search).get('work');
  if (work && (route.view === 'players' || route.view === 'staff'))
    address += `&work=${encodeURIComponent(work)}`;
  const request = new URLSearchParams(search).get('request');
  if (route.page === 'business' && request)
    address += `${address.includes('?') ? '&' : '?'}request=${encodeURIComponent(request)}`;
  const requestWorld = new URLSearchParams(search).get('requestWorld');
  if (route.page === 'business' && request && requestWorld)
    address += `&requestWorld=${encodeURIComponent(requestWorld)}`;
  return address === pathname + search ? route : { ...route, address };
}
/** The address in the bar, with an older one replaced by where it lands. */
function arrive(): Route {
  const route = routeOf(location.pathname, location.search);
  if (route.address) history.replaceState(history.state, '', route.address + location.hash);
  return route;
}
const arrival = typeof location === 'undefined' ? undefined : arrive();

export const useNavigation = create<{
  page: Page;
  /** The page the owner office was entered from, where 나가기 returns (→WEB-39). */
  officeFrom?: Page;
  setPage: (page: Page) => void;
  /** Redirects without a history entry (e.g. a match address without a live match). */
  replacePage: (page: Page) => void;
}>((set, get) => ({
  page: arrival?.page ?? 'dashboard',
  setPage: (page) => {
    rememberTask(get().page);
    const address = useTaskMemory.getState().addresses[page] ?? paths[page];
    if (taskAddress() !== address) history.pushState(null, '', address);
    set({ page });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasknavigate'));
  },
  replacePage: (page) => {
    if (taskAddress() !== paths[page]) history.replaceState(null, '', paths[page]);
    set({ page });
  },
}));

/** A primary entry resumes its last lens; explicit local tabs select their own lens. */
export function openPrimary(page: Page | 'market') {
  if (page === 'market') {
    useTaskMemory.setState({ returning: undefined, parents: [] });
    openMarket();
    return;
  }
  if (page === 'business') {
    useTaskMemory.setState({ returning: undefined, parents: [] });
    openOfficeLobby();
    useNavigation.setState({ officeFrom: 'dashboard' });
    return;
  }
  // The market is an entry of its own, so the first team's door resumes the team, not the market.
  if (
    page === 'firstTeam' &&
    useTaskMemory.getState().addresses.firstTeam?.includes('view=market')
  ) {
    openPersonnel({ page: 'firstTeam', view: 'players' });
    return;
  }
  // Each entry opens its own page: records, the league and the cups are no longer one hub.
  useNavigation.getState().setPage(page);
}
useNavigation.subscribe(({ page }) => {
  const hub = SEASON_PAGES.some((candidate) => candidate === page)
    ? 'league'
    : HISTORY_PAGES.some((candidate) => candidate === page)
      ? 'history'
      : undefined;
  if (hub)
    useTaskMemory.setState((memory) => ({ values: { ...memory.values, [`hub-${hub}`]: page } }));
});

// However the office is reached — a page change, an address, back or a task return — the page
// before it is where leaving returns.
useNavigation.subscribe((state, previous) => {
  if (state.page === 'business' && previous.page !== 'business')
    useNavigation.setState({ officeFrom: previous.page });
});

/** A one-shot request a page takes when it opens, or at once while it is showing. */
export interface OneShot<T> {
  request?: T;
  open: (request: T) => void;
  /** Clears the request and returns it. */
  take: () => T | undefined;
}
const oneShot = <T>() =>
  create<OneShot<T>>((set, get) => ({
    open: (request) => set({ request }),
    take: () => {
      const { request } = get();
      set({ request: undefined });
      return request;
    },
  }));
/** A legacy alert/deep link asks for the manager market once. */
export const usePeopleView = oneShot<'candidates'>();
if (arrival?.market) usePeopleView.getState().open('candidates');
/** An office view asked for while the office is showing; from elsewhere the address carries it. */
export const useBusinessView = oneShot<OfficeView>();
/**
 * A coach's training sheet asked for from elsewhere (a fatigue remedy →WEB-44, 훈련's own rows),
 * for 훈련 to open with the focus ready to suggest (→STAFF-19): the squad's, the academy's or one
 * player's.
 */
export const useCoachRequest = oneShot<{
  coach: TrainingCoach;
  focus?: TrainingFocus | YouthFocus;
  player?: string;
}>();
/** The primary navigation's entry to the owner office (→WEB-10/39). */
export function openOfficeLobby() {
  openBusiness('lobby');
}
/**
 * 나가기 from the owner office: back to the task that detoured into it, otherwise to the page it
 * was entered from, home by default.
 */
export function leaveOffice() {
  if (approvalId()) {
    returnApprovalHome();
    return;
  }
  if (useTaskMemory.getState().returning?.target === 'business') {
    returnToTask();
    return;
  }
  useNavigation.getState().setPage(useNavigation.getState().officeFrom ?? 'dashboard');
}
/** Overview overlays the current task, including an existing department sheet. */
export function openOwnerOffice() {
  const memory = useTaskMemory.getState();
  useTaskMemory.setState({ values: { ...memory.values, 'office-overview': true } });
}
/** Opens 훈련 (유소년 for the youth director) on a coach's training sheet (→WEB-70). */
export function openCoachSheet(
  coach: TrainingCoach,
  focus?: TrainingFocus | YouthFocus,
  player?: string,
) {
  const destination = personnelHome(coach === 'youth' ? 'academy' : 'training');
  beginTaskDetour(destination.page, personnelAddress(destination));
  useCoachRequest.getState().open({ coach, focus, player });
  openTraining(coach === 'youth' ? 'academy' : 'training');
}
/**
 * A dial change suggested from elsewhere (a cash remedy, →WEB-44), for the operating board to
 * open as a draft.
 */
export const useBoardRequest = oneShot<BoardRequest>();
/** A department editor overlays the task without changing its route or return stack. */
export const useDepartmentPolicy = create<{
  request?: BoardRequest;
  open: (request: BoardRequest) => void;
  close: () => void;
}>((set) => ({
  open: (request) => set({ request }),
  close: () => set({ request: undefined }),
}));
export function openDirection(area: AreaKey) {
  useDepartmentPolicy.getState().open({ area });
}

/** Explicit action links select their canonical workflow, never the last unrelated subview. */
export function openPersonnel(home: PersonnelHome, market = false) {
  rememberTask(useNavigation.getState().page);
  const address = personnelAddress(home, market);
  if (taskAddress() !== address) history.pushState(null, '', address);
  useNavigation.setState({ page: home.page });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasknavigate'));
}
export function openPeople(tab: PeopleRequest) {
  if (tab === 'candidates') usePeopleView.getState().open(tab);
  openPersonnel(personnelHome(tab), tab === 'candidates');
}
export function openTraining(tab: TrainingTab) {
  openPersonnel(personnelHome(tab));
}
/** Opens the office on a view: from elsewhere through its address, while it shows by request. */
export function openBusiness(
  destination: OfficeView | 'strategy' | 'build' | 'finance' | 'facility' | 'marketing',
) {
  const view = officeView(destination);
  if (useNavigation.getState().page === 'business') {
    useBusinessView.getState().open(view);
    return;
  }
  rememberTask(useNavigation.getState().page);
  history.pushState(null, '', officeAddress(view));
  useNavigation.setState({ page: 'business' });
}
/** A request has its own address and world-scoped snapshot, separate from desk browsing. */
export function approvalId() {
  return typeof location === 'undefined'
    ? undefined
    : (new URLSearchParams(location.search).get('request') ?? undefined);
}
export function approvalWorld() {
  return typeof location === 'undefined'
    ? undefined
    : (new URLSearchParams(location.search).get('requestWorld') ?? undefined);
}
/** App's existing career activation also clears an address belonging to another world. */
export function activateTaskWorld(world: string) {
  const previous = useTaskMemory.getState().world;
  if (
    approvalId() &&
    ((approvalWorld() && approvalWorld() !== world) || (previous && previous !== world))
  ) {
    useNavigation.getState().replacePage('dashboard');
    useNavigation.setState({ officeFrom: undefined });
  }
  if (previous && previous !== world) {
    usePeopleView.getState().take();
    useCoachRequest.getState().take();
    useStaffRequest.getState().take();
    useContractTalk.getState().close();
    useCupRequest.getState().take();
    useLeagueSeason.getState().take();
  }
  useTaskMemory.getState().activate(world);
}
export function openApprovalRequest(world: string, item: StopReason) {
  const desk = eventDesk(item);
  if (!desk) return;
  useTaskMemory.getState().activate(world);
  rememberTask(useNavigation.getState().page);
  const request: ApprovalRequest = { world, desk, item: { ...item } };
  useTaskMemory.setState((memory) => ({
    approvalRequests: { ...memory.approvalRequests, [item.id]: request },
  }));
  history.pushState(
    null,
    '',
    `${officeAddress(desk)}&request=${encodeURIComponent(item.id)}&requestWorld=${encodeURIComponent(world)}`,
  );
  if (useNavigation.getState().page === 'business') useBusinessView.getState().open(desk);
  useNavigation.setState({ page: 'business' });
}
export function returnApprovalHome(request?: ApprovalRequest) {
  if (
    request &&
    (useTaskMemory.getState().world !== request.world ||
      approvalWorld() !== request.world ||
      approvalId() !== request.item.id ||
      useNavigation.getState().page !== 'business')
  )
    return;
  const desk = officeView(new URLSearchParams(location.search).get('view'));
  useTaskMemory.setState((memory) => ({
    addresses: { ...memory.addresses, business: officeAddress(desk) },
  }));
  history.pushState(null, '', '/journal');
  useNavigation.setState({ page: 'dashboard' });
}
/** Opens the page and tab where a setting lives (→WEB-71). */
export function openHome(home: Home) {
  if (home.page === 'business') openBusiness(home.view);
  else openPersonnel(home);
}
/** Opens the first-team transfer market. */
export function openMarket() {
  openPeople('market');
}
/** The player's authoritative roster contract talk (→WEB-68). */
export const useContractTalk = create<{
  id?: string;
  open: (id: string) => void;
  close: () => void;
}>((set) => ({
  open: (id) => set({ id }),
  close: () => set({ id: undefined }),
}));
/** Opens a player's contract talk from elsewhere, such as its event card: 선수, then the sheet. */
export function openContractTalk(id: string) {
  beginTaskDetour('firstTeam', personnelAddress(personnelHome('players')));
  useContractTalk.getState().open(id);
  openPeople('players');
}
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    // Back and forward follow the address; an older one is replaced by where it lands.
    const route = arrive();
    if (route.market) usePeopleView.getState().open('candidates');
    if (route.page === 'business')
      useBusinessView.getState().open((route.view as OfficeView) ?? 'lobby');
    useNavigation.setState({ page: route.page });
  });

/**
 * The clubs whose team sheets are open, oldest first: a club named inside a sheet opens on top
 * of it and closing returns to the one below (→WEB-58). Opening a club already in the stack
 * returns to its sheet instead of stacking it twice.
 */
export const useTeamSheet = create<{
  ids: string[];
  open: (id: string) => void;
  close: () => void;
  reset: () => void;
}>((set) => ({
  ids: [],
  open: (id) =>
    set(({ ids }) => ({
      ids: ids.includes(id) ? ids.slice(0, ids.indexOf(id) + 1) : [...ids, id],
    })),
  close: () => set(({ ids }) => ({ ids: ids.slice(0, -1) })),
  reset: () => set({ ids: [] }),
}));

/**
 * The player of ours whose sheet is open: one at a time, from any view and over any dialog, the
 * way team sheets open. `scope` is the record it starts on; players who left only have their club
 * career.
 */
export const usePlayerSheet = create<{
  id?: string;
  scope: PlayerScope;
  open: (id: string, scope?: PlayerScope) => void;
  close: () => void;
}>((set) => ({
  scope: 'career',
  open: (id, scope = 'career') => set({ id, scope }),
  close: () => set({ id: undefined }),
}));

/**
 * A season asked for on the league page from elsewhere, such as a records-room season row. The
 * league page takes it once: a closed season opens on its final table in our league that season.
 */
export const useLeagueSeason = create<{ request?: number; take: () => void }>((set) => ({
  take: () => set({ request: undefined }),
}));
/** Opens the league page on a season (→WEB-54). */
export function openLeagueSeason(year: number, currentYear?: number) {
  const target = year === currentYear ? 'league' : 'leagueHistory';
  beginTaskDetour(target);
  useLeagueSeason.setState({ request: year });
  useNavigation.getState().setPage(target);
}

/** A closed season's tabs on the league page, in tab-bar order; the review comes first. */
export const PAST_TABS = [
  ['table', '순위표'],
  ['matches', '일정·결과'],
  ['rank', '팀 기록'],
  ['scorers', '선수 기록'],
] as const;
export type PastTab = (typeof PAST_TABS)[number][0];

/** The records room's tabs, in tab-bar order; the first one keeps no ?view= in the address. */
export const RECORD_TABS = [
  ['seasons', '시즌별 기록'],
  ['trends', '구단 성장'],
  ['honours', '명예·최고기록'],
  ['players', '선수 통산'],
  ['transfers', '이적 기록'],
  ['managers', '감독 이력'],
] as const;
export type RecordTab = (typeof RECORD_TABS)[number][0];

/**
 * The 감독 이력 tab's place in one career (→WEB-74, WEB-92), kept in the world-scoped task memory:
 * a visit to a season it names and the way back find it as it was, and another game starts empty.
 */
export interface ManagerRecords {
  /** The view's `managerHistoryKey` `page` was read at; any other key reads it again. */
  key?: string;
  /** Every row read so far, with the next page's cursor. */
  page?: ManagerHistoryPage;
  /** The key of the latest first-page read; an earlier one's reply is superseded. */
  reading?: string;
  /** The tenure open for inspection. */
  inspected?: string;
  /** The list's scroll when a season was opened from it. */
  scroll?: number;
  /** The season a tenure opened, and that tenure's row, until the way back is taken. */
  opened?: { season: ManagerSourceSeason; row: string };
}
export const MANAGER_RECORDS = 'manager-records';
/** This career's 감독 이력 place; empty for another career or before any. */
export function managerRecords(world: string): ManagerRecords {
  const memory = useTaskMemory.getState();
  return memory.world === world ? ((memory.values[MANAGER_RECORDS] as ManagerRecords) ?? {}) : {};
}
export function updateManagerRecords(
  world: string,
  update: (records: ManagerRecords) => ManagerRecords,
) {
  useTaskMemory.getState().activate(world);
  const next = update(managerRecords(world));
  useTaskMemory.setState((memory) => ({ values: { ...memory.values, [MANAGER_RECORDS]: next } }));
}
/** `next`, the page after the rows read so far, added to them; a row already read is kept once. */
export function mergeManagerPage(loaded: ManagerHistoryPage, next: ManagerHistoryPage) {
  const seen = new Set(loaded.rows.map((row) => row.id));
  return { ...next, rows: [...loaded.rows, ...next.rows.filter((row) => !seen.has(row.id))] };
}
/**
 * The first page read again, followed by its cursors until `rows` rows are back (at least one
 * page): a refresh renews every summary on screen without shortening the list. A page that adds
 * no row ends it.
 */
export async function readManagerPages(
  read: (cursor?: string) => Promise<ManagerHistoryPage>,
  rows: number,
) {
  let page = await read();
  while (page.nextCursor && page.rows.length < rows) {
    const next = mergeManagerPage(page, await read(page.nextCursor));
    if (next.rows.length === page.rows.length) break;
    page = next;
  }
  return page;
}
/** A first-page read for `key` begins; any earlier one still in flight is superseded. */
export function beginManagerRead(world: string, key: string | undefined) {
  updateManagerRecords(world, (records) => ({ ...records, reading: key ?? '' }));
}
/**
 * Keeps a page read for `key` (the first one when `cursor` is absent, else the one after
 * `cursor`) unless it is no longer this career's answer: another game is active, a later
 * first-page read superseded it, or the rows it continues were replaced meanwhile.
 */
export function acceptManagerPage(
  world: string,
  key: string | undefined,
  page: ManagerHistoryPage,
  cursor?: string,
) {
  if (useTaskMemory.getState().world !== world) return false;
  const records = managerRecords(world);
  if (cursor === undefined) {
    if (records.reading !== (key ?? '')) return false;
    updateManagerRecords(world, ({ reading: _reading, ...kept }) => {
      void _reading;
      return { ...kept, key, page };
    });
    return true;
  }
  if (records.key !== key || !records.page || records.page.nextCursor !== cursor) return false;
  updateManagerRecords(world, (kept) => ({ ...kept, page: mergeManagerPage(kept.page!, page) }));
  return true;
}
/** A tenure opens one of our seasons: the list keeps that tenure open and its scroll. */
export function rememberManagerSeason(
  world: string,
  season: ManagerSourceSeason,
  row: string,
  scroll: number,
) {
  updateManagerRecords(world, (records) => ({
    ...records,
    inspected: row,
    scroll,
    opened: { season: { ...season }, row },
  }));
}
/** Another records journey begins: the season opened from the list no longer names a way back. */
export function leaveManagerSeason(world: string) {
  if (!managerRecords(world).opened) return;
  updateManagerRecords(world, ({ opened: _opened, ...records }) => {
    void _opened;
    return records;
  });
}
/**
 * Back on the list from that season, by its named return or the browser: the scroll to restore,
 * once; nothing when no season was opened from it.
 */
export function returnedToManagers(world: string) {
  const { opened, scroll } = managerRecords(world);
  if (!opened) return undefined;
  leaveManagerSeason(world);
  return scroll ?? 0;
}

/** A focused policy/competition visit keeps the working task it was opened from. */
export function beginTaskDetour(target: Page, address?: string) {
  const page = useNavigation.getState().page;
  if (
    page === target &&
    (!address || address === taskAddress()) &&
    !HISTORY_PAGES.some((candidate) => candidate === page)
  )
    return;
  const prior = useTaskMemory.getState();
  if (
    prior.returning &&
    isTaskDestination(prior.returning.target, target) &&
    prior.returning.address === taskAddress()
  )
    return;
  rememberTask(page);
  const view = new URLSearchParams(location.search).get('view');
  const label =
    page === 'firstTeam'
      ? (FIRST_TEAM_TABS.find(([id]) => id === (view ?? 'players'))?.[1] ?? '1군')
      : page === 'staff'
        ? (STAFF_TABS.find(([id]) => id === (view ?? 'manager'))?.[1] ?? '코치진')
        : page === 'training'
          ? '훈련장'
          : page === 'academy'
            ? '유소년'
            : page === 'history'
              ? '클럽 시즌 기록'
              : page === 'league' || page === 'leagueHistory'
                ? '리그'
                : page === 'europe' || page === 'cupHistory'
                  ? '컵 대회'
                  : '클럽 홈';
  useTaskMemory.setState({
    parents:
      prior.returning && isTaskDestination(prior.returning.target, page)
        ? [...prior.parents, prior.returning]
        : [],
    returning: { page, address: taskAddress(), label, target },
  });
}
export function returnToTask() {
  const task = useTaskMemory.getState().returning;
  if (!task) return;
  rememberTask(useNavigation.getState().page);
  const parents = useTaskMemory.getState().parents;
  useTaskMemory.setState({ returning: parents.at(-1), parents: parents.slice(0, -1) });
  history.pushState(null, '', task.address);
  const route = routeOf(location.pathname, location.search);
  if (route.market) usePeopleView.getState().open('candidates');
  if (route.page === 'business')
    useBusinessView.getState().open((route.view as OfficeView) ?? 'lobby');
  useNavigation.setState({ page: route.page });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasknavigate'));
}

/** A specific responsible staff post, opened from its operational work. */
export const useStaffRequest = oneShot<StaffRole>();
export function openStaff(role: StaffRole) {
  beginTaskDetour('staff', personnelAddress(personnelHome('coaches')));
  useStaffRequest.getState().open(role);
  openPeople('coaches');
}
/** Player preparation opens the existing sheet without assigning a lineup. */
export const usePlayerPreparation = create<{
  world?: string;
  id?: string;
  open: (id: string) => void;
  close: () => void;
}>((set) => ({
  open: (id) => set({ id, world: useTaskMemory.getState().world }),
  close: () => set({ id: undefined, world: undefined }),
}));

export const useFacilityRequest = oneShot<'stadium' | 'training' | 'academy'>();
export function openFacility(part: 'stadium' | 'training' | 'academy') {
  beginTaskDetour('business');
  useFacilityRequest.getState().open(part);
  openBusiness('investment');
}

export const useRecordRequest = oneShot<{ year: number }>();
export function openClubSeason(year: number) {
  beginTaskDetour('history');
  useRecordRequest.getState().open({ year });
  useNavigation.getState().setPage('history');
}
export const useCupRequest = oneShot<{ year: number; competition: string }>();
export function openCupSeason(year: number, competition = 'cup', currentYear?: number) {
  const target = year === currentYear ? 'europe' : 'cupHistory';
  beginTaskDetour(target);
  useCupRequest.getState().open({ year, competition });
  useNavigation.getState().setPage(target);
}
