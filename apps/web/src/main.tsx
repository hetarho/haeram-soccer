import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PresentationSettings } from './ui/PresentationSettings';
import { presentationFailed, startPresentation } from './presentation/startPresentation';

const root = createRoot(document.getElementById('root')!);
void startPresentation(
  root,
  <>
    <App />
    <PresentationSettings />
  </>,
).catch(() => presentationFailed(root));
