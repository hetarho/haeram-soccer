/**
 * The presentation bootstrap every entry shares (→ARCH-32): the locale/theme controller, its
 * document bindings and the provider/boundary the screens render inside, so the game and the match
 * lab (→LAB-9) draw the same theme the browser chose.
 */
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PresentationBoundary, PresentationProvider } from './react';
import { setLocaleFormatters } from '../ui/format';
import { createBrowserThemeTransition } from '../adapters/themeTransition';
import '../adapters/themeTransition.css';
import './imageUi.css';
import './theme.css';

export async function startPresentation(root: Root, children: ReactNode) {
  // Validation and installation stay outside the initial application chunk.
  const [
    { createPresentationController },
    { createPresentationResources },
    { PresentationPreferencesStore },
    { prepareThemeResources },
  ] = await Promise.all([
    import('./controller'),
    import('../adapters/presentationResources'),
    import('../adapters/presentationPreferences'),
    import('../adapters/themeResources'),
  ]);
  const controller = createPresentationController({
    resources: createPresentationResources({ fetch }),
    preferences: new PresentationPreferencesStore(),
    prepareTheme: prepareThemeResources,
    transitionTheme: createBrowserThemeTransition(document, flushSync),
    applyLocale(locale) {
      document.documentElement.lang = locale.id;
      document.documentElement.dir = locale.direction;
      setLocaleFormatters(locale.formatters);
    },
  });
  controller.subscribe(() => {
    const { theme } = controller.getSnapshot();
    if (theme) {
      document.documentElement.dataset.theme = theme.id;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme.token('bg'));
    }
  });
  root.render(
    <PresentationProvider controller={controller}>
      <PresentationBoundary>{children}</PresentationBoundary>
    </PresentationProvider>,
  );
  void controller.initialize();
}

/** What an entry shows when the presentation cannot start. */
export function presentationFailed(root: Root) {
  root.render(
    <main style={{ padding: 24 }}>
      <p role="alert">화면 설정을 불러오지 못했어요. 다시 시도해 주세요.</p>
      <button onClick={() => location.reload()}>다시 시도</button>
    </main>,
  );
}
