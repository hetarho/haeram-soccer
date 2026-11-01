import { useEffect, useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { orderIds, ownDivisionRound, ownLeague, ownLeagueIds, ownLeagueProgress } from './league';
import { leagueName } from './LeaguePicker';
import { competitionLabel } from './format';
import { QuickActions } from './QuickActions';
import { clubSituation } from './teamState';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { openCupSeason, openPrimary, useNavigation } from './state';
import { approvalRequests, overdueSummary } from '../runtime/progression';
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
 * The clubhouse's illustrated way into the owner office (→WEB-11/72): the manager-room art in its
 * reserved slot under a light shade, with the approvals that actually wait, the overdue ones among
 * them and 들어가기 as live text on top. The office holds the club summary and quick actions.
 */
export function OfficeEntrance({ w }: { w: World }) {
  const requests = approvalRequests(w);
  const pending = requests.length,
    overdue = overdueSummary(w, requests).overdue;
  return (
    <section className={s.office} data-home-part="office" aria-label="구단주 사무실">
      <FacilityArt kind="manager" world={w} className={s.officeArt} />
      <div className={s.officeShade} aria-hidden="true" />
      <div className={s.officeCaption}>
        <b>구단주 사무실</b>
        <span data-testid="office-waiting">
          결재 대기{' '}
          {pending > 0 ? (
            <b data-ui="count" className={s.officeCount}>
              {pending > 99 ? '99+' : pending}
            </b>
          ) : (
            '0'
          )}
          건{overdue > 0 && <em className={s.officeLate}> · 지연 {overdue}건</em>}
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

/**
 * Where the club stands now (→WEB-44), beside the office's owner work and quieter than it:
 * strength and its place in our division, who can play, fatigue, 분위기 and the manager's
 * standing, with warnings in plain words. It only reads — no tile redirects anywhere; the quick
 * actions beside it answer it and the club sections hold the real workflows.
 */
export function ClubSituation({ w }: { w: World }) {
  return (
    <section className={s.situation} aria-label="클럽 현황" data-testid="club-situation">
      <dl>
        {clubSituation(w).map((fact) => (
          <div
            key={fact.key}
            data-ui="stat-tile"
            data-fact={fact.key}
            data-tone={fact.tone}
            className={s.fact}
          >
            <dt>{fact.label}</dt>
            <dd>
              <b>{fact.value}</b>
              <span className={s.factNote}>
                {fact.note}
                {fact.warning && (
                  <strong className={s.factWarning} data-testid={`situation-warning-${fact.key}`}>
                    {' · '}
                    {fact.warning}
                  </strong>
                )}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The office's supporting team content under its 결재함 (→WEB-39/44/107): the club summary, then
 * the owner's three quick actions in the office's compact band, so neither replaces the queue.
 */
export function OfficeTeam({ w, client }: { w: World; client: GameClient }) {
  return (
    <section className={s.team} aria-label="팀 현황" data-office-part="team">
      <ClubSituation w={w} />
      {/* The band keeps the themes' compact office tiles (→WEB-91). */}
      <div className={s.officeActions} data-home-part="office">
        <QuickActions w={w} client={client} />
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
      <OfficeEntrance w={w} />

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {cupsOpen && (
        <Dialog label="컵대회" wide onClose={() => setCupsOpen(false)}>
          <CupBriefing w={w} onOpen={() => setCupsOpen(false)} />
        </Dialog>
      )}
    </section>
  );
}
