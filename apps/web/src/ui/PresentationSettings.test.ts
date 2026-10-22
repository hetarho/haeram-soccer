import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../public/presentation/locales/index.json';
import localeData from '../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../public/presentation/themes/index.json';
import pixelData from '../../public/presentation/themes/pixel.json';
import type { PresentationController, PresentationSnapshot } from '../presentation/controller';
import { validateLocalePack, validateThemePack } from '../presentation/contracts';
import { createLoadedLocale } from '../presentation/locale';
import { PresentationProvider } from '../presentation/react';
import { validateRegistry } from '../presentation/registry';
import { createThemeResolver } from '../presentation/theme';
import { PresentationSettingsControls } from './PresentationSettings';

const localeRegistry = validateRegistry(localeRegistryData, 'locale');
const themeRegistry = validateRegistry(themeRegistryData, 'theme');
const base: PresentationSnapshot = {
  locale: createLoadedLocale(localeRegistry, validateLocalePack(localeData)),
  theme: createThemeResolver(validateThemePack(pixelData), {
    url: '/presentation/themes/pixel.json',
  }),
  localeRegistry,
  themeRegistry,
  pending: false,
  sessionOnly: false,
};

function render(change: Partial<PresentationSnapshot> = {}) {
  const snapshot = { ...base, ...change };
  const controller: PresentationController = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: vi.fn(),
    select: vi.fn(),
    retry: vi.fn(),
    registerNeed: () => () => {},
    dispose: vi.fn(),
  };
  return renderToStaticMarkup(
    createElement(PresentationProvider, {
      controller,
      children: createElement(PresentationSettingsControls),
    }),
  );
}

describe('presentation change feedback', () => {
  it('keeps pending preference changes out of visible layout and copy', () => {
    const idle = render();
    const pending = render({ pending: true });
    expect(pending).toContain('aria-busy="true"');
    expect(pending.replace('aria-busy="true"', 'aria-busy="false"')).toBe(idle);
    expect(pending).not.toContain('화면 설정을 적용하는 중');
    expect(pending).not.toContain('presentation-pending');
  });

  it('keeps a failed change actionable with its error and retry', () => {
    const markup = render({ error: new Error('Missing theme resource') });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('선택한 설정을 불러오지 못했어요. 이전 설정을 유지했어요.');
    expect(markup).toContain('data-testid="presentation-retry"');
  });

  it('retains session-only storage feedback independently of loading', () => {
    const markup = render({ pending: true, sessionOnly: true });
    expect(markup).toContain('data-testid="presentation-session-only"');
    expect(markup).toContain('이 브라우저에서는 설정을 저장할 수 없어 지금 탭에만 적용돼요.');
  });
});
