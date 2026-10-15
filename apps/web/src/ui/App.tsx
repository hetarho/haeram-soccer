import { PixelIcon, type PixelIconName } from './PixelIcon';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { country, priceIndex } from '../../../../packages/catalogs/src/index';
import { GameClient, type ClientState } from '../runtime/client';
import { openPeople, useInterventionDialog, useNavigation, type Page } from './state';
import { TaskReturn } from './TaskReturn';
import { taskAddress, useTaskMemory } from './taskMemory';
import { ClubCrest } from './ClubCrest';
import { ClubLink } from './ClubLink';
import { watchNextMatch } from './watch';
import { compactMoney, competitionLabel, money, number, percent, seasonName } from './format';
import { Money } from './Money';
import { InterventionSettings, ProgressControls } from './ProgressControls';
import { LiveSeason } from './LiveSeason';
import { ClubHub } from './ClubHub';
import { ClubFounding } from './ClubFounding';
import { PlayGuide } from './PlayGuide';
import { gameStore, useGameState } from '../runtime/store';
import { ProgressionController, useProgression } from '../runtime/progression';
import { worldSelector } from './liveState';
import { LeagueOverview, RankHistoryGraph, Standings } from './LeagueInsights';
import { ownLeagueIds } from './league';
import {
  daysUntilNextMatch,
  fixtureDate,
  nextOwnFixture,
} from '../../../../packages/engine/src/calendar';
import s from './App.module.css';
import { Dialog } from './Dialog';
import { ActionOutcome } from './ActionOutcome';
import { AnimatedMoney } from './AnimatedMoney';
import { play } from './motion';
import { EventCenter, InboxButton } from './EventCenter';
import { RemedySheet } from './RemedySheet';
import { GlossaryHost } from './Glossary';
import { useGlossary } from './metricGlossary';
import { NewsButton, NewsSheet, useNewsSheet } from './NewsFeed';
import { CelebrationHost } from './Celebration';
import { CupsView } from './CupsView';
import { TeamSheetHost } from './TeamSheet';
import { PlayerSheetHost } from './PlayerSheet';
import { cashState } from './teamState';
import {
  BANKRUPTCY_ROUNDS,
  CASH_WARNING_ROUNDS,
  MANAGER_GONE,
} from '../../../../packages/engine/src/operations';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { GameSlots } from '../runtime/slots';
import { GameIndexStore } from '../adapters/games';
import { useTabTitle } from './tabTitle';

/** The away card loads only when a run waits to be summarized (→WEB-64, →ARCH-28). */
const AwaySummary = lazy(() =>
  import('./AwaySummary').then((module) => ({ default: module.AwaySummary })),
);
function AwayHost({ controller }: { controller: ProgressionController }) {
  const away = useProgression(controller, (state) => !!state.away);
  return away ? (
    <Suspense fallback={null}>
      <AwaySummary controller={controller} />
    </Suspense>
  ) : null;
}
/**
 * The squad, staff, operations and records pages load as their own chunk, outside the first-play
 * entry (→ARCH-28). It is fetched once a game is in play, so a first visit seldom waits for it.
 */
const loadRich = () => import('./Rich');
const Rich = lazy(loadRich);
/** The slot screen loads on its own, outside the first-play entry (→ARCH-28). */
const GameSlotScreen = lazy(() =>
  import('./GameSlotScreen').then((module) => ({ default: module.GameSlotScreen })),
);

/** Set while this tab is in a game, so a reload continues it instead of showing the slots. */
const IN_GAME = 'haeram-soccor:in-game';
/** Set by deleting the game in play: the page reloads onto the slot screen, even all empty. */
const BACK_TO_SLOTS = 'haeram-soccor:back-to-slots';
/** Read once per page load: a state initializer may run twice. */
const backToSlots = (() => {
  try {
    const set = sessionStorage.getItem(BACK_TO_SLOTS) === '1';
    sessionStorage.removeItem(BACK_TO_SLOTS);
    return set;
  } catch {
    return false;
  }
})();
/** Reloads the page away from a deleted game in play, back onto the slot screen (→WEB-62). */
function reloadToSlots() {
  try {
    sessionStorage.setItem(BACK_TO_SLOTS, '1');
  } catch {
    /* without session storage the reload opens as the start address would */
  }
  location.reload();
}
/**
 * The start address opens on the slot screen whenever a slot holds a game (→WEB-62); an in-game
 * address or a reload of a tab already in a game continues the game in play.
 */
