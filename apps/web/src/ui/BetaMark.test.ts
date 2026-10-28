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
import { BetaMark } from './BetaMark';

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
const render = (version?: boolean) =>
  renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(BetaMark, { version }),
    }),
  );

describe('the shared BETA mark (→WEB-101)', () => {
  it('shows an untranslated BETA pill with a localized label for screen readers', () => {
    const markup = render();
    expect(markup).toContain('aria-hidden="true">BETA</span>');
    expect(markup).toContain('베타 버전 0.7 · 정식 출시 전까지 게임이 바뀔 수 있어요');
    // A label, never a control.
    expect(markup).not.toMatch(/<button|<a |tabindex|role="button"/);
  });

  it('prints the game version beside it on the start and save-slot screens', () => {
    expect(render(true)).toContain('aria-hidden="true">v0.7 BETA</span>');
  });
});
