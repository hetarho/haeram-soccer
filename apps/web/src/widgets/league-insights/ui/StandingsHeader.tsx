import { useState, type ReactNode } from 'react';
import { chooseStandingsSort, officialOrder, type StandingsMetric } from '../lib/standingsSort';
import s from '../../../shared/ui/styles/LeagueInsights.module.css';

export function useStandingsSort() {
  const [sort, setSort] = useState(officialOrder);
  return {
    sort,
    choose: (column: StandingsMetric) =>
      setSort((previous) => chooseStandingsSort(previous, column)),
  };
}

export function StandingsHeader({
  column,
  controls,
  title,
  className,
  children,
}: {
  column: StandingsMetric;
  controls?: ReturnType<typeof useStandingsSort>;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const direction = controls?.sort.column === column ? controls.sort.direction : undefined;
  return (
    <th scope="col" aria-sort={direction} title={title} className={className}>
      {controls ? (
        <button
          className={s.sortHeader}
          data-ui="table-sort"
          type="button"
          onClick={() => controls.choose(column)}
        >
          {children}
          <span className={s.sortDirection} aria-hidden="true" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}
