import { CashAlarm } from './CashAlarm';
import { FeedbackOverlay } from './FeedbackOverlay';
import { openClubSeason } from './state';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { useLocale } from '../presentation/react';
import type { Translator } from '../presentation/locale';
import { PresentationSettingsTrigger } from './PresentationSettings';
import { AppMenu } from './AppMenu';
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
import { openPeople, useNavigation, type Page } from './state';
import { DepartmentPolicySheet } from './DepartmentPolicySheet';
import { PlayerPreparationHost } from './PlayerPreparationHost';
import { TaskReturn } from './TaskReturn';
import { taskAddress, useTaskMemory } from './taskMemory';
import { ClubCrest } from './ClubCrest';
import { ClubLink } from './ClubLink';
import { compactMoney, competitionLabel, money, number, percent, seasonName } from './format';
import { Money } from './Money';
import { ProgressControls, ProgressOverview } from './ProgressControls';
import { LiveSeason } from './LiveSeason';
import { ClubHub, MatchAction } from './ClubHub';
import { ClubFounding } from './ClubFounding';
const PlayGuide = lazy(() =>
  import('./PlayGuide').then((module) => ({ default: module.PlayGuide })),
);
import { gameActionsBlocked, gameStore, useGameState } from '../runtime/store';
import { ProgressionController, useProgression } from '../runtime/progression';
import { worldSelector } from './liveState';
import { LeagueOverview, RankHistoryGraph, Standings } from './LeagueInsights';
import { ownLeagueIds } from './league';
import {
  daysUntilNextMatch,
  fixtureDate,
  nextOwnFixture,
  ROUND_INTERVAL_DAYS,
  seasonDayLabel,
} from '../../../../packages/engine/src/calendar';
import s from './App.module.css';
import { Dialog } from './Dialog';
import { ActionOutcome } from './ActionOutcome';
import { AnimatedMoney } from './AnimatedMoney';
import { play } from './motion';
import { EventCenter, CommunicationsCenter, CommunicationsButton } from './EventCenter';
import { RemedySheet } from './RemedySheet';
import { GlossaryHost } from './Glossary';
import { useGlossary } from './metricGlossary';
import { useNewsSheet } from './NewsFeed';
import { CelebrationHost } from './Celebration';
const CupsView = lazy(() => import('./CupsView').then((module) => ({ default: module.CupsView })));
import { TeamSheetHost } from './TeamSheet';
import { PlayerSheetHost } from './PlayerSheet';
import { cashState } from './teamState';
import { MANAGER_GONE } from '../../../../packages/engine/src/ops-staff';
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
function ClubJournal({ state }: { state: ClientState }) {
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
        <button type="button" onClick={() => openClubSeason(w.year)}>
          이번 시즌 구단 기록 →
        </button>
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
                      <small>{seasonDayLabel(e.year, e.round * ROUND_INTERVAL_DAYS)}</small>
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
  ['dashboard', 'navigation.dashboard'],
  ['league', 'navigation.league'],
  ['europe', 'navigation.europe'],
  ['history', 'navigation.history'],
  ['people', 'navigation.people'],
  ['training', 'navigation.training'],
  ['business', 'navigation.business'],
];
/**
 * Home sits in the raised centre; competition destinations fan out to the left and the owner's
 * three levers to the right: 사람 (who joins and stays), 훈련 (how players develop) and 방향 (where
 * the club is going and how it earns and spends, →WEB-10). The transfer market and the staff are tabs of 사람.
 */
