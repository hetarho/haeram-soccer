import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConstantsPage } from './ConstantsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConstantsPage />
  </StrictMode>,
);
