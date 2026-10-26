import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { rating, tacticLabel } from '../../../../packages/engine/src/world';
import { nextOwnFixture, currentDay, seasonLength } from '../../../../packages/engine/src/calendar';
import { orderIds, ownLeagueIds } from './league';
import { competitionLabel, number } from './format';
import { cashState, teamStates, type StateKey } from './teamState';
import { RemedySheet } from './RemedySheet';
import type { GameClient } from '../runtime/client';
import { useProgression, type ProgressionController } from '../runtime/progression';
import { useNavigation } from './state';
import { ClubLink } from './ClubLink';
import { StrategyPanel } from './LazyStrategyPanel';
import { Dialog } from './Dialog';
import s from './ClubHub.module.css';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { FacilityArt } from './FacilityArt';
import { PixelIcon } from './PixelIcon';
import { CashAlarm } from './CashAlarm';

/** During an own fixture day's match-day moment the card plays it in place of its content (→WEB-11). */
export function NextMatchCard({
  w,
  onPrepare,
  moment = false,
}: {
  w: World;
  onPrepare: () => void;
  moment?: boolean;
}) {
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (c) => c.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  const last = w.ownMatches.at(-1);
  const lastScore = last && [
    last.home === w.playerClub ? last.score.home : last.score.away,
    last.home === w.playerClub ? last.score.away : last.score.home,
  ];
  return (
    <section
      className={`${s.fixture} ${moment ? s.momentOn : ''}`}
      aria-label="다음 경기"
      data-home-part="fixture"
    >
      <div className={s.fixtureInfo}>
        <small>
          NEXT MATCH
          {next &&
            ` · ${next.home === w.playerClub ? '홈' : '원정'} · ${competitionLabel(w, next)}`}
        </small>
        <h3>
          {opponent ? (
            <>
              vs <ClubLink w={w} id={opponent.id} crest={18} large />
            </>
          ) : (
            <span>다음 시즌을 준비해요</span>
          )}
        </h3>
        <p data-testid="hub-preparation">
          {tacticLabel[w.tactic]} · {w.lineup ? '직접 고른 선발' : '감독 자동 선발'}
          {lastScore && ` · 최근 ${lastScore[0]}–${lastScore[1]}`}
        </p>
      </div>
      <div className={s.fixtureActions}>
        <button
          className={s.prepare}
          disabled={!!w.critical}
          onClick={(event) => {
            event.currentTarget.focus();
            onPrepare();
          }}
        >
          전술·선발 준비
        </button>
      </div>
      {/* Last, so the themes' first-child rules still reach the content, which keeps its place
          hidden: the card and the home layout keep their size. */}
      {moment && (
        <span className={s.moment} data-testid="next-match-moment" aria-hidden="true">
          <i className={s.momentBall} />
        </span>
      )}
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

export function ClubHub({
  w,
  client,
  controller,
  journal,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  journal: ReactNode;
}) {
  const matchMoment = useProgression(controller, (state) => state.matchMoment);
  // Home stays mounted while hidden: only leaving it matters, not moves between other pages.
  const away = useNavigation((state) => state.page !== 'dashboard');
  const [journalOpen, setJournalOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (away && (journalOpen || preparing)) {
      setJournalOpen(false);
      setPreparing(false);
    }
  }, [away, journalOpen, preparing]);
  const club = clubOf(w);
  const table = w.tables[w.playerClub];
  const ids = orderIds(ownLeagueIds(w), w.tables),
    played = !!w.tables[w.playerClub]?.played,
    rank = ids.indexOf(w.playerClub) + 1;
  const progress = Math.min(
    100,
    Math.max(0, Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 100)),
  );
  return (
    <section
      className={s.hub}
      data-testid="club-hub"
      data-home-active={!away}
      aria-label="클럽 키우기"
    >
      <div className={s.seasonOverview}>
        <div className={s.seasonMeter} data-home-part="season-meter">
          <span>
            시즌 진행률 <b>{progress}%</b>
          </span>
          <progress aria-label="시즌 진행률" value={progress} max={100} />
        </div>
      </div>
      {/* The season numbers ride the bottom of the club's stage instead of taking a row. */}
      <div className={s.stage} data-home-part="stage">
        <ClubScene w={w} />
        <button
          className={s.resources}
          data-home-part="season-stats"
          aria-label="시즌 상세"
          aria-describedby="hub-stats-hint"
          onClick={(event) => {
            event.currentTarget.focus();
            setJournalOpen(true);
          }}
        >
          <span id="hub-stats-hint" className={s.srOnly}>
            리그 순위·팀 전력·시즌 전적과 현재 구단 브리핑을 자세히 봐요
          </span>
          <div>
            <span>리그 순위</span>
            <b data-testid="hub-rank">
              <span key={played ? rank : '-'} className={s.bump}>
                {played ? rank : '—'}
              </span>
              <small>/{ids.length}위</small>
            </b>
            <small>{w.lower ? '아마추어 리그' : `${club.tier + 1}부`}</small>
          </div>
          <div>
            <span>팀 전력</span>
            <b>
              <span key={rating(w, club)} className={s.bump}>
                {rating(w, club)}
              </span>{' '}
              <small>/ 100</small>
            </b>
            <small>선발 평균</small>
          </div>
          <div>
            <span>시즌 전적</span>
            <b data-testid="hub-record">
              <span key={table ? table.played : 0} className={s.bump}>
                {table ? `${table.won}-${table.drawn}-${table.lost}` : '0-0-0'}
              </span>
            </b>
            <small>승점 {table?.points ?? 0}</small>
          </div>
          <PixelIcon name="chevronRight" size={14} className={s.more} />
        </button>
      </div>
      <TeamState w={w} client={client} onPrepare={() => setPreparing(true)} />
      <NextMatchCard
        w={w}
        onPrepare={() => setPreparing(true)}
        moment={matchMoment !== undefined}
      />

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
    </section>
  );
}
