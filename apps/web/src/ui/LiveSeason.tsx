import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { clubOf, startingSquad, tacticLabel } from '../../../../packages/engine/src/world';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import { useProgression, type ProgressionController } from '../runtime/progression';
import { useNavigation, type Page } from './state';
import { Pitch } from './Pitch';
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
  ['table', '순위표'],
  ['rank', '순위 추이'],
  ['scorers', '득점 순위'],
  ['scorer-trend', '득점왕 추이'],
  ['strategy', '전술·선발'],
  ['results', '일정·결과'],
] as const;
type Tab = (typeof TABS)[number][0];
const MOBILE_TABS = TABS.filter(([id]) => ['match', 'table', 'strategy'].includes(id));

function NextMatchAction({ client }: { client: GameClient }) {
  const processing = useGameState((state) => state.processing);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  const critical = useGameState((state) => state.view?.world.critical);
  return (
    <button
      className={t.watch}
      data-testid="match-next-action"
      disabled={processing || readonly || !!error || !!critical}
      onClick={() => {
        const state = gameStore.getSnapshot();
        if (state.processing || state.readonly || state.error || state.view?.world.critical) return;
        void client.command({ type: 'next-match' }, { background: true });
      }}
    >
      다음 경기 관전
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
}: {
  client: GameClient;
  controller: ProgressionController;
  onPrepare: () => void;
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
        <h2>90분의 작은 드라마.</h2>
        <p>우리 선발의 선택을 지켜보고 다음 경기를 준비해요.</p>
      </header>
      <section>
        <Pitch
          playback={playback}
          world={w}
          onFinish={onFinish}
          onPlaybackStart={onPlaybackStart}
          onPresentationChange={onPresentationChange}
          afterControls={
            <div className={t.coreActions}>
              <MatchFeedback finished={finished} />
              <div className={t.nextActions}>
                <button onClick={onPrepare}>다음 경기 준비</button>
                <NextMatchAction client={client} />
              </div>
            </div>
          }
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

const TablePane = memo(function TablePane({ client }: { client: GameClient }) {
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
          <select
            aria-label="국가"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setTier(0);
              setGroup(0);
            }}
          >
            {COUNTRIES.map((cp) => (
              <option key={cp.code} value={cp.code}>
                {cp.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          디비전{' '}
          <select
            value={tier}
            onChange={(event) => {
              setTier(Number(event.target.value));
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
          </select>
        </label>
        {cp.groups[tier]?.length > 1 && (
          <label>
            지역 그룹{' '}
            <select value={group} onChange={(event) => setGroup(Number(event.target.value))}>
              {cp.groups[tier].map((_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <FixtureNotebook w={w} client={client} />
      {ownLeague && <LeagueOverview w={w} />}
      <section className={s.panel}>
        <Standings w={w} ids={ids} />
      </section>
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
const StrategyPane = memo(function StrategyPane({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const w = useGameState(selectStrategyWorld)!;
  const onSuspend = useCallback(
    (suspended: boolean) => controller.setSuspended(suspended),
    [controller],
  );
  return <StrategyPanel w={w} client={client} onSuspendChange={onSuspend} />;
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
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const visibleTabs = mobile ? MOBILE_TABS : TABS;
  const [tab, setTab] = useState<Tab>(() => {
    const saved = new URLSearchParams(location.search).get('view');
    return TABS.find(([id]) => id === saved)?.[0] || (page === 'league' ? 'table' : 'match');
  });
  const previousPage = useRef(page);
  useEffect(() => {
    if (active && previousPage.current !== page) setTab(page === 'league' ? 'table' : 'match');
    previousPage.current = page;
  }, [page, active]);
  useEffect(() => {
    if (!active) return;
    const url = new URL(location.href);
    url.searchParams.set('view', tab);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [active, tab]);
  useEffect(() => {
    controller.setWatching(active && tab === 'match');
  }, [active, tab, controller]);
  const onPrepare = useCallback(() => {
    setTab('strategy');
    document.getElementById('season-tab-strategy')?.focus();
  }, []);
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
    setTab(visibleTabs[next][0]);
    document.getElementById(`season-tab-${visibleTabs[next][0]}`)?.focus();
  };
  return (
    <div hidden={!active} data-testid="live-season" className={t.liveSeason}>
      <div className={t.navigation}>
        <div className={`${s.seasonTabs} ${t.tabs}`} role="tablist" aria-label="시즌 보기">
          {visibleTabs.map(([id, label], i) => (
            <button
              key={id}
              id={`season-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`season-panel-${id}`}
              tabIndex={
                tab === id || (i === 0 && !visibleTabs.some(([visible]) => visible === tab))
                  ? 0
                  : -1
              }
              onKeyDown={(event) => keyboard(event, i)}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {mobile && (
          <select
            className={t.statistics}
            aria-label="시즌 통계 보기"
            value={MOBILE_TABS.some(([id]) => id === tab) ? '' : tab}
            onChange={(event) => {
              if (event.target.value) setTab(event.target.value as Tab);
            }}
          >
            <option value="" disabled>
              통계
            </option>
            {TABS.filter(([id]) => !MOBILE_TABS.some(([visible]) => visible === id)).map(
              ([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ),
            )}
          </select>
        )}
      </div>
      {TABS.map(([id, label]) => (
        <section
          key={id}
          id={`season-panel-${id}`}
          className={`${s.seasonPane} ${t.pane}`}
          role="tabpanel"
          aria-labelledby={
            !mobile || MOBILE_TABS.some(([visible]) => visible === id)
              ? `season-tab-${id}`
              : undefined
          }
          aria-label={
            mobile && !MOBILE_TABS.some(([visible]) => visible === id) ? label : undefined
          }
          hidden={tab !== id}
        >
          {id === 'match' ? (
            <MatchPane client={client} controller={controller} onPrepare={onPrepare} />
          ) : id === 'table' ? (
            <TablePane client={client} />
          ) : id === 'rank' ? (
            <RankPane />
          ) : id === 'scorers' ? (
            <ScorersPane />
          ) : id === 'scorer-trend' ? (
            <ScorerTrendPane />
          ) : id === 'strategy' ? (
            <StrategyPane client={client} controller={controller} />
          ) : (
            <ResultsPane />
          )}
        </section>
      ))}
    </div>
  );
}
