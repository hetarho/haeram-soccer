import { memo, useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { country, priceIndex } from '../../../../packages/catalogs/src/index';
import { GameClient, type ClientState } from '../runtime/client';
import { useNavigation, type Page } from './state';
import { ClubCrest } from './ClubCrest';
import { watchNextMatch } from './watch';
import { money, number, percent, seasonName, kindLabel } from './format';
import { InterventionSettings, ProgressControls } from './ProgressControls';
import { LiveSeason } from './LiveSeason';
import { ClubHub } from './ClubHub';
import { ClubFounding } from './ClubFounding';
import { PlayGuide } from './PlayGuide';
import { gameStore, useGameState } from '../runtime/store';
import { ProgressionController } from '../runtime/progression';
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
import { SeasonReview } from './SeasonReview';
import Rich from './Rich';
function NavIcon({ page }: { page: Page }) {
  const paths: Record<Page, string> = {
    dashboard: 'M3 11l9-8 9 8 M5 9.5V20h14V9.5 M10 20v-6h4v6',
    match: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8l4 3-2 5h-4l-2-5z',
    league: 'M4 5h16 M4 12h16 M4 19h16',
    europe:
      'M7 3h10v7a5 5 0 0 1-10 0z M7 5H3v4a4 4 0 0 0 4 4 M17 5h4v4a4 4 0 0 1-4 4 M12 15v5 M8 21h8',
    squad:
      'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M5 21v-5a7 7 0 0 1 14 0v5 M4 5a2 2 0 0 0 0 4 M20 5a2 2 0 0 1 0 4',
    transfers: 'M4 8h14l-3-3 M18 8l-3 3 M20 16H6l3-3 M6 16l3 3',
    manager: 'M12 2l10 10-10 10L2 12z M8 12h8 M12 8v8',
    business: 'M3 18l6-6 4 3 8-11 M15 4h6v6',
    history: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l4 3',
    season:
      'M7 4h10v5a5 5 0 0 1-10 0z M12 14v4 M8 20h8 M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3',
  };
  return (
    <svg
      className={s.navIcon}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d={paths[page]} />
    </svg>
  );
}
export function Crest({ color = '#b4c399' }: { color?: string }) {
  return <span className={s.crest} style={{ backgroundColor: color }} aria-hidden="true" />;
}
export function Panel({
  title,
  note,
  children,
  footer,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h3>{title}</h3>
        {note && <span>{note}</span>}
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
  const { setPage } = useNavigation();
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
            {w.lower ? '프로 복귀 도전' : `${c.tier + 1}부`} · 남은 우리 리그 경기{' '}
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
        {[
          [
            '운영 자금',
            money(w.cash, c.country, w.year),
            `연간 운영비 ${money(v.annualCost, c.country, w.year)}`,
          ],
          ['우리의 서포터', number(c.fans), '경기·마케팅 결과에 따라 변화'],
          ['이번 시즌', `${t.points} pts`, `${t.played}경기 · ${t.won}승 ${t.drawn}무 ${t.lost}패`],
          [
            '쌓아온 기록',
            `${number(v.totalMatches)} matches`,
            `${w.history.length}개 시즌 · 승률 ${winRate}`,
          ],
        ].map(([label, value, note]) => (
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
                  {home && <ClubCrest w={w} id={home.id} size={20} />}
                  {home?.name || '시즌의 마지막 페이지'}
                </div>
                <b>vs</b>
                <div>
                  {away && <ClubCrest w={w} id={away.id} size={20} />}
                  {away?.name || '다음 시즌을 기다립니다'}
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
                <b>{money((BigInt(w.income) - BigInt(w.expense)).toString(), c.country, w.year)}</b>
              </div>
            </div>
            <div className={s.panelFoot}>지표를 비교하고, 다음 선택을 바꿔보세요.</div>
          </Panel>
        </div>
      </div>
    </>
  );
}
function Europe({ w, coefficient }: { w: World; coefficient: number }) {
  const [key, setKey] = useState('ucl');
  const t = w.europe.find((t) => t.key === key);
  const cards = [
    ['ucl', 1955, 'European Cup / Champions League', '1955/56 시작 · 1992/93 챔피언스리그'],
    ['uel', 1971, 'UEFA Cup / Europa League', '1971/72 시작 · 2009/10 유로파리그'],
    ['uecl', 2021, 'Conference League', '2021/22 시작 · 2024/25 명칭 변경'],
  ] as const;
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>BEYOND THE BORDER</div>
          <h2>유럽이 부르는 날.</h2>
          <p>대회는 실제 역사의 시기에 시작됩니다. 우승의 역사는 우리가 만듭니다.</p>
        </div>
        <span className={s.pill}>5년간 구단 경기 계수 · {number(coefficient)}점</span>
      </div>
      <div className={s.competitionGrid}>
        {cards.map(([id, year, title, note]) => (
          <section
            key={id}
            className={`${s.panel} ${s.competition} ${w.year < year ? s.locked : ''}`}
          >
            <div className={s.symbol}>{w.year < year ? '◷' : '♜'}</div>
            <h3>{w.europe.find((t) => t.key === id)?.name || title}</h3>
            <p>{note}</p>
            <p>
              {w.year < year
                ? `${year - w.year}년 후 창설 예정`
                : `${w.europe.find((t) => t.key === id)?.field}팀 · ${w.europe.find((t) => t.key === id)?.format} 단계`}
            </p>
            <button style={{ marginTop: 20 }} disabled={w.year < year} onClick={() => setKey(id)}>
              {w.year < year ? '아직 창설되지 않은 대회' : '대회 보기 →'}
            </button>
          </section>
        ))}
      </div>
      {t && (
        <>
          <div className={s.filters}>
            {w.europe.map((t) => (
              <button
                key={t.key}
                onClick={() => setKey(t.key)}
                className={t.key === key ? s.selected : undefined}
              >
                {t.name}
              </button>
            ))}
          </div>
          <Panel
            title={t.name}
            note={`${t.field} CLUBS · ${t.stage}`}
            footer={
              t.clubs.includes(w.playerClub)
                ? `우리 클럽 참가 · ${t.ownExit || '지난 시즌 리그/컵 성적에 따른 자격'}`
                : '우리 클럽은 참가하지 않습니다. 리그 성적과 국내 컵 우승으로 도전하세요.'
            }
          >
            <Table w={{ ...w, tables: t.standings }} ids={t.clubs} />
            {t.fixtures.length > 0 && (
              <div className={s.panelBody}>
                {t.fixtures
                  .filter((f) => f.home === w.playerClub || f.away === w.playerClub)
                  .map((f) => (
                    <p key={f.id} className={s.muted}>
                      {w.clubs.find((c) => c.id === f.home)?.name}{' '}
                      {f.score ? `${f.score.home}–${f.score.away}` : '예정'}{' '}
                      {w.clubs.find((c) => c.id === f.away)?.name}
                    </p>
                  ))}
              </div>
            )}
          </Panel>
        </>
      )}
      <p className={s.muted}>
        국가별 참가권, 시드와 추첨은 데모에 맞게 단순화했습니다. 2024/25부터 36팀 리그 페이즈와
        8·8·6경기, 상위 8팀 직행과 9–24위 플레이오프를 적용합니다. 컵위너스컵은 1960–1998 시즌
        운영됩니다.
      </p>
    </>
  );
}
/** The match view has no menu entry: it opens only from a watch action (→WEB-40). */
const NAV: [Page, string][] = [
  ['dashboard', '클럽 홈'],
  ['league', '리그'],
  ['europe', '유럽 무대'],
  ['history', '역사 보관함'],
  ['season', '시즌 결산'],
  ['squad', '선수단'],
  ['transfers', '이적 시장'],
  ['manager', '스태프'],
  ['business', '구단 운영'],
];
/**
 * Home sits in the raised centre; competition destinations fan out to the left and club
 * management to the right.
 */
const TABS: [Page, string, string, Page[]][] = [
  ['league', '리그', '리그', ['league']],
  ['europe', '유럽', '유럽 무대', ['europe']],
  ['history', '기록', '역사 보관함', ['history', 'season']],
  ['dashboard', '홈', '클럽 홈', ['dashboard']],
  ['squad', '선수단', '선수단', ['squad', 'manager']],
  ['transfers', '이적', '이적 시장', ['transfers']],
  ['business', '운영', '구단 운영', ['business']],
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
  'training',
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
  'facilities',
  'ticket',
  'campaigns',
  'sponsor',
  'lower',
  'europe',
  'critical',
  // Staff, policy, delegation and bid decisions can change only these keys.
  'policy',
  'staff',
  'academy',
  'delegation',
  'bids',
  'morale',
  'inbox',
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
  const campaigns = useGameState((state) => state.view?.campaigns);
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
            campaigns: campaigns!,
          }
        : undefined,
  };
}
const ConnectedFounding = memo(function ConnectedFounding({
  client,
  replace,
  onDone,
}: {
  client: GameClient;
  replace: boolean;
  onDone: () => void;
}) {
  const state = useGameState((state) => state);
  if (state.busy && !state.view)
    return (
      <div className={s.loading} role="status">
        클럽을 준비하고 있어요…
      </div>
    );
  return <ClubFounding client={client} state={state} replace={replace} onDone={onDone} />;
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
const ConnectedEurope = memo(function ConnectedEurope() {
  const state = useContentState();
  return <Europe w={state.view!.world} coefficient={state.view!.coefficient} />;
});
const ConnectedSeasonReview = memo(function ConnectedSeasonReview({
  client,
}: {
  client: GameClient;
}) {
  const state = useContentState();
  const { setPage } = useNavigation();
  return (
    <SeasonReview
      w={state.view!.world}
      candidates={state.view!.transfers.filter((offer) => offer.available).length}
      client={client}
      onMarket={() => setPage('transfers')}
      onHome={() => setPage('dashboard')}
    />
  );
});
function ConnectedRich({ client, page }: { client: GameClient; page: Page }) {
  const state = useContentState();
  return <Rich client={client} state={state} page={page} />;
}
function CalendarText() {
  const year = useGameState((state) => state.view?.world.year);
  const round = useGameState((state) => state.view?.world.round);
  return <>{year ? `${seasonName(year)} · 라운드 ${round}` : '1901 · A NEW BEGINNING'}</>;
}
/** Cash is the one resource every decision spends, so it stays pinned to the top right. */
function HudCash() {
  const cash = useGameState((state) => state.view?.world.cash);
  const year = useGameState((state) => state.view?.world.year);
  const own = useGameState((state) =>
    state.view?.world.clubs.find((club) => club.id === state.view?.world.playerClub),
  );
  if (!cash || !own || !year) return null;
  return (
    <div
      className={`${s.hudCash} ${BigInt(cash) < 0n ? s.hudCashNegative : ''}`}
      data-testid="hud-cash"
      aria-label={`운영 자금 ${money(cash, own.country, year)}`}
    >
      <i aria-hidden="true" />
      <span>
        <small>운영 자금</small>
        <AnimatedMoney
          value={cash}
          format={(value) => money(value, own.country, year)}
          upClass={s.cashUp}
          downClass={s.cashDown}
        />
      </span>
    </div>
  );
}
function GameHud({
  onMenu,
  menuDisabled,
  client,
}: {
  onMenu: () => void;
  menuDisabled: boolean;
  client?: GameClient;
}) {
  const own = useGameState((state) =>
    state.view?.world.clubs.find((club) => club.id === state.view?.world.playerClub),
  );
  const lower = useGameState((state) => state.view?.world.lower);
  const crestWorld = useGameState((state) => state.view?.world.clubs && state.view.world);
  return (
    <header className={s.hud}>
      {!menuDisabled && (
        <button
          className={s.hudMenu}
          aria-label="전체 메뉴"
          onClick={(event) => {
            event.currentTarget.focus();
            onMenu();
          }}
        >
          <span aria-hidden="true" />
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
            {own && `${lower ? '프로 복귀 도전' : `${own.tier + 1}부`} · `}
            <CalendarText />
          </small>
        </div>
      </div>
      <ReadonlyBadge />
      {client && !menuDisabled && <InboxButton client={client} />}
      <HudCash />
    </header>
  );
}
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
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
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
        ? `${fixtureDate(w, next)} · ${daysUntilNextMatch(w)}일 후 · ${kindLabel[next.kind]}`
        : '시즌 마무리'}
    </>
  );
}
function RuntimeFeedback({ client, localError }: { client: GameClient; localError: string }) {
  const state = useGameState((state) => state);
  const critical = state.view?.world.critical;
  return (
    <>
      {(state.error || localError) && (
        <div className={s.error} role="alert">
          {state.error || localError}{' '}
          <button onClick={() => location.reload()}>저장 다시 불러오기</button>
        </div>
      )}
      {state.notice && !state.readonly && (
        <div className={s.notice} role="status">
          {state.notice}
        </div>
      )}
      {critical && (
        <div className={s.critical} role="status">
          {critical}
          <button disabled={state.busy || state.readonly} onClick={() => void client.acknowledge()}>
            알림 확인 후 계속
          </button>
        </div>
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
}
function saveText(w: World | undefined, savedRevision: number) {
  if (!w) return '로그인 없이 시작하세요';
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const status = priceIndex(own.country, w.year).status;
  return `${savedRevision === w.revision ? '저장 완료' : '저장 대기'} · r${w.revision} · 물가 ${status === 'observed' ? '관측' : status === 'estimated' ? '추정' : '전망'}`;
}
function LiveFooter() {
  const w = useGameState((state) => state.view?.world);
  const savedRevision = useGameState((state) => state.savedRevision);
  return (
    <footer className={s.footer}>
      <span>HAERAM FOOTBALL · 가상의 클럽, 당신의 역사.</span>
      <span data-testid="save-status">{saveText(w, savedRevision)}</span>
    </footer>
  );
}
function SaveStatus() {
  const w = useGameState((state) => state.view?.world);
  const savedRevision = useGameState((state) => state.savedRevision);
  return <p className={s.menuSave}>기록 · {saveText(w, savedRevision)}</p>;
}
function SaveActions({
  client,
  compact = false,
  onDownload,
  onImport,
  onNewWorld,
}: {
  client: GameClient;
  compact?: boolean;
  onDownload: () => Promise<void>;
  onImport: (file?: File) => Promise<void>;
  onNewWorld?: () => void;
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
      {!compact && w && (
        <button disabled={state.busy || state.readonly} onClick={onNewWorld}>
          새로운 세계
        </button>
      )}
      {!compact && w && !state.processing && state.savedRevision !== w.revision && (
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
    [newWorldConfirm, setNewWorldConfirm] = useState(false),
    [pendingImport, setPendingImport] = useState<string>(),
    [moreOpen, setMoreOpen] = useState(false),
    [stopSettings, setStopSettings] = useState(false),
    [guideOpen, setGuideOpen] = useState(false);
  const { page, setPage } = useNavigation();
  const contentPage = useDeferredValue(page);
  const changingView = contentPage !== page;
  useEffect(() => {
    try {
      if (!isSecureContext || !crypto.subtle || !crypto.randomUUID)
        throw new Error(
          '게임 저장은 HTTPS 또는 localhost에서 이용할 수 있습니다. localhost로 접속하거나 HTTPS 배포를 사용하세요.',
        );
      const c = new GameClient((state) => gameStore.publish(state));
      const progression = new ProgressionController(c);
      // A hidden tab only pauses the clock; it resumes when the player returns.
      const visibility = () => progression.setSuspended(document.hidden, 'visibility');
      document.addEventListener('visibilitychange', visibility);
      visibility();
      setClient(c);
      setController(progression);
      void c.start();
      return () => {
        document.removeEventListener('visibilitychange', visibility);
        progression.dispose();
        c.dispose();
      };
    } catch (error) {
      setLocalError(String(error));
    }
  }, []);
  const w = state?.view?.world;
  // The match view exists only for a live playback; its address alone leads home (→WEB-40).
  const hasPlayback = useGameState((state) => !!state.playback);
  const replacePage = useNavigation((state) => state.replacePage);
  useEffect(() => {
    if (page === 'match' && client && w && !hasPlayback) replacePage('dashboard');
  }, [page, client, w, hasPlayback, replacePage]);
  // However a season closes, its review opens before anything else.
  useEffect(() => {
    if (!controller) return;
    const review = (state: { seasonEnd?: number }) => {
      if (state.seasonEnd === undefined) return;
      controller.clearSeasonEnd();
      setPage('season');
    };
    review(controller.store.getState());
    return controller.store.subscribe(review);
  }, [controller, setPage]);
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
    scroller.current?.scrollTo(0, 0);
  }, [page, worldId, replacing]);
  const download = async () => {
    const raw = await client?.exportFile();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `haeram-${gameStore.getSnapshot().view?.world.year || 'backup'}.haeram-save.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const menuDisabled = !w || replacing;
  return (
    <div
      className={`${s.layout} ${w && !replacing ? s.playLayout : ''} ${w && !replacing && (page === 'dashboard' || page === 'match') ? s.coreLayout : ''} ${!w || replacing ? s.startLayout : ''}`}
    >
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <Crest />
          <h1>
            Haeram
            <br />
            Football Manager
          </h1>
          <span>A CLUB. A CENTURY.</span>
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
        <GameHud onMenu={() => setMoreOpen(true)} menuDisabled={menuDisabled} client={client} />
        {!client && localError && (
          <div className={s.error} role="alert">
            {localError}
          </div>
        )}
        {client && <RuntimeFeedback client={client} localError={localError} />}
        {/* The match theatre carries its own compact clock in its header row. */}
        {client && controller && w && !replacing && page !== 'match' && (
          <ProgressControls
            client={client}
            controller={controller}
            compact={page !== 'dashboard'}
          />
        )}
        <div ref={scroller} className={s.scroller} data-testid="view-scroller">
          {client && controller ? (
            !w || replacing ? (
              <ConnectedFounding
                client={client}
                replace={replacing}
                onDone={() => {
                  setReplacing(false);
                  if (replacing) setPage('dashboard');
                }}
              />
            ) : (
              <>
                {changingView && (
                  <div className={s.viewPending} role="status">
                    화면을 여는 중…
                  </div>
                )}
                <div className={s.views} inert={changingView} aria-busy={changingView}>
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
                    <ConnectedEurope />
                  </div>
                  {contentPage === 'season' && <ConnectedSeasonReview client={client} />}
                  {(['squad', 'transfers', 'manager', 'business', 'history'] as Page[]).includes(
                    contentPage,
                  ) && <ConnectedRich page={contentPage} client={client} />}
                </div>
              </>
            )
          ) : (
            <div className={s.loading}>클럽 사무실을 여는 중…</div>
          )}
          {client && (!w || replacing) && (
            <StartTools onDownload={download} onImport={importFile} />
          )}
          {replacing && w && (
            <button
              className={s.returnClub}
              onClick={() => {
                setReplacing(false);
                setPage('dashboard');
              }}
            >
              현재 클럽 보기
            </button>
          )}
          <LiveFooter />
          {client && (
            <SaveActions
              client={client}
              onDownload={download}
              onImport={importFile}
              onNewWorld={() => setNewWorldConfirm(true)}
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
      {client && w && !replacing && <ActionOutcome />}
      {client && controller && w && !replacing && page !== 'match' && page !== 'season' && (
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
              setStopSettings(true);
            }}
          >
            개입 수준 설정
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
              onNewWorld={() => {
                setMoreOpen(false);
                setNewWorldConfirm(true);
              }}
            />
          )}
        </Dialog>
      )}
      {stopSettings && controller && client && (
        <InterventionSettings
          client={client}
          controller={controller}
          onClose={() => setStopSettings(false)}
        />
      )}
      {guideOpen && w && (
        <PlayGuide goals={state.view!.milestones.goals} onClose={() => setGuideOpen(false)} />
      )}
      {newWorldConfirm && (
        <Dialog label="새로운 세계 창단 확인" onClose={() => setNewWorldConfirm(false)}>
          <h2>새로운 세계를 펼치기 전에.</h2>
          <p>
            현재 기록을 파일로 보관하세요. 새 세계를 창단하면 이 브라우저의 활성 기록을 교체합니다.
          </p>
          <div className={s.actions}>
            <button onClick={() => void download()}>현재 기록 내보내기</button>
            <button onClick={() => setNewWorldConfirm(false)}>취소</button>
            <button
              className={s.primary}
              onClick={() => {
                setNewWorldConfirm(false);
                setReplacing(true);
              }}
            >
              새 세계 설정
            </button>
          </div>
        </Dialog>
      )}
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
