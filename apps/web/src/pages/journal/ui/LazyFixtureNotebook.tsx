import { useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { lazy, Suspense, type ComponentProps } from 'react';
const Notebook = lazy(() =>
  import('./FixtureNotebook').then((module) => ({ default: module.FixtureNotebook })),
);
/** The fixture notebook and its match report load when the fixture tab is opened. */
export function FixtureNotebook(props: ComponentProps<typeof Notebook>) {
  useTextLocale();
  return (
    <Suspense fallback={<p role="status">{richMessage('copy.LazyFixtureNotebook.a545816f8e')}</p>}>
      <Notebook {...props} />
    </Suspense>
  );
}
