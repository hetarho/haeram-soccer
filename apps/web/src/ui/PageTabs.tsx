import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from './tabs';
import { taskAddress, useTaskState } from './taskMemory';
import s from './App.module.css';

/**
 * A tab bar (→WEB-69): labels over a hairline, the selected one underlined, scrolling sideways
 * when they do not fit. Arrow keys, Home and End move between tabs (→ nextTabIndex) and focus the
 * one they pick.
 */
export function TabList<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  className = `${s.seasonTabs} ${s.operationsTabs}`,
}: {
  tabs: readonly (readonly [T, ReactNode])[];
  value: T;
  onChange: (tab: T) => void;
  /** The tab list's accessible name. */
  label: string;
  /** Tabs are `<idPrefix>-tab-<id>`, controlling `<idPrefix>-panel` (→ TabPanel). */
  idPrefix: string;
  /** The bar's classes; a page's tab bar by default. */
  className?: string;
}) {
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(event.key, index, tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    onChange(tabs[next][0]);
    // Within this bar: a closing dialog's fading copy keeps the same IDs for a moment.
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label}>
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

/** Rewrites the address's query in place: replaced, never a history entry. */
export function replaceQuery(update: (params: URLSearchParams) => void) {
  const url = new URL(location.href);
  update(url.searchParams);
  const address = `${url.pathname}${url.search}${url.hash}`;
  if (address !== taskAddress()) history.replaceState(history.state, '', address);
}

/**
 * A page's tab bar whose selected tab stays in the address as ?view= (replaced, never a history
 * entry); the first tab keeps none.
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
  useEffect(
    () =>
      replaceQuery((params) => {
        if (value === first) params.delete('view');
        else params.set('view', value);
      }),
    [value, first],
  );
  return (
    <TabList tabs={tabs} value={value} onChange={onChange} label={label} idPrefix={idPrefix} />
  );
}

/** The tab the address asks for under `param`: an older address's, a listed one, else the first. */
function addressTab<T extends string>(
  param: string,
  tabs: readonly (readonly [T, ...unknown[]])[],
  first: T,
  older?: (params: URLSearchParams) => T | undefined,
) {
  const params = new URLSearchParams(location.search);
  return older?.(params) ?? tabs.find(([id]) => id === params.get(param))?.[0] ?? first;
}

/** A mounted lens may share a pathname with other lenses; match its grouping keys too. */
function matchesPath(path?: string) {
  if (!path) return true;
  const expected = new URL(path, location.origin);
  const params = new URLSearchParams(location.search);
  return (
    location.pathname.startsWith(expected.pathname) &&
    [...expected.searchParams].every(([key, value]) => params.get(key) === value)
  );
}

/**
 * A tab kept in the address under `param` and per career in task memory (→ useTaskState): read
 * from the address when the page opens, written back as it changes (replaced, never a history
 * entry; the first tab leaves the parameter out unless `keepFirst`), and read again when back or
 * forward moves the address. A page kept mounted while hidden names its `path`: away from it the
 * address is another page's, so the tab neither writes nor reads it.
 */
export function useAddressTab<T extends string>(
  param: string,
  tabs: readonly (readonly [T, ...unknown[]])[],
  first: T,
  {
    world,
    key,
    path,
    keepFirst = false,
    older,
  }: {
    world: string;
    /** The task-memory key the career keeps the tab under. */
    key: string;
    path?: string;
    keepFirst?: boolean;
    /** The tab an older address asks for, read ahead of the parameter. */
    older?: (params: URLSearchParams) => T | undefined;
  },
) {
  const [tab, setTab] = useTaskState(world, key, () =>
    matchesPath(path) ? addressTab(param, tabs, first, older) : first,
  );
  const shown = matchesPath(path);
  const entry = useRef('');
  const scope = `${world}:${key}:${path ?? ''}`;
  const entering = shown && entry.current !== scope;
  useLayoutEffect(() => {
    if (entering) {
      entry.current = scope;
      setTab(addressTab(param, tabs, first, older));
    }
    if (!shown) entry.current = '';
  });
  useEffect(() => {
    if (!shown || entering) return;
    replaceQuery((params) => {
      if (tab === first && !keepFirst) params.delete(param);
      else params.set(param, tab);
    });
  }, [param, tab, first, keepFirst, shown, entering]);
  useEffect(() => {
    const restore = () => {
      if (matchesPath(path)) setTab(addressTab(param, tabs, first, older));
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('tasknavigate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('tasknavigate', restore);
    };
  }, [param, tabs, first, older, path, setTab]);
  return [tab, setTab] as const;
}

/** The panel a tab bar controls, labelled by its selected tab. */
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
