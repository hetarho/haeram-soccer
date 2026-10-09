import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf, rating, tacticLabel } from '../../../../packages/engine/src/world';
import { nextOwnFixture, daysUntilNextMatch } from '../../../../packages/engine/src/calendar';
import { orderIds, ownLeagueIds } from './league';
import { kindLabel, number } from './format';
import {
  remedies,
  STATE_TITLES,
  teamStates,
  urgentState,
  type StateAction,
  type StateKey,
} from './teamState';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useMatchView, useNavigation, useSquadView } from './state';
import { useGameState } from '../runtime/store';
import { ClubCrest } from './ClubCrest';
import { crestOf } from './crests';
import { watchNextMatch } from './watch';
import { StrategyPanel } from './StrategyPanel';
import { Dialog } from './Dialog';
import { MilestoneCollection } from './MilestoneCollection';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import s from './ClubHub.module.css';

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
 * Club condition right now. The most urgent problem gets two one-tap remedies; every state opens
 * a sheet with all of its choices, each stating cost and effect first (→WEB-44).
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
  const { setPage } = useNavigation();
  const setSquadTab = useSquadView((state) => state.setTab);
  const acting = useGameState((state) => !!state.pendingActions || state.readonly);
  const [sheet, setSheet] = useState<StateKey>();
  const states = teamStates(w),
    urgent = urgentState(states);
  const run = (action: StateAction) => {
    if (action.command) void client.command(action.command);
    else if (action.prepare) {
      setSheet(undefined);
      onPrepare();
    } else if (action.page) {
      if (action.tab) setSquadTab(action.tab);
      setPage(action.page);
    }
  };
  const current = sheet && states.find((state) => state.key === sheet);
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
      {current && (
        <Dialog label={STATE_TITLES[current.key]} onClose={() => setSheet(undefined)}>
          <header className={s.remedyHead}>
            <span className={s[current.tone]}>
              {current.label} {current.value} · {current.status}
            </span>
          </header>
          <ul className={s.remedies}>
            {remedies(w, current.key).map((remedy) => (
              <li key={remedy.id} className={remedy.unavailable ? s.remedyOff : undefined}>
                <div>
                  <b>{remedy.label}</b>
                  <small>{remedy.effect}</small>
                  {(remedy.cost || remedy.unavailable) && (
                    <em>{remedy.unavailable || `비용 ${remedy.cost}`}</em>
                  )}
                </div>
                <button
                  disabled={!!remedy.unavailable || (acting && !!remedy.command)}
                  onClick={() => run(remedy)}
                >
                  {remedy.command ? '실행' : '열기'}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </section>
  );
}

function ClubScene({ w }: { w: World }) {
  const club = clubOf(w);
  const crest = crestOf(w, club.id);
  const crowds = Math.min(36, Math.max(6, Math.round(club.fans / 200)));
  return (
    <figure
      className={s.scene}
      aria-label={`우리 구장 · 시설 ${w.facilities}단계 · 팬 ${club.fans}명`}
    >
      <div className={s.sceneCaption}>
        <span className={s.badge}>
          <i aria-hidden="true">♥</i>
          {number(club.fans)}명의 서포터
        </span>
        <b>
          {w.facilities < 3
            ? '동네의 작은 구장'
            : w.facilities < 8
              ? '우리만의 홈 그라운드'
              : '도시의 자부심'}
        </b>
        <span className={s.badge}>
          <i aria-hidden="true">▲</i>시설 Lv.{w.facilities}
        </span>
      </div>
      <svg
        viewBox="0 0 360 150"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="시설과 서포터에 따라 성장하는 클럽 구장"
      >
        <defs>
          <linearGradient id="club-sky" x2="0" y2="1">
            <stop stopColor="#dfeddd" />
            <stop offset="1" stopColor="#fbf1d8" />
          </linearGradient>
        </defs>
        <rect width="360" height="150" fill="url(#club-sky)" />
        <circle cx="302" cy="27" r="15" fill="#efd599" />
        <path d="M0 74Q60 36 120 68T250 62T360 66V150H0Z" fill="#9cbb93" />
        <path d="M0 106L180 61L360 106L180 164Z" fill="#527d58" />
        <path d="M55 100L178 70L302 100L180 138Z" fill="#72a16b" stroke="#f4f0dc" strokeWidth="2" />
        <path
          d="M180 70V138M111 87L233 122M55 100L180 138M178 70L302 100"
          fill="none"
          stroke="#a2c297"
        />
        <ellipse cx="180" cy="103" rx="20" ry="9" fill="none" stroke="#f4f0dc" strokeWidth="1.5" />
        <path
          d="M53 98V87L72 83V94M302 98V87L284 83V94"
          fill="none"
          stroke="#fff9e6"
          strokeWidth="2"
        />
        <path d="M44 82L147 56L149 69L46 95Z" fill="#cdb88f" />
        {w.facilities >= 2 && <path d="M213 57L317 81L315 94L211 70Z" fill="#cdb88f" />}
        {w.facilities >= 4 && <path d="M36 73L149 44L157 51L44 82Z" fill={crest.primary} />}
        {w.facilities >= 8 && <path d="M207 44L325 73L317 81L201 51Z" fill={crest.primary} />}
        {Array.from({ length: crowds }, (_, i) => (
          <circle
            key={i}
            cx={51 + (i % 18) * 5.3}
            cy={84 - (i % 18) * 1.35 - Math.floor(i / 18) * 4}
            r="1.7"
            fill={i % 3 === 0 ? crest.primary : i % 3 === 1 ? crest.secondary : '#334d3b'}
          />
        ))}
        <path d="M25 110V62M335 110V62" stroke="#485b43" strokeWidth="2" />
        <path d="M25 62L41 68L25 73M335 62L319 68L335 73" fill={crest.primary} />
        <path d="M25 66L33 68L25 70M335 66L327 68L335 70" fill={crest.secondary} />
        {[
          [100, 104],
          [140, 99],
          [191, 113],
          [216, 100],
          [253, 98],
        ].map(([x, y], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y + 3} rx="5" ry="2" fill="#274c3240" />
            <circle cx={x} cy={y} r="3.5" fill={crest.primary} stroke={crest.secondary} />
          </g>
        ))}
        <circle cx="207" cy="105" r="2.4" fill="white" />
      </svg>
    </figure>
  );
}

export function ClubHub({
  w,
  client,
  controller,
  journal,
  milestoneFacts,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  journal: ReactNode;
  milestoneFacts: ReturnType<typeof clubMilestones>;
}) {
  const { page, setPage } = useNavigation();
  const [journalOpen, setJournalOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const milestones = milestoneFacts;
  useEffect(() => {
    if (page !== 'dashboard' && (journalOpen || goalsOpen || preparing)) {
      setJournalOpen(false);
      setGoalsOpen(false);
      setPreparing(false);
    }
  }, [page, journalOpen, goalsOpen, preparing]);
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
  const last = w.ownMatches.at(-1);
  const lastScore = last && [
    last.home === w.playerClub ? last.score.home : last.score.away,
    last.home === w.playerClub ? last.score.away : last.score.home,
  ];
  const open = (set: (value: boolean) => void) => (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.focus();
    set(true);
  };
  return (
    <section className={s.hub} data-testid="club-hub" aria-label="클럽 키우기">
      <h2 className={s.srOnly}>{club.name} 클럽 홈</h2>
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
            리그 순위·팀 전력·시즌 전적과 라운드 진행을 자세히 봐요
          </span>
          <div>
            <span>리그 순위</span>
            <b data-testid="hub-rank">
              <span key={played ? rank : '-'} className={s.bump}>
                {played ? rank : '—'}
              </span>
              <small>/{ids.length}위</small>
            </b>
            <small>{w.lower ? '프로 복귀 도전' : `${club.tier + 1}부`}</small>
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
      <button
        className={s.goal}
        aria-label="성장 목표 보기"
        aria-describedby="club-goal-progress"
        onClick={open(setGoalsOpen)}
      >
        <span>
          이번 도전{' '}
          <strong>
            {milestones.completed}/{milestones.total} 달성
          </strong>
        </span>
        <b>
          {milestones.next?.title || '우리 클럽의 첫 목표들을 모두 이뤘어요'}{' '}
          <span aria-hidden="true">›</span>
        </b>
        <small id="club-goal-progress">
          {milestones.next
            ? `${milestones.next.current}/${milestones.next.target} · ${milestones.next.action}`
            : '기록은 계속됩니다. 더 높은 무대를 향해!'}
        </small>
        <progress
          aria-label="현재 성장 목표 달성도"
          value={milestones.next?.progress ?? 100}
          max={100}
        />
      </button>
      <section className={s.fixture} aria-label="다음 경기">
        <div className={s.fixtureInfo}>
          <small>
            NEXT MATCH
            {next &&
              ` · ${next.home === w.playerClub ? '홈' : '원정'} · ${kindLabel[next.kind] || next.kind}`}
          </small>
          <h3>
            {opponent && <ClubCrest w={w} id={opponent.id} size={22} />}
            {opponent ? `vs ${opponent.name}` : '다음 시즌을 준비해요'}
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
      {goalsOpen && (
        <MilestoneCollection w={w} milestones={milestones} onClose={() => setGoalsOpen(false)} />
      )}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
    </section>
  );
}
