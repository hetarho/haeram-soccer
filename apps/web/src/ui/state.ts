import { rememberTask, taskAddress, useTaskMemory } from './taskMemory';
import { create } from 'zustand';
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
/**
 * The destinations: home, the competitions and records, and the owner's three levers — 사람 (who
 * joins and stays), 훈련 (how players develop) and 방향 (where the club is going and its money,
 * →WEB-10).
 */
export type Page =
  'dashboard' | 'match' | 'league' | 'europe' | 'people' | 'training' | 'business' | 'history';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  league: '/leagues',
  europe: '/europe',
  people: '/people',
  training: '/training',
  business: '/direction',
  history: '/history',
};

/** 사람's tabs (→WEB-43), in tab-bar order; the first one keeps no ?view= in the address. */
export const PEOPLE_TABS = [
  ['players', '선수'],
  ['market', '이적시장'],
  ['manager', '감독'],
  ['coaches', '스태프'],
] as const;
export type PeopleTab = (typeof PEOPLE_TABS)[number][0];
/** A 사람 tab, or `candidates`: 감독 with the manager market open (→WEB-43, WEB-57). */
export type PeopleRequest = PeopleTab | 'candidates';
/** 훈련's tabs (→WEB-70), in tab-bar order; the first one keeps no ?view= in the address. */
export const TRAINING_TABS = [
  ['training', '1군 훈련'],
  ['academy', '유소년'],
] as const;
export type TrainingTab = (typeof TRAINING_TABS)[number][0];
const tabOf = <T extends string>(tabs: readonly (readonly [T, string])[], id: string | null) =>
  tabs.find(([tab]) => tab === id)?.[0];
/** 방향's tabs (→WEB-39), in tab-bar order; the first one keeps no ?view= in the address. */
export const BUSINESS_TABS = [
  ['strategy', '운영 방침'],
  ['build', '시설'],
  ['finance', '재정'],
  ['sponsor', '후원'],
  // The authoritative club-design editor (→WEB-71/86).
  ['identity', '구단 디자인'],
  ['office', '구단주 사무실'],
] as const;
export type BusinessView = (typeof BUSINESS_TABS)[number][0];
/** Views from before 방향 open the tab that now holds their content. */
const OLDER_BUSINESS: Record<string, BusinessView> = { facility: 'build', marketing: 'finance' };
/** The 방향 tab a ?view= asks for: an older view's new home, else the first tab. */
export function businessTab(view: string | null): BusinessView {
  return tabOf(BUSINESS_TABS, view) ?? OLDER_BUSINESS[view ?? ''] ?? 'strategy';
}
/** Where a setting lives (→WEB-71): a page and its tab. */
export type Home =
  | { page: 'people'; view: PeopleTab }
  | { page: 'training'; view: TrainingTab }
  | { page: 'business'; view: BusinessView };

/** Where an address lands. */
export interface Route {
  page: Page;
  /** The tab 사람, 훈련 or 방향 opens on. */
  view?: PeopleTab | TrainingTab | BusinessView;
  /** 사람's 감독 opens with the manager market. */
  market?: true;
  /** The address to show instead of the one asked for, for older and non-canonical ones. */
  address?: string;
}
/**
 * Resolves an address. Older ones open 사람's tabs (→WEB-43): /squad 선수, /transfers 이적시장,
 * /manager 감독 (its ?view=coaches 코치진, ?view=delegation 감독), and ?view=candidates — of
 * /manager or /people — 감독 with the market open; /business opens 방향's tabs (→WEB-39) with its
 * views. Each gets the address of the tab it opens.
 */
export function routeOf(pathname: string, search: string): Route {
  const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const asked = new URLSearchParams(search).get('view');
  let route: Route;
  if (at('/squad')) route = { page: 'people', view: 'players' };
  else if (at('/transfers')) route = { page: 'people', view: 'market' };
  else if (at('/manager') || (at(paths.people) && asked === 'candidates'))
    route = {
      page: 'people',
      view: asked === 'coaches' ? 'coaches' : 'manager',
      ...(asked === 'candidates' ? { market: true as const } : {}),
    };
  else if (at(paths.people))
    route = { page: 'people', view: tabOf(PEOPLE_TABS, asked) ?? 'players' };
  else if (at(paths.training))
    route = { page: 'training', view: tabOf(TRAINING_TABS, asked) ?? 'training' };
  else if (at(paths.business) || at('/business'))
    route = { page: 'business', view: businessTab(asked) };
  else
    return {
      page: (Object.entries(paths).find(([, path]) => at(path))?.[0] as Page) || 'dashboard',
    };
  const first = {
    people: PEOPLE_TABS[0][0],
    training: TRAINING_TABS[0][0],
    business: BUSINESS_TABS[0][0],
  }[route.page as 'people' | 'training' | 'business'];
  const address = `${paths[route.page]}${route.view === first ? '' : `?view=${route.view}`}`;
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
  },
  replacePage: (page) => {
    if (location.pathname !== paths[page]) history.replaceState(null, '', paths[page]);
    set({ page });
  },
}));

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
/**
 * A 사람 tab asked for from elsewhere, such as the manager-departure alert opening the market.
 * 사람 takes it once, even while it is showing; otherwise it opens on the tab in its address.
 */
