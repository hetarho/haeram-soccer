import { lazy, Suspense, type ComponentProps } from 'react';
const Notebook = lazy(() =>
  import('./FixtureNotebook').then((module) => ({ default: module.FixtureNotebook })),
);
/** The fixture notebook and its match report load when the fixture tab is opened. */
export function FixtureNotebook(props: ComponentProps<typeof Notebook>) {
  return (
    <Suspense fallback={<p role="status">경기 일정을 불러오고 있어요.</p>}>
      <Notebook {...props} />
    </Suspense>
  );
}
