import { competitionRoute, selectedYear } from './competitionNavigation';
import { useTaskMemory, useTaskState } from './taskMemory';
import { CompetitionRecords, UnavailableLeagueRecord } from './CompetitionRecords';
import { Segments } from './Segments';
import { PixelIcon } from './PixelIcon';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { activeMatchModel } from '../../../../packages/contracts/src/match-model';
import { nextOwnFixture, todayStamp } from '../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { startingSquad } from '../../../../packages/engine/src/world';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import { type ProgressionController } from '../runtime/progression';
import { useLeagueSeason, useNavigation, type Page, type PastTab } from './state';
import { useMatchView } from '../runtime/matchView';
import type { PitchControls } from './Pitch';
import { LeagueOverview, RankHistoryGraph, Standings, RoundResults } from './LeagueInsights';
import { DisciplineTable, ScorerStandings, ScorerHistory } from './ScorerPanels';
import { StrategyPanel } from './LazyStrategyPanel';
import { FixtureNotebook } from './LazyFixtureNotebook';
/** A closed season's pages load when one is opened, outside the first-play entry (→ARCH-28). */
const ClosedSeason = lazy(() =>
  import('./PastSeason').then((module) => ({ default: module.ClosedSeason })),
);
/** The match theatre loads when the match pane first renders, outside the entry (→ARCH-28). */
const Pitch = lazy(() => import('./Pitch').then((module) => ({ default: module.Pitch })));
/** The season's complete statistics load with the league tab that shows them (→ARCH-28). */
const LazyFullStats = lazy(() =>
  import('./LeagueFullStats').then((module) => ({ default: module.LeagueFullStats })),
);
function LeagueFullStats(props: ComponentProps<typeof LazyFullStats>) {
  return (
    <Suspense fallback={null}>
      <LazyFullStats {...props} />
    </Suspense>
  );
}
import { seasonName } from './format';
import {
  leagueIds,
  leagueParam,
  ownLeague,
  ownLeagueIds,
  parseLeague,
  sameLeague,
  type LeagueChoice,
} from './league';
import { LeaguePicker, leagueName, useLeagueFixtures } from './LeaguePicker';
import { CompetitionHeader } from './CompetitionTabs';
import {
  selectLeagueWorld,
  selectMatchWorld,
  selectScorerWorld,
  selectStrategyWorld,
} from './liveState';
import s from './App.module.css';
import t from './LiveSeason.module.css';

const TABS = [
  ['match', '경기'],
  ['table', '순위표'],
  ['results', '일정·결과'],
  ['teams', '팀 기록'],
  ['players', '선수 기록'],
] as const;
type Tab = (typeof TABS)[number][0];
const LEAGUE_TABS = TABS.filter(([id]) => id !== 'match');
function savedLeagueTab(): Tab {
  const params = new URLSearchParams(location.search),
    saved = params.get('view'),
    past = params.get('tab');
  if (saved === 'rank' || past === 'rank') return 'teams';
  if (saved === 'scorers' || saved === 'scorer-trend' || past === 'scorers') return 'players';
  if (saved === 'results' || past === 'matches') return 'results';
  return LEAGUE_TABS.find(([id]) => id === saved)?.[0] ?? 'table';
}
const pastOf = (tab: Tab): PastTab =>
  tab === 'results'
    ? 'matches'
    : tab === 'teams'
      ? 'rank'
      : tab === 'players'
        ? 'scorers'
        : 'table';

/** Reveal the running result, then return to management for the next match eve. */
function NextMatchAction({ controls }: { controls: PitchControls }) {
  const live = useGameState((state) => !!state.playback);
  const setPage = useNavigation((state) => state.setPage);
  const reveal = live && !controls.finished;
  return (
    <button
      data-ui="primary"
      className={t.watch}
      aria-label={reveal ? '결과 보기' : '홈으로'}
      aria-describedby="match-next-hint"
      data-testid="match-next-action"
      onClick={reveal ? controls.reveal : () => setPage('dashboard')}
    >
      <b>
        {reveal ? '결과 보기' : '홈으로'}{' '}
        <PixelIcon name={reveal ? 'chevronRight' : 'home'} size={16} />
      </b>
      <small id="match-next-hint">
        {reveal ? '종료 휘슬까지 바로 넘어가요' : '다음 일정과 구단 상태를 확인해요'}
      </small>
    </button>
  );
}

