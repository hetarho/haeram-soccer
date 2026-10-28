import { COMPETITION_PATHS, competitionRoute, selectedYear } from './competitionNavigation';
import { Select } from './Select';
import { LINEAGES, lineageName } from './cupCompetitions';
import { useCupRequest, useNavigation } from './state';
import { useTaskMemory, useTaskState } from './taskMemory';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  EuropeTournament,
  Fixture,
  KnockoutRound,
  World,
} from '../../../../packages/contracts/src/types';
import { COUNTRIES } from '../../../../packages/catalogs/src/index';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { cupKey, domesticCupName } from '../../../../packages/engine/src/competition-keys';
import { ownReached } from '../../../../packages/engine/src/knockout';
import { phaseGroups } from '../../../../packages/engine/src/europe';
import { emptyTable } from '../../../../packages/engine/src/league-fixtures';
import type { GameClient } from '../runtime/client';
import { Bracket, Club } from './Bracket';
import { number, seasonName } from './format';
import { orderIds } from './league';
import { replaceQuery, TabList, TabPanel, useAddressTab } from './PageTabs';
import s from './App.module.css';
import c from './CupsView.module.css';

/**
 * History is the heaviest and least visited tab, so its code loads on first opening instead of
 * with the app (ARCH-28 entry budget). A failed load says so instead of breaking the page.
 */
const CupHistory = lazy(() =>
  import('./CupHistory')
    .then((module) => ({ default: module.CupHistory }))
    .catch(() => ({
      default: () => (
        <p className={s.muted} role="alert">
          컵 대회 역사를 불러오지 못했어요. 페이지를 새로 고친 뒤 다시 열어 주세요.
        </p>
      ),
    })),
);

const nameOf = (w: World, id?: string) => w.clubs.find((club) => club.id === id)?.name ?? '—';

