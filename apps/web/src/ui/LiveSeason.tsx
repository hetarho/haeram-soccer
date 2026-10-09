import { Select } from './Select';
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import { daysUntilNextMatch, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { clubOf, startingSquad, tacticLabel } from '../../../../packages/engine/src/world';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import { useProgression, type ProgressionController } from '../runtime/progression';
import { useMatchView, useNavigation, type Page } from './state';
import { Pitch, type PitchControls } from './Pitch';
import { ProgressControls } from './ProgressControls';
import { watchNextMatch } from './watch';
import { LeagueOverview, RankHistoryGraph, Standings, RoundResults } from './LeagueInsights';
import { ScorerStandings, ScorerHistory } from './ScorerPanels';
import { StrategyPanel } from './StrategyPanel';
import { FixtureNotebook } from './FixtureNotebook';
import { ownLeagueIds } from './league';
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
  ['overview', '개요'],
  ['table', '순위표'],
  ['results', '라운드 결과'],
  ['rank', '순위 추이'],
  ['scorers', '득점 순위'],
  ['scorer-trend', '득점왕 추이'],
] as const;
type Tab = (typeof TABS)[number][0];
/** The match theatre has no tabs; every league view is a tab of one bar. */
const LEAGUE_TABS = TABS.filter(([id]) => id !== 'match');

/**
 * The primary match action: while the match plays it reveals the result; after the final whistle
 * it watches the next match (→WEB-50).
 */
