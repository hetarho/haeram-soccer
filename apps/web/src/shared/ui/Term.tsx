import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import type { ReactNode } from 'react';
import { glossaryEntry } from './glossaryEntries';
import { useGlossary } from './metricGlossary';
import s from './styles/Glossary.module.css';

/**
 * A metric name that explains itself: tapping it opens its glossary entry (→WEB-53). Only lazily
 * loaded screens show metric names, so the entries load with them and not with the app.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  useTextLocale();
  const show = useGlossary((state) => state.show);
  const entry = glossaryEntry(id);
  if (!entry) return <>{localizeValue(children)}</>;
  return (
    <button
      type="button"
      className={s.term}
      data-ui="term"
      aria-label={displayMessage('copy.Term.d34ec39231', {
        p0: entry.abbr ? `${entry.abbr} ` : '',
        p1: entry.term,
      })}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
        show(id);
      }}
    >
      {localizeValue(children ?? entry.abbr ?? entry.term)}
    </button>
  );
}