function MatchFeedback({ finished }: { finished: boolean }) {
  const w = useGameState(selectStrategyWorld)!;
  const playback = useGameState((state) => state.playback);
  const next = nextOwnFixture(w);
  const opponent = w.clubs.find(
    (club) => club.id === (next?.home === w.playerClub ? next.away : next?.home),
  );
  const readiness = lineupSummary(startingSquad(w, clubOf(w)), w.tactic);
  const record = playback?.record;
  const side = record?.home === w.playerClub ? 0 : 1;
  const ownGoals = side === 0 ? record?.score.home : record?.score.away;
  const otherGoals = side === 0 ? record?.score.away : record?.score.home;
  return (
    <div
      className={t.feedback}
      data-ui="match-feedback"
      data-testid="match-feedback"
      aria-label="경기 결과와 다음 준비"
    >
      {finished && record ? (
        <div className={t.result} data-testid="match-result-summary">
          <strong>
            {ownGoals! > otherGoals! ? '승리' : ownGoals === otherGoals ? '무승부' : '패배'}{' '}
            {ownGoals}–{otherGoals}
          </strong>
          <span>
            슛 {record.metrics[side][4]}–{record.metrics[1 - side][4]} · 유효 슛{' '}
            {record.metrics[side][5]}–{record.metrics[1 - side][5]}
          </span>
        </div>
      ) : (
        <div className={t.result}>
          <strong>다음 상대</strong>
          <span>{opponent?.name || '다음 시즌을 준비해요'}</span>
        </div>
      )}
      <p data-testid="match-readiness">
        다음 선발 · {tacticLabel[w.tactic]} · 피로 {readiness.fatigue}/100
      </p>
    </div>
  );
}

const MatchPane = memo(function MatchPane({
  onPrepare,
  showDate,
}: {
  onPrepare: () => void;
  showDate: boolean;
}) {
  const w = useGameState(selectMatchWorld)!;
  const playback = useGameState((state) => state.playback);
  const [finishedWorld, setFinishedWorld] = useState<World>();
  const completed = useRef<string | undefined>(undefined);
  const [presentation, setPresentation] = useState<{
    matchId?: string;
    finished: boolean;
    details: boolean;
  }>({
    matchId: playback?.record.id,
    finished: false,
    details: false,
  });
  const onPresentationChange = useCallback(
    (next: { matchId?: string; finished: boolean; details: boolean }) => setPresentation(next),
    [],
  );
  const finished = presentation.finished && presentation.matchId === playback?.record.id;
  const setPage = useNavigation((state) => state.setPage);
  const publish = useMatchView((state) => state.set);
  useEffect(() => {
    publish({ matchId: presentation.matchId, finished: presentation.finished });
  }, [presentation.matchId, presentation.finished, publish]);
  const onFinish = useCallback((id: string) => {
    if (completed.current !== id) {
      completed.current = id;
      setFinishedWorld(gameStore.getSnapshot().view?.world);
    }
  }, []);
  return (
    <div className={t.matchPane} data-testid="match-theatre">
      <h2 className={t.srOnly}>매치데이</h2>
      {showDate && (
        <span className={t.srOnly} data-testid="game-date">
          {todayStamp(w)}
        </span>
      )}
      <section>
        <Suspense fallback={<div className={s.pitch} aria-busy="true" />}>
          <Pitch
            playback={playback}
            world={w}
            onFinish={onFinish}
            onPresentationChange={onPresentationChange}
            lead={
              <button
                data-ui="icon"
                className={t.back}
                aria-label="홈"
                onClick={() => setPage('dashboard')}
              >
                <PixelIcon name="chevronLeft" size={22} />
              </button>
            }
            actions={(controls) => (
              <div className={t.coreActions} data-ui="match-actions">
                <MatchFeedback finished={finished} />
                <div className={t.nextActions}>
                  <button onClick={onPrepare}>상세 리포트</button>
                  <NextMatchAction controls={controls} />
                </div>
              </div>
            )}
          />
        </Suspense>
      </section>
      {presentation.details &&
        finished &&
        finishedWorld &&
        completed.current === playback?.record.id && (
          <div className={s.afterMatch}>
            <LeagueOverview w={finishedWorld} onOpenLeague={() => setPage('league')} />
            <section data-surface="panel" className={s.panel}>
              <div className={s.panelHead}>
                <h3>경기 뒤의 순위표</h3>
              </div>
              <Standings w={finishedWorld} ids={ownLeagueIds(finishedWorld)} limit={6} />
            </section>
          </div>
        )}
    </div>
  );
});

