import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { usePresentation, usePresentationController } from '../presentation/react';
import { STORIES } from './catalog';
import { previewRequest } from './session';
import { loadSample, previewRuntime } from './client';
import { useNavigation } from '../ui/state';

const StoryRenderer = lazy(() => import('./stories'));
class PreviewBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="ds-frame-error" role="alert">
        <h2>미리보기를 표시하지 못했어요.</h2>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => location.reload()}>다시 불러오기</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

export default function StoryFrame() {
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
  if (!story) return <p className="ds-frame-error">등록되지 않은 미리보기입니다.</p>;
  if (error)
    return (
      <p role="alert" className="ds-frame-error">
        {error}
        <button onClick={() => location.reload()}>다시 시도</button>
      </p>
    );
  return (
    <div className="ds-story-document" data-surface="canvas" data-story={story.id}>
      {runtime ? (
        <PreviewBoundary>
          <Suspense fallback={<p className="ds-loading">컴포넌트를 불러오는 중…</p>}>
            <StoryRenderer story={story} runtime={runtime} notify={setMessage} />
          </Suspense>
        </PreviewBoundary>
      ) : (
        <p role="status" className="ds-loading">
          샘플 게임을 준비하는 중…
        </p>
      )}
      {presentation.pending && (
        <p role="status" className="ds-toast">
          테마를 불러오는 중…
        </p>
      )}
      {message && (
        <p role="status" className="ds-toast">
          {message}
          <button aria-label="알림 닫기" onClick={() => setMessage('')}>
            ×
          </button>
        </p>
      )}
    </div>
  );
}
