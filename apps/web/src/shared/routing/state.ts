import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
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
import { deskDestination, OFFICE_DESKS, resolveOffice, type WorkDesk } from './officeDesks';
import { operationsAddress, operationsRoute, type OperationsView } from './clubSections';
import type { InvestmentArea } from './investmentAreas';
import { teamAddress, teamRoute, type TeamView } from './teamNavigation';
import { isTaskDestination, rememberTask, taskAddress, useTaskMemory } from './taskMemory';
import { create } from 'zustand';
import { eventDesk, type ApprovalRequest } from './eventRouting';
import { QUEUE_RETURN, type QueueReturn } from './approvalOrder';
import type { StopReason } from '../../../../../packages/engine/src/stopping';
import type { ResponsibilityKey, StaffRole } from '../../../../../packages/contracts/src/types';
import type {
  ManagerHistoryPage,
  ManagerSourceSeason,
} from '../../../../../packages/contracts/src/manager-history-view';
/** The places, the club's sections and their retained competition and match views. */
export type Page =
  | 'dashboard'
  | 'match'
  | 'league'
  | 'europe'
  | 'team'
  | 'firstTeam'
  | 'academy'
  | 'training'
  | 'staff'
  | 'operations'
  | 'business'
  | 'history'
  | 'leagueHistory'
  | 'cupHistory';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  ...COMPETITION_PATHS,
  ...PERSONNEL_PATHS,
  team: teamAddress(),
  operations: operationsAddress(),
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
export type Home = PersonnelHome | { page: 'operations'; view: OperationsView };