/** The chosen league's table; the own league's keeps its rank story (→WEB-65). */
const TablePane = memo(function TablePane({
  client,
  league,
}: {
  client: GameClient;
  league?: LeagueChoice;
}) {
  const w = useGameState(selectLeagueWorld)!;
  const fixtures = useLeagueFixtures(client, w, league);
  return (
    <>
      <h2 className={s.seasonPaneTitle}>리그 순위표</h2>
      <section data-surface="panel" className={s.panel}>
        <Standings w={w} ids={leagueIds(w, league)} fixtures={fixtures} />
      </section>
    </>
  );
});
const TeamPane = memo(function TeamPane({
  client,
  league,
  onLeague,
  part,
  onPart,
}: {
  client: GameClient;
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  part: 'table' | 'rank';
  onPart: (value: 'table' | 'rank') => void;
}) {
  const w = useGameState(selectLeagueWorld)!,
    other = league && !sameLeague(league, ownLeague(w));
  const rows = leagueIds(w, league).flatMap((id) =>
    w.tables[id] ? [{ id, ...w.tables[id] }] : [],
  );
  return (
    <>
      <Segments
        label="팀 기록 보기"
        options={
          [
            ['table', '팀 성적'],
            ['rank', '순위 추이'],
          ] as const
        }
        value={part}
        onChange={onPart}
      />
      {part === 'table' ? (
        <>
          <CompetitionRecords w={w} rows={rows} />
          <LeagueFullStats client={client} league={league} lens="teams" />
        </>
      ) : other ? (
        <UnavailableLeagueRecord
          league={league!}
          label="라운드별 순위 추이"
          onOwn={() => onLeague(undefined)}
        />
      ) : (
        <RankHistoryGraph w={w} year={w.year} />
      )}
    </>
  );
});
const PlayerPane = memo(function PlayerPane({
  client,
  league,
  onLeague,
  part,
  onPart,
}: {
  client: GameClient;
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  part: 'scorers' | 'trend';
  onPart: (value: 'scorers' | 'trend') => void;
}) {
  const w = useGameState(selectScorerWorld)!,
    other = league && !sameLeague(league, ownLeague(w)),
    // With complete statistics another league's leaders come from the lens below (→WEB-89); only
    // the round-by-round race stays our league's alone (→WEB-65).
    full = activeMatchModel(w) !== undefined;
  return (
    <>
      <Segments
        label="선수 기록 보기"
        options={
          [
            ['scorers', '득점 순위'],
            ['trend', '득점왕 추이'],
          ] as const
        }
        value={part}
        onChange={onPart}
      />
      {other ? (
        full && part === 'scorers' ? null : (
          <UnavailableLeagueRecord
            league={league!}
            label={full ? '라운드별 득점왕 기록' : '선수별 득점 기록'}
            onOwn={() => onLeague(undefined)}
          />
        )
      ) : part === 'trend' ? (
        <ScorerHistory w={w} />
      ) : (
        <ScorerStandings w={w} />
      )}
      {part === 'scorers' && <LeagueFullStats client={client} league={league} lens="players" />}
      {part === 'scorers' && <DisciplineTable league={league} />}
    </>
  );
});
/** Country, division and season: one filter row picks any league in any season (→WEB-65). */
const LeagueScope = memo(function LeagueScope({
  league,
  onLeague,
  onSeason,
}: {
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  onSeason: (year: number) => void;
}) {
  const w = useGameState(selectLeagueWorld)!;
  return (
    <CompetitionHeader page="league">
      <b className={s.srOnly}>
        {leagueName(league ?? ownLeague(w))} · {seasonName(w.year)}
      </b>
      <LeaguePicker league={league} onLeague={onLeague} onSeason={onSeason} />
    </CompetitionHeader>
  );
});
const ResultsPane = memo(function ResultsPane({
  client,
  league,
  onLeague,
}: {
  client: GameClient;
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
}) {
  const w = useGameState(selectLeagueWorld)!,
    fixtures = useLeagueFixtures(client, w, league),
    other = league && !sameLeague(league, ownLeague(w));
  const [part, setPart] = useState<'rounds' | 'ours'>('rounds');
  return (
    <>
      <Segments
        label="일정·결과 보기"
        options={
          [
            ['rounds', '라운드 결과'],
            ['ours', '우리 경기'],
          ] as const
        }
        value={part}
        onChange={setPart}
      />
      {part === 'ours' ? (
        other ? (
          <UnavailableLeagueRecord
            league={league!}
            label="우리 구단 경기"
            onOwn={() => onLeague(undefined)}
          />
        ) : (
          <FixtureNotebook w={w} client={client} />
        )
      ) : other && !fixtures ? (
        <p className={s.muted} role="status">
          {leagueName(league!)} 경기를 불러오는 중…
        </p>
      ) : (
        <RoundResults w={w} ids={leagueIds(w, league)} fixtures={fixtures} />
      )}
    </>
  );
});
/**
 * Panels stay mounted. The simulation and canvas keep their identity when tabs change; a league
 * tab joins them once it has been opened.
 */
