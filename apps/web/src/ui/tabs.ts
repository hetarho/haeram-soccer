/**
 * The tab a key moves to in a tab bar of `count` tabs, from the tab at `index`: the arrows step and
 * wrap around, Home and End jump to the ends, and any other key leaves the selection (undefined).
 */
export function nextTabIndex(key: string, index: number, count: number): number | undefined {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  return undefined;
}

/** A tab the keyboard picked, `from` the tab selected when the key was pressed. */
export interface TabIntent<T extends string> {
  from: T;
  to: T;
}

/**
 * What a committed selection does to the keyboard's pick: `focus` once the picked tab is selected,
 * `keep` while the departing tab is still shown (its page's deferred view is loading), `drop` when
 * another selection came instead.
 */
export function tabIntentOutcome<T extends string>(
  intent: TabIntent<T>,
  value: T,
): 'focus' | 'keep' | 'drop' {
  if (value === intent.to) return 'focus';
  return value === intent.from ? 'keep' : 'drop';
}

/** What focus recovery reads of the focused element (a DOM Element). */
export interface FocusedNode {
  readonly isConnected: boolean;
  closest(selectors: string): unknown;
}

/**
 * Whether the keyboard's tab has lost its focus by the time its view commits, so the bar may take
 * it back: focus on nothing, the document body, a detached or inert element, or still in the bar
 * itself. Focus anywhere else is the owner's own and stays where it is.
 */
export function tabFocusLost(active: FocusedNode | null, body: unknown, inBar: boolean): boolean {
  return (
    !active || active === body || !active.isConnected || inBar || active.closest('[inert]') !== null
  );
}
