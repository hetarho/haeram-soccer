import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type {
  InboxItem,
  MatchPlayback,
  TransferBid,
} from '../../../../../../packages/contracts/src/types';
import { overall } from '../../../../../../packages/engine/src/player-state';
import { defaultSettings } from '../../../../../../packages/engine/src/responsibilities';
import { makePlayer } from '../../../../../../packages/engine/src/world';
import type { ClientState } from '../../../runtime/client';
import type { ProgressionController } from '../../../runtime/progression';
import type { GameClient } from '../../../runtime/client';
import type { View } from '../../../runtime/protocol';
import {
  gameStore,
  initialClientState,
  notificationStore,
  type SystemNotification,
} from '../../../runtime/store';
import { ApprovalRequestHost } from './ApprovalRequestHost';
import { CommunicationsButton, EventCard, EventCenter } from '../../../widgets/event-center';
import { useNavigation } from '../../../shared/routing/state';

const reports = vi.hoisted(() => ({
  resume: undefined as MatchPlayback | undefined,
  events: [] as InboxItem[],
  approvals: [] as InboxItem[],
  eve: false,
}));
vi.mock('../../../shared/routing/state', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/routing/state')>();
  return {
    ...original,
    useNavigation: Object.assign(
      (selector: (state: ReturnType<typeof original.useNavigation.getState>) => unknown) =>
        selector(original.useNavigation.getState()),
      original.useNavigation,
    ),
  };
});
vi.mock('../../../runtime/matchView', () => ({ useUnfinishedPlayback: () => reports.resume }));
vi.mock('../../../runtime/progression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/progression')>()),
  stoppingEvents: () => reports.events,
  approvalRequests: () => reports.approvals,
  pendingMatchReport: () => (reports.eve ? { id: 'tomorrow' } : undefined),
}));

