import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../../public/presentation/locales/index.json';
import localeData from '../../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../../public/presentation/themes/index.json';
import standardData from '../../../public/presentation/themes/standard.json';
import type { PresentationController, PresentationSnapshot } from '../../presentation/controller';
import { validateLocalePack, validateThemePack } from '../../presentation/contracts';
import { createLoadedLocale } from '../../presentation/locale';
import { PresentationProvider } from '../../presentation/react';
import { validateRegistry } from '../../presentation/registry';
import { createThemeResolver } from '../../presentation/theme';
import { ClubNavigation } from './ClubNavigation';
import { clubSection, officeBack, OPERATIONS_VIEWS } from '../../shared/routing/clubSections';
import type { Page } from '../../shared/routing/state';

vi.mock('../../features/approvals/ui/ApprovalButtons', () => ({
  ApprovalButtons: () =>
    createElement(
      'div',
      null,
      createElement('button', null, '결재함'),
      createElement('button', null, '위임 설정'),
    ),
}));
const snapshot: PresentationSnapshot = {
  locale: createLoadedLocale(
    validateRegistry(localeRegistryData, 'locale'),
    validateLocalePack(localeData),
  ),
  theme: createThemeResolver(validateThemePack(standardData), {
    url: '/presentation/themes/standard.json',
  }),
  localeRegistry: validateRegistry(localeRegistryData, 'locale'),
  themeRegistry: validateRegistry(themeRegistryData, 'theme'),
  pending: false,
  sessionOnly: false,
};
const controller: PresentationController = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  initialize: vi.fn(),
  select: vi.fn(),
  retry: vi.fn(),
  registerNeed: () => () => {},
  dispose: vi.fn(),
};
const render = (page: Page) =>
  renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(ClubNavigation, { page }),
    }),
  );

describe('the office section bar (→WEB-10/69/112)', () => {
  it('shows a compact home link and overview, inbox and settings actions without retired tabs', () => {
    const html = render('operations');
    expect(html).toContain('aria-label="클럽하우스 홈으로"');
    expect(html).toContain('role="group" aria-label="사무실 메뉴"');
    for (const label of ['오버뷰', '결재함', '위임 설정']) expect(html).toContain(label);
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tablist"');
  });

  it('shows on the office and its working pages, never on 팀, our people, home or competitions', () => {
    for (const page of ['business', 'training', 'operations'] as const)
      expect(render(page), page).toMatch(/role="group" aria-label="사무실 메뉴"/);
    // Our people belong to the primary 팀 entry, its list and detailed pages alike (→WEB-112).
    for (const page of [
      'team',
      'firstTeam',
      'staff',
      'academy',
      'dashboard',
      'league',
      'europe',
      'history',
      'match',
    ] as const) {
      expect(render(page), page).toBe('');
      expect(clubSection(page)).toBeUndefined();
    }
  });

  it("a home area card's detail leads home, any other detail to the office", () => {
    // The office's own page leads home.
    expect(officeBack('operations', '?view=investment')).toBe('home');
    expect(officeBack('operations', '')).toBe('home');
    expect(officeBack('business', '')).toBe('home');
    expect(officeBack('training', '')).toBe('home');
    // A detail opened inside the office, or a 구단 운영 section, leads back to the office.
    expect(officeBack('operations', '?view=investment&area=youth')).toBe('office');
    expect(officeBack('operations', '?view=sponsor')).toBe('office');
    expect(officeBack('operations', '?view=sponsor', 'youth')).toBe('office');
    // Only the area a home card opened leads home (→WEB-10 r216).
    expect(officeBack('operations', '?view=investment&area=youth', 'youth')).toBe('home');
    expect(officeBack('operations', '?view=investment&area=stadium', 'youth')).toBe('office');
    for (const page of ['dashboard', 'team', 'league', 'match'] as const)
      expect(officeBack(page, '?view=investment&area=youth', 'youth'), page).toBeUndefined();
  });

  it('names every section and operations view in each registered locale', () => {
    const keys = [
      'club.sections',
      'club.operations.title',
      ...OPERATIONS_VIEWS.map(([, key]) => key),
    ];
    for (const entry of localeRegistryData.entries) {
      const pack = validateLocalePack(
        JSON.parse(
          readFileSync(
            new URL(`../../../public/presentation/locales/${entry.resource}`, import.meta.url),
            'utf8',
          ),
        ),
      );
      for (const key of keys) {
        const message = pack.messages[key];
        expect(typeof message === 'string' && message.trim(), `${entry.id} ${key}`).toBeTruthy();
      }
      // Neither the home briefing nor our people are sections, so no pack keeps their labels.
      for (const retired of ['overview', 'firstTeam', 'staff', 'academy'])
        expect(pack.messages, entry.id).not.toHaveProperty([`club.section.${retired}`]);
    }
  });
});
