import { describe, expect, it } from 'vitest';
import { nextTabIndex } from './tabs';

/** Every tab bar's keyboard (→ TabList): four tabs, as on the records room. */
describe('the tab-bar keyboard', () => {
  it('ArrowRight wraps to the first tab', () => {
    expect(nextTabIndex('ArrowRight', 1, 4)).toBe(2);
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0);
  });

  it('ArrowLeft wraps to the last tab', () => {
    expect(nextTabIndex('ArrowLeft', 2, 4)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 0, 4)).toBe(3);
  });

  it('Home and End jump to the ends', () => {
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 1, 4)).toBe(3);
  });

  it('other keys leave the selection', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a'])
      expect(nextTabIndex(key, 1, 4)).toBeUndefined();
  });
});
