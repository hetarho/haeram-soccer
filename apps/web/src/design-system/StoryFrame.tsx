import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { usePresentation, usePresentationController } from '../presentation/react';
import { STORIES } from './catalog';
import { previewRequest } from './session';
import { loadSample, previewRuntime } from './client';
import { useNavigation } from '../shared/routing/state';

const StoryRenderer = lazy(() => import('./stories'));
class PreviewBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="ds-frame-error" role="alert">
        <h2>{richMessage('copy.StoryFrame.0e82e93395')}</h2>
        <pre>{localizeValue(this.state.error.message)}</pre>
        <button onClick={() => location.reload()}>
          {richMessage('copy.ConstantsPage.9cee01b433')}
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

export default function StoryFrame() {
  useTextLocale();
  const params = new URLSearchParams(location.search);
  const id = previewRequest.story ?? params.get('__design_system') ?? params.get('preview');
  const story = STORIES.find((item) => item.id === id);
  const controller = usePresentationController();
  const presentation = usePresentation();
  const [runtime, setRuntime] = useState<
    Awaited<ReturnType<typeof loadSample>> & ReturnType<typeof previewRuntime>
  >();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== 'design-system-theme' ||
        typeof event.data.theme !== 'string'
      )
        return;
      void controller.select({ themeId: event.data.theme });
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [controller]);
  useEffect(() => {
    let active = true;
    void loadSample()
      .then((sample) => {
        if (!active) return;
        useNavigation.setState({
          page:
            story?.page ??
            (id === 'season'
              ? 'league'
              : id === 'league-history'
                ? 'leagueHistory'
                : id === 'cup-history'
                  ? 'cupHistory'
                  : id === 'cups'
                    ? 'europe'
                    : 'dashboard'),
        });
        setRuntime({ ...sample, ...previewRuntime(sample, setMessage) });
      })
      .catch((cause) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [id, story?.page]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    // Actual tab/sheet navigation can edit query parameters without leaving the workbench entry.
    const original = { pushState: history.pushState, replaceState: history.replaceState };
    for (const method of ['pushState', 'replaceState'] as const) {
      history[method] = (data, unused, url) => {
        const target = new URL(url?.toString() ?? location.href, location.href);
        target.searchParams.set('__design_system', id ?? 'controls');
        target.searchParams.set('theme', presentation.theme!.id);
        original[method].call(history, data, unused, target);
      };
    }
    return () => {
      history.pushState = original.pushState;
      history.replaceState = original.replaceState;
    };
  }, [id, presentation.theme]);
  if (!story) return <p className="ds-frame-error">{richMessage('copy.StoryFrame.159e81365d')}</p>;
  if (error)
    return (
      <p role="alert" className="ds-frame-error">
        {localizeValue(error)}
        <button onClick={() => location.reload()}>{richMessage('presentation.retry')}</button>
      </p>
    );
  return (
    <div className="ds-story-document" data-surface="canvas" data-story={story.id}>
      {localizeValue(
        runtime ? (
          <PreviewBoundary>
            <Suspense
              fallback={<p className="ds-loading">{richMessage('copy.StoryFrame.cdac3f3fa0')}</p>}
            >
              <StoryRenderer story={story} runtime={runtime} notify={setMessage} />
            </Suspense>
          </PreviewBoundary>
        ) : (
          <p role="status" className="ds-loading">
            {richMessage('copy.StoryFrame.a375c080dc')}
          </p>
        ),
      )}
      {localizeValue(
        presentation.pending && (
          <p role="status" className="ds-toast">
            {richMessage('copy.StoryFrame.58404dc290')}
          </p>
        ),
      )}
      {localizeValue(
        !!presentation.error && (
          <p role="alert" className="ds-toast">
            {richMessage('copy.StoryFrame.8f5a0d77d9', {
              p0: (
                <button onClick={() => void controller.retry()}>
                  {richMessage('presentation.retry')}
                </button>
              ),
            })}
          </p>
        ),
      )}
      {localizeValue(
        message && (
          <p role="status" className="ds-toast">
            {localizeValue(message)}
            <button
              aria-label={displayMessage('copy.StoryFrame.f4c4e17ed0')}
              onClick={() => setMessage('')}
            >
              ×
            </button>
          </p>
        ),
      )}
    </div>
  );
}
