import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { competitionRoute, selectedYear } from '../../../shared/routing/competitionNavigation';
import { useTaskMemory, useTaskState } from '../../../shared/routing/taskMemory';
import { CompetitionRecords, UnavailableLeagueRecord } from './CompetitionRecords';
import { Segments } from '../../../shared/ui/Segments';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
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
import type { World } from '../../../../../../packages/contracts/src/types';
import { activeMatchModel } from '../../../../../../packages/contracts/src/match-model';
import { nextOwnFixture, todayStamp } from '../../../../../../packages/engine/src/calendar';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { startingSquad } from '../../../../../../packages/engine/src/world';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import { lineupSummary } from '../../../../../../packages/engine/src/strategy';
import type { GameClient } from '../../../runtime/client';
import { gameStore, useGameState } from '../../../runtime/store';
import { type ProgressionController } from '../../../runtime/progression';
import {
  useLeagueSeason,
  useNavigation,
  type Page,
  type PastTab,
} from '../../../shared/routing/state';
import { useMatchView } from '../../../runtime/matchView';
import type { PitchControls } from '../../../features/match-viewer/ui/Pitch';
import {
  LeagueOverview,
  RankHistoryGraph,
  Standings,
  RoundResults,
} from '../../../widgets/league-insights/ui/LeagueInsights';
import { DisciplineTable, ScorerStandings, ScorerHistory } from './ScorerPanels';
import { StrategyPanel } from '../../../features/match-prep/ui/LazyStrategyPanel';
import { FixtureNotebook } from './LazyFixtureNotebook';
/** A closed season's pages load when one is opened, outside the first-play entry (→ARCH-28). */
const ClosedSeason = lazy(() =>
  import('./PastSeason').then((module) => ({ default: module.ClosedSeason })),
);
/** The match theatre loads when the match pane first renders, outside the entry (→ARCH-28). */
const Pitch = lazy(() =>
  import('../../../features/match-viewer/ui/Pitch').then((module) => ({ default: module.Pitch })),
);
/** The season's complete statistics load with the league tab that shows them (→ARCH-28). */
const LazyFullStats = lazy(() =>
  import('./LeagueFullStats').then((module) => ({ default: module.LeagueFullStats })),
);
function LeagueFullStats(props: ComponentProps<typeof LazyFullStats>) {
  useTextLocale();
  return (
    <Suspense fallback={null}>
      <LazyFullStats {...props} />
    </Suspense>
  );
}
import { seasonName } from '../../../presentation/format';
import {
  leagueIds,
  leagueParam,
  ownLeague,
  ownLeagueIds,
  parseLeague,
  sameLeague,
  type LeagueChoice,
} from '../../../entities/league/lib/league';
import {
  LeaguePicker,
  leagueName,
  useLeagueFixtures,
} from '../../../entities/league/ui/LeaguePicker';
import { CompetitionHeader } from '../../../shared/ui/CompetitionTabs';
import {
  selectLeagueWorld,
  selectMatchWorld,
  selectScorerWorld,
  selectStrategyWorld,
} from '../../../shared/lib/liveState';
import s from '../../../shared/ui/styles/App.module.css';
import t from '../../../shared/ui/styles/LiveSeason.module.css';

