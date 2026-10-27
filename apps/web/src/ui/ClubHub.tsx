import { useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { nextOwnFixture, currentDay, seasonLength } from '../../../../packages/engine/src/calendar';
import { orderIds, ownDivisionRound, ownLeagueIds } from './league';
import { competitionLabel, number } from './format';
import { cashState, teamStates, type StateKey } from './teamState';
import { RemedySheet } from './RemedySheet';
import type { GameClient } from '../runtime/client';
import { openOfficeLobby, useNavigation } from './state';
import { ClubLink } from './ClubLink';
import { StrategyPanel } from './LazyStrategyPanel';
import { Dialog } from './Dialog';
import s from './ClubHub.module.css';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { FacilityArt } from './FacilityArt';
import { PixelIcon } from './PixelIcon';
import { CashAlarm } from './CashAlarm';

export function NextMatchCard({ w, onPrepare }: { w: World; onPrepare: () => void }) {
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
    <section className={s.fixture} aria-label="다음 경기" data-home-part="fixture">
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

/** The office's six areas, named on its entrance (→WEB-11/39). */
const OFFICE_AREAS = '운영 방침 · 시설 · 재정 · 후원 · 구단 디자인 · 결재 라인';
/** Home's door to the owner office, where every club lever is (→WEB-11, WEB-39). */
export function OfficeEntrance({ w }: { w: World }) {
  return (
    <button
      type="button"
      className={s.office}
      data-home-part="office"
      aria-label="구단주 사무실"
      aria-describedby="hub-office-areas"
      onClick={(event) => {
        event.currentTarget.focus();
        openOfficeLobby();
      }}
    >
      <FacilityArt kind="manager" world={w} className={s.officeArt} />
      <span className={s.officeText}>
        <b>구단주 사무실</b>
        <small id="hub-office-areas">{OFFICE_AREAS}</small>
      </span>
      <span className={s.officeEnter} aria-hidden="true">
        들어가기
        <PixelIcon name="chevronRight" size={14} />
      </span>
    </button>
  );
}

/**
 * Where this season stands (→WEB-11): our division's round, our rank and the record change only
 * when a round is played, so they read together above the season-progress rule. Only the card
 * on screen carries the round's test ids; the information row shows the round everywhere else.
 */
export function SeasonCard({
  w,
  active,
  onOpen,
}: {
  w: World;
  active: boolean;
  onOpen: () => void;
}) {
  const club = clubOf(w);
  const table = w.tables[w.playerClub];
  const ids = orderIds(ownLeagueIds(w), w.tables),
    played = !!table?.played,
    rank = ids.indexOf(w.playerClub) + 1;
  const round = ownDivisionRound(w);
  const progress = Math.min(
    100,
    Math.max(0, Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 100)),
  );
  return (
    <section className={s.seasonCard} data-home-part="season-card" aria-label="이번 시즌">
      <button
        className={s.resources}
        data-home-part="season-stats"
        aria-label="시즌 상세"
        aria-describedby="hub-stats-hint"
        onClick={(event) => {
          event.currentTarget.focus();
          onOpen();
        }}
      >
        <span id="hub-stats-hint" className={s.srOnly}>
          라운드·리그 순위·시즌 전적과 현재 구단 브리핑을 자세히 봐요
        </span>
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
          <small>{round.total - round.played}라운드 남음</small>
        </div>
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
      <div className={s.seasonMeter} data-home-part="season-meter">
        <span>
          시즌 진행률 <b>{progress}%</b>
        </span>
        <progress aria-label="시즌 진행률" value={progress} max={100} />
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
  useEffect(() => {
    if (away && (journalOpen || preparing)) {
      setJournalOpen(false);
      setPreparing(false);
    }
  }, [away, journalOpen, preparing]);
  return (
    <section
      className={s.hub}
      data-testid="club-hub"
      data-home-active={!away}
      aria-label="클럽 키우기"
    >
      <SeasonCard w={w} active={!away} onOpen={() => setJournalOpen(true)} />
      {/* The scene's frame stays its own part; season figures live in the card above. */}
      <div className={s.stage} data-home-part="stage">
        <ClubScene w={w} />
      </div>
      <OfficeEntrance w={w} />
      <TeamState w={w} client={client} onPrepare={() => setPreparing(true)} />
      <NextMatchCard w={w} onPrepare={() => setPreparing(true)} />

      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      {journalOpen && (
        <Dialog label="시즌 상세와 클럽 소식" onClose={() => setJournalOpen(false)} wide>
          {journal}
        </Dialog>
      )}
    </section>
  );
}
