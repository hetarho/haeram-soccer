import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { orderIds, ownDivisionRound, ownLeague, ownLeagueIds, ownLeagueProgress } from './league';
import { leagueName } from './LeaguePicker';
import { competitionLabel } from './format';
import { QuickActions } from './QuickActions';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { openCupSeason, openPrimary, useNavigation } from './state';
import { stoppingEvents } from '../runtime/progression';
import { eventDesk } from './eventRouting';
import { currentCupBriefings } from './competitionNavigation';
import { ClubLink } from './ClubLink';
import { StrategyPanel } from './LazyStrategyPanel';
import { Dialog } from './Dialog';
import s from './ClubHub.module.css';
import { FacilityArt } from './FacilityArt';
import { Card } from './Card';
import { PixelIcon } from './PixelIcon';
import { HomeAwayBadge } from './HomeAwayBadge';

export function NextMatchCard({ w, onPrepare }: { w: World; onPrepare: () => void }) {
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (c) => c.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  return (
    <section className={s.fixture} aria-label="다음 경기" data-home-part="fixture">
      <div className={s.fixtureInfo}>
        {/* The competition sits beside the title; opponent, venue and report share one row. */}
        <div className={s.fixtureHead}>
          <h2 className={s.fixtureTitle}>NEXT MATCH</h2>
          {next && <span className={s.fixtureTag}>{competitionLabel(w, next)}</span>}
        </div>
        <div className={s.fixtureRow}>
          <h3>
            {opponent ? (
              <>
                vs <ClubLink w={w} id={opponent.id} crest={18} large />
              </>
            ) : (
              <span>다음 시즌을 준비해요</span>
            )}
          </h3>
          {next && <HomeAwayBadge side={next.home === w.playerClub ? 'home' : 'away'} />}
          <button
            className={s.prepare}
            data-ui="primary"
            aria-haspopup="dialog"
            disabled={!!w.critical}
            onClick={(event) => {
              event.currentTarget.focus();
              onPrepare();
            }}
          >
            상세 리포트
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The owner's office (→WEB-10/11): its room art, dimmed, with the owner's quick actions in small
 * tiles over it. Office work waiting for the owner shows its count in the caption, and the office
 * — the team's state, the rooms and every view and setting — opens from there.
 */
function OfficeScene({ w, children }: { w: World; children: ReactNode }) {
  const pending = stoppingEvents(w).filter((item) => !!eventDesk(item)).length;
  return (
    <section className={s.office} data-home-part="office" aria-label="구단주 사무실">
      <FacilityArt kind="manager" world={w} className={s.officeArt} />
      <div className={s.officeShade} aria-hidden="true" />
      <div className={s.officeCaption}>
        <b>구단주 사무실</b>
        <span>
          결재 대기{' '}
          {pending > 0 ? (
            <b data-ui="count" className={s.officeCount}>
              {pending > 99 ? '99+' : pending}
            </b>
          ) : (
            '0'
          )}
          건
        </span>
        <button
          type="button"
          data-ui="primary"
          className={s.officeEnter}
          onClick={() => openPrimary('business')}
        >
          들어가기
        </button>
      </div>
      {children}
    </section>
  );
}

export function CupBriefing({ w, onOpen }: { w: World; onOpen?: () => void }) {
  return (
    <section className={s.competitions} aria-label="현재 컵 대회">
      {currentCupBriefings(w).map((cup) => (
        <Card
          key={cup.key}
          title={cup.name}
          meta={<PixelIcon name="cup" size={28} />}
          actions={
            <button
              data-ui="secondary"
              aria-label={`${cup.name} 현재 대회 보기`}
              onClick={() => {
                onOpen?.();
                openCupSeason(w.year, cup.key, w.year);
              }}
            >
              대회 보기 ↗
            </button>
          }
        >
          <strong>{cup.status}</strong>
          {cup.detail && <p>{cup.detail}</p>}
          {cup.winner && <p>{cup.winner}</p>}
        </Card>
      ))}
    </section>
  );
}

/**
 * Where this season stands (→WEB-11): our division's round, our rank and the record change only
 * when a round is played, so they read together above the season-progress rule. Only the card
 * on screen carries the round's test ids. The card only reads; the links below open the league
 * and the cups.
 */
export function SeasonCard({ w, active }: { w: World; active: boolean }) {
  const table = w.tables[w.playerClub];
  const ids = orderIds(ownLeagueIds(w), w.tables),
    played = !!table?.played,
    rank = ids.indexOf(w.playerClub) + 1;
  const round = ownDivisionRound(w);
  const cupCount = currentCupBriefings(w).filter((cup) => cup.active).length;
  // Home content skips day-only changes; progress reads the shown world so it moves every day.
  const progress = useGameState((state) => ownLeagueProgress(state.view?.world ?? w));
  return (
    <section className={s.seasonCard} data-home-part="season-card" aria-label="이번 시즌">
      <div className={s.seasonSummary}>
        <span className={s.groupTitle} data-home-part="season-group">
          {leagueName(ownLeague(w), w.lower)}
        </span>
        <span className={s.groupTitle} data-home-part="season-group" aria-hidden="true">
          컵
        </span>
        <div className={s.resources} data-home-part="season-stats">
          <div aria-label={`우리 리그 ${round.total}라운드 중 ${round.played}라운드`}>
            <span>라운드</span>
            <b>
              <span
                key={round.played}
                className={s.bump}
                data-testid={active ? 'game-round' : undefined}
              >
                {round.played}
              </span>
              <small data-testid={active ? 'game-round-total' : undefined}>/ {round.total}</small>
            </b>
          </div>
          <div>
            <span>리그 순위</span>
            <b data-testid="hub-rank">
              <span key={played ? rank : '-'} className={s.bump}>
                {played ? rank : '—'}
              </span>
              <small>/{ids.length}위</small>
            </b>
          </div>
          <div>
            <span>승점 {table?.points ?? 0}</span>
            <b data-testid="hub-record">
              <span key={table ? table.played : 0} className={s.bump}>
                {table ? `${table.won}-${table.drawn}-${table.lost}` : '0-0-0'}
              </span>
            </b>
          </div>
        </div>
        <div className={s.cupSummary} data-home-part="cup-summary">
          <span>컵대회</span>
          <b>
            {cupCount}
            <small>개</small>
          </b>
        </div>
        <div className={s.seasonMeter} data-home-part="season-meter">
          <span>
            리그 진행률 <b>{progress.toFixed(1)}%</b>
          </span>
          <progress aria-label="리그 진행률" value={progress} max={100} />
        </div>
      </div>
    </section>
  );
}

export function ClubHub({ w, client }: { w: World; client: GameClient }) {
  // Home stays mounted while hidden: only leaving it matters, not moves between other pages.
  const away = useNavigation((state) => state.page !== 'dashboard');
  const [preparing, setPreparing] = useState(false);
  const [cupsOpen, setCupsOpen] = useState(false);
  useEffect(() => {
    if (away && (preparing || cupsOpen)) {
      setPreparing(false);
      setCupsOpen(false);
    }
  }, [away, preparing, cupsOpen]);
  return (
    <section
      className={s.hub}
      data-testid="club-hub"
      data-home-active={!away}
      aria-label="클럽 키우기"
    >
      <SeasonCard w={w} active={!away} />
      <NextMatchCard w={w} onPrepare={() => setPreparing(true)} />
      <OfficeScene w={w}>
        <QuickActions w={w} client={client} />
      </OfficeScene>

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {cupsOpen && (
        <Dialog label="컵대회" wide onClose={() => setCupsOpen(false)}>
          <CupBriefing w={w} onOpen={() => setCupsOpen(false)} />
        </Dialog>
      )}
    </section>
  );
}
