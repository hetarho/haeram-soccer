import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientState } from '../runtime/client';
import type { View } from '../runtime/protocol';
import {
  gameStore,
  initialClientState,
  notificationStore,
  type SystemNotification,
} from '../runtime/store';
import { CommunicationsButton } from './EventCenter';

vi.mock('../runtime/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../runtime/store')>();
  return {
    ...original,
    useGameState: (selector: (state: ClientState) => unknown) =>
      selector(original.gameStore.getState()),
    useNotifications: (selector: (items: SystemNotification[]) => unknown) =>
      selector(original.notificationStore.getState()),
  };
});

const render = () => renderToStaticMarkup(createElement(CommunicationsButton));
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  gameStore.setState(
    {
      ...initialClientState,
      view: {
        world: { id: 'clock-news', inbox: [{}, { read: false }, { read: true }] },
        news: [{ id: 'new-one' }, { id: 'new-two' }],
      } as unknown as View,
    },
    true,
  );
  notificationStore.setState(
    [
      { id: 'system-new', text: 'New notice', read: false, at: 1 },
      { id: 'system-read', text: 'Read notice', read: true, at: 0 },
    ],
    true,
  );
});
afterEach(() => {
  gameStore.setState(initialClientState, true);
  notificationStore.setState([], true);
  vi.unstubAllGlobals();
});

describe('inline clock notifications', () => {
  it('combines unread club/system notifications and news in one accessible trigger', () => {
    const markup = render();
    expect(markup).toContain('aria-label="알림·뉴스 · 새 소식 5개"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-hidden="true">5</b>');
    expect(markup.match(/data-testid="communications-button"/g)).toHaveLength(1);
  });

  it('caps the visible badge while retaining the exact accessible count', () => {
    notificationStore.setState(
      Array.from({ length: 100 }, (_, index) => ({
        id: `system-${index}`,
        text: 'Unread notice',
        read: false,
        at: index,
      })),
      true,
    );
    const markup = render();
    expect(markup).toContain('aria-label="알림·뉴스 · 새 소식 104개"');
    expect(markup).toContain('aria-hidden="true">99+</b>');
  });

  it('does not render a launcher without an active game', () => {
    gameStore.setState(initialClientState, true);
    expect(render()).toBe('');
  });
});
