import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../public/presentation/locales/index.json';
import localeData from '../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../public/presentation/themes/index.json';
import standardData from '../../public/presentation/themes/standard.json';
import type { PresentationController, PresentationSnapshot } from '../presentation/controller';
import { validateLocalePack, validateThemePack } from '../presentation/contracts';
import { createLoadedLocale } from '../presentation/locale';
import { PresentationProvider } from '../presentation/react';
import { validateRegistry } from '../presentation/registry';
import { createThemeResolver } from '../presentation/theme';
import { ClubNavigation } from './ClubNavigation';
import { CLUB_SECTIONS, clubSection, OPERATIONS_VIEWS } from './clubSections';
import type { Page } from './state';

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
const render = (page: Page, market = false) =>
  renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(ClubNavigation, { page, market }),
    }),
  );

describe('the club section bar (→WEB-10/69)', () => {
  it('lists the six sections as page tabs with the current one selected', () => {
    const html = render('operations');
    expect(html).toContain('role="tablist" aria-label="구단 섹션"');
    expect([...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) => match[1])).toEqual([
      '현황',
      '1군',
      '코치진',
      '훈련',
      '유소년',
      '운영',
    ]);
    expect(html).toMatch(/id="club-section-tab-operations"[^>]*aria-selected="true"/);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    // The tabs open pages of their own, so none names a panel that does not exist.
    expect(html).not.toContain('aria-controls');
  });

  it('shows on the clubhouse and club pages, never on the office, market or competitions', () => {
    for (const page of ['dashboard', 'firstTeam', 'staff', 'training', 'academy'] as const)
      expect(render(page), page).toMatch(
        new RegExp(`id="club-section-tab-${page}"[^>]*aria-selected="true"`),
      );
    expect(render('firstTeam', true)).toBe('');
    for (const page of ['business', 'league', 'europe', 'history', 'match'] as const) {
      expect(render(page), page).toBe('');
      expect(clubSection(page, false)).toBeUndefined();
    }
  });

  it('names every section and operations view in each registered locale', () => {
    const keys = [
      'club.sections',
      'club.operations.title',
      ...CLUB_SECTIONS.map(([, key]) => key),
      ...OPERATIONS_VIEWS.map(([, key]) => key),
    ];
    for (const entry of localeRegistryData.entries) {
      const pack = validateLocalePack(
        JSON.parse(
          readFileSync(
            new URL(`../../public/presentation/locales/${entry.resource}`, import.meta.url),
            'utf8',
          ),
        ),
      );
      for (const key of keys) {
        const message = pack.messages[key];
        expect(typeof message === 'string' && message.trim(), `${entry.id} ${key}`).toBeTruthy();
      }
    }
  });
});
