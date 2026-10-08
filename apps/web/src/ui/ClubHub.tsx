import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf, rating, startingSquad, tacticLabel } from '../../../../packages/engine/src/world';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import { nextOwnFixture, daysUntilNextMatch } from '../../../../packages/engine/src/calendar';
import { orderIds, ownLeagueIds } from './league';
import { money, number } from './format';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useNavigation } from './state';
import { gameStore, useGameState } from '../runtime/store';
import { StrategyPanel } from './StrategyPanel';
import { Dialog } from './Dialog';
import { TrainingStudio } from './TrainingStudio';
import { MilestoneCollection } from './MilestoneCollection';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import s from './ClubHub.module.css';

function MatchCountdown() {
  const w = useGameState((state) => state.view?.world)!;
  const next = nextOwnFixture(w);
  return (
    <small>
      {next
        ? `${next.home === w.playerClub ? '홈' : '원정'} · ${daysUntilNextMatch(w)}일 후`
        : '시즌의 마지막 페이지'}
    </small>
  );
}
function MatchAction({
  critical,
  next,
  onWatch,
}: {
  critical: boolean;
  next: boolean;
  onWatch: () => Promise<void>;
}) {
  const busy = useGameState((state) => state.busy);
  const [pending, setPending] = useState(false);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  return (
    <button
      data-testid="hub-play"
      disabled={pending || busy || readonly || !!error || critical}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void onWatch().finally(() => setPending(false));
      }}
    >
      {next ? '다음 경기 관전' : '다음 시즌 시작'} <span aria-hidden="true">▷</span>
    </button>
  );
}

