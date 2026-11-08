import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useEffect, useState } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import {
  orderIds,
  ownDivisionRound,
  ownLeague,
  ownLeagueIds,
  ownLeagueProgress,
} from '../../../entities/league';
import { leagueName } from '../../../entities/league';
import { competitionLabel } from '../../../presentation/format';
import { clubSituation } from '../../../entities/player';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { openCupSeason, openPrimary, useNavigation } from '../../../shared/routing/state';
import { approvalRequests, overdueSummary } from '../../../runtime/progression';
import { currentCupBriefings } from '../../../shared/routing/competitionNavigation';
import { ClubLink } from '../../../entities/club';
import { StrategyPanel } from '../../../features/match-prep';
import { Dialog } from '../../../shared/ui/Dialog';
import s from './ClubHub.module.css';
import { FacilityArt } from '../../../entities/office';
import { InvestmentGallery } from './InvestmentGallery';
import { Card } from '../../../shared/ui/Card';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { HomeAwayBadge } from '../../../shared/ui/HomeAwayBadge';

export function NextMatchCard({ w, onPrepare }: { w: World; onPrepare: () => void }) {
  useTextLocale();
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (c) => c.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  return (
    <section
      className={s.fixture}
      aria-label={displayMessage('copy.ClubHub.3bfd9db66e')}
      data-home-part="fixture"
    >
      <div className={s.fixtureInfo}>
        {/* The competition and venue sit beside the title; opponent and report share one row. */}
        <div className={s.fixtureHead}>
          <h2 className={s.fixtureTitle}>{richMessage('copy.ClubHub.c0ee2913e3')}</h2>
          {localizeValue(
            next && (
              <span className={s.fixtureTag}>{localizeValue(competitionLabel(w, next))}</span>
            ),
          )}
          {localizeValue(
            next && <HomeAwayBadge side={next.home === w.playerClub ? 'home' : 'away'} />,
          )}
        </div>
        <div className={s.fixtureRow}>
          <h3>
            {localizeValue(
              opponent ? (
                <>
                  {richMessage('copy.ClubHub.906befedbd', {
                    p0: <ClubLink w={w} id={opponent.id} crest={18} large />,
                  })}
                </>
              ) : (
                <span>{richMessage('copy.ClubHub.1015d8ff31')}</span>
              ),
            )}
          </h3>
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
            {richMessage('copy.ClubHub.f2bef7802a')}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The clubhouse's illustrated way into the owner office (→WEB-11/72): the manager-room art in its
 * reserved slot under a light shade, with the approvals that actually wait, the overdue ones among
 * them and 들어가기 as live text on top. The office holds the club summary.
 */
export function OfficeEntrance({ w }: { w: World }) {
  useTextLocale();
  const requests = approvalRequests(w);
  const pending = requests.length,
    overdue = overdueSummary(w, requests).overdue;
  return (
    <section
      className={s.office}
      data-home-part="office"
      aria-label={displayMessage('copy.catalog.9a8019d09c')}
    >
      <FacilityArt kind="manager" world={w} className={s.officeArt} />
      <div className={s.officeShade} aria-hidden="true" />
      <div className={s.officeCaption}>
        <b>{richMessage('copy.catalog.9a8019d09c')}</b>
        <span data-testid="office-waiting">
          {richMessage('copy.ClubHub.a51a602b0a', {
            p0: ' ',
            p1:
              pending > 0 ? (
                <b data-ui="count" className={s.officeCount}>
                  {localizeValue(pending > 99 ? '99+' : pending)}
                </b>
              ) : (
                '0'
              ),
            p2: overdue > 0 && (
              <em className={s.officeLate}>
                {richMessage('copy.ApprovalButtons.51598323eb', { p0: overdue })}
              </em>
            ),
          })}
        </span>
        <button
          type="button"
          data-ui="primary"
          className={s.officeEnter}
          onClick={() => openPrimary('business')}
        >
          {richMessage('copy.ClubHub.851ea8409a')}
        </button>
      </div>
    </section>
  );
}

export function CupBriefing({ w, onOpen }: { w: World; onOpen?: () => void }) {
  useTextLocale();
  return (
    <section className={s.competitions} aria-label={displayMessage('copy.ClubHub.1c4fa642c2')}>
      {localizeValue(
        currentCupBriefings(w).map((cup) => (
          <Card
            key={cup.key}
            title={localizeValue(cup.name)}
            meta={<PixelIcon name="cup" size={28} />}
            actions={
              <button
                data-ui="secondary"
                aria-label={displayMessage('copy.ClubHub.5d3690a8c5', { p0: cup.name })}
                onClick={() => {
                  onOpen?.();
                  openCupSeason(w.year, cup.key, w.year);
                }}
              >
                {richMessage('copy.ClubHub.c769579672')}
              </button>
            }
          >
            <strong>{localizeValue(cup.status)}</strong>
            {localizeValue(cup.detail && <p>{localizeValue(cup.detail)}</p>)}
            {localizeValue(cup.winner && <p>{localizeValue(cup.winner)}</p>)}
          </Card>
        )),
      )}
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
  useTextLocale();
  const table = w.tables[w.playerClub];
  const ids = orderIds(ownLeagueIds(w), w.tables),
    played = !!table?.played,
    rank = ids.indexOf(w.playerClub) + 1;
  const round = ownDivisionRound(w);
  const cupCount = currentCupBriefings(w).filter((cup) => cup.active).length;
  // Home content skips day-only changes; progress reads the shown world so it moves every day.
  const progress = useGameState((state) => ownLeagueProgress(state.view?.world ?? w));
  return (
    <section
      className={s.seasonCard}
      data-home-part="season-card"
      aria-label={displayMessage('copy.ClubHub.ece63ccd56')}
    >
      <div className={s.seasonSummary}>
        <span className={s.groupTitle} data-home-part="season-group">
          {localizeValue(leagueName(ownLeague(w)))}
        </span>
        <span className={s.groupTitle} data-home-part="season-group" aria-hidden="true">
          {richMessage('navigation.short.europe')}
        </span>
        <div className={s.resources} data-home-part="season-stats">
          <div
            aria-label={displayMessage('copy.ClubHub.9a0f4b3241', {
              p0: round.total,
              p1: round.played,
            })}
          >
            <span>{richMessage('copy.ClubHub.0fcb288d12')}</span>
            <b>
              <span
                key={round.played}
                className={s.bump}
                data-testid={active ? 'game-round' : undefined}
              >
                {localizeValue(round.played)}
              </span>
              <small data-testid={active ? 'game-round-total' : undefined}>
                / {localizeValue(round.total)}
              </small>
            </b>
          </div>
          <div>
            <span>{richMessage('copy.AwaySummary.a1f8f34457')}</span>
            <b data-testid="hub-rank">
              <span key={played ? rank : '-'} className={s.bump}>
                {localizeValue(played ? rank : '—')}
              </span>
              <small>{richMessage('copy.ClubHub.327cd4f374', { p0: ids.length })}</small>
            </b>
          </div>
          <div>
            <span>{richMessage('copy.ClubHub.7776cad992', { p0: table?.points ?? 0 })}</span>
            <b data-testid="hub-record">
              <span key={table ? table.played : 0} className={s.bump}>
                {localizeValue(table ? `${table.won}-${table.drawn}-${table.lost}` : '0-0-0')}
              </span>
            </b>
          </div>
        </div>
        <div className={s.cupSummary} data-home-part="cup-summary">
          <span>{richMessage('copy.ClubHub.30aa32ffee')}</span>
          <b>
            {localizeValue(cupCount)}
            <small>{richMessage('copy.ClubHub.a57ab05712')}</small>
          </b>
        </div>
        <div className={s.seasonMeter} data-home-part="season-meter">
          <span>
            {richMessage('copy.ClubHub.96a2c9fbff', {
              p0: <b>{localizeValue(progress.toFixed(1))}%</b>,
            })}
          </span>
          <progress
            aria-label={displayMessage('copy.ClubHub.11ed863eae')}
            value={progress}
            max={100}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Where the club stands now (→WEB-44), beside the office's owner work and quieter than it:
 * strength and its place in our division, who can play, fatigue, 분위기 and the manager's
 * standing, with warnings in plain words. It only reads — no tile redirects or remedies anything;
 * the club sections hold the real workflows.
 */
export function ClubSituation({ w }: { w: World }) {
  useTextLocale();
  return (
    <section
      className={s.situation}
      aria-label={displayMessage('copy.ClubHub.149de98d87')}
      data-testid="club-situation"
    >
      <dl>
        {localizeValue(
          clubSituation(w).map((fact) => (
            <div
              key={fact.key}
              data-ui="stat-tile"
              data-fact={fact.key}
              data-tone={fact.tone}
              className={s.fact}
            >
              <dt>{localizeValue(fact.label)}</dt>
              <dd>
                <b>{localizeValue(fact.value)}</b>
                <span className={s.factNote}>
                  {localizeValue(fact.note)}
                  {localizeValue(
                    fact.warning && (
                      <strong
                        className={s.factWarning}
                        data-testid={`situation-warning-${fact.key}`}
                      >
                        {localizeValue(' · ')}
                        {localizeValue(fact.warning)}
                      </strong>
                    ),
                  )}
                </span>
              </dd>
            </div>
          )),
        )}
      </dl>
    </section>
  );
}

/**
 * The office's supporting team content under its 결재함 (→WEB-39/44): the read-only club summary,
 * which never replaces the queue and offers no immediate owner action.
 */
export function OfficeTeam({ w }: { w: World }) {
  useTextLocale();
  return (
    <section
      className={s.team}
      aria-label={displayMessage('copy.ClubHub.be3c272ab3')}
      data-office-part="team"
    >
      <ClubSituation w={w} />
    </section>
  );
}

export function ClubHub({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
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
      aria-label={displayMessage('copy.ClubHub.463aec347d')}
    >
      <SeasonCard w={w} active={!away} />
      <NextMatchCard w={w} onPrepare={() => setPreparing(true)} />
      <OfficeEntrance w={w} />
      <InvestmentGallery w={w} className={s.areas} />

      {localizeValue(
        preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />,
      )}
      {localizeValue(
        cupsOpen && (
          <Dialog
            label={displayMessage('copy.ClubHub.30aa32ffee')}
            wide
            onClose={() => setCupsOpen(false)}
          >
            <CupBriefing w={w} onOpen={() => setCupsOpen(false)} />
          </Dialog>
        ),
      )}
    </section>
  );
}
