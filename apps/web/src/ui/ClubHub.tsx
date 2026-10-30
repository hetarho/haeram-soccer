import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { orderIds, ownDivisionRound, ownLeague, ownLeagueIds, ownLeagueProgress } from './league';
import { leagueName } from './LeaguePicker';
import { competitionLabel, number } from './format';
import { cashState, teamStates, type StateKey } from './teamState';
import { RemedySheet } from './RemedySheet';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { openLeagueSeason, openCupSeason, beginTaskDetour, useNavigation } from './state';
import { currentCupBriefings } from './competitionNavigation';
import { ClubLink } from './ClubLink';
import { StrategyPanel } from './LazyStrategyPanel';
import { Dialog } from './Dialog';
import s from './ClubHub.module.css';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { FacilityArt } from './FacilityArt';
import { CashAlarm } from './CashAlarm';
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

/** Current conditions reveal their explanation and remedies when the owner opens a tile. */
export function TeamState({
  w,
  client,
  onPrepare,
}: {
  w: World;
  client: GameClient;
  onPrepare: () => void;
}) {
  const [sheet, setSheet] = useState<StateKey>();
  const states = teamStates(w);
  return (
    <section className={s.state} aria-label="팀 상태" data-testid="team-state">
      <ul data-home-part="conditions">
        {states.map((state) => (
          <li key={state.key} className={s[state.tone]} data-condition={state.key}>
            <button
              aria-label={`${state.label} ${state.value} · ${state.status}${state.advice ? ' · 주의' : ''} · 대처 방법 보기`}
              aria-haspopup="dialog"
              onClick={(event) => {
                event.currentTarget.focus();
                setSheet(state.key);
              }}
            >
              <span className={s.stateLabel}>
                {state.label}
                {state.advice && (
                  <span
                    className={s.warningBadge}
                    data-testid={`state-warning-${state.key}`}
                    aria-hidden="true"
                  >
                    !
                  </span>
                )}
              </span>
              <b>
                <i key={state.value} className={s.bump}>
                  {state.value}
                </i>
              </b>
              <small>
                {state.status
                  .split(/(\d+)/)
                  .map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part))}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {!states.some((state) => state.advice) && !cashState(w).advice && (
        <p className={s.calm}>팀이 안정적이에요. 상태를 누르면 미리 챙길 방법을 볼 수 있어요.</p>
      )}
      {sheet && (
        <RemedySheet
          w={w}
          client={client}
          state={sheet}
          onClose={() => setSheet(undefined)}
          onPrepare={onPrepare}
        />
      )}
    </section>
  );
}

function ClubScene({ w }: { w: World }) {
  const club = clubOf(w);
  return (
    <figure
      className={s.scene}
      data-home-part="scene"
      aria-label={`우리 구장 · ${STADIUM_STEPS[w.stadium].name} ${STADIUM_STEPS[w.stadium].capacity}석 · 팬 ${club.fans}명`}
    >
      <FacilityArt kind="stadium" world={w} className={s.sceneArt} />
      <div className={s.sceneCaption} data-home-part="scene-caption">
        <span className={s.badge}>
          <i aria-hidden="true">♥</i>
          {number(club.fans)}명의 서포터
        </span>
        <b>{STADIUM_STEPS[w.stadium].name}</b>
        <span className={s.badge}>
          <i aria-hidden="true">▲</i>
          {number(STADIUM_STEPS[w.stadium].capacity)}석
        </span>
      </div>
      <CashAlarm overlay />
      <span className={s.stageLabel} data-home-part="stage-label">
        구장 {w.stadium + 1}단계
      </span>
    </figure>
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

export function ClubHub({
  w,
  client,
  journal,
}: {
  w: World;
  client: GameClient;
  journal: ReactNode;
}) {
  // Home stays mounted while hidden: only leaving it matters, not moves between other pages.
  const away = useNavigation((state) => state.page !== 'dashboard');
  const [journalOpen, setJournalOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cupsOpen, setCupsOpen] = useState(false);
  useEffect(() => {
    if (away && (journalOpen || preparing || cupsOpen)) {
      setJournalOpen(false);
      setPreparing(false);
      setCupsOpen(false);
    }
  }, [away, journalOpen, preparing, cupsOpen]);
  return (
    <section
      className={s.hub}
      data-testid="club-hub"
      data-home-active={!away}
      aria-label="클럽 키우기"
    >
      <SeasonCard w={w} active={!away} />
      <NextMatchCard w={w} onPrepare={() => setPreparing(true)} />
      <div className={s.clubLinks}>
        <button data-ui="link" onClick={() => openLeagueSeason(w.year, w.year)}>
          리그 보기
        </button>
        <button data-ui="link" aria-haspopup="dialog" onClick={() => setCupsOpen(true)}>
          컵대회 보기
        </button>
        <button
          data-ui="link"
          onClick={() => {
            beginTaskDetour('history');
            useNavigation.getState().setPage('history');
          }}
        >
          클럽 기록실
        </button>
        <button data-ui="link" onClick={() => setJournalOpen(true)}>
          클럽 소식·시즌 브리핑
        </button>
      </div>
      {/* The scene's frame stays its own part; season figures live in the card above. */}
      <div className={s.stage} data-home-part="stage">
        <ClubScene w={w} />
      </div>
      <TeamState w={w} client={client} onPrepare={() => setPreparing(true)} />

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
      {cupsOpen && (
        <Dialog label="컵대회" centered wide onClose={() => setCupsOpen(false)}>
          <CupBriefing w={w} onOpen={() => setCupsOpen(false)} />
        </Dialog>
      )}
    </section>
  );
}