const TABS = [
  ['match', sourceMessage('copy.LabPage.e56314e9a1')],
  ['table', sourceMessage('copy.LiveSeason.a6fecd0870')],
  ['results', sourceMessage('copy.LiveSeason.b5eac83230')],
  ['teams', sourceMessage('copy.LiveSeason.ae97e3f103')],
  ['players', sourceMessage('copy.stories.c50c28f608')],
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
  useTextLocale();
  const live = useGameState((state) => !!state.playback);
  const setPage = useNavigation((state) => state.setPage);
  const reveal = live && !controls.finished;
  return (
    <button
      data-ui="primary"
      className={t.watch}
      aria-label={localizeValue(
        reveal
          ? sourceMessage('copy.LiveSeason.1547b2a6d2')
          : sourceMessage('copy.LiveSeason.ffe893bace'),
      )}
      aria-describedby="match-next-hint"
      data-testid="match-next-action"
      onClick={reveal ? controls.reveal : () => setPage('dashboard')}
    >
      <b>
        {localizeValue(
          reveal
            ? sourceMessage('copy.LiveSeason.1547b2a6d2')
            : sourceMessage('copy.LiveSeason.ffe893bace'),
        )}
        {localizeValue(' ')}
        <PixelIcon name={reveal ? 'chevronRight' : 'home'} size={16} />
      </b>
      {/* Both hints keep one line in a 360px half-width cell, so revealing the result never
          grows the action row under the bottom menu. */}
      <small id="match-next-hint">
        {localizeValue(
          reveal
            ? sourceMessage('copy.LiveSeason.5ddbe8eeab')
            : sourceMessage('copy.LiveSeason.43a0c21210'),
        )}
      </small>
    </button>
  );
}

