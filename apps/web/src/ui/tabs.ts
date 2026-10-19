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
