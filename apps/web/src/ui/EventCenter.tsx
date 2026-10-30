import { eventDesk } from './eventRouting';
import { PixelIcon } from './PixelIcon';
import { memo, useEffect, useId, useRef, useState } from 'react';
import type { InboxItem, TransferBid, World } from '../../../../packages/contracts/src/types';
import { seasonDate, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { pendingDecisions } from '../../../../packages/engine/src/stopping';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { releaseCost } from '../../../../packages/engine/src/staff-info';
import type { GameClient } from '../runtime/client';
import {
  gameActionsBlocked,
  gameStore,
  notificationStore,
  useGameState,
  useNotifications,
  type SystemNotification,
} from '../runtime/store';
import {
  pendingMatchReport,
  stoppingEvents,
  useProgression,
  type ProgressionController,
} from '../runtime/progression';
import {
  openMarket,
  openTraining,
  openOwnerOffice,
  useNavigation,
  openApprovalRequest,
} from './state';
import { Money } from './Money';
import { Dialog } from './Dialog';
import { TabList, TabPanel } from './PageTabs';
import s from './EventCenter.module.css';
import { fadeOutOnRemove } from './motion';
import { watchNextMatch } from './watch';
import { useUnfinishedPlayback } from '../runtime/matchView';
import { MatchReportCard } from './MatchReportCard';
import {
  NewsQuietToggle,
  NewsList,
  useClubNews,
  useNewsSheet,
  useUnreadNewsCount,
  markNewsSeen,
  type NewsTab,
} from './NewsFeed';
import newsStyle from './NewsFeed.module.css';

const cardExit = fadeOutOnRemove([
  { opacity: 1, transform: 'none' },
  { opacity: 0, transform: 'translateY(18px) scale(0.98)' },
]);

function bidFor(w: World, item: InboxItem): TransferBid | undefined {
  return item.ref ? w.bids?.find((bid) => bid.id === item.ref) : undefined;
}
function playerName(
  w: World,
  bid: TransferBid,
  market: { player: { id: string; name: string } }[],
) {
  return (
    w.players.find((p) => p.id === bid.playerId)?.name ||
    market.find((offer) => offer.player.id === bid.playerId)?.player.name ||
    '선수'
  );
}

/**
 * The clock stops for events; this card says why and offers the decisions that event needs.
 * Deciding the last waiting event plays on a clock an event stopped; a choice that opens another
 * view leaves it stopped for the owner to act there. A card decides its event or opens a setting's
 * home; it never changes a standing setting itself (→WEB-42, WEB-71).
 */
export const EventCenter = memo(function EventCenter({
  client,
  controller,
  compact = false,
}: {
  client: GameClient;
  controller: ProgressionController;
  compact?: boolean;
}) {
  const w = useGameState((state) => state.view?.world);
  // An owner's stop lands once every day it computed ahead has been shown, and management stays
  // locked until then (→WEB-18/97). Until it has, the shown date is not the one it stops on, so no
  // event is presented: not even the report of a match already played through, whose match day is
  // still to be shown.
  const stopping = useGameState((state) => !!state.clockRunning);
  const running = useProgression(controller, (state) => state.running) || stopping;
  const [opened, setOpened] = useState<string>();
  const eventRequest = useProgression(controller, (state) => state.eventRequest);
  const previousRequest = useRef(eventRequest);
  const page = useNavigation((state) => state.page);
  const setPage = useNavigation((state) => state.setPage);
  const unfinished = useUnfinishedPlayback();
  const resume = !running ? unfinished : undefined;
  // Office work waits in the owner's office behind the menu's count; only what has no desk shows here.
  const events =
    w && !running
      ? stoppingEvents(w).filter((item) => !eventDesk(item) && (!resume || item.kind !== 'match'))
      : [];
  const key = w ? `${w.id}:${seasonDate(w)}` : '';
  const date = w ? seasonDate(w) : '';
  const eve = !resume && !running && w && !!pendingMatchReport(w);
  const eveKey = eve ? key : undefined;
  const resumeKey = w && resume ? `${w.id}:watch:${resume.record.id}` : undefined;
  const resumeOpen = !!resumeKey && opened === resumeKey;
  const acting = useGameState(gameActionsBlocked);
  useEffect(() => setOpened(undefined), [page]);
  useEffect(() => {
    const requested = eventRequest !== previousRequest.current;
    previousRequest.current = eventRequest;
    if (eveKey) setOpened(eveKey);
    else if (resumeKey && requested) setOpened(resumeKey);
  }, [eveKey, resumeKey, eventRequest]);
  if (!w || page === 'business' || running || (!events.length && !resumeOpen)) return null;
  const inDialog = compact || eve || resumeOpen;
  const label = resumeOpen ? '관전 이어보기' : eve ? 'NEXT MATCH' : `${date} 이벤트`;
  if (inDialog && opened !== key && !resumeOpen) {
    const manualMatch = eve && settingsOf(w).mode === 'manual';
    const entries = manualMatch ? events.filter((item) => item.kind !== 'match') : events;
    if (!entries.length) return null;
    return (
      <button
        className={s.pill}
        data-testid="event-pill"
        data-event-access
        aria-label={
          eve && !manualMatch
            ? `경기 준비 보고 · ${date} · 열기`
            : `이벤트 ${entries.length}개 · ${date} · 열기`
        }
        onClick={() => setOpened(key)}
      >
        <i aria-hidden="true">{entries.length}</i>
        <span>{eve && !manualMatch ? 'NEXT MATCH · 보고 확인' : `${date} 이벤트`}</span>
      </button>
    );
  }
  const content = (
    <div className={s.group} data-testid="event-group">
      <div className={s.groupHead}>
        <h2>
          {date} ·{' '}
          {resumeOpen ? '관전 중인 경기' : eve ? '경기 준비 보고' : `이벤트 ${events.length}개`}
        </h2>
        {/* The match eve card names its responsibility entry itself. */}
        {!eve && !resumeOpen && (
          <button data-ui="link" type="button" className={s.groupOffice} onClick={openOwnerOffice}>
            결재라인 모아보기
          </button>
        )}
      </div>
      {resumeOpen && resume && (
        <MatchReportCard w={w} fixture={resume.record} continuing>
          <div className={s.actions}>
            <button
              data-ui="primary"
              className={s.primary}
              aria-label="관전 이어보기"
              disabled={acting || !!w.critical || !!w.bankrupt}
              onClick={() => setPage('match')}
            >
              관전 이어보기 <PixelIcon name="play" size={16} />
            </button>
          </div>
        </MatchReportCard>
      )}
      {events.map((item) => (
        <EventCard key={item.id} client={client} controller={controller} item={item} />
      ))}
    </div>
  );
  return inDialog ? (
    <Dialog label={label} onClose={() => setOpened(undefined)}>
      {content}
    </Dialog>
  ) : (
    <section className={s.eventGroup} aria-label={eve ? 'NEXT MATCH' : `${date} 이벤트`}>
      {content}
    </section>
  );
});

export const EventCard = memo(function EventCard({
  client,
  controller,
  item,
  inDesk = false,
}: {
  client: GameClient;
  controller: ProgressionController;
  item: InboxItem;
  inDesk?: boolean;
}) {
  const w = useGameState((state) => state.view!.world);
  const market = useGameState((state) => state.view?.transfers) || [];
  const read = (item: InboxItem) => client.command({ type: 'read-inbox', id: item.id });
  const decide = async (item: InboxItem, action?: () => Promise<unknown>) => {
    const reply = await action?.();
    if (reply && typeof reply === 'object' && 'ok' in reply && !reply.ok) return;
    if (inDesk) return;
    await read(item);
    controller.eventDecided();
  };
  const acting = useGameState(gameActionsBlocked);
  const setPage = useNavigation((state) => state.setPage);
  const bid = bidFor(w, item);
  const desk = eventDesk(item);
  if (!inDesk && desk)
    return (
      <aside
        data-surface="panel"
        className={s.card}
        aria-label="이벤트"
        data-testid="event-card"
        data-request-id={item.id}
      >
        <header>
          <span className={s.kind}>{KIND_LABEL[item.kind]}</span>
        </header>
        <h3>{item.title}</h3>
        <p>{bid && `${playerName(w, bid, market)} · `}결재 대기</p>
        <button
          data-ui="primary"
          onClick={() => {
            if (gameStore.getSnapshot().view?.world.id === w.id) openApprovalRequest(w.id, item);
          }}
        >
          검토하기
        </button>
      </aside>
    );
  const next = nextOwnFixture(w);
  const eve = item.kind === 'match' && next?.id === item.ref ? next : undefined;
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  if (eve) {
    const blocked = acting || pendingDecisions(w).length > 0;
    const watch = () => {
      controller.clearMatchEve();
      return watchNextMatch(client, controller, () => setPage('match'), { fromEve: true });
    };
    return (
      <MatchReportCard w={w} fixture={eve} ref={cardExit}>
        <button data-ui="link" type="button" className={s.stops} onClick={openOwnerOffice}>
          결재라인 모아보기
        </button>
        <div className={s.actions}>
          <button
            data-ui="primary"
            className={s.primary}
            disabled={blocked}
            onClick={() => void watch()}
          >
            관전하기 ▶
          </button>
          <button disabled={blocked} onClick={() => controller.playThrough()}>
            결과만 보고 계속
          </button>
        </div>
      </MatchReportCard>
    );
  }
  const answer = (accept: boolean) => {
    if (!bid) return;
    return decide(item, () => client.command({ type: 'respond-bid', id: bid.id, accept }));
  };
  // A window opening is routine club business: read it and go to the market, no ceremony.
  const showMarket = () => {
    void read(item);
    openMarket();
  };
  return (
    <aside
      data-surface="panel"
      key={item.id}
      ref={cardExit}
      className={`${s.card} ${inDesk ? s.inlineCard : ''}`}
      aria-label="이벤트"
      data-testid="event-card"
    >
      <header>
        <span className={s.kind}>{KIND_LABEL[item.kind]}</span>
      </header>
      <h3>{item.title}</h3>
      <p>{item.detail}</p>
      {bid && (
        <dl className={s.bid}>
          <div>
            <dt>선수</dt>
            <dd>{playerName(w, bid, market)}</dd>
          </div>
          <div>
            <dt>{bid.status === 'countered' ? '역제안 이적료' : '제안 이적료'}</dt>
            <dd>{format(bid.counterFee || bid.fee)}</dd>
          </div>
          {w.staff?.some((member) => member.person === bid.playerId) && (
            <div>
              <dt>코치 계약도 함께 종료</dt>
              <dd>
                기존 계약 종료 비용{' '}
                {format(
                  releaseCost(
                    w,
                    w.staff.find((member) => member.person === bid.playerId),
                  ),
                )}
              </dd>
            </div>
          )}
          {bid.club && (
            <div>
              <dt>상대 구단</dt>
              <dd>{w.clubs.find((c) => c.id === bid.club)?.name}</dd>
            </div>
          )}
        </dl>
      )}
      <div className={s.actions}>
        {bid?.direction === 'in' && bid.status === 'pending' ? (
          <>
            <button
              data-ui="primary"
              className={s.primary}
              disabled={acting}
              onClick={() => void answer(true)}
            >
              수락하고 매각
            </button>
            <button disabled={acting} onClick={() => void answer(false)}>
              거절
            </button>
          </>
        ) : bid?.direction === 'out' && bid.status === 'countered' ? (
          <>
            <button
              data-ui="primary"
              className={s.primary}
              disabled={acting}
              onClick={() => void answer(true)}
            >
              역제안 수락
            </button>
            <button disabled={acting} onClick={() => void answer(false)}>
              거절
            </button>
          </>
        ) : item.kind === 'window-open' ? (
          <>
            <button data-ui="primary" className={s.primary} disabled={acting} onClick={showMarket}>
              이적시장 보기
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'cup' ? (
          <>
            <button
              data-ui="primary"
              className={s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                setPage('europe');
              }}
            >
              대진표 보기
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'youth-intake' ? (
          <>
            <button
              data-ui="primary"
              className={s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                openTraining('academy');
              }}
            >
              유소년 보기
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : (
          <button
            data-ui="primary"
            className={s.primary}
            disabled={acting}
            onClick={() => void decide(item)}
          >
            확인
          </button>
        )}
      </div>
    </aside>
  );
});

export const KIND_LABEL: Record<InboxItem['kind'], string> = {
  match: '경기',
  'window-open': '이적시장 개장',
  'window-close': '이적시장 마감',
  'bid-response': '이적 협상',
  'incoming-bid': '영입 제안 받음',
  'youth-intake': '유소년 입단',
  'staff-report': '스태프 보고',
  'staff-renewal': '스태프 재계약',
  cup: '컵 대진',
  finance: '자금·후원',
  'contract-talk': '계약 협상',
  unhappy: '언해피',
  'transfer-request': '이적 요청',
  'sponsor-ending': '후원 계약 만료',
};

/** When a system notification arrived, in this browser's time. */
const arrived = (at: number) =>
  new Date(at).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const unreadItems = (items: readonly { read?: boolean }[]) =>
  items.filter((item) => !item.read).length;

/** The clock entry shares the global dialog and its notification/news counts. */
export function CommunicationsButton({ className = '' }: { className?: string }) {
  const w = useGameState((state) => state.view?.world);
  const notices = useNotifications((items) => items);
  const fresh = useUnreadNewsCount();
  const show = useNewsSheet((state) => state.show);
  if (!w) return null;
  const total = unreadItems(w.inbox || []) + unreadItems(notices) + fresh;
  return (
    <button
      type="button"
      className={`${newsStyle.launcher} ${className}`}
      data-testid="communications-button"
      aria-haspopup="dialog"
      aria-label={`알림·뉴스${total ? ` · 새 소식 ${total}개` : ''}`}
      onClick={(event) => {
        event.currentTarget.focus();
        show('notifications');
      }}
    >
      <PixelIcon name="bell" size={20} />
      {total > 0 && (
        <b data-ui="count" aria-hidden="true">
          {total > 99 ? '99+' : total}
        </b>
      )}
    </button>
  );
}

/** One dialog host for club decisions, system notifications and full-career news. */
export function CommunicationsCenter({ client }: { client: GameClient }) {
  const w = useGameState((state) => state.view?.world);
  const inbox = w?.inbox;
  const { open, tab, show, hide } = useNewsSheet();
  const news = useClubNews();
  const fresh = useUnreadNewsCount();
  const id = useId();
  useEffect(() => () => hide(), [hide]);
  const notices = useNotifications((items) => items);
  const items = [...(inbox || [])].reverse();
  const system = [...notices].reverse();
  const worldUnread = unreadItems(items);
  const unread = worldUnread + unreadItems(system);
  if (!w) return null;
  const leaveTab = () => {
    if (tab === 'news') markNewsSeen(w.id, news);
    else notificationStore.read();
  };
  const close = () => {
    leaveTab();
    hide();
  };
  const selectTab = (next: NewsTab) => {
    if (next === tab) return;
    leaveTab();
    show(next);
  };
  const tabs = [
    ['notifications', '알림·결정', unread],
    ['news', '뉴스', fresh],
  ] as const;
  const systemRow = (item: SystemNotification) => (
    <li key={item.id} className={item.read ? undefined : s.unread}>
      <small>시스템 · {arrived(item.at)}</small>
      <b>{item.text}</b>
    </li>
  );
  return (
    <>
      {open && (
        <Dialog
          label="알림·뉴스"
          wide
          onClose={close}
          actions={
            <div className={s.inboxActions}>
              {tab === 'notifications' && (
                <button
                  disabled={!unread}
                  onClick={() => {
                    notificationStore.read();
                    if (worldUnread) void client.command({ type: 'read-inbox' });
                  }}
                >
                  모두 읽음
                </button>
              )}
              <button onClick={close}>닫기</button>
            </div>
          }
        >
          <TabList
            tabs={tabs.map(
              ([value, label, count]) =>
                [
                  value,
                  <>
                    {label}
                    {count > 0 && (
                      <span className={newsStyle.tabCount}>{count > 99 ? '99+' : count}</span>
                    )}
                  </>,
                ] as const,
            )}
            value={tab}
            onChange={selectTab}
            label="알림·뉴스 분류"
            idPrefix={id}
          />
          <TabPanel idPrefix={id} value={tab}>
            {tab === 'news' ? (
              <NewsList w={w} />
            ) : (
              <>
                <NewsQuietToggle />
                {items.length || system.length ? (
                  <ul className={s.inbox}>
                    {system.filter((item) => !item.read).map(systemRow)}
                    {items.map((item) => (
                      <li key={item.id} className={item.read ? undefined : s.unread}>
                        <small>
                          {KIND_LABEL[item.kind]} · {item.year}/{String(item.year + 1).slice(2)} ·{' '}
                          {item.day}일차
                        </small>
                        <b>{item.title}</b>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                    {system.filter((item) => item.read).map(systemRow)}
                  </ul>
                ) : (
                  <p className={s.empty}>아직 소식이 없어요.</p>
                )}
              </>
            )}
          </TabPanel>
        </Dialog>
      )}
    </>
  );
}
