import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PresentationBoundary, PresentationProvider } from './presentation/react';
import { PresentationSettings } from './ui/PresentationSettings';
import { setLocaleFormatters } from './ui/format';
import { createBrowserThemeTransition } from './adapters/themeTransition';
import './adapters/themeTransition.css';
import './presentation/theme.css';

const root = createRoot(document.getElementById('root')!);
async function start() {
  // Validation and installation stay outside the initial application chunk.
  const [
    { createPresentationController },
    { createPresentationResources },
    { PresentationPreferencesStore },
    { prepareThemeResources },
  ] = await Promise.all([
    import('./presentation/controller'),
    import('./adapters/presentationResources'),
    import('./adapters/presentationPreferences'),
    import('./adapters/themeResources'),
  ]);
  const controller = createPresentationController({
    resources: createPresentationResources({ fetch }),
    preferences: new PresentationPreferencesStore(),
    prepareTheme: prepareThemeResources,
    transitionTheme: createBrowserThemeTransition(document),
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
      <PresentationBoundary>
        <App />
        <PresentationSettings />
      </PresentationBoundary>
    </PresentationProvider>,
  );
  void controller.initialize();
}
void start().catch(() =>
  root.render(
    <main style={{ padding: 24 }}>
      <p role="alert">화면 설정을 불러오지 못했어요. 다시 시도해 주세요.</p>
      <button onClick={() => location.reload()}>다시 시도</button>
    </main>,
  ),
);