export const LiveSeason = memo(function LiveSeason({
  page,
  client,
  controller,
}: {
  page: Page;
  client: GameClient;
  controller: ProgressionController;
}) {
  const archive = page === 'leagueHistory';
  const leaguePage = page === 'league' || archive;
  const active = page === 'match' || leaguePage;
  const world = useGameState((state) => state.view!.world.id);
  const years = useGameState((state) => state.view!.world.history.map((h) => h.year).join(','));
  const context = archive ? 'leagueHistory' : 'league';
  const atContext = () => competitionRoute(location.pathname, location.search)?.page === context;
  // Whether the page asked for is the one on screen; moves between other pages leave it alone.
  const settled = useNavigation((state) => state.page === page);
  const [preparing, setPreparing] = useState(false);
  const visibleTabs = LEAGUE_TABS;
  const [leagueTab, setLeagueTab] = useTaskState<Tab>(world, `${context}-tab`, () =>
    atContext() ? savedLeagueTab() : 'table',
  );
  const [teamPart, setTeamPart] = useTaskState<'table' | 'rank'>(world, `${context}-team`, () => {
    const p = new URLSearchParams(location.search);
    return p.get('view') === 'rank' || p.get('detail') === 'rank' ? 'rank' : 'table';
  });
  const [playerPart, setPlayerPart] = useTaskState<'scorers' | 'trend'>(
    world,
    `${context}-player`,
    () => {
      const p = new URLSearchParams(location.search);
      return p.get('view') === 'scorer-trend' || p.get('detail') === 'trend' ? 'trend' : 'scorers';
    },
  );
  const [pickedYear, setReviewYear] = useTaskState<number | undefined>(
    world,
    'league-history-year',
    () =>
      competitionRoute(location.pathname, location.search)?.page === 'leagueHistory'
        ? selectedYear(new URLSearchParams(location.search))
        : undefined,
  );
  const reviewYear = archive
    ? (pickedYear ?? (years ? Number(years.split(',').at(-1)) : undefined))
    : undefined;
  useEffect(() => {
    if (archive && pickedYear === undefined && reviewYear !== undefined) setReviewYear(reviewYear);
  }, [archive, pickedYear, reviewYear, setReviewYear]);
  const [league, setLeague] = useTaskState<LeagueChoice | undefined>(
    world,
    `${context}-scope`,
    () =>
      atContext() ? parseLeague(new URLSearchParams(location.search).get('league')) : undefined,
  );
  // A closed season's tab stays while the list steps between closed seasons.
  const pastTab = pastOf(leagueTab);
  const setPastTab = (value: PastTab) =>
    setLeagueTab(
      value === 'matches'
        ? 'results'
        : value === 'rank'
          ? 'teams'
          : value === 'scorers'
            ? 'players'
            : 'table',
    );
  const tab: Tab = page === 'match' ? 'match' : leagueTab;
  // A season asked for from elsewhere (a records-room season row) opens in our league that season.
  const requestedSeason = useLeagueSeason((state) => state.request);
  const currentYear = useGameState((state) => state.view?.world.year);
  useEffect(() => {
    if (!leaguePage || requestedSeason === undefined || currentYear === undefined) return;
    useLeagueSeason.getState().take();
    setLeague(undefined);
    setLeagueTab('table');
    if (requestedSeason === currentYear) setReviewYear(undefined);
    else {
      setReviewYear(requestedSeason);
    }
  }, [requestedSeason, currentYear, leaguePage, setLeague, setLeagueTab, setReviewYear]);
  const restoreLeague = useCallback(() => {
    if (competitionRoute(location.pathname, location.search)?.page !== context) return;
    const params = new URLSearchParams(location.search);
    setLeagueTab(savedLeagueTab());
    setLeague(parseLeague(params.get('league')));
    if (archive) setReviewYear(selectedYear(params));
    setTeamPart(
      params.get('detail') === 'rank' || params.get('view') === 'rank' ? 'rank' : 'table',
    );
    setPlayerPart(
      params.get('detail') === 'trend' || params.get('view') === 'scorer-trend'
        ? 'trend'
        : 'scorers',
    );
  }, [context, archive, setLeagueTab, setLeague, setReviewYear, setTeamPart, setPlayerPart]);
  const entered = useRef('');
  const entering = leaguePage && settled && atContext() && entered.current !== context;
  useLayoutEffect(() => {
    if (entering) {
      entered.current = context;
      restoreLeague();
    }
    if (!leaguePage) entered.current = '';
  });
  useEffect(() => {
    window.addEventListener('popstate', restoreLeague);
    window.addEventListener('tasknavigate', restoreLeague);
    return () => {
      window.removeEventListener('popstate', restoreLeague);
      window.removeEventListener('tasknavigate', restoreLeague);
    };
  }, [restoreLeague]);
  useEffect(() => {
    if (!leaguePage || !settled || !atContext() || entering) return;
    const url = new URL(location.href);
    url.searchParams.set('view', leagueTab);
    if (leagueTab === 'teams' && teamPart === 'rank') url.searchParams.set('detail', 'rank');
    else if (leagueTab === 'players' && playerPart === 'trend')
      url.searchParams.set('detail', 'trend');
    else url.searchParams.delete('detail');
    const chosen = leagueParam(league);
    if (chosen) url.searchParams.set('league', chosen);
    else url.searchParams.delete('league');
    if (reviewYear === undefined) {
      url.searchParams.delete('season');
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('season', String(reviewYear));
      url.searchParams.set('tab', pastTab);
    }
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [
    page,
    leaguePage,
    settled,
    leagueTab,
    reviewYear,
    pastTab,
    league,
    teamPart,
    playerPart,
    context,
    entering,
  ]);
  useEffect(() => {
    if (archive && reviewYear === currentYear) {
      const params = new URLSearchParams(location.search);
      params.delete('season');
      params.delete('tab');
      const target = competitionRoute('/season', params.toString());
      const address = target?.address ?? '/season?competition=league';
      history.replaceState(null, '', address);
      useNavigation.setState({ page: 'league' });
      window.dispatchEvent(new Event('tasknavigate'));
    }
  }, [archive, reviewYear, currentYear]);
  const reviewing = archive && reviewYear !== undefined;
  // This season is the live league; a closed one opens its archive in the same league and tab.
  const pickSeason = (year: number) => {
    if (archive) {
      setReviewYear(year);
      return;
    }
    if (year === currentYear) return;
    const params = new URLSearchParams({
      section: 'league',
      season: String(year),
      view: leagueTab,
    });
    const chosen = leagueParam(league);
    if (chosen) params.set('league', chosen);
    useTaskMemory.setState((memory) => ({
      addresses: { ...memory.addresses, leagueHistory: `/history?${params}` },
    }));
    useNavigation.getState().setPage('leagueHistory');
  };
  // A league tab mounts the first time it is shown and stays mounted after, so it keeps what was
  // chosen in it; a tab never opened renders nothing while hidden.
  const shown = page === 'league' ? tab : undefined;
  const [opened, setOpened] = useState<Tab[]>([]);
  if (shown && !opened.includes(shown)) setOpened([...opened, shown]);
  useEffect(() => {
    controller.setWatching(active && settled && tab === 'match');
  }, [active, settled, tab, controller]);
  useEffect(() => {
    if (page !== 'match') setPreparing(false);
  }, [page]);
  const onPrepare = useCallback(() => setPreparing(true), []);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? visibleTabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + visibleTabs.length) %
            visibleTabs.length;
    setLeagueTab(visibleTabs[next][0]);
    document.getElementById(`season-tab-${visibleTabs[next][0]}`)?.focus();
  };
  const inTabs = (id: Tab) => visibleTabs.some(([visible]) => visible === id);
  return (
    <div hidden={!active} data-testid="live-season" className={t.liveSeason}>
      {archive && reviewYear === undefined && (
        <p className={s.muted}>아직 마감된 리그 시즌이 없어요.</p>
      )}
      {page === 'league' && !reviewing && (
        <div className={t.navigation} data-ui="toolbar">
          <LeagueScope league={league} onLeague={setLeague} onSeason={pickSeason} />
          <div className={`${s.seasonTabs} ${t.tabs}`} role="tablist" aria-label="리그 보기">
            {visibleTabs.map(([id, label], i) => (
              <button
                key={id}
                id={`season-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`season-panel-${id}`}
                tabIndex={tab === id || (i === 0 && !inTabs(tab)) ? 0 : -1}
                onKeyDown={(event) => keyboard(event, i)}
                onClick={() => setLeagueTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {TABS.map(([id, label]) => (
        <section
          key={id}
          id={`season-panel-${id}`}
          className={`${s.seasonPane} ${t.pane}`}
          role={id === 'match' ? undefined : 'tabpanel'}
          aria-labelledby={id !== 'match' && inTabs(id) ? `season-tab-${id}` : undefined}
          aria-label={id === 'match' ? '경기 관전' : inTabs(id) ? undefined : label}
          hidden={tab !== id || reviewing || (archive && id !== 'match')}
        >
          {id === 'match' ? (
            <MatchPane onPrepare={onPrepare} showDate={page === 'match'} />
          ) : !opened.includes(id) ? null : id === 'table' ? (
            <TablePane client={client} league={league} />
          ) : id === 'teams' ? (
            <TeamPane
              client={client}
              league={league}
              onLeague={setLeague}
              part={teamPart}
              onPart={setTeamPart}
            />
          ) : id === 'players' ? (
            <PlayerPane
              client={client}
              league={league}
              onLeague={setLeague}
              part={playerPart}
              onPart={setPlayerPart}
            />
          ) : (
            <ResultsPane client={client} league={league} onLeague={setLeague} />
          )}
        </section>
      ))}
      {reviewing && (
        <Suspense
          fallback={
            <p className={s.muted} role="status">
              지난 시즌을 펼치는 중…
            </p>
          }
        >
          <ClosedSeason
            client={client}
            year={reviewYear}
            tab={pastTab}
            onTab={setPastTab}
            league={league}
            onLeague={setLeague}
            teamPart={teamPart}
            onTeamPart={setTeamPart}
            playerPart={playerPart}
            onPlayerPart={setPlayerPart}
            onYear={pickSeason}
          />
          {pastTab === 'scorers' && playerPart === 'scorers' && (
            <p className={s.muted}>지난 시즌 징계 기록은 보관하지 않아요.</p>
          )}
        </Suspense>
      )}
      {preparing && page === 'match' && (
        <StrategyPanelSheet client={client} onClose={() => setPreparing(false)} />
      )}
    </div>
  );
});
function StrategyPanelSheet({ client, onClose }: { client: GameClient; onClose: () => void }) {
  const w = useGameState(selectStrategyWorld)!;
  return <StrategyPanel w={w} client={client} onClose={onClose} />;
}
