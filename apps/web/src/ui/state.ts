import { create } from 'zustand';
export type Page =
  'dashboard' | 'match' | 'league' | 'europe' | 'squad' | 'manager' | 'business' | 'history';
const paths: Record<Page, string> = {
  dashboard: '/journal',
  match: '/matches',
  league: '/leagues',
  europe: '/europe',
  squad: '/squad',
  manager: '/manager',
  business: '/business',
  history: '/history',
};
const current = (): Page =>
  (Object.entries(paths).find(
    ([, path]) => location.pathname === path || location.pathname.startsWith(path + '/'),
  )?.[0] as Page) || 'dashboard';
export const useNavigation = create<{ page: Page; setPage: (page: Page) => void }>((set) => ({
  page: typeof location === 'undefined' ? 'dashboard' : current(),
  setPage: (page) => {
    if (location.pathname !== paths[page]) history.pushState(null, '', paths[page]);
    set({ page });
  },
}));
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => useNavigation.setState({ page: current() }));
