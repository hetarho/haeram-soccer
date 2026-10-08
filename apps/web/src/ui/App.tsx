import { memo, useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { country, priceIndex } from '../../../../packages/catalogs/src/index';
import { GameClient, type ClientState } from '../runtime/client';
import { useNavigation, type Page } from './state';
import { money, number, percent, seasonName, kindLabel } from './format';
import { ProgressControls } from './ProgressControls';
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
import { QuickActions } from './QuickActions';
import Rich from './Rich';
function NavIcon({ page }: { page: Page }) {
  const paths: Record<Page, string> = {
    dashboard: 'M4 3h6a3 3 0 0 1 2 2 3 3 0 0 1 2-2h6v16h-6a3 3 0 0 0-2 2 3 3 0 0 0-2-2H4z M12 5v16',
    match: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8l4 3-2 5h-4l-2-5z',
    league: 'M4 5h16 M4 12h16 M4 19h16',
    europe:
      'M7 3h10v7a5 5 0 0 1-10 0z M7 5H3v4a4 4 0 0 0 4 4 M17 5h4v4a4 4 0 0 1-4 4 M12 15v5 M8 21h8',
    squad:
      'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M5 21v-5a7 7 0 0 1 14 0v5 M4 5a2 2 0 0 0 0 4 M20 5a2 2 0 0 1 0 4',
    manager: 'M12 2l10 10-10 10L2 12z M8 12h8 M12 8v8',
    business: 'M3 18l6-6 4 3 8-11 M15 4h6v6',
    history: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l4 3',
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
function ClubJournal({ state, client }: { state: ClientState; client: GameClient }) {
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
  const winRate = percent(t.won, t.played);
  const watch = async () => {
    const result = await client.command({ type: 'next-match' });
    if (result?.playback) setPage('match');
  };
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>
            THE CLUB JOURNAL · VOL. {String(w.year - 1900).padStart(3, '0')}
          </div>
          <h2>우리의 시즌은 지금.</h2>
          <p>
            {c.name} ·{' '}
            {w.lower ? '프로 복귀를 준비하는 계절' : `${c.tier + 1}부에서 쓰는 우리 이야기`}
          </p>
        </div>
        <div className={s.heroActions}>
          <button
            disabled={state.busy || state.readonly}
            onClick={() => void client.command({ type: 'advance', rounds: 1 })}
          >
            다음 라운드
          </button>
          <button
            className={s.primary}
            disabled={state.busy || state.readonly}
            onClick={() => void client.command({ type: 'season', count: 1 })}
          >
            시즌 마무리 ↗
          </button>
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
                  <Crest color={home?.color} />
                  {home?.name || '시즌의 마지막 페이지'}
                </div>
                <b>vs</b>
                <div>
                  <Crest color={away?.color} />
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
const NAV: [Page, string, string][] = [
  ['dashboard', '◈', '클럽 일지'],
  ['match', '◉', '경기 관전'],
  ['league', '≡', '리그'],
  ['europe', '☆', '유럽 무대'],
  ['squad', '♙', '선수와 영입'],
  ['manager', '◇', '감독실'],
  ['business', '↗', '클럽 경영'],
  ['history', '◷', '역사 보관함'],
];
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
      journal={<ClubJournal client={client} state={state} />}
    />
  );
});
const ConnectedEurope = memo(function ConnectedEurope() {
  const state = useContentState();
  return <Europe w={state.view!.world} coefficient={state.view!.coefficient} />;
});
function ConnectedRich({ client, page }: { client: GameClient; page: Page }) {
  const state = useContentState();
  return <Rich client={client} state={state} page={page} />;
}
function CalendarText() {
  const year = useGameState((state) => state.view?.world.year);
  const round = useGameState((state) => state.view?.world.round);
  return <>{year ? `시즌 ${year} · 라운드 ${round}` : '1901 · A NEW BEGINNING'}</>;
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
      {state.notice && (
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
function LiveFooter() {
  const w = useGameState((state) => state.view?.world);
  const savedRevision = useGameState((state) => state.savedRevision);
  const own = w?.clubs.find((club) => club.id === w.playerClub);
  return (
    <footer className={s.footer}>
      <span>HAERAM FOOTBALL ARCHIVES · 가상의 클럽, 당신의 역사.</span>
      <span data-testid="save-status">
        {w
          ? `${savedRevision === w.revision ? '저장 완료' : '저장 대기'} · r${w.revision}`
          : '로그인 없이 시작하세요'}
        {w &&
          ` · 물가 ${priceIndex(own!.country, w.year).status === 'observed' ? '관측' : priceIndex(own!.country, w.year).status === 'estimated' ? '추정' : '전망'}`}
      </span>
    </footer>
  );
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
      const dialogListener = (event: Event) => {
        const detail = (event as CustomEvent<{ id: string; open: boolean }>).detail;
        if (detail?.id) progression.setSuspended(detail.open, `dialog:${detail.id}`);
      };
      window.addEventListener('haeram:dialog', dialogListener);
      const visibility = () => progression.setSuspended(document.hidden, 'visibility');
      document.addEventListener('visibilitychange', visibility);
      visibility();
      setClient(c);
      setController(progression);
      void c.start();
      return () => {
        window.removeEventListener('haeram:dialog', dialogListener);
        document.removeEventListener('visibilitychange', visibility);
        progression.dispose();
        c.dispose();
      };
    } catch (error) {
      setLocalError(String(error));
    }
  }, []);
  const v = state?.view,
    w = v?.world,
    own = w?.clubs.find((c) => c.id === w.playerClub);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, worldId]);
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
            Football Archives
          </h1>
          <span>A CLUB. A CENTURY.</span>
        </div>
        {own && (
          <div className={s.clubBadge}>
            <Crest color={own.color} />
            <div>
              <b>{own.name}</b>
              <small>EST. 1901 · {country(own.country).name}</small>
            </div>
          </div>
        )}
        <nav className={s.nav} aria-label="게임 메뉴">
          {NAV.map(([id, , label]) => (
            <button
              key={id}
              disabled={!w || replacing}
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
        <div className={s.topbar}>
          <span>
            <span className={s.desktopOnly}>FOOTBALL ARCHIVES / </span>
            {w ? NAV.find((n) => n[0] === page)?.[2] : 'Haeram Football'}
          </span>
          <div className={s.topRight}>
            <span className={s.tag}>WEB DEMO · LOCAL</span>
            <span data-testid="calendar">
              <CalendarText />
            </span>
          </div>
        </div>
        {!client && localError && (
          <div className={s.error} role="alert">
            {localError}
          </div>
        )}
        {client && <RuntimeFeedback client={client} localError={localError} />}
        {client && controller && w && !replacing && (
          <ProgressControls
            client={client}
            controller={controller}
            suspended={newWorldConfirm || !!pendingImport || moreOpen}
          />
        )}
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
                  기록을 펼치는 중…
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
                {(['squad', 'manager', 'business', 'history'] as Page[]).includes(contentPage) && (
                  <ConnectedRich page={contentPage} client={client} />
                )}
              </div>
            </>
          )
        ) : (
          <div className={s.loading}>기록 보관함을 여는 중…</div>
        )}
        {client && (!w || replacing) && <StartTools onDownload={download} onImport={importFile} />}
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
      </main>
      <nav className={s.mobileNav} aria-label="모바일 게임 메뉴">
        {(
          [
            ['dashboard', '일지', '클럽 일지'],
            ['match', '관전', '경기 관전'],
            ['league', '리그', '리그'],
            ['business', '경영', '클럽 경영'],
          ] as const
        ).map(([id, label, full]) => (
          <button
            key={id}
            aria-label={full}
            aria-current={page === id ? 'page' : undefined}
            disabled={!w || replacing}
            onClick={() => setPage(id)}
          >
            <NavIcon page={id} />
            <span>{label}</span>
          </button>
        ))}
        <button
          aria-label="더보기"
          disabled={!w || replacing}
          onClick={(event) => {
            event.currentTarget.focus();
            setMoreOpen(true);
          }}
        >
          <span aria-hidden="true">•••</span>
          <span>더보기</span>
        </button>
      </nav>
      {client && controller && w && !replacing && (
        <QuickActions client={client} controller={controller} />
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
          <div className={s.moreMenu}>
            {NAV.map(([id, , label]) => (
              <button
                key={id}
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
                window.scrollTo(0, 0);
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
