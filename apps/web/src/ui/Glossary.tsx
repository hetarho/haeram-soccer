import { lazy, Suspense } from 'react';
import { useGlossary } from './metricGlossary';

/** The entries and their sheet load on first open, keeping their text out of the app's first load. */
const GlossarySheet = lazy(() =>
  import('./GlossarySheet').then((module) => ({ default: module.GlossarySheet })),
);

/** One sheet for the whole app: a single term from a metric label, or every term from the menu. */
export function GlossaryHost() {
  const open = useGlossary((state) => state.open);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GlossarySheet open={open} />
    </Suspense>
  );
}
