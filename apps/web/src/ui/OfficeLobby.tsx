import { useState, type ReactNode } from 'react';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { World } from '../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import { activePlayers } from '../../../../packages/engine/src/player-state';
import type { GameClient } from '../runtime/client';
import { useLocale } from '../presentation/react';
import type { PixelIconName } from './PixelIcon';
import { ClubCrest } from './ClubCrest';
import { Dialog } from './Dialog';
import { eventDesk } from './eventRouting';
import { StrategyPanel } from './LazyStrategyPanel';
import { ROOMS } from './navigationTabs';
import { ApprovalTray, DeskBody, LobbyScene, LobbyStats } from './OfficeDesk';
import { officeFacts } from './officeSummary';
import { PixelIcon } from './PixelIcon';
import { BUSINESS_TABS, openPrimary, type BusinessView, type Page } from './state';
import { placeTraining } from './teamState';
import { TeamState } from './TeamStateTiles';
import o from './OfficeLobby.module.css';

const ICONS: Record<Exclude<BusinessView, 'identity'>, PixelIconName> = {
  players: 'people',
  staff: 'people',
  investment: 'star',
  sponsor: 'medal',
};

/** What stands in each of the clubhouse's rooms now, on its door. */
function roomFact(w: World, page: Page) {
  if (page === 'firstTeam') return `감독 ${w.manager.name} · 1군 ${activePlayers(w).length}명`;
  if (page === 'staff') return `스태프 ${w.staff?.length ?? 0}명`;
  if (page === 'training') return `1군 ${placeTraining(w, 'assistant').focus}`;
  return `유소년 ${w.academy?.players.length ?? 0}명`;
}

/**
 * The owner office's lobby (→WEB-39): the room, the waiting decisions on their ticket, the
 * office's figures, one door per desk with what stands there now, then the team's state and the
 * doors to the clubhouse's rooms. The clubhouse keeps only quick actions; everything that reads
 * or leads elsewhere opens from here.
 */
export function OfficeLobby({
  w,
  client,
  sponsors,
  pending = [],
  journal,
  onOpen,
  onOverview,
}: {
  w: World;
  client: GameClient;
  sponsors: readonly SponsorSlotView[];
  pending?: readonly StopReason[];
  journal?: ReactNode;
  onOpen: (view: BusinessView) => void;
  onOverview: () => void;
}) {
  const { t } = useLocale();
  const facts = officeFacts(w, sponsors, pending);
  const [journalOpen, setJournalOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  return (
    <section aria-label="구단주 사무실" data-testid="office-lobby">
      <DeskBody>
        <LobbyScene
          w={w}
          pending={pending}
          actions={
            <>
              {journal && (
                <button type="button" onClick={() => setJournalOpen(true)}>
                  클럽 소식·시즌 브리핑
                </button>
              )}
              <button type="button" data-ui="primary" aria-haspopup="dialog" onClick={onOverview}>
                결재라인 모아보기
              </button>
            </>
          }
        />
        <ApprovalTray w={w} items={pending} />
        <LobbyStats w={w} sponsors={sponsors} pending={pending} />
        <ul className={o.areas} aria-label="사무실 업무">
          {BUSINESS_TABS.map(([view, label]) => {
            const waiting = pending.filter((item) => eventDesk(item) === view).length;
            return (
              <li key={view}>
                <button
                  type="button"
                  className={o.area}
                  data-office-area={view}
                  aria-label={label}
                  aria-describedby={`office-fact-${view}`}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    onOpen(view);
                  }}
                >
                  <span className={o.icon} data-desk-icon={view} aria-hidden="true">
                    {view === 'identity' ? (
                      <ClubCrest w={w} id={w.playerClub} size={44} />
                    ) : (
                      <PixelIcon name={ICONS[view]} size={28} />
                    )}
                  </span>
                  <b className={o.label}>{label}</b>
                  <small id={`office-fact-${view}`} className={o.fact}>
                    {view === 'identity' ? '엠블럼과 유니폼' : facts[view]}
                  </small>
                  {waiting > 0 && (
                    <b data-ui="count" className={o.count} aria-hidden="true">
                      {waiting > 99 ? '99+' : waiting}
                    </b>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <TeamState w={w} client={client} onPrepare={() => setPreparing(true)} />
        <nav className={o.rooms} aria-label="클럽하우스 시설">
          {ROOMS.map(([page, label]) => (
            <button
              key={page}
              type="button"
              className={o.room}
              data-ui="place"
              data-place={page}
              aria-label={t(label)}
              aria-describedby={`room-fact-${page}`}
              onClick={() => openPrimary(page)}
            >
              <span>{t(label)}</span>
              <small id={`room-fact-${page}`}>{roomFact(w, page)}</small>
            </button>
          ))}
        </nav>
      </DeskBody>
      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
    </section>
  );
}
