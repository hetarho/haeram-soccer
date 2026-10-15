import { PixelIcon } from './PixelIcon';
import { memo, useState } from 'react';
import type {
  InboxItem,
  InboxKind,
  TransferBid,
  World,
} from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import { talkFor } from '../../../../packages/engine/src/contracts';
import { isExpiring } from '../../../../packages/engine/src/staff';
import { managerRenewal } from '../../../../packages/engine/src/operations';
import { managerTerm } from '../../../../packages/engine/src/styles';
import type { GameClient } from '../runtime/client';
import {
  notificationStore,
  useGameState,
  useNotifications,
  type SystemNotification,
} from '../runtime/store';
import { stoppingEvents, useProgression, type ProgressionController } from '../runtime/progression';
import {
  openBusiness,
  openContractTalk,
  openMarket,
  openPeople,
  openTraining,
  useInterventionDialog,
  useNavigation,
} from './state';
import { competitionLabel } from './format';
import { Money } from './Money';
import { Dialog } from './Dialog';
import s from './EventCenter.module.css';
import { fadeOutOnRemove } from './motion';
import { ClubCrest } from './ClubCrest';
import { watchNextMatch } from './watch';
import { NewsQuietToggle } from './NewsFeed';

const cardExit = fadeOutOnRemove([
  { opacity: 1, transform: 'none' },
  { opacity: 0, transform: 'translateY(18px) scale(0.98)' },
]);