vi.mock('../../../runtime/store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../runtime/store')>();
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
  reports.approvals = [];
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
    // Approvals never stop the clock, so they are never among the stopping events (→WEB-42).
    reports.approvals = [
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
describe('a bid request’s review (→WEB-39/100)', () => {
  // Small synthetic fixtures: one target on the selling club's books, one player of ours.
  const target = makePlayer('ENG', 'bid-review', 'market:1950:sig:7', 1950, 62, 'ST', 24);
  Object.assign(target, { name: 'Pinned Target', wage: '180000', until: 1953 });
  const ours = makePlayer('ENG', 'bid-review', 'ours', 1950, 55, 'CB', 27);
  Object.assign(ours, { name: 'Our Defender', until: 1952 });
  const countered = {
    id: 'out-bid',
    direction: 'out',
    playerId: target.id,
    club: 'seller',
    fee: '400000',
    counterFee: '520000',
    offer: { player: target, fee: '500000', loanFee: '90000' },
    year: 1950,
    day: 5,
    due: 8,
    status: 'countered',
  } as TransferBid;
  const incoming = {
    id: 'in-bid',
    direction: 'in',
    playerId: ours.id,
    club: 'bidder',
    fee: '300000',
    year: 1950,
    day: 6,
    due: 11,
    status: 'pending',
  } as TransferBid;
  const item = (id: string, ref: string, kind: InboxItem['kind'], title: string) =>
    ({ id, ref, kind, title, detail: title, year: 1950, day: 7, attention: true }) as InboxItem;
  const outItem = item('decision:recruitment:out-bid', 'out-bid', 'bid-response', '역제안 답변');
  const inItem = item('decision:sales:in-bid', 'in-bid', 'incoming-bid', '매각 제안 답변');
  const controller = {} as ProgressionController;
  const client = {
    get state() {
      return gameStore.getState();
    },
  } as GameClient;
  beforeEach(() => {
    const w = gameStore.getState().view!.world;
    Object.assign(w, {
      playerClub: 'own',
      clubs: [
        { id: 'own', name: 'Own FC', country: 'ENG' },
        { id: 'seller', name: 'Seller FC', country: 'ENG' },
        { id: 'bidder', name: 'Bidder FC', country: 'ENG' },
      ],
      // A sold row of the target, as if a former player of ours: the review reads the pinned offer.
      players: [ours, { ...target, status: 'sold', name: 'Stale Row', until: 1951 }],
      bids: [countered, incoming],
      staff: [],
      fixtures: [],
      europe: [],
      approvalWaits: { [outItem.id]: 9, [inItem.id]: 2 },
    });
    // The target is not on the current market page.
    gameStore.setState({ view: { ...gameStore.getState().view!, transfers: [] } });
  });
  const review = (request: InboxItem) =>
    renderToStaticMarkup(
      createElement(ApprovalRequestHost, {
        request: { world: 'clock-news', desk: 'players', item: request },
        client,
        children: (scoped) =>
          createElement(EventCard, { client: scoped, controller, item: request, inDesk: true }),
      }),
    );
  const facts = (html: string) =>
    Object.fromEntries(
      [...html.matchAll(/<div><dt>([^<]+)<\/dt><dd>(.*?)<\/dd><\/div>/g)].map(([, dt, dd]) => [
        dt,
        dd.replace(/<[^>]+>/g, ''),
      ]),
    );

  it('shows one heading with its real 결재 기한 and one named return, without echoed copy', () => {
    reports.approvals = [outItem, inItem];
    const html = review(outItem);
    expect(html.match(/<h[1-6][^>]*>/g)).toHaveLength(1);
    expect(html.match(/역제안 답변/g)).toHaveLength(1);
    expect(html).toContain('data-testid="approval-deadline">지연 3일<');
    expect(html).toContain('>결재함으로</button>');
    expect(html).not.toContain('>취소</button>');
    // The answer stays the request's own authoritative form.
    expect(html).toContain('>역제안 수락</button>');
    expect(html).toContain('>거절</button>');
    expect(review(inItem)).toContain('data-testid="approval-deadline">D-5<');
  });
  it('names the pinned target, his ability and the counter terms before an answer', () => {
    reports.approvals = [outItem];
    const shown = facts(review(outItem));
    expect(shown).toMatchObject({
      '영입 대상': 'Pinned Target',
      '포지션·나이': 'ST · 스트라이커 · 24세',
      능력: `OVR ${overall(target)} · 잠재력 ${Math.round(target.potential)}`,
      '상대 구단': 'Seller FC',
      '영입 후 연봉·계약': expect.stringContaining('계약 1952/53 시즌 끝까지'),
    });
    expect(shown['우리 제안 이적료']).toBeTruthy();
    expect(shown['역제안 이적료']).toBeTruthy();
    expect(shown['우리 제안 이적료']).not.toBe(shown['역제안 이적료']);
    expect(JSON.stringify(shown)).not.toContain('Stale Row');
  });
  it('labels a loan as a loan and never shows his club contract as its end', () => {
    countered.loan = true;
    try {
      reports.approvals = [outItem];
      const shown = facts(review(outItem));
      expect(shown['임대 대상']).toBe('Pinned Target');
      expect(shown['역제안 임대료']).toBeTruthy();
      expect(shown['임대 중 연봉']).toBeTruthy();
      expect(JSON.stringify(shown)).not.toContain('시즌 끝까지');
      expect(Object.keys(shown).join()).not.toContain('이적료');
    } finally {
      delete countered.loan;
    }
  });
  it('identifies our player and his current terms for an offer we received', () => {
    reports.approvals = [inItem];
    const shown = facts(review(inItem));
    expect(shown).toMatchObject({
      '우리 선수': 'Our Defender',
      '포지션·나이': 'CB · 센터백 · 27세',
      '제안 구단': 'Bidder FC',
      '현재 연봉·계약': expect.stringContaining('계약 1951/52 시즌 끝까지'),
    });
    expect(review(inItem)).toContain('>수락하고 매각</button>');
  });
  it('says a legacy target is unknown rather than inventing him or his terms', () => {
    const legacy = { ...countered, playerId: 'market:1950:2', offer: undefined };
    gameStore.getState().view!.world.bids = [legacy];
    reports.approvals = [outItem];
    const shown = facts(review(outItem));
    expect(shown['영입 대상']).toBe('선수 정보 없음');
    expect(Object.keys(shown)).not.toContain('포지션·나이');
    expect(Object.keys(shown).join()).not.toContain('연봉');
    expect(shown['역제안 이적료']).toBeTruthy();
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