function initialScreen(): 'slots' | 'game' {
  try {
    if (backToSlots) return 'slots';
    if (location.pathname !== '/' || sessionStorage.getItem(IN_GAME) === '1') return 'game';
    return new GameIndexStore(localStorage).hasGames() ? 'slots' : 'game';
  } catch {
    return 'game';
  }
}
function rememberInGame(inGame: boolean) {
  try {
    if (inGame) sessionStorage.setItem(IN_GAME, '1');
    else sessionStorage.removeItem(IN_GAME);
  } catch {
    /* Without session storage a reload shows the slots again. */
  }
}
function NavIcon({ page }: { page: Page }) {
  const names: Record<Page, PixelIconName> = {
    dashboard: 'home',
    match: 'ball',
    league: 'table',
    europe: 'cup',
    people: 'people',
    training: 'training',
    business: 'trend',
    history: 'history',
  };
  return <PixelIcon name={names[page]} size={20} className={s.navIcon} />;
}
export function Crest({ color = '#b4c399' }: { color?: string }) {
  return <span className={s.crest} style={{ backgroundColor: color }} aria-hidden="true" />;
}
export function Panel({
  title,
  note,
  action,
  children,
  footer,
}: {
  title: string;
  note?: ReactNode;
  /** A control at the header's end, such as a view-settings button. */
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h3>{title}</h3>
        {note && <span>{note}</span>}
        {action}
      </div>
      {children}
      {footer && <div className={s.panelFoot}>{footer}</div>}
    </section>
  );
}
export function Table({ w, ids, limit }: { w: World; ids: string[]; limit?: number }) {
  return <Standings w={w} ids={ids} limit={limit} />;
}
function ClubJournal({
  state,
  client,
  controller,
}: {
  state: ClientState;
  client: GameClient;
  controller: ProgressionController;
}) {
  const setPage = useNavigation((state) => state.setPage);
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    t = w.tables[c.id],
    next = nextOwnFixture(w),
    home = w.clubs.find((c) => c.id === next?.home),
    away = w.clubs.find((c) => c.id === next?.away);
  const members = w.clubs.filter((club) => ownLeagueIds(w).includes(club.id));
  const last = w.ownMatches.slice(-5);
  const remaining = w.fixtures.filter(
    (f) =>
      !f.score &&
      ['league', 'lower'].includes(f.kind) &&
      (f.home === w.playerClub || f.away === w.playerClub),
  ).length;
  const winRate = percent(t.won, t.played);
  const watch = () => watchNextMatch(client, controller, () => setPage('match'));
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>SEASON {seasonName(w.year)}</div>
          <h2>{c.name}</h2>
          <p>
            {w.lower ? '아마추어 리그' : `${c.tier + 1}부`} · 남은 우리 리그 경기{' '}
            {Math.max(0, remaining)}개
          </p>
        </div>
        <div className={s.heroActions}>
          <button
            disabled={state.busy || state.readonly}
            aria-describedby="journal-round-hint"
            onClick={() => void client.command({ type: 'advance', rounds: 1 })}
          >
            한 라운드 진행
          </button>
          <button
            className={s.primary}
            disabled={state.busy || state.readonly}
            aria-describedby="journal-season-hint"
            onClick={() => void client.command({ type: 'season', count: 1 })}
          >
            시즌 끝까지 진행
          </button>
          <small id="journal-round-hint">
            한 라운드 진행: 관전 없이 이번 라운드 경기와 급여·훈련을 정산해요.
          </small>
          <small id="journal-season-hint">
            시즌 끝까지 진행: 남은 경기를 모두 결과로 처리하고 승강·상금을 정산해요.
          </small>
        </div>
      </div>
      <LeagueOverview w={w} onOpenLeague={() => setPage('league')} />
      <div className={s.stats}>
        {(
          [
            [
              '운영 자금',
              <Money value={w.cash} code={c.country} year={w.year} />,
              <>
                연간 운영비 <Money value={v.annualCost} code={c.country} year={w.year} />
              </>,
            ],
            ['우리의 서포터', number(c.fans), '경기 결과·해외 마케팅·글로벌 인지도에 따라 변화'],
            [
              '이번 시즌',
              `${t.points} pts`,
              `${t.played}경기 · ${t.won}승 ${t.drawn}무 ${t.lost}패`,
            ],
            [
              '쌓아온 기록',
              `${number(v.totalMatches)} matches`,
              `${w.history.length}개 시즌 · 승률 ${winRate}`,
            ],
          ] as [string, ReactNode, ReactNode][]
        ).map(([label, value, note]) => (
          <div className={s.stat} key={label}>
            <div className={s.label}>{label}</div>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className={s.grid}>
        <div className={s.stack}>
          <Panel title="다음 경기" note={<NextMatchNote />}>
            <div className={s.fixture}>
              <small>
                {seasonName(w.year)} · {country(c.country).name} · {c.tier + 1}부
              </small>
              <div className={s.fixtureTeams}>
                <div>
                  {home ? <ClubLink w={w} id={home.id} crest={20} /> : '시즌의 마지막 페이지'}
                </div>
                <b>vs</b>
                <div>
                  {away ? <ClubLink w={w} id={away.id} crest={20} /> : '다음 시즌을 기다립니다'}
                </div>
              </div>
              <button
                className={s.coral}
                disabled={state.busy || state.readonly}
                onClick={() => void watch()}
              >
                {next ? '다음 경기 관전' : '다음 시즌 시작'} ▷
              </button>
            </div>
            <div className={s.panelFoot}>
              최근 경기{' '}
              {last.length
                ? last.map((m) => {
                    const a = m.home === w.playerClub ? m.score.home : m.score.away,
                      b = m.home === w.playerClub ? m.score.away : m.score.home;
                    return (
                      <span key={m.id} className={s.pill} style={{ marginRight: 6 }}>
                        {a > b ? 'W' : a === b ? 'D' : 'L'} {a}–{b}
                      </span>
                    );
                  })
                : '아직 첫 휘슬이 울리지 않았습니다.'}
            </div>
          </Panel>
          <RankHistoryGraph w={w} />
          <Panel
            title="리그의 지금"
            note={`${c.tier + 1}부 · ${members.length} CLUBS`}
            footer={<button onClick={() => setPage('league')}>전체 리그 보기 →</button>}
          >
            <Table w={w} ids={members.map((c) => c.id)} limit={6} />
          </Panel>
        </div>
        <div className={s.stack}>
          <Panel title="클럽의 작은 소식" note="THE NOTICEBOARD">
            <div className={s.panelBody}>
              <ul className={s.timeline}>
                {w.events
                  .slice(-7)
                  .reverse()
                  .map((e, i) => (
                    <li key={i}>
                      <small>
                        {e.year} · ROUND {e.round}
                      </small>
                      <h3>{e.title}</h3>
                      <p>{e.detail}</p>
                    </li>
                  ))}
              </ul>
            </div>
          </Panel>
          <Panel title="숫자로 보는 이번 시즌" note="ON THE PITCH">
            <div className={s.panelBody}>
              <div className={s.attribute}>
                <span>득점 / 실점</span>
                <b>
                  {t.gf} / {t.ga}
                </b>
              </div>
              <div className={s.attribute}>
                <span>클럽 평판</span>
                <b>{number(c.reputation)} / 100</b>
              </div>
              <div className={s.attribute}>
                <span>감독과의 신뢰</span>
                <b>{number(w.manager.trust)} / 100</b>
              </div>
              <div className={s.attribute}>
                <span>연간 손익</span>
                <b>
                  <Money
                    value={BigInt(w.income) - BigInt(w.expense)}
                    code={c.country}
                    year={w.year}
                  />
                </b>
              </div>
            </div>
            <div className={s.panelFoot}>지표를 비교하고, 다음 선택을 바꿔보세요.</div>
          </Panel>
        </div>
      </div>
    </>
  );
}
/** The match view has no menu entry: it opens only from a watch action (→WEB-40). */
const NAV: [Page, string][] = [
  ['dashboard', '클럽 홈'],
  ['league', '리그'],
  ['europe', '컵 대회'],
  ['history', '클럽 기록실'],
  ['people', '선수·스태프'],
  ['training', '훈련·육성'],
  ['business', '구단 방향'],
];
/**
 * Home sits in the raised centre; competition destinations fan out to the left and the owner's
 * three levers to the right: 사람 (who joins and stays), 훈련 (how players develop) and 방향 (where
 * the club is going and how it earns and spends, →WEB-10). The transfer market and the staff are tabs of 사람.
 */
const TABS: [Page, string, string, Page[]][] = [
  ['league', '리그', '리그', ['league']],
  ['europe', '컵', '컵 대회', ['europe']],
  ['history', '기록', '클럽 기록실', ['history']],
  ['dashboard', '홈', '클럽 홈', ['dashboard']],
  ['people', '사람', '선수·스태프', ['people']],
  ['training', '훈련', '훈련·육성', ['training']],
  ['business', '방향', '구단 방향', ['business']],
];
/** The HUD menu lists only destinations the tab bar does not already show. */
const MENU_PAGES = NAV.filter(([id]) => !TABS.some(([tab]) => tab === id));
const selectContentWorld = worldSelector([
  'year',
  'round',
  'playerClub',
  'clubs',
  'tables',
  'fixtures',
  'rankHistory',
  'scorerSeason',
  'players',
  'trainingOrders',
  'manager',
  'lineup',
  'tactic',
  'requested',
  'ownMatches',
  'history',
  'events',
  'cash',
  'income',
  'expense',
  'currency',
  'support',
  'stadium',
  'trainingGround',
  'academyFacility',
  'facilityWorks',
  'ticket',
  'campaigns',
  'sponsors',
  'lower',
  'europe',
  'critical',
  // Staff, policy, intervention and bid decisions can change only these keys.
  'policy',
  'staff',
  'academy',
  'intervention',
  'bids',
  'morale',
  'inbox',
  'build',
  'direction',
  'managerMarket',
]);
function useContentState(): ClientState {
  const world = useGameState(selectContentWorld);
  const busy = useGameState((state) => state.busy);
  const readonly = useGameState((state) => state.readonly);
  const totalMatches = useGameState((state) => state.view?.totalMatches);
  const annualCost = useGameState((state) => state.view?.annualCost);
  const milestones = useGameState((state) => state.view?.milestones);
  const managers = useGameState((state) => state.view?.managers);
  const transfers = useGameState((state) => state.view?.transfers);
  const sponsors = useGameState((state) => state.view?.sponsors);
  const state = gameStore.getSnapshot();
  return {
    ...state,
    busy,
    readonly,
    view:
      world && state.view
        ? {
            ...state.view,
            world,
            totalMatches: totalMatches!,
            annualCost: annualCost!,
            milestones: milestones!,
            managers: managers!,
            transfers: transfers!,
            sponsors: sponsors!,
          }
        : undefined,
  };
}
const ConnectedFounding = memo(function ConnectedFounding({
  client,
  replace,
  slot,
  onBack,
  onDone,
}: {
  client: GameClient;
  replace: boolean;
  slot: number;
  onBack?: () => void;
  onDone: () => void;
}) {
  const state = useGameState((state) => state);
  if (state.busy && !state.view)
    return (
      <div className={s.loading} role="status">
        클럽을 준비하고 있어요…
      </div>
    );
  return (
    <ClubFounding
      client={client}
      state={state}
      replace={replace}
      slot={slot}
      onBack={onBack}
      onDone={onDone}
    />
  );
});
const ConnectedDashboard = memo(function ConnectedDashboard({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const state = useContentState();
  return (
    <ClubHub
      w={state.view!.world}
      milestoneFacts={state.view!.milestones}
      client={client}
      controller={controller}
      journal={<ClubJournal client={client} state={state} controller={controller} />}
    />
  );
});
const ConnectedEurope = memo(function ConnectedEurope({ client }: { client: GameClient }) {
  const state = useContentState();
  return <CupsView w={state.view!.world} coefficient={state.view!.coefficient} client={client} />;
});
/** Kept apart from the shell's renders: a page change re-renders only the page shown next. */
const ConnectedRich = memo(function ConnectedRich({
  client,
  page,
}: {
  client: GameClient;
  page: Page;
}) {
  const state = useContentState();
  return (
    <Suspense
      fallback={
        <div className={s.loading} role="status">
          화면을 여는 중…
        </div>
      }
    >
      <Rich client={client} state={state} page={page} />
    </Suspense>
  );
});
function CalendarText() {
  const year = useGameState((state) => state.view?.world.year)!;
  const round = useGameState((state) => state.view?.world.round);
  return <>{`${seasonName(year)} · 라운드 ${round}`}</>;
}
/**
 * Cash is the one resource every decision spends, so it stays pinned to the top right; tapping it
 * shows how long it lasts and the ways to raise or save money (→WEB-44).
 */
function HudCash({ client }: { client?: GameClient }) {
  const w = useGameState((state) => state.view?.world);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const state = cashState(w);
  const exact = money(w.cash, own.country, w.year);
  return (
    <>
      <button
        className={`${s.hudCash} ${BigInt(w.cash) < 0n ? s.hudCashNegative : state.tone === 'warn' || state.tone === 'bad' ? s.hudCashWarn : ''}`}
        data-testid="hud-cash"
        title={exact}
        aria-label={`운영 자금 ${exact} · ${state.status} · 자금 상황 보기`}
        disabled={!client}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span>
          <small>운영 자금</small>
          {/* The money notation on every viewport (→WEB-67); the exact amount is the title. */}
          <AnimatedMoney
            value={w.cash}
            format={(value) => compactMoney(value, own.country, w.year)}
            upClass={s.cashUp}
            downClass={s.cashDown}
          />
        </span>
      </button>
      {open && client && (
        <RemedySheet w={w} client={client} state="cash" onClose={() => setOpen(false)} />
      )}
    </>
  );
}
const GameHud = memo(function GameHud({
  onMenu,
  playing,
  client,
}: {
  onMenu: () => void;
  /** Founding, even beside a parked game, shows the start HUD: no club, menu, inbox or cash. */
  playing: boolean;
  client?: GameClient;
}) {
  const own = useGameState((state) =>
    playing
      ? state.view?.world.clubs.find((club) => club.id === state.view?.world.playerClub)
      : undefined,
  );
  const lower = useGameState((state) => state.view?.world.lower);
  const crestWorld = useGameState((state) => state.view?.world.clubs && state.view.world);
  return (
    <header className={s.hud}>
      {playing && (
        <button
          className={s.hudMenu}
          aria-label="전체 메뉴"
          onClick={(event) => {
            event.currentTarget.focus();
            onMenu();
          }}
        >
          <PixelIcon name="menu" size={20} />
        </button>
      )}
      <div className={s.hudClub}>
        {own && crestWorld ? (
          <ClubCrest w={crestWorld} id={own.id} size={26} className={s.hudCrest} />
        ) : (
          <Crest color={own?.color} />
        )}
        <div>
          <b>{own?.name || 'Haeram Football'}</b>
          <small data-testid="calendar">
            {own ? (
              <>
                {`${lower ? '아마추어 리그' : `${own.tier + 1}부`} · `}
                <CalendarText />
              </>
            ) : (
              '1950 · A NEW BEGINNING'
            )}
          </small>
        </div>
      </div>
      <ReadonlyBadge />
      {client && playing && <InboxButton client={client} />}
      {playing && <HudCash client={client} />}
    </header>
  );
});
/** Read-only ownership is a small HUD badge that explains itself on tap (→WEB-10). */
function ReadonlyBadge() {
  const readonly = useGameState((state) => state.readonly && !!state.view);
  const notice = useGameState((state) => state.notice);
  const [open, setOpen] = useState(false);
  if (!readonly) return null;
  const text = notice || '다른 탭이 플레이 중입니다. 이 탭은 읽기 전용입니다.';
  return (
    <span className={s.readonlyBadge} role="status">
      <button aria-expanded={open} title={text} onClick={() => setOpen(!open)}>
        <PixelIcon name="eye" size={14} />
        읽기 전용
      </button>
      <span className={open ? s.readonlyDetail : s.srOnly}>{text}</span>
    </span>
  );
}
function NextMatchNote() {
  const w = useGameState((state) => state.view?.world)!;
  const next = nextOwnFixture(w);
  return (
    <>
      {next
        ? `${fixtureDate(w, next)} · ${daysUntilNextMatch(w)}일 후 · ${competitionLabel(w, next)}`
        : '시즌 마무리'}
    </>
  );
}
/**
 * The end of a career (→ECON-24): what the club achieved before it went under, its records to
 * keep and a new club to found.
 */
function GameOver({
  w,
  onExport,
  onNew,
  onSlots,
}: {
  w: World;
  onExport: () => void;
  onNew: () => void;
  onSlots: () => void;
}) {
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const best = w.history.reduce<(typeof w.history)[number] | undefined>(
    (top, season) =>
      !top || season.tier < top.tier || (season.tier === top.tier && season.rank < top.rank)
        ? season
        : top,
    undefined,
  );
  // Leagues, cups and continental titles recorded season by season (the event tail is bounded).
  const titles = w.history.reduce(
    (count, season) =>
      count +
      season.champions.filter((title) => title.club === own.id).length +
      season.europe.filter((tournament) => tournament.winner === own.id).length,
    0,
  );
  const peak = Math.max(own.fans, ...w.history.map((season) => season.fans));
  return (
    <section className={s.gameOver} data-testid="game-over" aria-label="게임 오버">
      <small>GAME OVER</small>
      <h2>{own.name} 파산</h2>
      <p>
        {seasonName(w.bankrupt!.year)} 시즌, 적자를 {w.insolvent ?? 0}라운드 동안 벗어나지 못해
        구단이 문을 닫았어요. 남은 건 우리가 쌓은 기록이에요.
      </p>
      <ul>
        <li>
          <span>함께한 시즌</span>
          <b>{w.history.length}</b>
        </li>
        <li>
          <span>최고 성적</span>
          <b>
            {best
              ? `${best.tier >= country(own.country).groups.length ? '아마추어' : `${best.tier + 1}부`} ${best.rank}위`
              : '—'}
          </b>
        </li>
        <li>
          <span>우승</span>
          <b>{titles}</b>
        </li>
        <li>
          <span>최다 서포터</span>
          <b>{number(peak)}</b>
        </li>
      </ul>
      <div className={s.gameOverActions}>
        <button onClick={onExport}>기록 내보내기</button>
        <button onClick={onSlots}>게임 슬롯</button>
        <button className={s.primary} onClick={onNew}>
          이 슬롯에서 새 게임
        </button>
      </div>
    </section>
  );
}
/** Debt plays on under a red band counting down to bankruptcy (→ECON-24). */
function CashAlarm() {
  const w = useGameState((state) => state.view?.world);
  if (!w || w.bankrupt) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const cash = BigInt(w.cash);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  if (cash >= 0n && runway >= CASH_WARNING_ROUNDS) return null;
  return (
    <div className={s.cashAlarm} role="status" data-testid="cash-alarm">
      {cash < 0n ? (
        <>
          <b>파산 위기</b> 잔고 <Money value={w.cash} code={own.country} year={w.year} /> ·{' '}
          {BANKRUPTCY_ROUNDS - (w.insolvent ?? 0)}라운드 안에 흑자로 돌아오지 못하면 파산해요
        </>
      ) : (
        <>
          <b>자금 위기</b> 운영비 약 {runway}주분 남음 · 바닥난 채 {BANKRUPTCY_ROUNDS}라운드가
          지나면 파산해요
        </>
      )}
    </div>
  );
}
const RuntimeFeedback = memo(function RuntimeFeedback({
  client,
  localError,
  playing,
}: {
  client: GameClient;
  localError: string;
  /** The club's bands belong to the game in play, never to founding beside a parked one. */
  playing: boolean;
}) {
  const state = useGameState((state) => state);
  const critical = playing ? state.view?.world.critical : undefined;
  const blocked = state.busy || state.readonly;
  return (
    <>
      {(state.error || localError) && (
        <div className={s.error} role="alert">
          {state.error || localError}{' '}
          <button onClick={() => location.reload()}>저장 다시 불러오기</button>
        </div>
      )}
      {/* App notices arrive as system notifications in the HUD inbox, never over the view (→WEB-66). */}
      {playing && <CashAlarm />}
      {critical === MANAGER_GONE ? (
        // The interim manager can carry on, or the owner goes straight to the candidates.
        <div className={s.critical} role="status">
          감독이 떠났어요. 임시 감독이 팀을 맡고 있어요.
          <div className={s.criticalActions}>
            <button
              className={s.primary}
              disabled={blocked}
              onClick={() => {
                void client.acknowledge();
                openPeople('candidates');
              }}
            >
              감독 선임하러 가기
            </button>
            <button disabled={blocked} onClick={() => void client.acknowledge()}>
              임시 감독으로 계속
            </button>
          </div>
        </div>
      ) : (
        critical && (
          <div className={s.critical} role="status">
            {critical}
            <button disabled={blocked} onClick={() => void client.acknowledge()}>
              알림 확인 후 계속
            </button>
          </div>
        )
      )}
      {state.busy && (
        <div className={s.foregroundProgress}>
          <div
            className={s.progress}
            role="progressbar"
            aria-label="세계 처리 진행"
            aria-valuenow={Math.round(state.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${Math.max(5, state.progress * 100)}%` }} />
          </div>
          {state.view && <button onClick={() => client.cancel()}>진행 중단</button>}
        </div>
      )}
    </>
  );
});
function savedAgo(savedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (seconds < 5) return '방금 저장';
  if (seconds < 60) return `${seconds}초 전 저장`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}분 전 저장` : `${Math.floor(minutes / 60)}시간 전 저장`;
}
/**
 * 저장 완료 while every revision is on disk; otherwise when this tab last saved, so a running clock
 * between its background saves reads steadily instead of flipping on every step (→SAVE-8). Start
 * screens say nothing of a game kept beside them.
 */
function useSaveText(playing = true) {
  const w = useGameState((state) => (playing ? state.view?.world : undefined));
  const savedRevision = useGameState((state) => state.savedRevision);
  const savedAt = useGameState((state) => state.savedAt);
  const waiting = !!w && savedRevision !== w.revision && savedAt !== undefined;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  if (!w) return '로그인 없이 시작하세요';
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const status = priceIndex(own.country, w.year).status;
  const saved =
    savedRevision === w.revision
      ? '저장 완료'
      : savedAt !== undefined
        ? savedAgo(savedAt, now)
        : '저장 대기';
  return `${saved} · r${w.revision} · 물가 ${status === 'observed' ? '관측' : status === 'estimated' ? '추정' : '전망'}`;
}
const LiveFooter = memo(function LiveFooter({ playing }: { playing: boolean }) {
  const text = useSaveText(playing);
  return (
    <footer className={s.footer}>
      <span>HAERAM FOOTBALL · 가상의 클럽, 당신의 역사.</span>
      <span data-testid="save-status">{text}</span>
    </footer>
  );
});
function SaveStatus() {
  return <p className={s.menuSave}>기록 · {useSaveText()}</p>;
}
function SaveActions({
  client,
  compact = false,
  onDownload,
  onImport,
  onSlots,
}: {
  client: GameClient;
  compact?: boolean;
  onDownload: () => Promise<void>;
  onImport: (file?: File) => Promise<void>;
  onSlots?: () => void;
}) {
  const state = useGameState((state) => state);
  const w = state.view?.world;
  return (
    <div className={compact ? s.sideFoot : s.actions}>
      {compact && (
        <>
          기록은 이 브라우저에 저장됩니다.
          <br />
          파일로 당신의 역사를 보관하세요.
        </>
      )}
      <button disabled={(!w && !state.error) || state.busy} onClick={() => void onDownload()}>
        {compact ? '기록 내보내기 ↓' : '기록 내보내기'}
      </button>
      {!compact && w && onSlots && <button onClick={onSlots}>게임 슬롯</button>}
      {!compact && w && state.saveFailed && state.savedRevision !== w.revision && (
        <button disabled={state.busy || state.readonly} onClick={() => void client.retrySave()}>
          저장 재시도
        </button>
      )}
      <label className={s.fileButton}>
        기록 가져오기
        <input
          className={s.fileInput}
          type="file"
          accept="application/json,.json"
          disabled={state.busy || state.readonly}
          onChange={(event) => {
            void onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
function StartTools({
  onDownload,
  onImport,
}: {
  onDownload: () => Promise<void>;
  onImport: (file?: File) => Promise<void>;
}) {
  const state = useGameState((state) => state);
  return (
    <div className={s.startTools}>
      <label className={s.fileButton}>
        기록 파일 가져오기
        <input
          className={s.fileInput}
          type="file"
          accept="application/json,.json"
          disabled={state.busy || state.readonly}
          onChange={(event) => {
            void onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {state.error && (
        <button disabled={state.busy} onClick={() => void onDownload()}>
          복구 기록 내보내기
        </button>
      )}
    </div>
  );
}
export function App() {
  const worldId = useGameState((state) => state.view?.world.id);
  const state = gameStore.getSnapshot();
  const [client, setClient] = useState<GameClient>(),
    [controller, setController] = useState<ProgressionController>(),
    [localError, setLocalError] = useState(''),
    [replacing, setReplacing] = useState(false),
    [screen, setScreen] = useState(initialScreen),
    [slots, setSlots] = useState<GameSlots>(),
    [targetSlot, setTargetSlot] = useState<number>(),
    [pendingImport, setPendingImport] = useState<string>(),
    [moreOpen, setMoreOpen] = useState(false),
    [guideOpen, setGuideOpen] = useState(false);
  const { page, setPage, replacePage } = useNavigation();
  // One intervention dialog for the HUD menu, the clock's popover and the match-eve card.
  const stopSettings = useInterventionDialog((state) => state.open);
  const showNews = useNewsSheet((state) => state.show);
  const showGlossary = useGlossary((state) => state.show);
  const contentPage = useDeferredValue(page);
  const changingView = contentPage !== page;
  const openMenu = useCallback(() => setMoreOpen(true), []);
  useEffect(() => {
    try {
      if (!isSecureContext || !crypto.subtle || !crypto.randomUUID)
        throw new Error(
          '게임 저장은 HTTPS 또는 localhost에서 이용할 수 있습니다. localhost로 접속하거나 HTTPS 배포를 사용하세요.',
        );
      const c = new GameClient((state) => gameStore.publish(state));
      const progression = new ProgressionController(c);
      const library = new GameSlots(c);
      // A hidden tab plays on at its wall-clock pace unless the owner chose to pause it
      // (→WEB-64). Leaving also refreshes the slot card, so the slot screen shows where this
      // game stood, and stores the clock so a later visit can play the time away. Hiding and
      // closing save automatic progress at once, a close as far as the browser lets it (→SAVE-8).
      const visibility = () => {
        progression.setHidden(document.hidden);
        if (!document.hidden) return;
        library.sync(gameStore.getSnapshot().view?.world, true);
        c.saveSoon();
      };
      const leave = () => {
        progression.writeClock(true);
        library.sync(gameStore.getSnapshot().view?.world, true);
        c.saveSoon();
      };
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('pagehide', leave);
      visibility();
      setClient(c);
      setController(progression);
      setSlots(library);
      void c.start();
      return () => {
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('pagehide', leave);
        progression.dispose();
        c.dispose();
      };
    } catch (error) {
      setLocalError(String(error));
    }
  }, []);
  const w = state?.view?.world;
  const playing = screen === 'game' && !!w && !replacing;
  // Every world that comes into play joins the slot index (→SAVE-14).
  useEffect(() => {
    if (worldId) slots?.sync(gameStore.getSnapshot().view?.world);
  }, [slots, worldId]);
  // Once a game is on screen, a reload of this tab continues it (→WEB-62), and a clock it left
  // running when the page slept or closed plays the time away (→WEB-64).
  useEffect(() => {
    if (playing) rememberInGame(true);
  }, [playing]);
  useEffect(() => {
    // A failed fetch is retried when a page needs the chunk.
    if (playing) loadRich().catch(() => undefined);
  }, [playing]);
  useEffect(() => {
    if (playing && worldId) controller?.resumeAway();
  }, [playing, worldId, controller]);
  useTabTitle(controller);
  // A game in play that fails to load opens its recovery and export path, not the slots (→WEB-8).
  const loadFailed = useGameState((state) => !state.busy && !!state.error && !state.view);
  const launched = useRef(false);
  const settled = useGameState((state) => !state.busy);
  useEffect(() => {
    if (!client || launched.current || !settled) return;
    launched.current = true;
    // An earlier-rules career stays on the slot screen, which offers its export and delete
    // (→SAVE-16); any other failure opens the recovery path.
    if (loadFailed) setScreen(client.earlierRules() && slots ? 'slots' : 'game');
  }, [client, settled, loadFailed, slots]);
  const openSlots = () => {
    controller?.pause();
    slots?.sync(gameStore.getSnapshot().view?.world, true);
    slots?.cancel();
    rememberInGame(false);
    setMoreOpen(false);
    setReplacing(false);
    setTargetSlot(undefined);
    // Home is set on the way out, so the game entered next opens there without mounting the tab
    // it was left on (a deferred page would let that tab write its ?view= into home's address).
    replacePage('dashboard');
    setScreen('slots');
  };
  /** A game entered from the slot screen or game over, continued or new, opens on home. */
  const enterGame = () => {
    rememberInGame(true);
    replacePage('dashboard');
    setScreen('game');
  };
  /** Readies a slot (parking the game in play) and opens founding for it. */
  const startNew = async (slot: number) => {
    await slots!.prepare(slot);
    setTargetSlot(slot);
    setReplacing(!!gameStore.getSnapshot().view?.world);
    enterGame();
  };
  const foundingSlot = () => {
    if (targetSlot !== undefined) return targetSlot;
    const index = slots?.read();
    const free = index?.slots.findIndex((entry) => !entry) ?? 0;
    return index?.active ?? (free < 0 ? 0 : free);
  };
  // The match view exists only for a live playback; its address alone leads home (→WEB-40).
  const hasPlayback = useGameState((state) => !!state.playback);
  useEffect(() => {
    if (page === 'match' && client && w && !hasPlayback) replacePage('dashboard');
  }, [page, client, w, hasPlayback, replacePage]);
  // The document never scrolls; each view scrolls inside the content region below the HUD.
  const scroller = useRef<HTMLDivElement>(null);
  // Screens slide in from the side of the tab that was chosen, so navigation reads spatially.
  const previousPage = useRef(page);
  useEffect(() => {
    const order = TABS.map(([id]) => id),
      before = order.indexOf(previousPage.current),
      after = order.indexOf(contentPage);
    previousPage.current = contentPage;
    const direction = before < 0 || after < 0 || before === after ? 0 : after > before ? 1 : -1;
    play(
      scroller.current,
      [
        {
          opacity: 0,
          transform: `translateX(${direction * 28}px) translateY(${direction ? 0 : 10}px)`,
        },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280 },
    );
  }, [contentPage]);
  useEffect(() => {
    if (worldId) useTaskMemory.getState().activate(worldId);
  }, [worldId]);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const desired = useTaskMemory.getState().scrolls[taskAddress()] ?? 0;
    root.scrollTo(0, desired);
    // Lazy screens may not have their final height at the navigation boundary.
    const resize = new ResizeObserver(() => root.scrollTo(0, desired));
    const body = root.firstElementChild;
    if (desired && body) resize.observe(body);
    const timer = window.setTimeout(() => resize.disconnect(), 500);
    return () => {
      resize.disconnect();
      window.clearTimeout(timer);
    };
  }, [page, contentPage, worldId, replacing, screen]);
  const saveFile = (raw: string, name: string) => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `haeram-${name}.haeram-save.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const download = async () => {
    const raw = await client?.exportFile();
    if (raw) saveFile(raw, String(gameStore.getSnapshot().view?.world.year || 'backup'));
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setLocalError('파일 크기는 4 MiB 이하이어야 합니다.');
      return;
    }
    setLocalError('');
    const raw = await file.text();
    let stored = false;
    try {
      stored = !!(
        localStorage.getItem('haeram-soccor:manifest') ||
        localStorage.getItem('haeram-soccor:slot:a') ||
        localStorage.getItem('haeram-soccor:slot:b')
      );
    } catch {
      /* unsupported storage is reported by the client */
    }
    if (w || stored) {
      setMoreOpen(false);
      setPendingImport(raw);
    } else await client?.importFile(raw);
  };
  const menuDisabled = !playing;
  return (
    <div
      className={`${s.layout} ${playing ? s.playLayout : ''} ${playing && (page === 'dashboard' || page === 'match') ? s.coreLayout : ''} ${!playing ? s.startLayout : ''} ${playing && page !== 'match' ? s.newsLayout : ''}`}
    >
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <i className={s.brandSignal} aria-hidden="true" />
          <h1>HAERAM</h1>
          <span>FOOTBALL MANAGER</span>
          <small>A CLUB. A CENTURY.</small>
        </div>
        <nav className={s.nav} aria-label="게임 메뉴">
          {NAV.map(([id, label]) => (
            <button
              key={id}
              disabled={menuDisabled}
              aria-current={page === id ? 'page' : undefined}
              className={page === id ? s.active : undefined}
              onClick={() => setPage(id)}
            >
              <NavIcon page={id} />
              {label}
            </button>
          ))}
        </nav>
        {client && (
          <SaveActions client={client} compact onDownload={download} onImport={importFile} />
        )}
      </aside>
      <main className={s.main}>
        {screen === 'game' && <GameHud onMenu={openMenu} playing={playing} client={client} />}
        {!client && localError && (
          <div className={s.error} role="alert">
            {localError}
          </div>
        )}
        {client && screen === 'game' && (
          <RuntimeFeedback client={client} localError={localError} playing={playing} />
        )}
        {/* The match theatre carries its own compact clock in its header row. */}
        {client && controller && playing && !w.bankrupt && page !== 'match' && (
          <ProgressControls
            client={client}
            controller={controller}
            compact={page !== 'dashboard'}
          />
        )}
        <div ref={scroller} className={s.scroller} data-testid="view-scroller">
          {client && controller ? (
            screen === 'slots' && slots ? (
              <Suspense
                fallback={
                  <div className={s.loading} role="status">
                    게임 슬롯을 여는 중…
                  </div>
                }
              >
                <GameSlotScreen
                  slots={slots}
                  onEnter={enterGame}
                  onNew={startNew}
                  onExport={saveFile}
                  onRemovedInPlay={reloadToSlots}
                />
              </Suspense>
            ) : !w || replacing ? (
              <ConnectedFounding
                client={client}
                replace={replacing}
                slot={foundingSlot()}
                onBack={slots?.read().slots.some(Boolean) ? openSlots : undefined}
                onDone={() => {
                  setReplacing(false);
                  setTargetSlot(undefined);
                  // A new career always opens on home, whatever address founding was reached at.
                  replacePage('dashboard');
                }}
              />
            ) : w.bankrupt ? (
              <GameOver
                w={w}
                onExport={() => void download()}
                onNew={() => void startNew(slots?.read().active ?? 0)}
                onSlots={openSlots}
              />
            ) : (
              <>
                {changingView && (
                  <div className={s.viewPending} role="status">
                    화면을 여는 중…
                  </div>
                )}
                <div className={s.views} inert={changingView} aria-busy={changingView}>
                  <TaskReturn />
                  <div className={s.coreContent} hidden={contentPage !== 'dashboard'}>
                    <ConnectedDashboard client={client} controller={controller} />
                  </div>
                  <LiveSeason
                    key={worldId}
                    page={contentPage}
                    client={client}
                    controller={controller}
                  />
                  <div hidden={contentPage !== 'europe'}>
                    <ConnectedEurope client={client} />
                  </div>
                  {(['people', 'training', 'business', 'history'] as Page[]).includes(
                    contentPage,
                  ) && <ConnectedRich page={contentPage} client={client} />}
                </div>
              </>
            )
          ) : (
            <div className={s.loading}>클럽 사무실을 여는 중…</div>
          )}
          {client && screen === 'game' && (!w || replacing) && (
            <StartTools onDownload={download} onImport={importFile} />
          )}
          <LiveFooter playing={playing} />
          {/* Start screens carry their own import and recovery tools. */}
          {client && playing && (
            <SaveActions
              client={client}
              onDownload={download}
              onImport={importFile}
              onSlots={openSlots}
            />
          )}
        </div>
      </main>
      <nav className={s.mobileNav} aria-label="모바일 게임 메뉴">
        {TABS.map(([id, label, full, owns]) => (
          <button
            key={id}
            aria-label={full}
            aria-current={owns.includes(page) ? 'page' : undefined}
            className={id === 'dashboard' ? s.homeTab : undefined}
            disabled={menuDisabled}
            onClick={() => setPage(id)}
          >
            <NavIcon page={id} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {client && playing && <ActionOutcome />}
      {/* The match theatre keeps its own controls clear; news waits until the owner returns. */}
      {playing && page !== 'match' && <NewsButton />}
      {client && controller && playing && !w.bankrupt && page !== 'match' && (
        <EventCenter client={client} controller={controller} compact={page !== 'dashboard'} />
      )}
      {moreOpen && (
        <Dialog label="전체 메뉴" onClose={() => setMoreOpen(false)}>
          <button
            className={s.guideOpen}
            onClick={() => {
              setMoreOpen(false);
              setGuideOpen(true);
            }}
          >
            클럽 키우기 가이드
          </button>
          <button
            className={s.guideOpen}
            onClick={() => {
              setMoreOpen(false);
              useInterventionDialog.getState().show();
            }}
          >
            개입 수준 설정
          </button>
          <button
            className={s.guideOpen}
            onClick={() => {
              setMoreOpen(false);
              showNews();
            }}
          >
            클럽 뉴스
          </button>
          <button
            className={s.guideOpen}
            onClick={() => {
              setMoreOpen(false);
              showGlossary();
            }}
          >
            지표 사전
          </button>
          <div className={s.moreMenu}>
            {MENU_PAGES.map(([id, label]) => (
              <button
                key={id}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => {
                  setPage(id);
                  setMoreOpen(false);
                }}
              >
                <NavIcon page={id} />
                {label}
              </button>
            ))}
          </div>
          <SaveStatus />
          {client && (
            <SaveActions
              client={client}
              onDownload={download}
              onImport={importFile}
              onSlots={openSlots}
            />
          )}
        </Dialog>
      )}
      {stopSettings && controller && client && (
        <InterventionSettings
          client={client}
          controller={controller}
          onClose={useInterventionDialog.getState().close}
        />
      )}
      {guideOpen && w && (
        <PlayGuide goals={state.view!.milestones.goals} onClose={() => setGuideOpen(false)} />
      )}
      <GlossaryHost />
      {playing && <NewsSheet />}
      {client && playing && <TeamSheetHost client={client} />}
      {playing && <PlayerSheetHost />}
      {playing && <CelebrationHost />}
      {playing && controller && <AwayHost controller={controller} />}
      {pendingImport && (
        <Dialog label="기록 가져오기 확인" onClose={() => setPendingImport(undefined)}>
          <h2>기록을 가져올까요?</h2>
          <p>현재 기록을 먼저 내보낼 수 있습니다. 검증된 파일만 활성 기록으로 교체합니다.</p>
          <div className={s.actions}>
            <button onClick={() => void download()}>현재 기록 내보내기</button>
            <button onClick={() => setPendingImport(undefined)}>취소</button>
            <button
              className={s.primary}
              onClick={() => {
                const raw = pendingImport;
                setPendingImport(undefined);
                void client?.importFile(raw);
              }}
            >
              기록 교체하고 가져오기
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