/** Items about a player's contract: a talk, his unhappiness, his transfer request. */
const PLAYER_KINDS: readonly InboxKind[] = ['contract-talk', 'unhappy', 'transfer-request'];
/** Sponsor reminders and contracts ending open 운영's 후원; other money items open 재정. */
const sponsorItem = (item: InboxItem) =>
  item.kind === 'sponsor-ending' || item.title.includes('후원');
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
  /** Away from home the card folds into a small pill until the owner opens it. */
  compact?: boolean;
}) {
  const w = useGameState((state) => state.view?.world);
  const market = useGameState((state) => state.view?.transfers) || [];
  const read = (item: InboxItem) => client.command({ type: 'read-inbox', id: item.id });
  /** The card's decision, after any command it takes: the event is read and the clock plays on. */
  const decide = async (item: InboxItem, action?: () => Promise<unknown>) => {
    await action?.();
    await read(item);
    controller.eventDecided();
  };
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const { matchEve, running } = useProgression(controller, (state) => state);
  const showLevels = useInterventionDialog((state) => state.show);
  const setPage = useNavigation((state) => state.setPage);
  const [opened, setOpened] = useState<string>();
  if (!w || running) return null;
  const events = stoppingEvents(w);
  const next = nextOwnFixture(w);
  const eve = matchEve && next?.id === matchEve ? next : undefined;
  if (!eve && !events.length) return null;
  const total = events.length + (eve ? 1 : 0);
  const key = eve?.id || events[0].id;
  if (compact && opened !== key)
    return (
      <button
        key={key}
        className={s.pill}
        data-testid="event-pill"
        aria-label={`이벤트 ${total}개 · ${eve ? '내일 경기' : events[0].title} · 열기`}
        onClick={() => setOpened(key)}
      >
        <i aria-hidden="true">{total}</i>
        <span>{eve ? '내일 경기' : KIND_LABEL[events[0].kind]}</span>
      </button>
    );
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  if (eve) {
    const home = eve.home === w.playerClub;
    const opponent = w.clubs.find((c) => c.id === (home ? eve.away : eve.home));
    const watch = () => {
      controller.clearMatchEve();
      return watchNextMatch(client, controller, () => setPage('match'), { fromEve: true });
    };
    return (
      <aside
        key={eve.id}
        ref={cardExit}
        className={s.card}
        aria-label="이벤트"
        data-testid="event-card"
      >
        <header>
          <span className={s.kind}>MATCH · 내일 경기</span>
          {total > 1 && <small>이벤트 {total}개</small>}
        </header>
        <h3>
          {opponent && <ClubCrest w={w} id={opponent.id} size={22} />}
          vs {opponent?.name}
        </h3>
        <p>
          {home ? '홈' : '원정'} · {competitionLabel(w, eve)} · 선발과 전술은 스태프가 준비해요.
        </p>
        <button type="button" className={s.stops} onClick={showLevels}>
          개입 수준
        </button>
        <div className={s.actions}>
          <button className={s.primary} disabled={acting} onClick={() => void watch()}>
            관전하기 ▶
          </button>
          <button disabled={acting} onClick={() => controller.playThrough()}>
            결과만 보고 계속
          </button>
        </div>
      </aside>
    );
  }
  const item = events[0];
  const bid = bidFor(w, item);
  // A talk still open, or an unhappy player's floor still to meet (→WEB-68).
  const talker = PLAYER_KINDS.includes(item.kind)
    ? w.players.find((p) => p.id === item.ref && p.status === 'active' && talkFor(w, p))
    : undefined;
  const expiring = (w.staff || []).filter((member) => isExpiring(w, member));
  // A firefighter's season-long deal can still be extended while it runs.
  const keepManager = managerTerm(w.manager) === 1 && !!managerRenewal(w);
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
      key={item.id}
      ref={cardExit}
      className={s.card}
      aria-label="이벤트"
      data-testid="event-card"
    >
      <header>
        <span className={s.kind}>{KIND_LABEL[item.kind]}</span>
        {total > 1 && <small>남은 이벤트 {total}개</small>}
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
            <button className={s.primary} disabled={acting} onClick={() => void answer(true)}>
              수락하고 매각
            </button>
            <button disabled={acting} onClick={() => void answer(false)}>
              거절
            </button>
          </>
        ) : bid?.direction === 'out' && bid.status === 'countered' ? (
          <>
            <button className={s.primary} disabled={acting} onClick={() => void answer(true)}>
              역제안 수락
            </button>
            <button disabled={acting} onClick={() => void answer(false)}>
              거절
            </button>
          </>
        ) : item.kind === 'window-open' ? (
          <>
            <button className={s.primary} disabled={acting} onClick={showMarket}>
              이적시장 보기
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'finance' || item.kind === 'sponsor-ending' ? (
          <>
            <button
              className={s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                openBusiness(sponsorItem(item) ? 'sponsor' : 'finance');
              }}
            >
              {sponsorItem(item) ? '후원 보기' : '재정 보기'}
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'staff-renewal' && item.ref === w.manager.id ? (
          <>
            {keepManager && (
              <button
                className={s.primary}
                disabled={acting}
                onClick={() => void decide(item, () => client.command({ type: 'renew-manager' }))}
              >
                감독 재계약
              </button>
            )}
            <button
              className={keepManager ? undefined : s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                openPeople('manager');
              }}
            >
              감독 보기
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'staff-renewal' ? (
          <>
            {expiring.length > 0 && (
              <button
                className={s.primary}
                disabled={acting}
                onClick={() =>
                  void decide(item, async () => {
                    for (const member of expiring)
                      await client.command({ type: 'renew-staff', role: member.role });
                  })
                }
              >
                모두 재계약
              </button>
            )}
            <button
              className={expiring.length ? undefined : s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                openPeople('coaches');
              }}
            >
              스태프 보기
            </button>
            {/* Each department's switch and criteria live in 사람's 코치진 (→WEB-43). */}
            <button
              disabled={acting}
              onClick={() => {
                void read(item);
                openPeople('coaches');
              }}
            >
              자동 결정 설정
            </button>
          </>
        ) : item.kind === 'cup' ? (
          <>
            <button
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
        ) : talker ? (
          <>
            <button
              className={s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                openContractTalk(talker.id);
              }}
            >
              {talker.talk ? '협상하기' : '하한 제시하기'}
            </button>
            <button disabled={acting} onClick={() => void decide(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'youth-intake' ? (
          <>
            <button
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
          <button className={s.primary} disabled={acting} onClick={() => void decide(item)}>
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

/**
 * HUD bell: every club event, newest first, readable at any time. The app's own notices join as
 * 시스템 (→WEB-66): unread ones lead, and seeing them in the opened inbox reads them.
 */
export function InboxButton({ client }: { client: GameClient }) {
  const inbox = useGameState((state) => state.view?.world.inbox);
  const notices = useNotifications((items) => items);
  const [open, setOpen] = useState(false);
  const items = [...(inbox || [])].reverse();
  const system = [...notices].reverse();
  const worldUnread = items.filter((item) => !item.read).length;
  const unread = worldUnread + system.filter((notice) => !notice.read).length;
  const close = () => {
    setOpen(false);
    notificationStore.read();
  };
  const systemRow = (item: SystemNotification) => (
    <li key={item.id} className={item.read ? undefined : s.unread}>
      <small>시스템 · {arrived(item.at)}</small>
      <b>{item.text}</b>
    </li>
  );
  return (
    <>
      <button
        className={s.bell}
        aria-label={`알림·결정${unread ? ` · 읽지 않은 소식 ${unread}개` : ''}`}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <PixelIcon name="bell" />
        {unread > 0 && <b aria-hidden="true">{unread > 9 ? '9+' : unread}</b>}
      </button>
      {open && (
        <Dialog
          label="알림·결정"
          onClose={close}
          actions={
            <div className={s.inboxActions}>
              <button
                disabled={!unread}
                onClick={() => {
                  notificationStore.read();
                  if (worldUnread) void client.command({ type: 'read-inbox' });
                }}
              >
                모두 읽음
              </button>
              <button onClick={close}>닫기</button>
            </div>
          }
        >
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
        </Dialog>
      )}
    </>
  );
}
