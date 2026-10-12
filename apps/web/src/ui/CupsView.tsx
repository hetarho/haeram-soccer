import { lazy, Suspense, useState } from 'react';
import type {
  EuropeTournament,
  Fixture,
  KnockoutRound,
  TableRow,
  World,
} from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { clubOf } from '../../../../packages/engine/src/world';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { cupKey, domesticCupName } from '../../../../packages/engine/src/cups';
import { ownReached } from '../../../../packages/engine/src/knockout';
import { phaseGroups } from '../../../../packages/engine/src/europe';
import { emptyTable } from '../../../../packages/engine/src/season';
import type { GameClient } from '../runtime/client';
import { Bracket, Club } from './Bracket';
import { number, seasonName } from './format';
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

/** Clubs ranked by a competition table: points, goal difference, goals, then ID. */
function rankIds(standings: Record<string, TableRow>, ids: string[]) {
  return [...ids].sort((a, b) => {
    const x = standings[a] || emptyTable(),
      y = standings[b] || emptyTable();
    return (
      y.points - x.points ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      (a < b ? -1 : a > b ? 1 : 0)
    );
  });
}

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
  const sorted = rankIds(t.standings, ids);
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

function DomesticCup({ w }: { w: World }) {
  const own = clubOf(w);
  const cup = w.cups?.find((entry) => entry.country === own.country);
  const name = cup?.name ?? domesticCupName(own.country);
  const titles = w.history.filter((h) =>
    h.champions.some((entry) => entry.country === own.country && entry.cup === w.playerClub),
  ).length;
  if (!cup)
    return (
      <section className={c.card}>
        <h3>{name}</h3>
        <p className={s.muted}>다음 시즌 시작과 함께 첫 라운드 대진을 추첨해요.</p>
      </section>
    );
  const entered = cup.clubs.includes(w.playerClub);
  return (
    <section className={c.card} aria-label={name}>
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
      <p className={c.status}>{ownStatus(w, cup.rounds, cup.fixtures, entered)}</p>
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
    ? '우리 클럽은 참가하지 않아요. 리그 상위권이나 국내 컵 우승으로 출전권을 얻어요.'
    : t.winner === w.playerClub
      ? '우승!'
      : (t.ownExit ?? ownStatus(w, rounds, t.fixtures, true));
  return (
    <section className={c.card} aria-label={t.name}>
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
      <p className={c.status}>{status}</p>
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
  const tabs = [
    { id: 'cup', label: domesticCupName(clubOf(w).country) },
    ...w.europe.filter((t) => t.key !== 'super').map((t) => ({ id: t.key, label: t.name })),
    { id: 'history', label: '역사' },
  ];
  const [tab, setTab] = useState('cup');
  const active = tabs.some((entry) => entry.id === tab) ? tab : 'cup';
  const tournament = w.europe.find((t) => t.key === active);
  const nextEurope = w.year < 1955 ? 1955 - w.year : 0;
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>CUP COMPETITIONS</div>
          <h2>컵 대회</h2>
          <p>
            {country(clubOf(w).country).name} 컵과 대륙 클럽대항전의 대진·순위·역사.
            {nextEurope > 0 && ` 유러피언컵은 ${nextEurope}년 후(1955/56) 창설돼요.`}
          </p>
        </div>
        <span className={s.pill}>최근 5시즌 구단 계수 · {number(coefficient)}점</span>
      </div>
      <div className={`${s.filters} ${c.tabs}`} role="tablist" aria-label="컵 대회">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={active === entry.id}
            className={active === entry.id ? s.selected : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {active === 'cup' && <DomesticCup w={w} />}
      {tournament && <Continental key={tournament.key} w={w} t={tournament} />}
      {active === 'history' && (
        <Suspense
          fallback={
            <p className={s.muted} role="status">
              컵 대회 역사를 펼치는 중…
            </p>
          }
        >
          <CupHistory w={w} client={client} />
        </Suspense>
      )}
      <p className={s.muted}>
        국가별 참가권, 시드와 추첨은 데모에 맞게 단순화했습니다. 클럽대항전은 9–1월 리그·조별 단계,
        2월부터(조별 단계가 없던 시대는 9월부터) 홈앤드어웨이 토너먼트, 5월 단판 결승으로 치릅니다.
        1·2차전은 2003년 전까지 2주, 이후 1주 간격이고 2003–2023년 챔피언스리그 16강만 3주 간격이며,
        2021년 전까지는 원정 다득점 규칙을 씁니다.
      </p>
    </>
  );
}