/** A league-phase or group table with its qualification zones. */
function PhaseTable({
  w,
  t,
  ids,
  zones,
  title,
}: {
  w: World;
  t: EuropeTournament;
  ids: string[];
  zones: { until: number; tone: 'direct' | 'playoff' | 'out'; label: string }[];
  title?: string;
}) {
  const [all, setAll] = useState(ids.length <= 8);
  const sorted = orderIds(ids, t.standings);
  const zoneOf = (rank: number) => zones.find((zone) => rank <= zone.until);
  return (
    <section className={c.phase}>
      {title && <h4>{title}</h4>}
      <table className={c.table} aria-label={title || `${t.name} 순위표`}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">클럽</th>
            <th scope="col">경기</th>
            <th scope="col">득실</th>
            <th scope="col">승점</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((id, i) => {
            if (!all && i >= 8 && id !== w.playerClub) return null;
            const row = t.standings[id] || emptyTable();
            const zone = zoneOf(i + 1);
            return (
              <tr
                key={id}
                className={`${zone ? c[zone.tone] : ''} ${id === w.playerClub ? c.ownRow : ''}`}
              >
                <td>{i + 1}</td>
                <td>
                  <Club w={w} id={id} />
                </td>
                <td>{row.played}</td>
                <td>{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                <td>
                  <b>{row.points}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!all && (
        <button className={c.more} onClick={() => setAll(true)}>
          {sorted.length}팀 모두 보기
        </button>
      )}
      <p className={c.legend}>
        {zones
          .filter((zone) => zone.tone !== 'out')
          .map((zone) => (
            <span key={zone.label}>
              <i className={c[zone.tone]} /> {zone.label}
            </span>
          ))}
      </p>
    </section>
  );
}

/** Our standing in one competition, in one line a fan would say. */
function ownStatus(w: World, rounds: KnockoutRound[], fixtures: Fixture[], entered: boolean) {
  if (!entered) return '우리 클럽은 참가하지 않아요.';
  const reached = ownReached(w, rounds);
  const next = fixtures
    .filter((f) => !f.score && (f.home === w.playerClub || f.away === w.playerClub))
    .sort((a, b) => a.round - b.round)[0];
  if (reached?.champion) return '우승!';
  if (reached?.eliminated) return `${reached.label} 탈락`;
  if (next) {
    const home = next.home === w.playerClub;
    return `${reached ? `${reached.label} · ` : ''}다음 ${home ? '홈' : '원정'} ${nameOf(w, home ? next.away : next.home)} · ${fixtureDate(w, next).replace(/^\d+년 /, '')}`;
  }
  return reached ? `${reached.label} 진출` : '대진 추첨을 기다려요';
}

function DomesticCup({ w, countryCode }: { w: World; countryCode: string }) {
  const cup = w.cups?.find((entry) => entry.country === countryCode);
  const name = cup?.name ?? domesticCupName(countryCode);
  const titles = w.history.filter((h) =>
    h.champions.some((entry) => entry.country === countryCode && entry.cup === w.playerClub),
  ).length;
  if (!cup)
    return (
      <section data-surface="panel" className={c.card}>
        <h3>{name}</h3>
        <p className={s.muted}>다음 시즌 시작과 함께 첫 라운드 대진을 추첨해요.</p>
      </section>
    );
  const entered = cup.clubs.includes(w.playerClub);
  return (
    <section data-surface="panel" className={c.card} aria-label={name}>
      <header className={c.cardHead}>
        <div>
          <h3>{name}</h3>
          <small>
            {seasonName(w.year)} · {cup.clubs.length}팀 단판 토너먼트 · 우승 {titles}회
          </small>
        </div>
        {cup.winner && (
          <span className={c.winnerPill}>
            우승 <Club w={w} id={cup.winner} />
          </span>
        )}
      </header>
      <p data-ui="notice" className={c.status}>
        {ownStatus(w, cup.rounds, cup.fixtures, entered)}
      </p>
      <Bracket
        w={w}
        rounds={cup.rounds}
        fixtures={cup.fixtures}
        competition={cupKey(cup.country)}
      />
      <p className={c.note}>
        리그 일정 사이 주중에 치러요(9월 1라운드 → 5월 결승). 하부 리그 클럽이 먼저 1라운드를 치르고
        상위 클럽은 다음 라운드부터 들어와요. 비기면 연장과 승부차기로 가려요.
      </p>
    </section>
  );
}

function Continental({ w, t }: { w: World; t: EuropeTournament }) {
  const entered = t.clubs.includes(w.playerClub);
  const rounds = t.rounds || [];
  const groups = phaseGroups(t, 'phase');
  const second = phaseGroups(t, 'second');
  const qualifyPerGroup = t.field === 40 ? 3 : t.field === 16 || t.field >= 32 ? 2 : 1;
  const status = !entered
    ? '우리 클럽은 참가하지 않아요. 국가별 리그 배분, 국내 컵 또는 유럽대항전 우승으로 출전권을 얻어요.'
    : t.winner === w.playerClub
      ? '우승!'
      : (t.ownExit ?? ownStatus(w, rounds, t.fixtures, true));
  return (
    <section data-surface="panel" className={c.card} aria-label={t.name}>
      <header className={c.cardHead}>
        <div>
          <h3>{t.name}</h3>
          <small>
            {seasonName(w.year)} · {t.field}팀 ·{' '}
            {t.format === 'league'
              ? `리그 페이즈 ${t.games}경기`
              : t.format === 'knockout'
                ? '토너먼트'
                : t.format === 'double-groups'
                  ? '조별 리그 2회'
                  : '조별 리그'}{' '}
            · 지금 {t.stage}
          </small>
        </div>
        {t.winner && (
          <span className={c.winnerPill}>
            우승 <Club w={w} id={t.winner} />
          </span>
        )}
      </header>
      <p data-ui="notice" className={c.status}>
        {status}
      </p>
      {entered && (
        <p className={c.note}>
          출전권: {t.ownQualification || '이 저장에는 당시 출전권 사유가 기록되어 있지 않아요.'}
        </p>
      )}
      {w.year >= 2021 ? (
        <p className={c.note}>
          예선 진출팀은 이 게임의 본선에 바로 참가해요. 국가 순위는 지원하는 8개국의 5시즌 기록으로
          계산하며, 기록이 부족하면 기본 순위를 사용해요. 2024년부터 국가 계수 상위 2개국에 추가
          챔스 티켓(EPS)을 배정하며, 이전 시즌의 국가 계수가 없으면 배정하지 않아요. 잉글랜드
          리그컵과 네덜란드·벨기에의 국내 출전권 플레이오프는 별도로 치르지 않고 리그 순위로
          배분해요.
        </p>
      ) : (
        <p className={c.note}>이 시대의 국가별 출전권과 예선 경로는 간소화한 배분을 사용해요.</p>
      )}
      <Bracket w={w} rounds={rounds} fixtures={t.fixtures} competition={t.key} />
      {second.length > 0 &&
        second.map((ids, g) => (
          <PhaseTable
            key={`second-${g}`}
            w={w}
            t={t}
            ids={ids}
            title={`2차 조별 리그 ${String.fromCharCode(65 + g)}조`}
            zones={[{ until: 2, tone: 'direct', label: '8강 진출' }]}
          />
        ))}
      {t.format === 'league' && groups.length > 0 && (
        <PhaseTable
          w={w}
          t={t}
          ids={groups.flat()}
          title="리그 페이즈 순위"
          zones={[
            { until: 8, tone: 'direct', label: '1–8위 16강 직행' },
            { until: 24, tone: 'playoff', label: '9–24위 플레이오프' },
            { until: 36, tone: 'out', label: '탈락' },
          ]}
        />
      )}
      {t.format !== 'league' && groups.length > 0 && (
        <div className={c.groups}>
          {groups.map((ids, g) => (
            <PhaseTable
              key={g}
              w={w}
              t={t}
              ids={ids}
              title={`${String.fromCharCode(65 + g)}조`}
              zones={[{ until: qualifyPerGroup, tone: 'direct', label: '토너먼트 진출' }]}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Cups: the domestic cup and the continental club competitions, live and in history (→WEB-40). */
export function CupsView({
  w,
  coefficient,
  client,
}: {
  w: World;
  coefficient: number;
  client: GameClient;
}) {
  const page = useNavigation((state) => state.page);
  const activePage = page === 'europe' || page === 'cupHistory';
  const context = page === 'cupHistory' ? 'cupHistory' : 'europe';
  const period = context === 'cupHistory' ? 'history' : 'current';
  const countries = COUNTRIES.map((entry) => [entry.code, entry.name] as const);
  const [countryCode, setCountry] = useAddressTab('country', countries, clubOf(w).country, {
    world: w.id,
    key: `${context}-country`,
    path: COMPETITION_PATHS[context],
  });
  const tabs = [
    ['cup', domesticCupName(countryCode)],
    ...LINEAGES.map((lineage) => [lineage.key, lineageName(w, lineage)] as const),
  ] as const;
  // The page stays mounted while hidden; the address carries the competition and period in full.
  const [tab, setTab] = useAddressTab('cup', tabs, 'cup', {
    world: w.id,
    key: `${context}-tab`,
    path: COMPETITION_PATHS[context],
    keepFirst: true,
  });
  const [year, setYear] = useTaskState<number | undefined>(w.id, `${context}-year-${tab}`, () =>
    competitionRoute(location.pathname, location.search)?.page === context
      ? selectedYear(new URLSearchParams(location.search))
      : undefined,
  );
  const entered = useRef('');
  const entering = activePage && entered.current !== context;
  useLayoutEffect(() => {
    if (entering) {
      entered.current = context;
      setYear(selectedYear(new URLSearchParams(location.search)));
    }
    if (!activePage) entered.current = '';
  });
  const request = useCupRequest((store) => store.request);
  useEffect(() => {
    if (!activePage || !request) return;
    // Set the requested competition's retained year directly before switching the key.
    useTaskMemory.getState().activate(w.id);
    const state = useTaskMemory.getState();
    useTaskMemory.setState({
      values: {
        ...state.values,
        [`${context}-year-${request.competition}`]:
          request.year === w.year ? undefined : request.year,
      },
    });
    useCupRequest.getState().take();
    setTab(request.competition);
    if (request.competition === 'cup') setCountry(clubOf(w).country);
  }, [request, w.id, w.year, setTab, setCountry, context, activePage]);
  useEffect(() => {
    if (!activePage || entering) return;
    replaceQuery((params) => {
      if (period === 'history' && year !== undefined) params.set('season', String(year));
      else params.delete('season');
    });
  }, [period, year, activePage, entering]);
  useEffect(() => {
    // Back and forward also bring the season that competition showed.
    const restore = () => {
      if (competitionRoute(location.pathname, location.search)?.page !== context) return;
      const params = new URLSearchParams(location.search),
        saved = params.get('cup'),
        picked = Number(params.get('season'));
      if (!saved) return;
      useTaskMemory.getState().activate(w.id);
      const state = useTaskMemory.getState();
      useTaskMemory.setState({
        values: {
          ...state.values,
          [`${context}-year-${saved}`]: Number.isInteger(picked) && picked > 0 ? picked : undefined,
        },
      });
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('tasknavigate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('tasknavigate', restore);
    };
  }, [w.id, context]);
  const active = tabs.some(([id]) => id === tab) ? tab : 'cup';
  const tournament = w.europe.find((t) => t.key === active);
  const lineage = LINEAGES.find((entry) => entry.key === active);
  return (
    <>
      <TabList
        tabs={tabs}
        value={active}
        onChange={setTab}
        label="컵 대회"
        idPrefix="cup-competition"
        className={`${s.seasonTabs} ${c.tabs}`}
      />
      <TabPanel idPrefix="cup-competition" value={active}>
        <div className={s.recordControls}>
          <b>
            {tabs.find(([id]) => id === active)?.[1]} ·{' '}
            {period === 'current' ? seasonName(w.year) : '지난 시즌·역사'}
          </b>
        </div>
        {period === 'current' && (
          <p className={s.muted}>최근 5시즌 구단 계수 · {number(coefficient)}점</p>
        )}
        {active === 'cup' && (
          <Select aria-label="국내 컵 국가" value={countryCode} onValueChange={setCountry}>
            {countries.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
        )}
        {period === 'current' && active === 'cup' && (
          <DomesticCup w={w} countryCode={countryCode} />
        )}
        {period === 'current' && tournament && (
          <Continental key={tournament.key} w={w} t={tournament} />
        )}
        {period === 'current' && active !== 'cup' && !tournament && (
          <p className={s.panelBody}>
            {lineage && w.year < lineage.founded
              ? `${seasonName(lineage.founded)} 시즌에 창설돼요.`
              : '이번 시즌에는 열리지 않는 대회예요. 지난 시즌·역사에서 보관된 기록을 볼 수 있어요.'}
          </p>
        )}
        {period === 'history' && (
          <Suspense
            fallback={
              <p className={s.muted} role="status">
                컵 대회 역사를 펼치는 중…
              </p>
            }
          >
            <CupHistory
              key={`${active}-${countryCode}`}
              countryCode={countryCode}
              w={w}
              client={client}
              competition={active}
              picked={year}
              onYear={setYear}
            />
          </Suspense>
        )}
      </TabPanel>
      <p className={s.muted}>
        국가별 참가권, 시드와 추첨은 데모에 맞게 단순화했습니다. 클럽대항전은 9–1월 리그·조별 단계,
        2월부터(조별 단계가 없던 시대는 9월부터) 홈앤드어웨이 토너먼트, 5월 단판 결승으로 치릅니다.
        1·2차전은 2003년 전까지 2주, 이후 1주 간격이고 2003–2023년 챔피언스리그 16강만 3주 간격이며,
        2021년 전까지는 원정 다득점 규칙을 씁니다.
      </p>
    </>
  );
}