const TABS: [Page, string, string, Page[]][] = [
  ['league', 'navigation.short.league', 'navigation.league', ['league']],
  ['europe', 'navigation.short.europe', 'navigation.europe', ['europe']],
  ['history', 'navigation.short.history', 'navigation.history', ['history']],
  ['dashboard', 'navigation.short.dashboard', 'navigation.dashboard', ['dashboard']],
  ['people', 'navigation.short.people', 'navigation.people', ['people']],
  ['training', 'navigation.short.training', 'navigation.training', ['training']],
  ['business', 'navigation.short.business', 'navigation.business', ['business']],
];
const selectContentWorld = worldSelector([
  'year',
  'round',
  'playerClub',
  // Each club's applied identity rides on its club, so an applied design reaches every crest at
  // once (→WEB-49).
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
  'settings',
  'decisionChoices',
  'academyReviews',
  'bids',
  'morale',
  'inbox',
  'build',
  'direction',
  'managerMarket',
]);
function useContentState(): ClientState {
  useLocale(); // Locale changes refresh memoized view boundaries without resetting them.
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
const ConnectedDashboard = memo(function ConnectedDashboard({ client }: { client: GameClient }) {
  const state = useContentState();
  const setPage = useNavigation((state) => state.setPage);
  const w = state.view!.world;
  return (
    <ClubHub
      w={w}
      client={client}
      journal={<ClubJournal state={state} />}
      matchAction={<MatchAction onReturn={() => setPage('match')} />}
    />
  );
});
const ConnectedEurope = memo(function ConnectedEurope({ client }: { client: GameClient }) {
  const state = useContentState();
  const page = useNavigation((state) => state.page);
  const visited = useRef(false);
  if (page === 'europe') visited.current = true;
  if (!visited.current) return null;
  return (
    <Suspense fallback={<p role="status">컵 대회를 불러오고 있어요.</p>}>
      <CupsView w={state.view!.world} coefficient={state.view!.coefficient} client={client} />
    </Suspense>
  );
});
/** Kept apart from the shell's renders: a page change re-renders only the page shown next. */
const ConnectedRich = memo(function ConnectedRich({
  client,
  controller,
  page,
}: {
  client: GameClient;
  controller: ProgressionController;
  page: Page;
}) {
  const { t } = useLocale();
  const state = useContentState();
  return (
    <Suspense
      fallback={
        <div className={s.loading} role="status">
          {t('shell.loadingView')}
        </div>
      }
    >
      <Rich client={client} controller={controller} state={state} page={page} />
    </Suspense>
  );
});
/**
 * Cash is the one resource every decision spends, so it stays pinned to the top right; tapping it
 * shows how long it lasts and the ways to raise or save money (→WEB-44).
 */
function HudCash({ client }: { client?: GameClient }) {
  const { t } = useLocale();
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
        aria-label={t('shell.cashDetails', { amount: exact, status: state.status })}
        disabled={!client}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span>
          <small>{t('shell.cash')}</small>
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
  const { t } = useLocale();
  const own = useGameState((state) =>
    playing
      ? state.view?.world.clubs.find((club) => club.id === state.view?.world.playerClub)
      : undefined,
  );
  const crestWorld = useGameState((state) => state.view?.world.clubs && state.view.world);
  return (
    <header className={s.hud}>
      {playing && (
        <button
          className={s.hudMenu}
          aria-label={t('shell.menu')}
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
          {!own && <small data-testid="calendar">1950 · A NEW BEGINNING</small>}
        </div>
      </div>
      <ReadonlyBadge />
      {!playing && <PresentationSettingsTrigger />}
      {playing && <HudCash client={client} />}
      {playing && <CommunicationsButton className={s.hudNotifications} />}
    </header>
  );
});
/** Read-only ownership is a small HUD badge that explains itself on tap (→WEB-10). */
function ReadonlyBadge() {
  const { t } = useLocale();
  const readonly = useGameState((state) => state.readonly && !!state.view);
  const notice = useGameState((state) => state.notice);
  const [open, setOpen] = useState(false);
  if (!readonly) return null;
  const text = notice || t('shell.readonlyNotice');
  return (
    <span className={s.readonlyBadge} role="status">
      <button aria-expanded={open} title={text} onClick={() => setOpen(!open)}>
        <PixelIcon name="eye" size={14} />
        {t('shell.readonly')}
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
  const { t } = useLocale();
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
        <button onClick={onSlots}>{t('slots.title')}</button>
        <button className={s.primary} onClick={onNew}>
          이 슬롯에서 새 게임
        </button>
      </div>
    </section>
  );
}
const RuntimeFeedback = memo(function RuntimeFeedback({
  client,
  localError,
  playing,
  onDownload,
}: {
  client: GameClient;
  localError: string;
  /** The club's bands belong to the game in play, never to founding beside a parked one. */
  playing: boolean;
  onDownload: () => Promise<void>;
}) {
  const { t } = useLocale();
  const state = useGameState((state) => state);
  const home = useNavigation((state) => state.page === 'dashboard');
  const critical = playing ? state.view?.world.critical : undefined;
  const blocked = state.busy || state.readonly;
  const error = state.error || localError;
  return (
    <>
      {(error || critical) && (
        <FeedbackOverlay urgent>
          {error && (
            <div className={s.error} role="alert">
              {error}
              <button onClick={() => location.reload()}>{t('save.reload')}</button>
              {state.error && !playing && (
                <button disabled={state.busy} onClick={() => void onDownload()}>
                  {t('save.exportRecovery')}
                </button>
              )}
            </div>
          )}
          {critical === MANAGER_GONE ? (
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
        </FeedbackOverlay>
      )}
      {/* Routine notices remain in the inbox; debt retains its existing status band. */}
      {playing && !home && <CashAlarm />}
      {state.busy && (
        <div className={s.foregroundProgress}>
          <div
            className={s.progress}
            role="progressbar"
            aria-label={t('shell.progress')}
            aria-valuenow={Math.round(state.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${Math.max(5, state.progress * 100)}%` }} />
          </div>
          {state.view && (
            <button onClick={() => client.cancel()}>{t('shell.cancelProgress')}</button>
          )}
        </div>
      )}
    </>
  );
});
function savedAgo(savedAt: number, now: number, t: Translator) {
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (seconds < 5) return t('save.justNow');
  if (seconds < 60) return t('save.secondsAgo', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? t('save.minutesAgo', { count: minutes })
    : t('save.hoursAgo', { count: Math.floor(minutes / 60) });
}
/**
 * 저장 완료 while every revision is on disk; otherwise when this tab last saved, so a running clock
 * between its background saves reads steadily instead of flipping on every step (→SAVE-8). Start
 * screens say nothing of a game kept beside them.
 */
function useSaveText(playing = true, detail: 'full' | 'brief' = 'full') {
  const { t } = useLocale();
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
  if (!w) return t('save.start');
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const status = priceIndex(own.country, w.year).status;
  const saved =
    savedRevision === w.revision
      ? t('save.complete')
      : savedAt !== undefined
        ? savedAgo(savedAt, now, t)
        : t('save.waiting');
  return detail === 'brief'
    ? saved
    : t('save.status', { saved, revision: w.revision, status: t(`save.price.${status}`) });
}
const LiveFooter = memo(function LiveFooter({ playing }: { playing: boolean }) {
  const { t } = useLocale();
  const text = useSaveText(playing);
  return (
    <footer className={s.footer}>
      <span>{t('shell.footer')}</span>
      <span data-testid="save-status">{text}</span>
    </footer>
  );
});
function SaveStatus() {
  return <p className={s.menuSave}>{useSaveText(true, 'brief')}</p>;
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
  const { t } = useLocale();
  const state = useGameState((state) => state);
  const w = state.view?.world;
  return (
    <div className={compact ? s.sideFoot : s.actions}>
      {compact && (
        <>
          {t('save.localNotice')}
          <br />
          {t('save.fileNotice')}
        </>
      )}
      <button disabled={(!w && !state.error) || state.busy} onClick={() => void onDownload()}>
        {t(compact ? 'save.exportCompact' : 'save.export')}
      </button>
      {!compact && w && onSlots && <button onClick={onSlots}>{t('slots.title')}</button>}
      {!compact && w && state.saveFailed && state.savedRevision !== w.revision && (
        <button disabled={state.busy || state.readonly} onClick={() => void client.retrySave()}>
          {t('save.retry')}
        </button>
      )}
      <label className={s.fileButton}>
        {t('save.import')}
        <input
          className={s.fileInput}
          type="file"
          accept="application/json,.json"
          disabled={gameActionsBlocked(state, { recovery: true })}
          onChange={(event) => {
            void onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
function StartTools({ onImport }: { onImport: (file?: File) => Promise<void> }) {
  const { t } = useLocale();
  const state = useGameState((state) => state);
  return (
    <div className={s.startTools}>
      <label className={s.fileButton}>
        {t('save.importFile')}
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
export function App() {
  const { t } = useLocale();
  const importBlocked = useGameState((state) => gameActionsBlocked(state, { recovery: true }));
  const progressionBlocked = useGameState(gameActionsBlocked);
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
  // One responsibility dialog for the clock, local task links and the main menu.
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
    if (playing && worldId && !progressionBlocked) controller?.resumeAway();
  }, [playing, worldId, controller, progressionBlocked]);
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
    // The options form: WebKit ignores scrollTo(0, 0) from a 2 px offset, so home kept the
    // office's scroll (CI 39952590526).
    root.scrollTo({ top: desired });
    // Lazy screens may not have their final height at the navigation boundary.
    const resize = new ResizeObserver(() => root.scrollTo({ top: desired }));
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
    if (!file || gameActionsBlocked(gameStore.getSnapshot(), { recovery: true })) return;
    if (file.size > 8 * 1024 * 1024) {
      setLocalError(t('save.fileTooLarge'));
      return;
    }
    setLocalError('');
    const raw = await file.text();
    if (gameActionsBlocked(gameStore.getSnapshot(), { recovery: true })) return;
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
        <nav className={s.nav} aria-label={t('shell.navigation')}>
          {NAV.map(([id, label]) => (
            <button
              key={id}
              disabled={menuDisabled}
              aria-current={page === id ? 'page' : undefined}
              className={page === id ? s.active : undefined}
              onClick={() => setPage(id)}
            >
              <NavIcon page={id} />
              {t(label)}
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
          <FeedbackOverlay>
            <div className={s.error} role="alert">
              {localError}
            </div>
          </FeedbackOverlay>
        )}
        {client && screen === 'game' && (
          <RuntimeFeedback
            client={client}
            localError={localError}
            playing={playing}
            onDownload={download}
          />
        )}
        {/* Season controls belong to management views; observation has its own speeds. */}
        {client && controller && playing && !w.bankrupt && page !== 'match' && (
          <ProgressOverview
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
                    {t('shell.loadingSlots')}
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
              // One founding session per slot: another slot never inherits its design draft
              // (→WEB-86).
              <ConnectedFounding
                key={foundingSlot()}
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
                    {t('shell.loadingView')}
                  </div>
                )}
                <div className={s.views} inert={changingView} aria-busy={changingView}>
                  <TaskReturn />
                  <div className={s.coreContent} hidden={contentPage !== 'dashboard'}>
                    <ConnectedDashboard client={client} />
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
                  ) && <ConnectedRich page={contentPage} client={client} controller={controller} />}
                </div>
              </>
            )
          ) : (
            <div className={s.loading}>{t('shell.loadingOffice')}</div>
          )}
          {client && screen === 'game' && (!w || replacing) && <StartTools onImport={importFile} />}
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
        {client && controller && playing && !w.bankrupt && page !== 'match' && (
          <ProgressControls controller={controller} />
        )}
      </main>
      <nav className={s.mobileNav} aria-label={t('shell.mobileNavigation')}>
        {TABS.map(([id, label, full, owns]) => (
          <button
            key={id}
            aria-label={t(full)}
            aria-current={owns.includes(page) ? 'page' : undefined}
            className={id === 'dashboard' ? s.homeTab : undefined}
            disabled={menuDisabled}
            onClick={() => setPage(id)}
          >
            <NavIcon page={id} />
            <span>{t(label)}</span>
          </button>
        ))}
      </nav>
      {client && playing && <ActionOutcome />}
      {/* The match theatre keeps its own controls clear; news waits until the owner returns. */}
      {client && playing && <CommunicationsCenter key={w.id} client={client} />}
      {client && controller && playing && !w.bankrupt && page !== 'match' && (
        <EventCenter client={client} controller={controller} compact={page !== 'dashboard'} />
      )}
      {moreOpen && (
        <AppMenu
          onClose={() => setMoreOpen(false)}
          onNews={() => showNews('notifications')}
          onGuide={() => setGuideOpen(true)}
          onGlossary={showGlossary}
          saveTools={
            <>
              <SaveStatus />
              {client && (
                <SaveActions
                  client={client}
                  onDownload={download}
                  onImport={importFile}
                  onSlots={openSlots}
                />
              )}
            </>
          }
        />
      )}
      {guideOpen && w && (
        <Suspense fallback={null}>
          <PlayGuide goals={state.view!.milestones.goals} onClose={() => setGuideOpen(false)} />
        </Suspense>
      )}
      <GlossaryHost />
      {client && playing && <TeamSheetHost client={client} />}
      {playing && client && <PlayerSheetHost client={client} />}
      {playing && client && <PlayerPreparationHost client={client} />}
      {playing && client && <DepartmentPolicySheet client={client} />}
      {playing && <CelebrationHost />}
      {playing && controller && <AwayHost controller={controller} />}
      {pendingImport && (
        <Dialog label={t('save.confirmImport')} onClose={() => setPendingImport(undefined)}>
          <h2>{t('save.importQuestion')}</h2>
          <p>{t('save.importNotice')}</p>
          <div className={s.actions}>
            <button onClick={() => void download()}>{t('save.exportCurrent')}</button>
            <button onClick={() => setPendingImport(undefined)}>{t('common.cancel')}</button>
            <button
              className={s.primary}
              disabled={importBlocked}
              onClick={() => {
                if (gameActionsBlocked(gameStore.getSnapshot(), { recovery: true })) return;
                const raw = pendingImport;
                setPendingImport(undefined);
                void client?.importFile(raw);
              }}
            >
              {t('save.replaceAndImport')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