/** Where an address lands. */
export interface Route {
  page: Page;
  /** The personnel workflow, Team list, club-operations section or office view. */
  view?: PeopleTab | TrainingTab | OfficeView | OperationsView | TeamView;
  /** The manager workflow opens with the replacement market. */
  market?: true;
  /** The address to show instead of the one asked for, for older and non-canonical ones. */
  address?: string;
}
/** The keys an office address names its desk or request by, which its destination drops. */
const OFFICE_KEYS = ['view', 'work', 'request', 'requestWorld'];
/** Resolve canonical destinations and meaningful older deep links. */
export function routeOf(pathname: string, search: string): Route {
  const at = (path: string) => pathname === path || pathname.startsWith(path + '/');
  const competition = competitionRoute(pathname, search);
  if (competition) return competition;
  const personnel = personnelRoute(pathname, search);
  if (personnel) return personnel;
  const operations = operationsRoute(pathname, search);
  if (operations) return operations;
  const team = teamRoute(pathname, search);
  if (team) return team;
  const asked = new URLSearchParams(search).get('view');
  if (!at(paths.business) && !at('/business'))
    return {
      page: (Object.entries(paths).find(([, path]) => at(path))?.[0] as Page) || 'dashboard',
    };
  const view = officeView(asked);
  const params = new URLSearchParams(search);
  if (view === 'lobby' && !params.has('request')) {
    const target = new URL(operationsAddress('investment'), 'https://haeram.invalid');
    for (const [key, value] of params)
      if (!OFFICE_KEYS.includes(key)) target.searchParams.append(key, value);
    return { page: 'operations', view: 'investment', address: target.pathname + target.search };
  }
  // An unselected desk is the work it stands for; a selected request keeps its office review.
  if (view !== 'lobby' && view !== 'office' && !params.has('request')) {
    const target = new URL(deskDestination(view, params.get('work')), 'https://haeram.invalid');
    for (const [key, value] of params)
      if (!OFFICE_KEYS.includes(key)) target.searchParams.append(key, value);
    const landing = routeOf(target.pathname, target.search);
    return { ...landing, address: landing.address ?? target.pathname + target.search };
  }
  const route: Route = { page: 'business', view };
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
/** The office entrance opens the investment directory; summaries and approvals use dialogs. */
export function openOfficeLobby() {
  useTaskMemory.setState((memory) => ({
    values: {
      ...memory.values,
      [APPROVAL_INBOX_OPEN]: false,
      [APPROVAL_DIALOG_REQUEST]: undefined,
      'office-overview': false,
      'club-summary-open': false,
    },
  }));
  openInvestment();
}
export const APPROVAL_INBOX_OPEN = 'approval-inbox-open';
export const APPROVAL_DIALOG_REQUEST = 'approval-dialog-request';
export function modalApproval() {
  return useTaskMemory.getState().values[APPROVAL_DIALOG_REQUEST] as ApprovalRequest | undefined;
}
export function openApprovalInbox() {
  useTaskMemory.setState((memory) => ({
    values: {
      ...memory.values,
      [APPROVAL_INBOX_OPEN]: true,
      [APPROVAL_DIALOG_REQUEST]: undefined,
    },
  }));
}
/** Overview overlays the current task, including an existing department sheet. */
export function openOwnerOffice() {
  const memory = useTaskMemory.getState();
  useTaskMemory.setState({
    values: { ...memory.values, 'office-overview': true, 'office-focus': undefined },
  });
}
export function openDecisionSettings(key: ResponsibilityKey | 'finance') {
  useTaskMemory.setState((memory) => ({
    values: { ...memory.values, 'office-overview': true, 'office-focus': key },
  }));
}
export function openClubOverview() {
  useTaskMemory.setState((memory) => ({
    values: { ...memory.values, 'club-summary-open': true },
  }));
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
/**
 * Shows the page an address lands on, as a history entry or replacing an address that has no
 * page of its own (an older desk's); the replaced address is never remembered as a task.
 */
function visit(address: string, replace = false) {
  const asked = new URL(address, 'https://haeram.invalid');
  const route = routeOf(asked.pathname, asked.search);
  const target = route.address ?? asked.pathname + asked.search;
  if (!replace) rememberTask(useNavigation.getState().page);
  if (taskAddress() !== target) {
    if (replace) history.replaceState(null, '', target);
    else history.pushState(null, '', target);
  }
  if (route.market) usePeopleView.getState().open('candidates');
  useNavigation.setState({ page: route.page });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tasknavigate'));
}
/** Opens one of 팀's lists (→WEB-112); reading it issues no command. */
export function openTeam(view: TeamView = 'players') {
  visit(teamAddress(view));
}
/** Opens one section of 구단 운영 (→WEB-110). */
export function openOperations(view: OperationsView = 'investment') {
  visit(operationsAddress(view));
}
export function openInvestment(area?: InvestmentArea) {
  visit(`${operationsAddress('investment')}${area ? `&area=${area}` : ''}`);
}
/**
 * Opens an investment area on one of its controls (→WEB-116): `control` is the control's id or
 * `data-control`, which the area scrolls to and marks once it shows.
 */
export function openControl(area: InvestmentArea, control: string) {
  useControlRequest.getState().open(control);
  openInvestment(area);
}
/** An office desk address left without a selected request goes where its work lives now. */
export function leaveDesk() {
  visit(taskAddress(), true);
}
/**
 * Opens the office on a view: from elsewhere through its address, while it shows by request. A
 * desk opens the work it stands for, outside the office (→WEB-39).
 */
export function openBusiness(
  destination: OfficeView | 'strategy' | 'build' | 'finance' | 'facility' | 'marketing',
) {
  const view = officeView(destination);
  if (view === 'lobby') {
    openOfficeLobby();
    return;
  }
  if (view !== 'office') {
    visit(officeAddress(view));
    return;
  }
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
  const request = modalApproval();
  if (request) return request.item.id;
  return typeof location === 'undefined'
    ? undefined
    : (new URLSearchParams(location.search).get('request') ?? undefined);
}
export function approvalWorld() {
  const request = modalApproval();
  if (request) return request.world;
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
  )
    useNavigation.getState().replacePage('dashboard');
  if (previous && previous !== world) {
    usePeopleView.getState().take();
    useStaffRequest.getState().take();
    useContractTalk.getState().close();
    useCupRequest.getState().take();
    useLeagueSeason.getState().take();
    useFacilityRequest.getState().take();
    useAcademyReview.getState().take();
  }
  useTaskMemory.getState().activate(world);
}
export function openApprovalRequest(world: string, item: StopReason) {
  const desk = eventDesk(item);
  if (!desk) return;
  useTaskMemory.getState().activate(world);
  const request: ApprovalRequest = { world, desk, item: { ...item } };
  useTaskMemory.setState((memory) => ({
    approvalRequests: { ...memory.approvalRequests, [item.id]: request },
    values: {
      ...memory.values,
      [APPROVAL_DIALOG_REQUEST]: request,
      [APPROVAL_INBOX_OPEN]: false,
    },
  }));
}
export function returnApprovalHome(request?: ApprovalRequest) {
  const selected = modalApproval();
  if (selected) {
    const memory = useTaskMemory.getState();
    if (
      request &&
      (memory.world !== request.world ||
        selected.world !== request.world ||
        selected.item.id !== request.item.id)
    )
      return;
    const from = memory.values[QUEUE_RETURN] as QueueReturn | undefined;
    useTaskMemory.setState({
      values: {
        ...memory.values,
        [APPROVAL_DIALOG_REQUEST]: undefined,
        [APPROVAL_INBOX_OPEN]: true,
        [QUEUE_RETURN]: { id: selected.item.id, index: from?.index ?? 0, back: true },
      },
    });
    return;
  }
  if (
    request &&
    (useTaskMemory.getState().world !== request.world ||
      approvalWorld() !== request.world ||
      approvalId() !== request.item.id ||
      useNavigation.getState().page !== 'business')
  )
    return;
  // Every way out of a review leads to the 결재함 with its filter and scroll, focus going to the
  // request still waiting there or the one in its place (→WEB-100). The office entry resumes it.
  const memory = useTaskMemory.getState(),
    id = request?.item.id ?? approvalId() ?? '',
    from = memory.values[QUEUE_RETURN] as QueueReturn | undefined;
  useTaskMemory.setState({
    addresses: { ...memory.addresses, business: officeAddress('lobby') },
    values: {
      ...memory.values,
      [APPROVAL_INBOX_OPEN]: true,
      [QUEUE_RETURN]: { id, index: from?.id === id ? from.index : 0, back: true },
    },
  });
  openInvestment();
}
/** Opens the page and tab where a setting lives (→WEB-71). */
export function openHome(home: Home) {
  if (home.page === 'operations') openOperations(home.view);
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
  ['table', sourceMessage('copy.LiveSeason.a6fecd0870')],
  ['matches', sourceMessage('copy.LiveSeason.b5eac83230')],
  ['rank', sourceMessage('copy.LiveSeason.ae97e3f103')],
  ['scorers', sourceMessage('copy.stories.c50c28f608')],
] as const;
export type PastTab = (typeof PAST_TABS)[number][0];

/** The records room's tabs, in tab-bar order; the first one keeps no ?view= in the address. */
export const RECORD_TABS = [
  ['seasons', sourceMessage('copy.ClubTrends.f402b0218e')],
  ['trends', sourceMessage('copy.state.a1513c5550')],
  ['honours', sourceMessage('copy.state.3d6ee5e3e4')],
  ['players', sourceMessage('copy.state.69cdb0e091')],
  ['transfers', sourceMessage('copy.state.101c4c0a7b')],
  ['managers', sourceMessage('copy.RecordsRoom.2c80205cf2')],
  ['ballonDor', sourceMessage('start.history.ballonDor')],
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
    page === 'team'
      ? sourceMessage('navigation.team')
      : page === 'firstTeam'
        ? (FIRST_TEAM_TABS.find(([id]) => id === (view ?? 'players'))?.[1] ??
          sourceMessage('team.view.players'))
        : page === 'staff'
          ? (STAFF_TABS.find(([id]) => id === (view ?? 'manager'))?.[1] ??
            sourceMessage('copy.investmentAreas.243be11e44'))
          : page === 'training'
            ? sourceMessage('copy.outcome.e9dbbe23f3')
            : page === 'academy'
              ? sourceMessage('team.view.academy')
              : page === 'operations'
                ? sourceMessage('club.operations.title')
                : page === 'history'
                  ? sourceMessage('copy.state.5abcab3c02')
                  : page === 'league' || page === 'leagueHistory'
                    ? sourceMessage('navigation.league')
                    : page === 'europe' || page === 'cupHistory'
                      ? sourceMessage('copy.ClubTrends.cf5a6ab3e0')
                      : sourceMessage('copy.TaskReturn.eb3de82bf1');
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
/**
 * A prospect's review in 유소년 (→WEB-112): Team's academy list names a prospect, and the academy's
 * own place opens his existing review there. Opening it reads; only its actions commit.
 */
export const useAcademyReview = oneShot<string>();
export function openAcademyProspect(id: string) {
  useAcademyReview.getState().open(id);
  openPersonnel({ page: 'academy' });
}
export const useFacilityRequest = oneShot<'stadium' | 'training' | 'academy'>();
/** A control an investment area shows first: its element id or `data-control`. */
export const useControlRequest = oneShot<string>();
export function openFacility(part: 'stadium' | 'training' | 'academy') {
  beginTaskDetour('operations', operationsAddress('investment'));
  useFacilityRequest.getState().open(part);
  openInvestment(part === 'training' ? 'firstTeam' : part === 'academy' ? 'youth' : 'stadium');
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