function NextMatchAction({
  client,
  controller,
  controls,
}: {
  client: GameClient;
  controller: ProgressionController;
  controls: PitchControls;
}) {
  const busy = useGameState((state) => state.busy);
  const [pending, setPending] = useState(false);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  const critical = useGameState((state) => state.view?.world.critical);
  const live = useGameState((state) => !!state.playback);
  const days = useGameState((state) => state.view && daysUntilNextMatch(state.view.world));
  if (live && !controls.finished)
    return (
      <button
        className={t.watch}
        aria-label="결과 보기"
        aria-describedby="match-next-hint"
        data-testid="match-next-action"
        onClick={controls.reveal}
      >
        <b>
          결과 보기 <span aria-hidden="true">⏭</span>
        </b>
        <small id="match-next-hint">종료 휘슬까지 바로 넘어가요</small>
      </button>
    );
  return (
    <button
      className={t.watch}
      aria-label="다음 경기 관전"
      aria-describedby="match-next-hint"
      data-testid="match-next-action"
      disabled={pending || busy || readonly || !!error || !!critical}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void watchNextMatch(client, controller, () => undefined, { background: true }).finally(() =>
          setPending(false),
        );
      }}
    >
      <b>
        다음 경기 관전 <span aria-hidden="true">▶</span>
      </b>
      <small id="match-next-hint">
        {days ? `${days}일 진행 후 킥오프` : days === 0 ? '지금 바로 킥오프' : '새 시즌 일정 시작'}
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
  const readiness = lineupSummary(startingSquad(w, clubOf(w)));
  const record = playback?.record;
  const side = record?.home === w.playerClub ? 0 : 1;
  const ownGoals = side === 0 ? record?.score.home : record?.score.away;
  const otherGoals = side === 0 ? record?.score.away : record?.score.home;
  return (
    <div className={t.feedback} data-testid="match-feedback" aria-label="경기 결과와 다음 준비">
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
  client,
  controller,
  onPrepare,
  clock,
}: {
  client: GameClient;
  controller: ProgressionController;
  onPrepare: () => void;
  /** Only the open theatre owns a clock; the app shell draws it everywhere else. */
  clock: boolean;
}) {
  const w = useGameState(selectMatchWorld)!;
  const playback = useGameState((state) => state.playback);
  const automatic = useProgression(controller, (state) => state.running && state.watching);
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
  const { setPage } = useNavigation();
  const publish = useMatchView((state) => state.set);
  useEffect(() => {
    publish({ matchId: presentation.matchId, finished: presentation.finished });
  }, [presentation.matchId, presentation.finished, publish]);
  const onFinish = useCallback(
    (id: string) => {
      if (completed.current !== id) {
        completed.current = id;
        setFinishedWorld(gameStore.getSnapshot().view?.world);
      }
      controller.finishMatch(id);
    },
    [controller],
  );
  const onPlaybackStart = useCallback((id: string) => controller.beginMatch(id), [controller]);
  return (
    <div className={t.matchPane} data-testid="match-theatre">
      <header className={t.heading}>
        <button className={t.back} onClick={() => setPage('dashboard')}>
          <span aria-hidden="true">‹</span> 홈
        </button>
        <h2>매치데이</h2>
        <p>결과는 킥오프 전에 정해져 있어요. 속도를 바꿔도 결과는 같아요.</p>
        {clock && (
          <ProgressControls client={client} controller={controller} compact className={t.clock} />
        )}
      </header>
      <section>
        <Pitch
          playback={playback}
          world={w}
          onFinish={onFinish}
          onPlaybackStart={onPlaybackStart}
          onPresentationChange={onPresentationChange}
          actions={(controls) => (
            <div className={t.coreActions}>
              <MatchFeedback finished={finished} />
              <div className={t.nextActions}>
                <button onClick={onPrepare}>전술·선발 준비</button>
                <NextMatchAction client={client} controller={controller} controls={controls} />
              </div>
            </div>
          )}
        />
      </section>
      {presentation.details &&
        finished &&
        !automatic &&
        finishedWorld &&
        completed.current === playback?.record.id && (
          <div className={s.afterMatch}>
            <LeagueOverview w={finishedWorld} onOpenLeague={() => setPage('league')} />
            <section className={s.panel}>
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

const TablePane = memo(function TablePane() {
  const w = useGameState(selectLeagueWorld)!;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const [code, setCode] = useState(own.country);
  const [tier, setTier] = useState(own.tier);
  const [group, setGroup] = useState(own.group);
  const previousLeague = useRef({ code: own.country, tier: own.tier, group: own.group });
  useEffect(() => {
    const previous = previousLeague.current;
    if (code === previous.code && tier === previous.tier && group === previous.group) {
      setCode(own.country);
      setTier(own.tier);
      setGroup(own.group);
    }
    previousLeague.current = { code: own.country, tier: own.tier, group: own.group };
  }, [own.country, own.tier, own.group]);
  const cp = country(code);
  const ownLeague = code === own.country && tier === own.tier && group === own.group;
  const ids = ownLeague
    ? ownLeagueIds(w)
    : w.clubs
        .filter(
          (club) =>
            club.country === code &&
            club.tier === tier &&
            club.group === group &&
            !club.representative,
        )
        .map((club) => club.id);
  return (
    <>
      <h2 className={s.seasonPaneTitle}>리그 순위표</h2>
      <div className={s.filters}>
        <label>
          국가{' '}
          <Select
            aria-label="국가"
            value={code}
            onValueChange={(value) => {
              setCode(value);
              setTier(0);
              setGroup(0);
            }}
          >
            {COUNTRIES.map((cp) => (
              <option key={cp.code} value={cp.code}>
                {cp.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          디비전{' '}
          <Select
            aria-label="디비전"
            value={tier}
            onValueChange={(value) => {
              setTier(Number(value));
              setGroup(0);
            }}
          >
            {cp.groups.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}부
              </option>
            ))}
            {w.lower && code === own.country && (
              <option value={own.tier}>하부 리그 · 프로 복귀 도전</option>
            )}
          </Select>
        </label>
        {cp.groups[tier]?.length > 1 && (
          <label>
            지역 그룹{' '}
            <Select
              aria-label="지역 그룹"
              value={group}
              onValueChange={(value) => setGroup(Number(value))}
            >
              {cp.groups[tier].map((_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
      <section className={s.panel}>
        <Standings w={w} ids={ids} />
      </section>
    </>
  );
});
/** The own league at a glance: race position, gaps, form, next rival and the fixture notebook. */
const OverviewPane = memo(function OverviewPane({ client }: { client: GameClient }) {
  const w = useGameState(selectLeagueWorld)!;
  return (
    <>
      <h2 className={s.seasonPaneTitle}>우리 리그 개요</h2>
      <LeagueOverview w={w} />
      <FixtureNotebook w={w} client={client} />
    </>
  );
});
const RankPane = memo(function RankPane() {
  const w = useGameState(selectLeagueWorld)!;
  return <RankHistoryGraph w={w} />;
});
const ScorersPane = memo(function ScorersPane() {
  const w = useGameState(selectScorerWorld)!;
  return <ScorerStandings w={w} />;
});
const ScorerTrendPane = memo(function ScorerTrendPane() {
  const w = useGameState(selectScorerWorld)!;
  return <ScorerHistory w={w} />;
});
const ResultsPane = memo(function ResultsPane() {
  const w = useGameState(selectLeagueWorld)!;
  return <RoundResults w={w} ids={ownLeagueIds(w)} />;
});
/** Panels stay mounted. The simulation and canvas keep their identity when tabs change. */
export function LiveSeason({
  page,
  client,
  controller,
}: {
  page: Page;
  client: GameClient;
  controller: ProgressionController;
}) {
  const active = page === 'match' || page === 'league';
  const requestedPage = useNavigation((state) => state.page);
  const [preparing, setPreparing] = useState(false);
  const visibleTabs = LEAGUE_TABS;
  const [leagueTab, setLeagueTab] = useState<Tab>(() => {
    const saved = new URLSearchParams(location.search).get('view');
    return LEAGUE_TABS.find(([id]) => id === saved)?.[0] || 'overview';
  });
  const tab: Tab = page === 'match' ? 'match' : leagueTab;
  useEffect(() => {
    if (page !== 'league') return;
    const url = new URL(location.href);
    url.searchParams.set('view', leagueTab);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [page, leagueTab]);
  useEffect(() => {
    controller.setWatching(active && requestedPage === page && tab === 'match');
  }, [active, requestedPage, page, tab, controller]);
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
      {page === 'league' && (
        <div className={t.navigation}>
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
          hidden={tab !== id}
        >
          {id === 'match' ? (
            <MatchPane
              client={client}
              controller={controller}
              onPrepare={onPrepare}
              clock={page === 'match'}
            />
          ) : id === 'overview' ? (
            <OverviewPane client={client} />
          ) : id === 'table' ? (
            <TablePane />
          ) : id === 'rank' ? (
            <RankPane />
          ) : id === 'scorers' ? (
            <ScorersPane />
          ) : id === 'scorer-trend' ? (
            <ScorerTrendPane />
          ) : (
            <ResultsPane />
          )}
        </section>
      ))}
      {preparing && page === 'match' && (
        <StrategyPanelSheet client={client} onClose={() => setPreparing(false)} />
      )}
    </div>
  );
}
function StrategyPanelSheet({ client, onClose }: { client: GameClient; onClose: () => void }) {
  const w = useGameState(selectStrategyWorld)!;
  return <StrategyPanel w={w} client={client} onClose={onClose} />;
}
