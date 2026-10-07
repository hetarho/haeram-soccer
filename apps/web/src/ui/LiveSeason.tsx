import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import { useProgression, type ProgressionController } from '../runtime/progression';
import { useNavigation, type Page } from './state';
import { Pitch } from './Pitch';
import { LeagueOverview, RankHistoryGraph, Standings, RoundResults } from './LeagueInsights';
import { ScorerStandings, ScorerHistory } from './ScorerPanels';
import { StrategyPanel } from './StrategyPanel';
import { ownLeagueIds } from './league';
import {
  selectLeagueWorld,
  selectMatchWorld,
  selectScorerWorld,
  selectStrategyWorld,
} from './liveState';
import s from './App.module.css';

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

const MatchPane = memo(function MatchPane({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const w = useGameState(selectMatchWorld)!;
  const playback = useGameState((state) => state.playback);
  const processing = useGameState((state) => state.processing);
  const readonly = useGameState((state) => state.readonly);
  const automatic = useProgression(controller, (state) => state.running && state.watching);
  const [finishedWorld, setFinishedWorld] = useState<World>();
  const completed = useRef<string | undefined>(undefined);
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
    <>
      <div className={s.hero}>
        <div>
          <h2>90분의 작은 드라마.</h2>
          <p>관전 중 자동 진행은 경기가 끝나면 다음 경기를 이어갑니다.</p>
        </div>
        <button
          className={s.primary}
          disabled={processing || readonly}
          onClick={() => void client.command({ type: 'next-match' }, { background: true })}
        >
          다음 경기 관전
        </button>
      </div>
      <section className={s.panel}>
        <Pitch
          playback={playback}
          world={w}
          onFinish={onFinish}
          onPlaybackStart={onPlaybackStart}
        />
      </section>
      {!automatic && finishedWorld && completed.current === playback?.record.id && (
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
    </>
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
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next][0]);
    document.getElementById(`season-tab-${TABS[next][0]}`)?.focus();
  };
  return (
    <div hidden={!active} data-testid="live-season">
      <div className={s.seasonTabs} role="tablist" aria-label="시즌 보기">
        {TABS.map(([id, label], i) => (
          <button
            key={id}
            id={`season-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`season-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => keyboard(event, i)}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {TABS.map(([id]) => (
        <section
          key={id}
          id={`season-panel-${id}`}
          className={s.seasonPane}
          role="tabpanel"
          aria-labelledby={`season-tab-${id}`}
          hidden={tab !== id}
        >
          {id === 'match' ? (
            <MatchPane client={client} controller={controller} />
          ) : id === 'table' ? (
            <TablePane />
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
