import { lazy, Suspense, type ComponentProps } from 'react';

const Preparation = lazy(() =>
  import('./StrategyPanel').then((module) => ({ default: module.StrategyPanel })),
);
/** Match preparation loads when opened, shared by home, match and individual-player entry points. */
export function StrategyPanel(props: ComponentProps<typeof Preparation>) {
  return (
    <Suspense fallback={null}>
      <Preparation {...props} />
    </Suspense>
  );
}
