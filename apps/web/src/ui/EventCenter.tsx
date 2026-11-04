import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayLocale, displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { eventDesk } from './eventRouting';
import { careerEnded } from '../../../../packages/contracts/src/owner';
import { PixelIcon } from './PixelIcon';
import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type {
  InboxItem,
  Player,
  TransferBid,
  World,
} from '../../../../packages/contracts/src/types';
import { seasonDate, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { POSITION_LABEL } from '../../../../packages/engine/src/player';
import { clubOf, overall } from '../../../../packages/engine/src/player-state';
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
import { bidPlayer, bidTerms } from './bidFacts';
import { contractLine } from './format';
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

/**
 * What a bid's review needs before an answer (→WEB-39/43): the actual player — ours for an offer
 * we received, the one our bid pinned otherwise — with his position, age and ability, the fees on
 * the table and only the contract terms the bid itself carries. Unknown facts say so or stay out.
 */
function BidFacts({
  w,
  bid,
  market,
  format,
}: {
  w: World;
  bid: TransferBid;
  market: readonly { player: Player }[];
  format: (value: string) => ReactNode;
}) {
  useTextLocale();
  const found = bidPlayer(w, bid, market);
  const player = found?.player;
  const terms = bidTerms(bid, found);
  const club = bid.club && w.clubs.find((c) => c.id === bid.club)?.name;
  const coach = w.staff?.find((member) => member.person === bid.playerId);
  const kind = bid.loan
    ? sourceMessage('copy.EventCenter.0339ce3889')
    : sourceMessage('copy.EventCenter.e2d73c6cf3');
  return (
    <dl className={s.bid} data-testid="bid-facts">
      <div>
        <dt>
          {localizeValue(
            bid.direction === 'in'
              ? sourceMessage('copy.EventCenter.45d9ddc729')
              : bid.loan
                ? sourceMessage('copy.EventCenter.98b93050a6')
                : sourceMessage('copy.EventCenter.42bd764e17'),
          )}
        </dt>
        <dd>{localizeValue(player?.name ?? sourceMessage('copy.EventCenter.5a281e7e95'))}</dd>
      </div>
      {localizeValue(
        player && (
          <>
            <div>
              <dt>{richMessage('copy.EventCenter.6a43be732f')}</dt>
              <dd>
                {richMessage('copy.EventCenter.3c3009e927', {
                  p0: player.position,
                  p1: POSITION_LABEL[player.position],
                  p2: w.year - player.born,
                })}
              </dd>
            </div>
            <div>
              <dt>{richMessage('team.column.ability')}</dt>
              <dd>
                {richMessage('copy.EventCenter.7c888e21c3', {
                  p0: overall(player),
                  p1: Math.round(player.potential),
                })}
              </dd>
            </div>
          </>
        ),
      )}
      {localizeValue(
        club && (
          <div>
            <dt>
              {localizeValue(
                bid.direction === 'in'
                  ? sourceMessage('copy.EventCenter.d1629d82d8')
                  : sourceMessage('copy.EventCenter.9f6c4f2aa5'),
              )}
            </dt>
            <dd>{localizeValue(club)}</dd>
          </div>
        ),
      )}
      <div>
        <dt>
          {localizeValue(
            bid.direction === 'in'
              ? sourceMessage('copy.EventCenter.73b1291c8c', { p0: kind })
              : sourceMessage('copy.EventCenter.de2833c583', { p0: kind }),
          )}
        </dt>
        <dd>{localizeValue(format(bid.fee))}</dd>
      </div>
      {localizeValue(
        bid.status === 'countered' && bid.counterFee && (
          <div>
            <dt>{richMessage('copy.EventCenter.14e1931a6f', { p0: kind })}</dt>
            <dd>{localizeValue(format(bid.counterFee))}</dd>
          </div>
        ),
      )}
      {localizeValue(
        terms && (
          <div>
            <dt>
              {localizeValue(
                bid.direction === 'in'
                  ? sourceMessage('copy.EventCenter.eaaf99213b')
                  : bid.loan
                    ? sourceMessage('copy.EventCenter.4e9a821c8e')
                    : sourceMessage('copy.EventCenter.3ef0119d85'),
              )}
            </dt>
            <dd>
              {localizeValue(format(terms.wage))}
              {localizeValue(
                terms.until !== undefined && ` · ${contractLine(terms.until, w.year)}`,
              )}
            </dd>
          </div>
        ),
      )}
      {localizeValue(
        coach && (
          <div>
            <dt>{richMessage('copy.EventCenter.0589f4351f')}</dt>
            <dd>
              {richMessage('copy.EventCenter.04ed038fad', { p0: format(releaseCost(w, coach)) })}
            </dd>
          </div>
        ),
      )}
    </dl>
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
  useTextLocale();
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
  // Only observations stop the clock; approvals wait in the office's 결재함 (→WEB-42/100).
  const events =
    w && !running ? stoppingEvents(w).filter((item) => !resume || item.kind !== 'match') : [];
  const key = w ? `${w.id}:${seasonDate(w)}` : '';
  const date = w ? seasonDate(w) : '';
  const eve = !resume && !running && w && !!pendingMatchReport(w);
  const eveKey = eve ? key : undefined;
  const resumeKey = w && resume ? `${w.id}:watch:${resume.record.id}` : undefined;
  const resumeOpen = !!resumeKey && opened === resumeKey;
  const acting = useGameState(gameActionsBlocked);
  // The day the match-eve report was last off: turning it on during the eve itself leaves the
  // report behind its pill instead of opening it over the office.
  const reportOn = !!w && settingsOf(w).observations.matchEve;
  const quietDay = useRef<string>(undefined);
  useEffect(() => setOpened(undefined), [page]);
  useEffect(() => {
    const requested = eventRequest !== previousRequest.current;
    previousRequest.current = eventRequest;
    if (eveKey && (requested || eveKey !== quietDay.current)) setOpened(eveKey);
    else if (resumeKey && requested) setOpened(resumeKey);
  }, [eveKey, resumeKey, eventRequest]);
  useEffect(() => {
    if (!reportOn) quietDay.current = key;
  }, [reportOn, key]);
  if (!w || page === 'business' || running || (!events.length && !resumeOpen)) return null;
  const inDialog = compact || eve || resumeOpen;
  const label = resumeOpen
    ? sourceMessage('copy.EventCenter.a2816ca124')
    : eve
      ? 'NEXT MATCH'
      : sourceMessage('copy.EventCenter.bdc87bfe71', { p0: date });
  if (inDialog && opened !== key && !resumeOpen) {
    const manualMatch = eve && settingsOf(w).mode === 'manual';
    const entries = manualMatch ? events.filter((item) => item.kind !== 'match') : events;
    if (!entries.length) return null;
    return (
      <button
        className={s.pill}
        data-testid="event-pill"
        data-event-access
        aria-label={localizeValue(
          eve && !manualMatch
            ? sourceMessage('copy.EventCenter.a13f62fd9b', { p0: date })
            : sourceMessage('copy.EventCenter.86a0fba99b', { p0: entries.length, p1: date }),
        )}
        onClick={() => setOpened(key)}
      >
        <i aria-hidden="true">{localizeValue(entries.length)}</i>
        <span>
          {localizeValue(
            eve && !manualMatch
              ? sourceMessage('copy.EventCenter.9d0e268540')
              : sourceMessage('copy.EventCenter.bdc87bfe71', { p0: date }),
          )}
        </span>
      </button>
    );
  }
  const content = (
    <div className={s.group} data-testid="event-group">
      <div className={s.groupHead}>
        <h2>
          {localizeValue(date)} ·{localizeValue(' ')}
          {localizeValue(
            resumeOpen
              ? sourceMessage('copy.EventCenter.81de44b7c6')
              : eve
                ? sourceMessage('copy.EventCenter.79ef403fdd')
                : sourceMessage('copy.EventCenter.32ee84213b', { p0: events.length }),
          )}
        </h2>
        {/* The match eve card names its responsibility entry itself. */}
        {localizeValue(
          !eve && !resumeOpen && (
            <button
              data-ui="link"
              type="button"
              className={s.groupOffice}
              onClick={openOwnerOffice}
            >
              {richMessage('copy.EventCenter.f9197ab2f6')}
            </button>
          ),
        )}
      </div>
      {localizeValue(
        resumeOpen && resume && (
          <MatchReportCard w={w} fixture={resume.record} continuing>
            <div className={s.actions}>
              <button
                data-ui="primary"
                className={s.primary}
                aria-label={displayMessage('copy.EventCenter.a2816ca124')}
                disabled={acting || !!w.critical || careerEnded(w)}
                onClick={() => setPage('match')}
              >
                {richMessage('copy.EventCenter.3a6ad769cf', {
                  p0: <PixelIcon name="play" size={16} />,
                })}
              </button>
            </div>
          </MatchReportCard>
        ),
      )}
      {localizeValue(
        events.map((item) => (
          <EventCard key={item.id} client={client} controller={controller} item={item} />
        )),
      )}
    </div>
  );
  return inDialog ? (
    <Dialog label={localizeValue(label)} onClose={() => setOpened(undefined)}>
      {localizeValue(content)}
    </Dialog>
  ) : (
    <section
      className={s.eventGroup}
      aria-label={localizeValue(
        eve ? 'NEXT MATCH' : sourceMessage('copy.EventCenter.bdc87bfe71', { p0: date }),
      )}
    >
      {localizeValue(content)}
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
  useTextLocale();
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
  const subject = bid && bidPlayer(w, bid, market)?.player.name;
  const desk = eventDesk(item);
  if (!inDesk && desk)
    return (
      <aside
        data-surface="panel"
        className={s.card}
        aria-label={displayMessage('copy.EventCenter.46b289bb0a')}
        data-testid="event-card"
        data-request-id={item.id}
      >
        <header>
          <span className={s.kind}>{localizeValue(KIND_LABEL[item.kind])}</span>
        </header>
        <h3>{localizeValue(item.title)}</h3>
        <p>{richMessage('copy.EventCenter.8636d18c67', { p0: subject && `${subject} · ` })}</p>
        <button
          data-ui="primary"
          onClick={() => {
            if (gameStore.getSnapshot().view?.world.id === w.id) openApprovalRequest(w.id, item);
          }}
        >
          {richMessage('copy.EventCenter.26985bcf98')}
        </button>
      </aside>
    );
  const next = nextOwnFixture(w);
  const eve = item.kind === 'match' && next?.id === item.ref ? next : undefined;
  const club = clubOf(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  if (eve) {
    const watch = () => {
      controller.clearMatchEve();
      return watchNextMatch(client, controller, () => setPage('match'), { fromEve: true });
    };
    return (
      <MatchReportCard w={w} fixture={eve} ref={cardExit}>
        <button data-ui="link" type="button" className={s.stops} onClick={openOwnerOffice}>
          {richMessage('copy.EventCenter.f9197ab2f6')}
        </button>
        <div className={s.actions}>
          <button
            data-ui="primary"
            className={s.primary}
            disabled={acting}
            onClick={() => void watch()}
          >
            {richMessage('copy.EventCenter.b451a320e0')}
          </button>
          <button disabled={acting} onClick={() => controller.playThrough()}>
            {richMessage('copy.EventCenter.a19c26d18e')}
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
      aria-label={displayMessage('copy.EventCenter.46b289bb0a')}
      data-testid="event-card"
    >
      <header>
        <span className={s.kind}>{localizeValue(KIND_LABEL[item.kind])}</span>
      </header>
      {/* In a review the request host already carries its heading and any distinct detail. */}
      {localizeValue(
        !inDesk && (
          <>
            <h3>{localizeValue(item.title)}</h3>
            <p>{localizeValue(item.detail)}</p>
          </>
        ),
      )}
      {localizeValue(bid && <BidFacts w={w} bid={bid} market={market} format={format} />)}
      <div className={s.actions}>
        {localizeValue(
          bid?.direction === 'in' && bid.status === 'pending' ? (
            <>
              <button
                data-ui="primary"
                className={s.primary}
                disabled={acting}
                onClick={() => void answer(true)}
              >
                {richMessage('copy.EventCenter.c62a0bc221')}
              </button>
              <button disabled={acting} onClick={() => void answer(false)}>
                {richMessage('copy.EventCenter.cc6314d04d')}
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
                {richMessage('copy.EventCenter.30507fedcc')}
              </button>
              <button disabled={acting} onClick={() => void answer(false)}>
                {richMessage('copy.EventCenter.cc6314d04d')}
              </button>
            </>
          ) : item.kind === 'window-open' ? (
            <>
              <button
                data-ui="primary"
                className={s.primary}
                disabled={acting}
                onClick={showMarket}
              >
                {richMessage('copy.EventCenter.bff84e4f71')}
              </button>
              <button disabled={acting} onClick={() => void decide(item)}>
                {richMessage('copy.stories.1aacb54c49')}
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
                {richMessage('copy.EventCenter.a43e9d9aaa')}
              </button>
              <button disabled={acting} onClick={() => void decide(item)}>
                {richMessage('copy.stories.1aacb54c49')}
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
                {richMessage('copy.EventCenter.ba42b0a358')}
              </button>
              <button disabled={acting} onClick={() => void decide(item)}>
                {richMessage('copy.stories.1aacb54c49')}
              </button>
            </>
          ) : (
            <button
              data-ui="primary"
              className={s.primary}
              disabled={acting}
              onClick={() => void decide(item)}
            >
              {richMessage('copy.stories.1aacb54c49')}
            </button>
          ),
        )}
      </div>
    </aside>
  );
});

export const KIND_LABEL: Record<InboxItem['kind'], string> = {
  match: sourceMessage('copy.LabPage.e56314e9a1'),
  'window-open': sourceMessage('copy.EventCenter.30b1854ab5'),
  'window-close': sourceMessage('copy.EventCenter.bbe12e5dd9'),
  'bid-response': sourceMessage('copy.EventCenter.89993bb226'),
  'incoming-bid': sourceMessage('copy.EventCenter.fe04ea4908'),
  'youth-intake': sourceMessage('copy.EventCenter.392f318064'),
  'staff-report': sourceMessage('copy.EventCenter.befaa70d33'),
  'staff-renewal': sourceMessage('copy.EventCenter.01c7790b2b'),
  cup: sourceMessage('copy.EventCenter.3f616cbe2c'),
  finance: sourceMessage('copy.EventCenter.d97cf74912'),
  'contract-talk': sourceMessage('copy.ClubStaff.5ca939d3e3'),
  unhappy: sourceMessage('team.unhappy'),
  'transfer-request': sourceMessage('copy.EventCenter.e389075954'),
  'sponsor-ending': sourceMessage('copy.EventCenter.6e8a7a9f3e'),
};

/** When a system notification arrived, in this browser's time. */
const arrived = (at: number) =>
  new Date(at).toLocaleString(displayLocale(), {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const unreadItems = (items: readonly { read?: boolean }[]) =>
  items.filter((item) => !item.read).length;

/** The clock entry shares the global dialog and its notification/news counts. */
export function CommunicationsButton({ className = '' }: { className?: string }) {
  useTextLocale();
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
      aria-label={displayMessage('copy.EventCenter.24e54ae153', {
        p0: total ? sourceMessage('copy.EventCenter.5d21127dfe', { p0: total }) : '',
      })}
      onClick={(event) => {
        event.currentTarget.focus();
        show('notifications');
      }}
    >
      <PixelIcon name="bell" size={20} />
      {localizeValue(
        total > 0 && (
          <b data-ui="count" aria-hidden="true">
            {localizeValue(total > 99 ? '99+' : total)}
          </b>
        ),
      )}
    </button>
  );
}

/** One dialog host for club decisions, system notifications and full-career news. */
export function CommunicationsCenter({ client }: { client: GameClient }) {
  useTextLocale();
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
    ['notifications', sourceMessage('copy.EventCenter.9335730d68'), unread],
    ['news', sourceMessage('copy.EventCenter.5ac661dbed'), fresh],
  ] as const;
  const systemRow = (item: SystemNotification) => (
    <li key={item.id} className={item.read ? undefined : s.unread}>
      <small>{richMessage('copy.EventCenter.c69b0b01fd', { p0: arrived(item.at) })}</small>
      <b>{localizeValue(item.text)}</b>
    </li>
  );
  return (
    <>
      {localizeValue(
        open && (
          <Dialog
            label={displayMessage('shell.news')}
            wide
            onClose={close}
            actions={
              <div className={s.inboxActions}>
                {localizeValue(
                  tab === 'notifications' && (
                    <button
                      disabled={!unread}
                      onClick={() => {
                        notificationStore.read();
                        if (worldUnread) void client.command({ type: 'read-inbox' });
                      }}
                    >
                      {richMessage('copy.EventCenter.6577bbbb8c')}
                    </button>
                  ),
                )}
                <button onClick={close}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
              </div>
            }
          >
            <TabList
              tabs={tabs.map(
                ([value, label, count]) =>
                  [
                    value,
                    <>
                      {localizeValue(label)}
                      {localizeValue(
                        count > 0 && (
                          <span className={newsStyle.tabCount}>
                            {localizeValue(count > 99 ? '99+' : count)}
                          </span>
                        ),
                      )}
                    </>,
                  ] as const,
              )}
              value={tab}
              onChange={selectTab}
              label={displayMessage('copy.EventCenter.9535d265f2')}
              idPrefix={id}
            />
            <TabPanel idPrefix={id} value={tab}>
              {localizeValue(
                tab === 'news' ? (
                  <NewsList key={w.id} w={w} client={client} />
                ) : (
                  <>
                    <NewsQuietToggle />
                    {localizeValue(
                      items.length || system.length ? (
                        <ul className={s.inbox}>
                          {localizeValue(system.filter((item) => !item.read).map(systemRow))}
                          {localizeValue(
                            items.map((item) => (
                              <li key={item.id} className={item.read ? undefined : s.unread}>
                                <small>
                                  {richMessage('copy.EventCenter.9f4253bd50', {
                                    p0: KIND_LABEL[item.kind],
                                    p1: item.year,
                                    p2: String(item.year + 1).slice(2),
                                    p3: ' ',
                                    p4: item.day,
                                  })}
                                </small>
                                <b>{localizeValue(item.title)}</b>
                                <span>{localizeValue(item.detail)}</span>
                              </li>
                            )),
                          )}
                          {localizeValue(system.filter((item) => item.read).map(systemRow))}
                        </ul>
                      ) : (
                        <p className={s.empty}>{richMessage('copy.EventCenter.421e08988c')}</p>
                      ),
                    )}
                  </>
                ),
              )}
            </TabPanel>
          </Dialog>
        ),
      )}
    </>
  );
}
