import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { InboxItem, MatchPlayback } from '../../../../packages/contracts/src/types';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import type { ClientState } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import type { GameClient } from '../runtime/client';
import type { View } from '../runtime/protocol';
import {
  gameStore,
  initialClientState,
  notificationStore,
  type SystemNotification,
} from '../runtime/store';
import { CommunicationsButton, EventCenter } from './EventCenter';
import { useNavigation } from './state';

const reports = vi.hoisted(() => ({
  resume: undefined as MatchPlayback | undefined,
  events: [] as InboxItem[],
  eve: false,
}));
vi.mock('./state', async (importOriginal) => {
  const original = await importOriginal<typeof import('./state')>();
  return {
    ...original,
    useNavigation: Object.assign(
      (selector: (state: ReturnType<typeof original.useNavigation.getState>) => unknown) =>
        selector(original.useNavigation.getState()),
      original.useNavigation,
    ),
  };
});
vi.mock('../runtime/matchView', () => ({ useUnfinishedPlayback: () => reports.resume }));
vi.mock('../runtime/progression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/progression')>()),
  stoppingEvents: () => reports.events,
  pendingMatchReport: () => (reports.eve ? { id: 'tomorrow' } : undefined),
}));

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
  reports.resume = undefined;
  reports.events = [];
  reports.eve = false;
  vi.stubGlobal('localStorage', { getItem: () => null });
  gameStore.setState(
    {
      ...initialClientState,
      view: {
        world: {
          id: 'clock-news',
          year: 1950,
          calendar: { day: 7 },
          settings: defaultSettings(),
          inbox: [{}, { read: false }, { read: true }],
        },
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

describe('unfinished observation access', () => {
  function renderEvents() {
    return renderToStaticMarkup(
      createElement(EventCenter, {
        client: {} as GameClient,
        controller: {
          store: createStore(() => ({ running: false, eventRequest: 0 })),
        } as unknown as ProgressionController,
        compact: true,
      }),
    );
  }

  it('shows no persistent launcher just because unfinished playback exists', () => {
    reports.resume = { record: { id: 'observed' } } as MatchPlayback;
    expect(renderEvents()).toBe('');
  });

  it('keeps other event access without offering resume from that notification', () => {
    reports.resume = { record: { id: 'observed' } } as MatchPlayback;
    reports.events = [{ id: 'decision', kind: 'staff-report' } as InboxItem];
    const markup = renderEvents();
    expect(markup).toContain('data-testid="event-pill"');
    expect(markup).toContain('이벤트 1개');
    expect(markup).not.toContain('관전 이어보기');
  });

  it('does not expose a persistent manual match report launcher', () => {
    gameStore.getState().view!.world.settings!.mode = 'manual';
    reports.eve = true;
    reports.events = [{ id: 'tomorrow', kind: 'match' } as InboxItem];
    expect(renderEvents()).toBe('');
  });

  it('keeps automatic report access because that mode has no next-event action', () => {
    reports.eve = true;
    reports.events = [{ id: 'tomorrow', kind: 'match' } as InboxItem];
    expect(renderEvents()).toContain('NEXT MATCH · 보고 확인');
  });

  it('presents no report until an owner stop has shown the days it computed ahead', () => {
    // A stop after 결과만 보고 계속: the clock no longer runs, but the played-through match day is
    // still to be shown, so the shown date is still that match's eve.
    reports.eve = true;
    reports.events = [{ id: 'tomorrow', kind: 'match' } as InboxItem];
    gameStore.setState({ clockRunning: true });
    expect(renderEvents()).toBe('');
    // Once the stop has landed on its date, an eve still shown there is reported as usual.
    gameStore.setState({ clockRunning: false });
    expect(renderEvents()).toContain('NEXT MATCH · 보고 확인');
  });

  it('preserves business-event access and excludes the manual match from its count', () => {
    gameStore.getState().view!.world.settings!.mode = 'manual';
    reports.eve = true;
    reports.events = [
      { id: 'tomorrow', kind: 'match' },
      { id: 'business', kind: 'staff-report' },
    ] as InboxItem[];
    const markup = renderEvents();
    expect(markup).toContain('이벤트 1개');
    expect(markup).not.toContain('NEXT MATCH · 보고 확인');
  });
});
describe('home business requests', () => {
  it("leaves office requests to the owner's office instead of the home", () => {
    reports.events = [
      {
        id: 'decision:sales:bid',
        attention: true,
        ref: 'bid',
        kind: 'incoming-bid',
        title: 'Synthetic sale',
        detail: 'Pending terms',
        year: 1950,
        day: 7,
      },
    ];
    const controller = {
      store: createStore(() => ({ running: false, eventRequest: 0 })),
    } as unknown as ProgressionController;
    const render = () =>
      renderToStaticMarkup(createElement(EventCenter, { client: {} as GameClient, controller }));
    // A desk's request waits in the office, counted on the clubhouse entry and the office scene.
    expect(render()).toBe('');
    useNavigation.setState({ page: 'business' });
    expect(render()).toBe('');
    useNavigation.setState({ page: 'dashboard' });
  });
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
