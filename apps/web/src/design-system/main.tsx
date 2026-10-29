import { createRoot } from 'react-dom/client';
import { isolatePreviewSession } from './session';
import { startDesignSystem } from './start';
import './workbench.css';

if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  isolatePreviewSession(
    params.get('theme'),
    params.get('__design_system') ?? params.get('preview'),
  );
  const preview = params.has('preview') || params.has('__design_system');
  document.documentElement.dataset.designSystem = preview ? 'preview' : 'workbench';
  const root = createRoot(document.getElementById('root')!);
  void startDesignSystem(root, preview);
}
