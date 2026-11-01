import type { Page } from './state';

/**
 * The office's sections (→WEB-10): 사무실, 훈련 and 운영 share this bar, 사무실 first, opening the
 * office's queue. Our people belong to the primary 팀 entry (→WEB-112), so neither its directory
 * nor its detailed pages show this bar; nor do the home briefing, the competitions or the market.
 */
export const CLUB_SECTIONS = [
  ['business', 'club.section.office'],
  ['training', 'club.section.training'],
  ['operations', 'club.section.operations'],
] as const satisfies readonly (readonly [Page, string])[];
export type ClubSection = (typeof CLUB_SECTIONS)[number][0];

/** The section a page shows, or none. */
export function clubSection(page: Page): ClubSection | undefined {
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
