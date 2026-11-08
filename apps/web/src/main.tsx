import { richMessage } from './presentation/LocalizedMessage';
import { createRoot } from 'react-dom/client';
import { App } from './app/ui/App';
import { PresentationSettings } from './widgets/presentation-settings';
import { presentationFailed, startPresentation } from './presentation/startPresentation';

const root = createRoot(document.getElementById('root')!);
void startPresentation(
  root,
  /^\/design-system(?:\/|\.html)?$/.test(location.pathname) ? (
    <main style={{ padding: 24 }}>
      <h1>{richMessage('copy.main.10ac389f48')}</h1>
      <a href="/">{richMessage('copy.main.0bf2b10d97')}</a>
    </main>
  ) : (
    <>
      <App />
      <PresentationSettings />
    </>
  ),
).catch(() => presentationFailed(root));
