import { useState } from 'react';
import type { InboxItem, TransferBid, World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { stoppingEvents, useProgression, type ProgressionController } from '../runtime/progression';
import { useNavigation, useSquadView } from './state';
import { money, kindLabel } from './format';
import { Dialog } from './Dialog';
import s from './EventCenter.module.css';
import { fadeOutOnRemove } from './motion';
import { TransferCeremony } from './TransferCeremony';
import { ClubCrest } from './ClubCrest';
import { watchNextMatch } from './watch';

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
 * Reading or answering an event lets the owner resume.
 */
export function EventCenter({
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
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const { stopOn, matchEve, running } = useProgression(controller, (state) => state);
  const { setPage } = useNavigation();
  const setSquadTab = useSquadView((state) => state.setTab);
  const [ceremony, setCeremony] = useState<InboxItem>();
  const [opened, setOpened] = useState<string>();
  if (ceremony && w)
    return (
      <TransferCeremony
        w={w}
        candidates={market.filter((offer) => offer.available).length}
        onEnter={() => {
          setCeremony(undefined);
          void read(ceremony);
          setPage('transfers');
        }}
        onClose={() => {
          setCeremony(undefined);
          void read(ceremony);
        }}
      />
    );
  if (!w || running) return null;
  const events = stoppingEvents(w, stopOn);
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
  const format = (value: string) => money(value, club.country, w.year);
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
          {home ? '홈' : '원정'} · {kindLabel[eve.kind] || eve.kind} · 선발과 전술은 스태프가
          준비해요.
        </p>
        <label className={s.skip}>
          <input
            type="checkbox"
            checked={!stopOn.match}
            onChange={(event) => controller.setStopOn('match', !event.target.checked)}
          />
          다음부터 경기는 안 보고 자동 진행
        </label>
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
  const answer = async (accept: boolean) => {
    if (!bid) return;
    await client.command({ type: 'respond-bid', id: bid.id, accept });
    await read(item);
  };
  // An opening window gets its full-screen moment before the market.
  const openMarket = () => setCeremony(item);
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
            <button className={s.primary} disabled={acting} onClick={openMarket}>
              이적 시장 열기 ✦
            </button>
            <button disabled={acting} onClick={() => void read(item)}>
              확인
            </button>
          </>
        ) : item.kind === 'finance' ? (
          <>
            <button
              className={s.primary}
              disabled={acting}
              onClick={() => {
                void read(item);
                setPage('business');
              }}
            >
              구단 운영 보기
            </button>
            <button disabled={acting} onClick={() => void read(item)}>
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
                setSquadTab('academy');
                setPage('squad');
              }}
            >
              유소년 보기
            </button>
            <button disabled={acting} onClick={() => void read(item)}>
              확인
            </button>
          </>
        ) : (
          <button className={s.primary} disabled={acting} onClick={() => void read(item)}>
            확인
          </button>
        )}
      </div>
    </aside>
  );
}

export const KIND_LABEL: Record<InboxItem['kind'], string> = {
  match: '경기',
  'window-open': '이적시장 개장',
  'window-close': '이적시장 마감',
  'bid-response': '이적 협상',
  'incoming-bid': '영입 제안 받음',
  'youth-intake': '유소년 입단',
  'staff-report': '스태프 보고',
  finance: '자금·후원',
};

/** HUD bell: every club event, newest first, readable at any time. */
export function InboxButton({ client }: { client: GameClient }) {
  const inbox = useGameState((state) => state.view?.world.inbox);
  const [open, setOpen] = useState(false);
  const items = [...(inbox || [])].reverse();
  const unread = items.filter((item) => !item.read).length;
  return (
    <>
      <button
        className={s.bell}
        aria-label={`소식함${unread ? ` · 읽지 않은 소식 ${unread}개` : ''}`}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 10a6 6 0 0 1 12 0c0 4.5 1.6 6.2 2.5 7H3.5c.9-.8 2.5-2.5 2.5-7z"
            fill="currentColor"
            fillOpacity="0.18"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M10 20a2.2 2.2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 && <b aria-hidden="true">{unread > 9 ? '9+' : unread}</b>}
      </button>
      {open && (
        <Dialog
          label="소식함"
          onClose={() => setOpen(false)}
          actions={
            <div className={s.inboxActions}>
              <button
                disabled={!unread}
                onClick={() => void client.command({ type: 'read-inbox' })}
              >
                모두 읽음
              </button>
              <button onClick={() => setOpen(false)}>닫기</button>
            </div>
          }
        >
          {items.length ? (
            <ul className={s.inbox}>
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
            </ul>
          ) : (
            <p className={s.empty}>아직 소식이 없어요.</p>
          )}
        </Dialog>
      )}
    </>
  );
}
