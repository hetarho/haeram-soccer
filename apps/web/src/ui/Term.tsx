import type { ReactNode } from 'react';
import { glossaryEntry } from './glossaryEntries';
import { useGlossary } from './metricGlossary';
import s from './Glossary.module.css';

/**
 * A metric name that explains itself: tapping it opens its glossary entry (→WEB-53). Only lazily
 * loaded screens show metric names, so the entries load with them and not with the app.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const show = useGlossary((state) => state.show);
  const entry = glossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <button
      type="button"
      className={s.term}
      data-ui="term"
      aria-label={`${entry.abbr ? `${entry.abbr} ` : ''}${entry.term} 설명 보기`}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
        show(id);
      }}
    >
      {children ?? entry.abbr ?? entry.term}
    </button>
  );
}
