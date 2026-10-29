/** The match lab's entry (→LAB-1): its own page, no game chrome, theme or save code. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LabPage } from './LabPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LabPage />
  </StrictMode>,
);
