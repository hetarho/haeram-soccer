/**
 * The match lab's entry (→LAB-1): its own page, no game chrome or save code, inside the game's
 * presentation so its match view draws the theme the game uses in this browser (→LAB-9).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { presentationFailed, startPresentation } from '../presentation/startPresentation';
import { LabPage } from './LabPage';

const root = createRoot(document.getElementById('root')!);
void startPresentation(
  root,
  <StrictMode>
    <LabPage />
  </StrictMode>,
).catch(() => presentationFailed(root));
