import { richMessage } from './LocalizedMessage';
/**
 * The presentation bootstrap every entry shares (→ARCH-32): the locale/theme controller, its
 * document bindings and the provider/boundary the screens render inside, so the game and the match
 * lab (→LAB-9) draw the same theme the browser chose.
 */
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PresentationBoundary, PresentationProvider } from './react';
import { setLocaleFormatters } from './format';
import { displayMessage, localizeValue, setTextLocale } from './text';
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
      setLocaleFormatters(locale.formatters);
      setTextLocale(locale);
      const page = location.pathname;
      document.title = displayMessage(
        page.endsWith('/lab.html')
          ? 'page.lab.title'
          : page.endsWith('/constants.html')
            ? 'page.constants.title'
            : page.endsWith('/design-system.html')
              ? 'page.designSystem.title'
              : 'page.game.title',
      );
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) {
        description = document.createElement('meta');
        description.name = 'description';
        document.head.append(description);
      }
      description.content = displayMessage('page.description');
      document.documentElement.lang = locale.id;
      document.documentElement.dir = locale.direction;
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
      <PresentationBoundary>{localizeValue(children)}</PresentationBoundary>
    </PresentationProvider>,
  );
  void controller.initialize();
}

/** What an entry shows when the presentation cannot start. */
export function presentationFailed(root: Root) {
  root.render(
    <main style={{ padding: 24 }}>
      <p role="alert">{richMessage('copy.react.16f89a11ed')}</p>
      <button onClick={() => location.reload()}>{richMessage('presentation.retry')}</button>
    </main>,
  );
}
