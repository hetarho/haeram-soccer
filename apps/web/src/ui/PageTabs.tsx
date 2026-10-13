import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import s from './App.module.css';

/**
 * A page's tab bar (→WEB-69): labels over a hairline, the selected one underlined, scrolling
 * sideways when they do not fit. Arrow keys, Home and End move between tabs. The selected tab
 * stays in the address as ?view= (replaced, never a history entry); the first tab keeps none.
 */
export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: readonly (readonly [T, string])[];
  value: T;
  onChange: (tab: T) => void;
  /** The tab list's accessible name. */
  label: string;
  /** Tabs are `<idPrefix>-tab-<id>`, controlling `<idPrefix>-panel` (→ TabPanel). */
  idPrefix: string;
}) {
  const first = tabs[0][0];
  useEffect(() => {
    const url = new URL(location.href);
    if (value === first) url.searchParams.delete('view');
    else url.searchParams.set('view', value);
    const address = `${url.pathname}${url.search}${url.hash}`;
    if (address !== `${location.pathname}${location.search}${location.hash}`)
      history.replaceState(history.state, '', address);
  }, [value, first]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next][0]);
    document.getElementById(`${idPrefix}-tab-${tabs[next][0]}`)?.focus();
  };
  return (
    <div className={`${s.seasonTabs} ${s.operationsTabs}`} role="tablist" aria-label={label}>
      {tabs.map(([id, text], index) => (
        <button
          key={id}
          type="button"
          id={`${idPrefix}-tab-${id}`}
          role="tab"
          aria-selected={value === id}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === id ? 0 : -1}
          onKeyDown={(event) => keyboard(event, index)}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The panel a PageTabs bar controls, labelled by its selected tab. */
export function TabPanel({
  idPrefix,
  value,
  children,
}: {
  idPrefix: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${value}`}>
      {children}
    </div>
  );
}