export const usePeopleView = oneShot<PeopleRequest>();
// The market an older address asked for opens once 사람 shows (the address keeps only its tab).
if (arrival?.market) usePeopleView.getState().open('candidates');
/** A 훈련 tab asked for from elsewhere, taken the same way. */
export const useTrainingView = oneShot<TrainingTab>();
/** A 방향 tab asked for while 방향 is showing; from elsewhere the address carries it. */
export const useBusinessView = oneShot<BusinessView>();
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
/** Home's entrance to the owner office (→WEB-11/39). */
export function openOfficeLobby() {
  openBusiness('strategy');
}
/**
 * 나가기 from the owner office: back to the task that detoured into it, otherwise to the page it
 * was entered from, home by default.
 */
export function leaveOffice() {
  if (useTaskMemory.getState().returning?.target === 'business') {
    returnToTask();
    return;
  }
  useNavigation.getState().setPage(useNavigation.getState().officeFrom ?? 'dashboard');
}
/** The authoritative responsibility and progression page in club operations. */
export function openOwnerOffice() {
  beginTaskDetour('business');
  openBusiness('office');
}
/** Opens 훈련 (유소년 for the youth director) on a coach's training sheet (→WEB-70). */
export function openCoachSheet(
  coach: TrainingCoach,
  focus?: TrainingFocus | YouthFocus,
  player?: string,
) {
  beginTaskDetour('training');
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

/** Opens 사람 on a tab, or on 감독 with the manager market (`candidates`). */
export function openPeople(tab: PeopleRequest) {
  usePeopleView.getState().open(tab);
  useNavigation.getState().setPage('people');
}
/** Opens 훈련 on a tab. */
export function openTraining(tab: TrainingTab) {
  useTrainingView.getState().open(tab);
  useNavigation.getState().setPage('training');
}
/** Opens 방향 on a tab: from elsewhere through its address, while it shows through a request. */
export function openBusiness(view: BusinessView) {
  if (view === 'strategy') beginTaskDetour('business');
  if (useNavigation.getState().page === 'business') {
    useBusinessView.getState().open(view);
    return;
  }
  rememberTask(useNavigation.getState().page);
  history.pushState(
    null,
    '',
    `${paths.business}${view === BUSINESS_TABS[0][0] ? '' : `?view=${view}`}`,
  );
  useNavigation.setState({ page: 'business' });
}
/** Opens the page and tab where a setting lives (→WEB-71). */
export function openHome(home: Home) {
  if (home.page === 'people') openPeople(home.view);
  else if (home.page === 'training') openTraining(home.view);
  else openBusiness(home.view);
}
/** Opens the transfer market: 사람's 이적시장. */
export function openMarket() {
  openPeople('market');
}
/** The player whose contract-talk sheet is open over 사람's 선수 (→WEB-68). */
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
  useContractTalk.getState().open(id);
  openPeople('players');
}
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    // Back and forward follow the address; an older one is replaced by where it lands.
    const route = arrive();
    if (route.page === 'people')
      usePeopleView
        .getState()
        .open(route.market ? 'candidates' : ((route.view as PeopleTab) ?? 'players'));
    if (route.page === 'training')
      useTrainingView.getState().open((route.view as TrainingTab) ?? 'training');
    if (route.page === 'business')
      useBusinessView.getState().open((route.view as BusinessView) ?? 'strategy');
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
export function openLeagueSeason(year: number) {
  beginTaskDetour('league');
  useLeagueSeason.setState({ request: year });
  useNavigation.getState().setPage('league');
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
export function beginTaskDetour(target: Page) {
  const page = useNavigation.getState().page;
  if (page === target) return;
  const prior = useTaskMemory.getState();
  if (prior.returning?.target === target && prior.returning.address === taskAddress()) return;
  rememberTask(page);
  const view = new URLSearchParams(location.search).get('view');
  const label =
    page === 'people'
      ? (PEOPLE_TABS.find(([id]) => id === (view ?? 'players'))?.[1] ?? '선수단')
      : page === 'training'
        ? view === 'academy'
          ? '유소년'
          : '1군 훈련'
        : page === 'history'
          ? '클럽 시즌 기록'
          : page === 'league'
            ? '리그'
            : page === 'europe'
              ? '컵 대회'
              : '클럽 홈';
  useTaskMemory.setState({
    parents: prior.returning?.target === page ? [...prior.parents, prior.returning] : [],
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
  if (route.page === 'people')
    usePeopleView.getState().open((route.view as PeopleTab) ?? 'players');
  if (route.page === 'training')
    useTrainingView.getState().open((route.view as TrainingTab) ?? 'training');
  if (route.page === 'business')
    useBusinessView.getState().open((route.view as BusinessView) ?? 'strategy');
  useNavigation.setState({ page: task.page });
}

/** A specific responsible staff post, opened from its operational work. */
export const useStaffRequest = oneShot<StaffRole>();
export function openStaff(role: StaffRole) {
  beginTaskDetour('people');
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
  openBusiness('build');
}

export const useRecordRequest = oneShot<{ year: number }>();
export function openClubSeason(year: number) {
  beginTaskDetour('history');
  useRecordRequest.getState().open({ year });
  useNavigation.getState().setPage('history');
}
export const useCupRequest = oneShot<{ year: number; competition: string }>();
export function openCupSeason(year: number, competition = 'cup') {
  beginTaskDetour('europe');
  useCupRequest.getState().open({ year, competition });
  useNavigation.getState().setPage('europe');
}