function MatchFeedback({ finished }: { finished: boolean }) {
  useTextLocale();
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
      aria-label={displayMessage('copy.LiveSeason.a6b6db5502')}
    >
      {localizeValue(
        finished && record ? (
          <div className={t.result} data-testid="match-result-summary">
            <strong>
              {localizeValue(
                ownGoals! > otherGoals!
                  ? sourceMessage('result.win.label')
                  : ownGoals === otherGoals
                    ? sourceMessage('result.draw.label')
                    : sourceMessage('result.loss.label'),
              )}
              {localizeValue(' ')}
              {localizeValue(ownGoals)}–{localizeValue(otherGoals)}
            </strong>
            <span>
              {richMessage('copy.LiveSeason.5ebfe89271', {
                p0: record.metrics[side][4],
                p1: record.metrics[1 - side][4],
                p2: ' ',
                p3: record.metrics[side][5],
                p4: record.metrics[1 - side][5],
              })}
            </span>
          </div>
        ) : (
          <div className={t.result}>
            <strong>{richMessage('copy.LiveSeason.0b25b7d6ac')}</strong>
            <span>{localizeValue(opponent?.name || sourceMessage('copy.ClubHub.1015d8ff31'))}</span>
          </div>
        ),
      )}
      <p data-testid="match-readiness">
        {richMessage('copy.LiveSeason.e8f5bd237a', {
          p0: tacticLabel[w.tactic],
          p1: readiness.fatigue,
        })}
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
  useTextLocale();
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
      <h2 className={t.srOnly}>{richMessage('copy.LiveSeason.b082e409a4')}</h2>
      {localizeValue(
        showDate && (
          <span className={t.srOnly} data-testid="game-date">
            {localizeValue(todayStamp(w))}
          </span>
        ),
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
                aria-label={displayMessage('fixture.home')}
                onClick={() => setPage('dashboard')}
              >
                <PixelIcon name="chevronLeft" size={22} />
              </button>
            }
            actions={(controls) => (
              <div className={t.coreActions} data-ui="match-actions">
                <MatchFeedback finished={finished} />
                <div className={t.nextActions}>
                  <button onClick={onPrepare}>{richMessage('copy.ClubHub.f2bef7802a')}</button>
                  <NextMatchAction controls={controls} />
                </div>
              </div>
            )}
          />
        </Suspense>
      </section>
      {localizeValue(
        finished && finishedWorld && completed.current === playback?.record.id && (
          <div className={s.afterMatch}>
            <LeagueOverview w={finishedWorld} onOpenLeague={() => setPage('league')} />
            <section data-surface="panel" className={s.panel}>
              <div className={s.panelHead}>
                <h3>{richMessage('copy.LiveSeason.9bc84721dc')}</h3>
              </div>
              <Standings w={finishedWorld} ids={ownLeagueIds(finishedWorld)} limit={6} />
            </section>
          </div>
        ),
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
  useTextLocale();
  const w = useGameState(selectLeagueWorld)!;
  const fixtures = useLeagueFixtures(client, w, league);
  return (
    <>
      <h2 className={s.seasonPaneTitle}>{richMessage('copy.LeagueInsights.7c477b094f')}</h2>
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
  useTextLocale();
  const w = useGameState(selectLeagueWorld)!,
    other = league && !sameLeague(league, ownLeague(w));
  const rows = leagueIds(w, league).flatMap((id) =>
    w.tables[id] ? [{ id, ...w.tables[id] }] : [],
  );
  return (
    <>
      <Segments
        label={displayMessage('copy.LiveSeason.dd0271790e')}
        options={
          [
            ['table', sourceMessage('copy.LiveSeason.cfb04aa930')],
            ['rank', sourceMessage('copy.LiveSeason.352637b1e4')],
          ] as const
        }
        value={part}
        onChange={onPart}
      />
      {localizeValue(
        part === 'table' ? (
          <>
            <CompetitionRecords w={w} rows={rows} />
            <LeagueFullStats client={client} league={league} lens="teams" />
          </>
        ) : other ? (
          <UnavailableLeagueRecord
            league={league!}
            label={displayMessage('copy.LiveSeason.72f03b4d8c')}
            onOwn={() => onLeague(undefined)}
          />
        ) : (
          <RankHistoryGraph w={w} year={w.year} />
        ),
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
  useTextLocale();
  const w = useGameState(selectScorerWorld)!,
    other = league && !sameLeague(league, ownLeague(w)),
    // With complete statistics another league's leaders come from the lens below (→WEB-89); only
    // the round-by-round race stays our league's alone (→WEB-65).
    full = activeMatchModel(w) !== undefined;
  return (
    <>
      <Segments
        label={displayMessage('copy.LiveSeason.145050ed3a')}
        options={
          [
            ['scorers', sourceMessage('copy.LiveSeason.12543e95b4')],
            ['trend', sourceMessage('copy.LiveSeason.d332850f5a')],
          ] as const
        }
        value={part}
        onChange={onPart}
      />
      {localizeValue(
        other ? (
          full && part === 'scorers' ? null : (
            <UnavailableLeagueRecord
              league={league!}
              label={localizeValue(
                full
                  ? sourceMessage('copy.LiveSeason.805e3ca9c4')
                  : sourceMessage('copy.LiveSeason.446a9e597e'),
              )}
              onOwn={() => onLeague(undefined)}
            />
          )
        ) : part === 'trend' ? (
          <ScorerHistory w={w} />
        ) : (
          <ScorerStandings w={w} />
        ),
      )}
      {localizeValue(
        part === 'scorers' && <LeagueFullStats client={client} league={league} lens="players" />,
      )}
      {localizeValue(part === 'scorers' && <DisciplineTable league={league} />)}
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
  useTextLocale();
  const w = useGameState(selectLeagueWorld)!;
  return (
    <CompetitionHeader page="league">
      <b className={s.srOnly}>
        {localizeValue(leagueName(league ?? ownLeague(w)))} · {localizeValue(seasonName(w.year))}
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
  useTextLocale();
  const w = useGameState(selectLeagueWorld)!,
    fixtures = useLeagueFixtures(client, w, league),
    other = league && !sameLeague(league, ownLeague(w));
  const [part, setPart] = useState<'rounds' | 'ours'>('rounds');
  return (
    <>
      <Segments
        label={displayMessage('copy.LiveSeason.94260fee4b')}
        options={
          [
            ['rounds', sourceMessage('copy.LeagueInsights.e0d0bdbc96')],
            ['ours', sourceMessage('copy.LiveSeason.7be4af1e16')],
          ] as const
        }
        value={part}
        onChange={setPart}
      />
      {localizeValue(
        part === 'ours' ? (
          other ? (
            <UnavailableLeagueRecord
              league={league!}
              label={displayMessage('copy.LiveSeason.69936299ca')}
              onOwn={() => onLeague(undefined)}
            />
          ) : (
            <FixtureNotebook w={w} client={client} />
          )
        ) : other && !fixtures ? (
          <p className={s.muted} role="status">
            {richMessage('copy.LiveSeason.f21c11a229', { p0: leagueName(league!) })}
          </p>
        ) : (
          <RoundResults w={w} ids={leagueIds(w, league)} fixtures={fixtures} />
        ),
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
  useTextLocale();
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
  // The league on screen, ours (this season's, or the closed season's) when none is chosen.
  const shownLeague = (): LeagueChoice | undefined => {
    if (league) return league;
    const w = gameStore.getSnapshot().view?.world;
    if (!w) return undefined;
    const season = archive ? w.history.find((h) => h.year === reviewYear) : undefined;
    return season
      ? { code: clubOf(w).country, tier: season.tier, group: season.group }
      : ownLeague(w);
  };
  // This season is the live league; a closed one opens its archive in the same tab. Stepping keeps
  // the league on screen, ours included, so a season never moves the division; 우리 리그 is the
  // way back to wherever we played that season.
  const pickSeason = (year: number) => {
    const kept = shownLeague();
    if (archive) {
      setLeague(kept);
      setReviewYear(year);
      return;
    }
    if (year === currentYear) return;
    const params = new URLSearchParams({
      section: 'league',
      season: String(year),
      view: leagueTab,
    });
    const chosen = leagueParam(kept);
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
      {localizeValue(
        archive && reviewYear === undefined && (
          <p className={s.muted}>{richMessage('copy.LiveSeason.e1a33edddf')}</p>
        ),
      )}
      {localizeValue(
        page === 'league' && !reviewing && (
          <div className={t.navigation} data-ui="toolbar">
            <LeagueScope league={league} onLeague={setLeague} onSeason={pickSeason} />
            <div
              className={`${s.seasonTabs} ${t.tabs}`}
              role="tablist"
              aria-label={displayMessage('copy.LiveSeason.ad7980a9c9')}
            >
              {localizeValue(
                visibleTabs.map(([id, label], i) => (
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
                    {localizeValue(label)}
                  </button>
                )),
              )}
            </div>
          </div>
        ),
      )}
      {localizeValue(
        TABS.map(([id, label]) => (
          <section
            key={id}
            id={`season-panel-${id}`}
            className={`${s.seasonPane} ${t.pane}`}
            role={id === 'match' ? undefined : 'tabpanel'}
            aria-labelledby={id !== 'match' && inTabs(id) ? `season-tab-${id}` : undefined}
            aria-label={localizeValue(
              id === 'match'
                ? sourceMessage('copy.LiveSeason.84d7e527ed')
                : inTabs(id)
                  ? undefined
                  : label,
            )}
            hidden={tab !== id || reviewing || (archive && id !== 'match')}
          >
            {localizeValue(
              id === 'match' ? (
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
              ),
            )}
          </section>
        )),
      )}
      {localizeValue(
        reviewing && (
          <Suspense
            fallback={
              <p className={s.muted} role="status">
                {richMessage('copy.LiveSeason.97317e5d34')}
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
            {localizeValue(
              pastTab === 'scorers' && playerPart === 'scorers' && (
                <p className={s.muted}>{richMessage('copy.LiveSeason.fa4f80b195')}</p>
              ),
            )}
          </Suspense>
        ),
      )}
      {localizeValue(
        preparing && page === 'match' && (
          <StrategyPanelSheet client={client} onClose={() => setPreparing(false)} />
        ),
      )}
    </div>
  );
});
function StrategyPanelSheet({ client, onClose }: { client: GameClient; onClose: () => void }) {
  useTextLocale();
  const w = useGameState(selectStrategyWorld)!;
  return <StrategyPanel w={w} client={client} onClose={onClose} />;
}