function ClubScene({ w }: { w: World }) {
  const club = clubOf(w);
  const crowds = Math.min(36, Math.max(6, Math.round(club.fans / 200)));
  return (
    <figure
      className={s.scene}
      aria-label={`우리 구장 · 시설 ${w.facilities}단계 · 팬 ${club.fans}명`}
    >
      <div className={s.sceneCaption}>
        <span>{number(club.fans)}명의 서포터</span>
        <b>
          {w.facilities < 3
            ? '동네의 작은 구장'
            : w.facilities < 8
              ? '우리만의 홈 그라운드'
              : '도시의 자부심'}
        </b>
        <span>시설 Lv.{w.facilities}</span>
      </div>
      <svg viewBox="0 0 360 150" role="img" aria-label="시설과 서포터에 따라 성장하는 클럽 구장">
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
        {w.facilities >= 4 && <path d="M36 73L149 44L157 51L44 82Z" fill={club.color} />}
        {w.facilities >= 8 && <path d="M207 44L325 73L317 81L201 51Z" fill={club.color} />}
        {Array.from({ length: crowds }, (_, i) => (
          <circle
            key={i}
            cx={51 + (i % 18) * 5.3}
            cy={84 - (i % 18) * 1.35 - Math.floor(i / 18) * 4}
            r="1.7"
            fill={i % 3 === 0 ? club.color : '#334d3b'}
          />
        ))}
        <path d="M25 110V62M335 110V62" stroke="#485b43" strokeWidth="2" />
        <path d="M25 62L41 68L25 73M335 62L319 68L335 73" fill={club.color} />
        {[
          [100, 104],
          [140, 99],
          [191, 113],
          [216, 100],
          [253, 98],
        ].map(([x, y], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y + 3} rx="5" ry="2" fill="#274c3240" />
            <circle cx={x} cy={y} r="3.5" fill={club.color} />
          </g>
        ))}
        <circle cx="207" cy="105" r="2.4" fill="white" />
      </svg>
      <figcaption>{number(club.fans)}명의 서포터와 함께 만드는 역사</figcaption>
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
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const milestones = milestoneFacts;
  useEffect(() => {
    if (page !== 'dashboard' && (journalOpen || trainingOpen || goalsOpen)) {
      setJournalOpen(false);
      setTrainingOpen(false);
      setGoalsOpen(false);
      controller.setSuspended(false);
    }
  }, [page, journalOpen, trainingOpen, goalsOpen, controller]);
  const club = clubOf(w),
    squad = lineupSummary(startingSquad(w, club));
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (c) => c.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  const ids = orderIds(ownLeagueIds(w), w.tables),
    rank = ids.indexOf(w.playerClub) + 1;
  const watch = async () => {
    controller.stop('관전을 위해 자동 진행을 멈췄습니다.');
    await client.whenIdle();
    const state = gameStore.getSnapshot();
    if (state.readonly || state.error || state.view?.world.critical) return;
    const reply = await client.command({ type: 'next-match' });
    if (reply?.playback) setPage('match');
  };
  const last = w.ownMatches.at(-1);
  return (
    <section className={s.hub} data-testid="club-hub" aria-label="클럽 키우기">
      <header className={s.title}>
        <div>
          <small>YOUR CLUB, YOUR STORY</small>
          <h2>{club.name}</h2>
        </div>
        <span>
          {w.lower ? '프로 복귀 도전' : `${club.tier + 1}부`} · {rank}/{ids.length}위
        </span>
      </header>
      <ClubScene w={w} />
      <div className={s.resources} aria-label="핵심 자원">
        <div>
          <span>운영 자금</span>
          <b className={BigInt(w.cash) < 0n ? s.warning : ''}>
            {money(w.cash, club.country, w.year)}
          </b>
        </div>
        <div>
          <span>팀 전력</span>
          <b>
            {rating(w, club)} <small>/ 100</small>
          </b>
        </div>
        <div>
          <span>선발 피로</span>
          <b>
            {squad.fatigue} <small>/ 100</small>
          </b>
        </div>
      </div>
      <button
        className={s.goal}
        aria-label="성장 목표 보기"
        aria-describedby="club-goal-progress"
        onClick={(event) => {
          event.currentTarget.focus();
          controller.setSuspended(true);
          setGoalsOpen(true);
        }}
      >
        <span>
          이번 도전{' '}
          <strong>
            {milestones.completed}/{milestones.total} 달성
          </strong>
        </span>
        <b>
          {milestones.next?.title || '우리 클럽의 첫 목표들을 모두 이뤘어요'}{' '}
          <span aria-hidden="true">↗</span>
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
      <div className={s.fixture}>
        <div>
          <MatchCountdown />
          <h3>{opponent?.name || '다음 시즌을 준비해요'}</h3>
          <p>
            {last
              ? `최근 경기 ${last.home === w.playerClub ? last.score.home : last.score.away}–${last.home === w.playerClub ? last.score.away : last.score.home}`
              : '첫 휘슬을 기다리는 중'}{' '}
            · {tacticLabel[w.tactic]}
          </p>
        </div>
        <MatchAction critical={!!w.critical} next={!!next} onWatch={watch} />
      </div>
      <StrategyPanel
        w={w}
        client={client}
        onSuspendChange={(value) => controller.setSuspended(value)}
      />
      <div className={s.shortcuts}>
        <button
          onClick={(event) => {
            event.currentTarget.focus();
            controller.setSuspended(true);
            setTrainingOpen(true);
          }}
        >
          선수 키우기·영입
        </button>
        <button onClick={() => setPage('business')}>클럽 투자</button>
        <button
          onClick={(e) => {
            e.currentTarget.focus();
            controller.setSuspended(true);
            setJournalOpen(true);
          }}
        >
          자세한 클럽 일지
        </button>
      </div>
      {goalsOpen && (
        <MilestoneCollection
          w={w}
          milestones={milestones}
          onClose={() => {
            setGoalsOpen(false);
            controller.setSuspended(false);
          }}
        />
      )}
      {trainingOpen && (
        <TrainingStudio
          w={w}
          client={client}
          onClose={() => {
            setTrainingOpen(false);
            controller.setSuspended(false);
          }}
          onMarket={() => {
            setTrainingOpen(false);
            controller.setSuspended(false);
            setPage('squad');
          }}
        />
      )}
      {journalOpen && (
        <Dialog
          label="클럽 일지 상세"
          onClose={() => {
            setJournalOpen(false);
            controller.setSuspended(false);
          }}
          wide
        >
          {journal}
        </Dialog>
      )}
    </section>
  );
}
