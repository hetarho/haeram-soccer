import { useTextLocale } from '../../../presentation/text';
import { lazy, Suspense, type ComponentProps } from 'react';

const Preparation = lazy(() =>
  import('./StrategyPanel').then((module) => ({ default: module.StrategyPanel })),
);
/** The next-match report loads when opened, shared by the home and match entry points. */
export function StrategyPanel(props: ComponentProps<typeof Preparation>) {
  useTextLocale();
  return (
    <Suspense fallback={null}>
      <Preparation {...props} />
    </Suspense>
  );
}
