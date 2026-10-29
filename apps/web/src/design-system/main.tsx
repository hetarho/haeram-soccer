import { createRoot } from 'react-dom/client';
import { isolatePreviewSession } from './session';
import { presentationFailed, startPresentation } from '../presentation/startPresentation';
import './workbench.css';

if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  isolatePreviewSession(
    params.get('theme'),
    params.get('__design_system') ?? params.get('preview'),
  );
  const root = createRoot(document.getElementById('root')!);
  const entry =
    params.has('preview') || params.has('__design_system')
      ? import('./StoryFrame')
      : import('./Workbench');
  void entry
    .then(({ default: Page }) => startPresentation(root, <Page />))
    .catch(() => presentationFailed(root));
}
