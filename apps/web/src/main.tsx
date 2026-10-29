import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PresentationSettings } from './ui/PresentationSettings';
import { presentationFailed, startPresentation } from './presentation/startPresentation';

const root = createRoot(document.getElementById('root')!);
void startPresentation(
  root,
  /^\/design-system(?:\/|\.html)?$/.test(location.pathname) ? (
    <main style={{ padding: 24 }}>
      <h1>개발 모드에서만 사용할 수 있어요.</h1>
      <a href="/">게임으로 돌아가기</a>
    </main>
  ) : (
    <>
      <App />
      <PresentationSettings />
    </>
  ),
).catch(() => presentationFailed(root));
