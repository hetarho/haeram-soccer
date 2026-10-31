import type { Page } from './state';

/**
 * The club's sections (→WEB-10): the clubhouse and the club information pages share this bar.
 * The owner office, the competitions and the transfer market, an entry of its own, have none.
 */
export const CLUB_SECTIONS = [
  ['dashboard', 'club.section.overview'],
  ['firstTeam', 'club.section.firstTeam'],
  ['staff', 'club.section.staff'],
  ['training', 'club.section.training'],
  ['academy', 'club.section.academy'],
  ['operations', 'club.section.operations'],
] as const satisfies readonly (readonly [Page, string])[];
export type ClubSection = (typeof CLUB_SECTIONS)[number][0];

/** The section a page shows, or none: the first team's market view belongs to 이적시장. */
export function clubSection(page: Page, market: boolean): ClubSection | undefined {
  if (page === 'firstTeam' && market) return undefined;
  return CLUB_SECTIONS.find(([id]) => id === page)?.[0];
}

/** 구단 운영's three sections (→WEB-110), the first its default. */
export const OPERATIONS_VIEWS = [
  ['investment', 'club.operations.investment'],
  ['sponsor', 'club.operations.sponsor'],
  ['identity', 'club.operations.identity'],
] as const;
export type OperationsView = (typeof OPERATIONS_VIEWS)[number][0];
export const OPERATIONS_PATH = '/club-operations';

export function operationsView(value: string | null | undefined): OperationsView {
  return OPERATIONS_VIEWS.find(([id]) => id === value)?.[0] ?? 'investment';
}
/** The canonical address keeps the section, the default included. */
export function operationsAddress(view: OperationsView = 'investment') {
  return `${OPERATIONS_PATH}?view=${view}`;
}
/** Resolves /club-operations: an unknown or missing section opens 재정·투자; other keys stay. */
export function operationsRoute(pathname: string, search: string) {
  if (pathname !== OPERATIONS_PATH && !pathname.startsWith(OPERATIONS_PATH + '/')) return undefined;
  const params = new URLSearchParams(search);
  const view = operationsView(params.get('view'));
  params.delete('view');
  const canonical = new URLSearchParams({ view });
  for (const [key, value] of params) canonical.append(key, value);
  const address = `${OPERATIONS_PATH}?${canonical}`;
  return {
    page: 'operations' as const,
    view,
    ...(address === pathname + search ? {} : { address }),
  };
}
