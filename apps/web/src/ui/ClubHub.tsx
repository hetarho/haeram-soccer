import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf, rating, tacticLabel } from '../../../../packages/engine/src/world';
import {
  nextOwnFixture,
  daysUntilNextMatch,
  currentDay,
  seasonLength,
} from '../../../../packages/engine/src/calendar';
import { orderIds, ownLeagueIds } from './league';
import { competitionLabel, number } from './format';
import { cashState, teamStates, urgentState, type StateKey } from './teamState';
import { RemedySheet, useRemedyRunner } from './RemedySheet';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useMatchView, useNavigation } from './state';
import { useGameState } from '../runtime/store';
import { ClubLink } from './ClubLink';
import { watchNextMatch } from './watch';
import { StrategyPanel } from './LazyStrategyPanel';
import { Dialog } from './Dialog';
import s from './ClubHub.module.css';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { FacilityArt } from './FacilityArt';
import { CashAlarm } from './CashAlarm';

function MatchAction({
  critical,
  next,
  onWatch,
  onReturn,
}: {
  critical: boolean;
  next: boolean;
  onWatch: () => Promise<void>;
  onReturn: () => void;
}) {
  const busy = useGameState((state) => state.busy);
  const [pending, setPending] = useState(false);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  const days = useGameState((state) => state.view && daysUntilNextMatch(state.view.world));
  // An unfinished live match is still on: home leads back to it instead of starting another.
  const live = useGameState((state) => state.playback?.record.id);
  const view = useMatchView();
  const returning = !!live && view.matchId === live && !view.finished;
  if (returning)
    return (
      <button
        data-testid="hub-play"
        className={`${s.play} ${s.returning}`}
        aria-label="경기로 돌아가기"
        aria-describedby="hub-play-hint"
        onClick={onReturn}
      >
        <b>
          경기로 돌아가기 <span aria-hidden="true">▶</span>
        </b>
        <small id="hub-play-hint">관전 중인 경기가 이어지고 있어요</small>
      </button>
    );
  return (
    <button
      data-testid="hub-play"
      className={s.play}
      aria-label={next ? '다음 경기 관전' : '다음 시즌 시작'}
      aria-describedby="hub-play-hint"
      disabled={pending || busy || readonly || !!error || critical}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void onWatch().finally(() => setPending(false));
      }}
    >
      <b>
        {next ? '다음 경기 관전' : '다음 시즌 시작'} <span aria-hidden="true">▶</span>
      </b>
      <small id="hub-play-hint">
        {next
          ? days
            ? `${days}일 진행 후 바로 킥오프`
            : '지금 바로 킥오프'
          : '시즌 정산 후 새 일정 시작'}
      </small>
    </button>
  );
}

/**
 * Club condition right now. The most urgent problem, cash included, gets two one-tap remedies;
 * every state opens a sheet with all of its choices, each stating cost and effect first (→WEB-44).
 */
function TeamState({
  w,
  client,
  onPrepare,
}: {
  w: World;
  client: GameClient;
  onPrepare: () => void;
}) {
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const [sheet, setSheet] = useState<StateKey>();
  const run = useRemedyRunner(client, onPrepare);
  const states = teamStates(w),
    urgent = urgentState(states, cashState(w));
  return (
    <section className={s.state} aria-label="팀 상태" data-testid="team-state">
      <ul>
        {states.map((state) => (
          <li key={state.key} className={s[state.tone]}>
            <button
              aria-label={`${state.label} ${state.value} · ${state.status} · 대처 방법 보기`}
              onClick={(event) => {
                event.currentTarget.focus();
                setSheet(state.key);
              }}
            >
              <span>{state.label}</span>
              <b>
                <i key={state.value} className={s.bump}>
                  {state.value}
                </i>
              </b>
              <small>{state.status}</small>
            </button>
          </li>
        ))}
      </ul>
      {urgent?.advice ? (
        <div className={`${s.advice} ${s[urgent.tone]}`} role="status">
          <p>{urgent.advice.text}</p>
          <div>
            {urgent.advice.actions.slice(0, 2).map((action) => (
              <button key={action.label} disabled={acting} onClick={() => run(action)}>
                {action.label}
              </button>
            ))}
            <button className={s.moreRemedies} onClick={() => setSheet(urgent.key)}>
              더 보기
            </button>
          </div>
        </div>
      ) : (
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
      aria-label={`우리 구장 · ${STADIUM_STEPS[w.stadium].name} ${STADIUM_STEPS[w.stadium].capacity}석 · 팬 ${club.fans}명`}
    >
      <FacilityArt kind="stadium" world={w} className={s.sceneArt} />
      <div className={s.sceneCaption}>
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
      <span className={s.stageLabel}>구장 {w.stadium + 1}단계</span>
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
  // Home stays mounted while hidden: only leaving it matters, not moves between other pages.
  const away = useNavigation((state) => state.page !== 'dashboard');
  const setPage = useNavigation((state) => state.setPage);
  const [journalOpen, setJournalOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (away && (journalOpen || preparing)) {
      setJournalOpen(false);
      setPreparing(false);
    }
  }, [away, journalOpen, preparing]);
  const club = clubOf(w);
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (c) => c.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  const table = w.tables[w.playerClub];
  const ids = orderIds(ownLeagueIds(w), w.tables),
    played = !!w.tables[w.playerClub]?.played,
    rank = ids.indexOf(w.playerClub) + 1;
  const watch = () => watchNextMatch(client, controller, () => setPage('match'));
  const progress = Math.min(
    100,
    Math.max(0, Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 100)),
  );
  const last = w.ownMatches.at(-1);
  const lastScore = last && [
    last.home === w.playerClub ? last.score.home : last.score.away,
    last.home === w.playerClub ? last.score.away : last.score.home,
  ];
  return (
    <section className={s.hub} data-testid="club-hub" aria-label="클럽 키우기">
      <div className={s.seasonOverview}>
        <div className={s.seasonMeter}>
          <span>
            시즌 진행률 <b>{progress}%</b>
          </span>
          <progress aria-label="시즌 진행률" value={progress} max={100} />
        </div>
      </div>
      {/* The season numbers ride the bottom of the club's stage instead of taking a row. */}
      <div className={s.stage}>
        <ClubScene w={w} />
        <button
          className={s.resources}
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
          <i className={s.more} aria-hidden="true">
            ›
          </i>
        </button>
      </div>
      <TeamState w={w} client={client} onPrepare={() => setPreparing(true)} />
      <section className={s.fixture} aria-label="다음 경기">
        <div className={s.fixtureInfo}>
          <small>
            NEXT MATCH
            {next &&
              ` · ${next.home === w.playerClub ? '홈' : '원정'} · ${competitionLabel(w, next)}`}
          </small>
          <h3>
            {opponent ? (
              <>
                vs <ClubLink w={w} id={opponent.id} crest={22} large />
              </>
            ) : (
              '다음 시즌을 준비해요'
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
              setPreparing(true);
            }}
          >
            전술·선발 준비
          </button>
          <MatchAction
            critical={!!w.critical}
            next={!!next}
            onWatch={watch}
            onReturn={() => setPage('match')}
          />
        </div>
      </section>

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
    </section>
  );
}
