import { describe, expect, it } from 'vitest';
import { nextTabIndex, tabFocusLost, tabIntentOutcome, type FocusedNode } from './tabs';

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

/**
 * The keyboard's pick through a deferred view (→ TabList): 코치진 → 1군 on the club section bar
 * (CI 41244030798 lost the focus to the inert shell while 1군 mounted).
 */
describe('the keyboard focus through a deferred view', () => {
  const pick = { from: 'staff', to: 'firstTeam' };
  const body = { isConnected: true, closest: () => null };
  const node = (connected = true, inert = false): FocusedNode => ({
    isConnected: connected,
    closest: (selectors) => (inert && selectors === '[inert]' ? {} : null),
  });

  it('waits while the departing tab is shown and focuses once the picked one commits', () => {
    expect(tabIntentOutcome(pick, 'staff')).toBe('keep');
    expect(tabIntentOutcome(pick, 'firstTeam')).toBe('focus');
  });

  it('drops the pick when another selection comes instead', () => {
    expect(tabIntentOutcome(pick, 'training')).toBe('drop');
  });

  it('takes back a focus left on nothing, the body, a detached or inert element or the bar', () => {
    expect(tabFocusLost(null, body, false)).toBe(true);
    expect(tabFocusLost(body, body, false)).toBe(true);
    expect(tabFocusLost(node(false), body, false)).toBe(true);
    expect(tabFocusLost(node(true, true), body, false)).toBe(true);
    expect(tabFocusLost(node(), body, true)).toBe(true);
  });

  it('leaves a focus the owner put on another control', () => {
    expect(tabFocusLost(node(), body, false)).toBe(false);
  });
});
