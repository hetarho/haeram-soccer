import { Select } from './Select';
import { useState } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { kindLabel, seasonName } from './format';
import {
  formFor,
  leagueFixtures,
  leagueRules,
  leagueTimeline,
  orderIds,
  ownLeagueIds,
  rankChange,
  sameMembers,
} from './league';
import { ClubCrest } from './ClubCrest';
import s from './LeagueInsights.module.css';

function Movement({ change }: { change?: number }) {
  return (
    <span
      className={change && change > 0 ? s.rising : change && change < 0 ? s.falling : s.neutral}
      aria-label={
        change === undefined
          ? '이전 순위 없음'
          : change > 0
            ? `${change}계단 상승`
            : change < 0
              ? `${-change}계단 하락`
              : '순위 유지'
      }
    >
      {change === undefined ? '—' : change > 0 ? `↑ ${change}` : change < 0 ? `↓ ${-change}` : '·'}
    </span>
  );
}

function Form({ results }: { results: ('승' | '무' | '패')[] }) {
  return (
    <span
      className={s.form}
      aria-label={
        results.length
          ? `최근 ${results.length}경기, 오래된 순서: ${results.join(', ')}`
          : '아직 경기 없음'
      }
    >
      {results.length ? (
        results.map((result, i) => (
          <span key={i} className={result === '승' ? s.win : result === '패' ? s.loss : s.draw}>
            {result}
          </span>
        ))
      ) : (
        <span className={s.neutral}>—</span>
      )}
    </span>
  );
}

export function Standings({ w, ids, limit }: { w: World; ids: string[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const continental = w.europe.find((t) => t.standings === w.tables);
  const sorted = orderIds(ids, w.tables),
    rules = continental ? undefined : leagueRules(w, ids),
    timeline = continental ? [] : leagueTimeline(w, ids);
  const domestic = leagueFixtures(w, ids);
  const fixtures = continental
    ? continental.fixtures
    : domestic.length
      ? domestic
      : w.europe.find((t) => sameMembers(t.clubs, ids))?.fixtures || [];
  const visibleLimit = limit || (expanded ? sorted.length : 8);
  const shown = sorted.filter((id, i) => i < visibleLimit || id === w.playerClub).length;
  return (
    <div className={s.tableWrap}>
      <table className={s.standings} aria-label="리그 순위표">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">클럽</th>
            <th scope="col">승점</th>
            <th scope="col">경기</th>
            <th scope="col">승</th>
            <th scope="col">무</th>
            <th scope="col">패</th>
            <th scope="col">득</th>
            <th scope="col">실</th>
            <th scope="col">득실</th>
            <th scope="col" className={s.optional}>
              변동
            </th>
            <th scope="col" className={s.optional}>
              최근 5경기
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((id, i) => {
            if (i >= visibleLimit && id !== w.playerClub) return null;
            const club = w.clubs.find((c) => c.id === id),
              t = w.tables[id];
            if (!club || !t) return null;
            const zone =
              t.played > 0 &&
              rules &&
              (i < rules.automatic
                ? 'automatic'
                : i < rules.automatic + rules.playoff
                  ? 'playoff'
                  : i >= sorted.length - rules.relegation
                    ? 'relegation'
                    : '');
            return (
              <tr
                key={id}
                className={`${id === w.playerClub ? s.own : ''} ${zone === 'automatic' ? s.automatic : zone === 'playoff' ? s.playoff : zone === 'relegation' ? s.relegation : ''}`}
              >
                <td>
                  {t.played ? i + 1 : '—'}
                  {i >= visibleLimit && <small aria-label="중간 순위 생략"> …</small>}
                </td>
                <th scope="row" className={s.club}>
                  <span className={s.clubName}>
                    <ClubCrest w={w} id={id} size={16} />
                    <span>
                      {club.name}
                      {id === w.playerClub && <span className={s.myClub}>우리 팀</span>}
                    </span>
                  </span>
                </th>
                <td className={s.points}>{t.points}</td>
                <td>{t.played}</td>
                <td>{t.won}</td>
                <td>{t.drawn}</td>
                <td>{t.lost}</td>
                <td>{t.gf}</td>
                <td>{t.ga}</td>
                <td>
                  {t.gf - t.ga > 0 ? '+' : ''}
                  {t.gf - t.ga}
                </td>
                <td className={s.optional}>
                  <Movement change={rankChange(timeline, id)} />
                </td>
                <td className={s.optional}>
                  <Form results={formFor(fixtures, id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!limit && (
        <div className={s.coverage}>
          <span>
            {shown}/{sorted.length}팀 표시 · 순위는 전체 리그 기준
          </span>
          {shown < sorted.length && (
            <button onClick={() => setExpanded(true)}>전체 {sorted.length}팀 순위 보기</button>
          )}
        </div>
      )}
      {rules && (
        <p className={s.legend}>
          {rules.automatic > 0 && (
            <span>
              <i className={s.autoDot} />
              {rules.lower ? '프로 복귀' : '자동 승격'}
            </span>
          )}
          {rules.playoff > 0 && (
            <span>
              <i className={s.playoffDot} />
              승격 플레이오프
            </span>
          )}
          {rules.relegation > 0 && (
            <span>
              <i className={s.dropDot} />
              강등 위험권
            </span>
          )}
          <span>동률: 골득실 → 다득점 → 클럽 ID</span>
        </p>
      )}
    </div>
  );
}

export function LeagueOverview({ w, onOpenLeague }: { w: World; onOpenLeague?: () => void }) {
  const ids = ownLeagueIds(w),
    sorted = orderIds(ids, w.tables),
    own = w.clubs.find((c) => c.id === w.playerClub)!;
  const t = w.tables[w.playerClub],
    rules = leagueRules(w, ids),
    timeline = leagueTimeline(w, ids),
    change = rankChange(timeline, w.playerClub);
  const rank = sorted.indexOf(w.playerClub) + 1,
    fixtures = leagueFixtures(w, ids),
    form = formFor(fixtures, w.playerClub);
  const threshold = rules?.automatic || 1,
    inside = rank <= threshold,
    targetId = sorted[inside ? Math.min(threshold, sorted.length - 1) : threshold - 1];
  const target = targetId ? w.tables[targetId] : undefined,
    gap = target ? Math.abs(t.points - target.points) : 0;
  const relegationId = rules?.relegation ? sorted[sorted.length - rules.relegation] : undefined;
  const cushion = relegationId ? t.points - w.tables[relegationId].points : undefined;
  const next = nextOwnFixture(w);
  const rivalId = next && (next.home === w.playerClub ? next.away : next.home),
    rival = w.clubs.find((c) => c.id === rivalId),
    rivalTable = rivalId && w.tables[rivalId];
  const leagueGame = next?.kind === 'league' || next?.kind === 'lower';
  const last = form.at(-1),
    streak = last ? [...form].reverse().findIndex((result) => result !== last) : 0;
  const streakLength = streak < 0 ? form.length : streak;
  const lastMatch = fixtures
    .filter((f) => f.score && (f.home === w.playerClub || f.away === w.playerClub))
    .sort((a, b) => a.round - b.round)
    .at(-1);
  const ownGoals =
    lastMatch && (lastMatch.home === w.playerClub ? lastMatch.score!.home : lastMatch.score!.away);
  const opponentGoals =
    lastMatch && (lastMatch.home === w.playerClub ? lastMatch.score!.away : lastMatch.score!.home);
  const matchPoints =
    ownGoals === undefined || opponentGoals === undefined
      ? 0
      : ownGoals > opponentGoals
        ? 3
        : ownGoals === opponentGoals
          ? 1
          : 0;
  const before =
    lastMatch &&
    timeline
      .filter((r) => r.round < lastMatch.round)
      .at(-1)
      ?.rows.find((r) => r.id === w.playerClub);
  const after =
    lastMatch &&
    timeline.find((r) => r.round === lastMatch.round)?.rows.find((r) => r.id === w.playerClub);
  return (
    <section className={s.overview} aria-label="우리 팀 리그 현황">
      <div className={s.overviewTitle}>
        <h3>{t.played ? '이번 경기로 바뀐 순위' : '우리 팀의 순위 경쟁'}</h3>
        {onOpenLeague && <button onClick={onOpenLeague}>순위 경쟁 보기 →</button>}
      </div>
      {lastMatch && (
        <p className={s.lastResult}>
          <b>
            {lastMatch.round}라운드 · {ownGoals}–{opponentGoals}{' '}
            {matchPoints === 3 ? '승리' : matchPoints === 1 ? '무승부' : '패배'}
          </b>
          <span>승점 +{matchPoints}</span>
          <span>
            {before && after
              ? `${before.rank}위 → ${after.rank}위`
              : after
                ? `첫 순위 ${after.rank}위`
                : '순위 기록 중'}
          </span>
        </p>
      )}
      <div className={s.stats}>
        <div>
          <span>현재 순위</span>
          <strong>
            {t.played ? `${rank}위` : '개막 전'} <Movement change={change} />
          </strong>
          <small>
            {t.played
              ? change === undefined
                ? '첫 순위가 기록되었습니다'
                : change > 0
                  ? `지난 라운드보다 ${change}계단 상승`
                  : change < 0
                    ? `지난 라운드보다 ${-change}계단 하락`
                    : '지난 라운드 순위 유지'
              : `${ids.length}팀이 새 시즌을 기다립니다`}
          </small>
        </div>
        <div>
          <span>
            {rules?.automatic
              ? rules.lower
                ? '프로 복귀 경쟁'
                : '자동 승격 경쟁'
              : '선두와 승점 차'}
          </span>
          <strong>{!t.played ? '—' : !rules?.automatic && rank === 1 ? '선두' : `${gap}점`}</strong>
          <small>
            {!t.played
              ? rules?.automatic
                ? `${threshold}위까지 자동 승격에 도전합니다`
                : '첫 경기부터 우승 경쟁이 시작됩니다'
              : rules?.automatic
                ? inside
                  ? `${threshold}위까지 승격권 · 추격 팀과 ${gap}점 차`
                  : `${threshold}위 승격선까지 ${gap}점 차`
                : rank === 1
                  ? '리그 우승을 향한 레이스'
                  : `1위 ${w.clubs.find((c) => c.id === sorted[0])?.short || '선두 팀'} 추격 중`}
          </small>
        </div>
        <div>
          <span>{cushion === undefined ? '현재 승점' : '강등 위험선과 승점 차'}</span>
          <strong>
            {!t.played
              ? '—'
              : cushion === undefined
                ? `${t.points}점`
                : `${cushion > 0 ? '+' : ''}${cushion}점`}
          </strong>
          <small>
            {!t.played
              ? '개막 전 · 아직 승점 차가 없습니다'
              : cushion === undefined
                ? `${t.won}승 ${t.drawn}무 ${t.lost}패`
                : rank > sorted.length - (rules?.relegation || 0)
                  ? '강등 위험권 · 승점이 필요합니다'
                  : cushion === 0
                    ? '같은 승점 · 골득실이 가릅니다'
                    : '승점 차를 더 벌려보세요'}
          </small>
        </div>
        <div>
          <span>최근 흐름</span>
          <strong className={s.formStrong}>
            <Form results={form} />
          </strong>
          <small>
            {form.length
              ? streakLength > 1
                ? `최근 ${streakLength}경기 연속 ${last === '승' ? '승리' : last === '패' ? '패배' : '무승부'}`
                : `최근 ${form.length}경기 ${form.filter((r) => r === '승').length}승 ${form.filter((r) => r === '무').length}무 ${form.filter((r) => r === '패').length}패`
              : '첫 승리로 흐름을 만들어보세요'}
          </small>
        </div>
      </div>
      {next && rival ? (
        <div className={s.rival}>
          <div>
            <span>
              {kindLabel[next.kind]} · 다음 상대 · {next.home === w.playerClub ? '홈' : '원정'}
            </span>
            <h4>
              <ClubCrest w={w} id={own.id} size={18} /> {own.short} <span>vs</span>{' '}
              <ClubCrest w={w} id={rival.id} size={18} /> {rival.name}
            </h4>
            <p>
              {leagueGame && rivalTable && t.played
                ? `${sorted.indexOf(rival.id) + 1}위 상대와 ${Math.abs(t.points - rivalTable.points)}점 차. ${Math.abs(t.points - rivalTable.points) <= 3 ? '한 경기로 경쟁 구도가 달라질 수 있습니다.' : '승점을 쌓아 순위 경쟁을 이어가세요.'}`
                : '다음 무대에서도 우리 팀의 흐름을 이어가세요.'}
            </p>
          </div>
          {leagueGame && (
            <div className={s.projection} aria-label="다음 경기 결과별 승점">
              <h5>다음 경기 후 우리 승점 · 지금 {t.points}점</h5>
              <span>
                이기면 <b>{t.points + 3}점</b> <small>+3</small>
              </span>
              <span>
                비기면 <b>{t.points + 1}점</b> <small>+1</small>
              </span>
              <span>
                지면 <b>{t.points}점</b> <small>+0</small>
              </span>
              <small>순위는 같은 라운드 다른 팀의 결과에 따라 달라져요.</small>
            </div>
          )}
        </div>
      ) : (
        <p className={s.seasonEnd}>
          이번 시즌 리그 일정이 끝났습니다. 시즌 결산에서 승강 결과를 확인하세요.
        </p>
      )}
    </section>
  );
}

export function RankHistoryGraph({ w, ids = ownLeagueIds(w) }: { w: World; ids?: string[] }) {
  const ownLeague = sameMembers(ids, ownLeagueIds(w));
  const years = [
    w.year,
    ...new Set(
      (w.rankHistory || [])
        .filter(
          (snapshot) =>
            ownLeague &&
            snapshot.year < w.year &&
            snapshot.round > 0 &&
            snapshot.rows.some(([index]) => w.clubs[index]?.id === w.playerClub),
        )
        .map((snapshot) => snapshot.year),
    ),
  ].sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState<number>(),
    [selectedComparison, setChoice] = useState('nearby');
  const year = selectedYear !== undefined && years.includes(selectedYear) ? selectedYear : w.year;
  const archived = (w.rankHistory || []).filter(
    (snapshot) =>
      snapshot.year === year &&
      snapshot.round > 0 &&
      snapshot.rows.some(([index]) => w.clubs[index]?.id === w.playerClub),
  );
  const timeline =
    year === w.year
      ? leagueTimeline(w, ids)
      : archived
          .map((snapshot) => ({
            year: snapshot.year,
            round: snapshot.round,
            rows: snapshot.rows.map(([index, points, gf, ga], i) => ({
              id: w.clubs[index].id,
              rank: i + 1,
              points,
              gf,
              ga,
            })),
          }))
          .sort((a, b) => a.round - b.round);
  const graphIds = year === w.year ? ids : timeline[0]?.rows.map((row) => row.id) || [];
  const sorted =
    year === w.year ? orderIds(ids, w.tables) : timeline.at(-1)?.rows.map((row) => row.id) || [];
  const primary = graphIds.includes(w.playerClub) ? w.playerClub : sorted[0];
  const choice = ['nearby', 'none', 'all', ...graphIds].includes(selectedComparison)
    ? selectedComparison
    : 'nearby';
  const rank = sorted.indexOf(primary),
    nearby = sorted[rank > 0 ? rank - 1 : 1];
  const compare = choice === 'nearby' ? nearby : graphIds.includes(choice) ? choice : undefined;
  const series =
    choice === 'all'
      ? [primary, ...graphIds.filter((id) => id !== primary)]
      : [primary, compare].filter((id): id is string => !!id);
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const x = (i: number) => 42 + (i / Math.max(1, timeline.length - 1)) * 572,
    y = (r: number) => 22 + ((r - 1) / Math.max(1, graphIds.length - 1)) * 150;
  const ticks = [...new Set([1, Math.ceil(graphIds.length / 2), graphIds.length])];
  return (
    <section className={s.panel} aria-label="시즌 순위 추이">
      <div className={s.panelHead}>
        <div>
          <h3>시즌 순위 추이</h3>
          <span>
            {seasonName(year)}
            {year !== w.year && archived[0] ? ` · 당시 ${archived[0].tier + 1}부` : ''} · 위로
            올라갈수록 높은 순위
          </span>
        </div>
        <div className={s.graphFilters}>
          {years.length > 1 && (
            <label className={s.compare}>
              시즌{' '}
              <Select
                aria-label="순위 추이 시즌 선택"
                value={year}
                onValueChange={(value) => setSelectedYear(Number(value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {seasonName(y)}
                    {y === w.year ? ' · 진행 중' : ''}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className={s.compare}>
            비교{' '}
            <Select
              aria-label="순위 추이 비교 클럽"
              value={choice}
              onValueChange={(value) => setChoice(value)}
            >
              <option value="nearby">가까운 경쟁 팀</option>
              <option value="none">한 팀만 보기</option>
              <option value="all">리그 전체</option>
              {sorted
                .filter((id) => id !== primary)
                .map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                  </option>
                ))}
            </Select>
          </label>
        </div>
      </div>
      {!timeline.length ? (
        <p className={s.empty}>
          {ownLeague
            ? '첫 라운드가 끝나면 모든 팀의 순위가 함께 기록됩니다.'
            : '다른 리그는 현재 순위표를 제공합니다. 라운드별 추이는 우리 팀 리그에서 기록됩니다.'}
        </p>
      ) : (
        <>
          <figure className={s.chart}>
            <svg
              viewBox="0 0 650 205"
              role="img"
              aria-label={`${name(primary)} 순위 추이: ${timeline.map((r) => `${r.round}라운드 ${r.rows.find((row) => row.id === primary)?.rank}위`).join(', ')}`}
            >
              {ticks.map((rank) => (
                <g key={rank}>
                  <line
                    x1="42"
                    x2="614"
                    y1={y(rank)}
                    y2={y(rank)}
                    stroke="#dce2d5"
                    strokeDasharray="3 5"
                  />
                  <text x="30" y={y(rank) + 4} textAnchor="end">
                    {rank}위
                  </text>
                </g>
              ))}
              {[...series].reverse().map((id) => (
                <g key={id} opacity={choice === 'all' && id !== primary ? 0.35 : 1}>
                  <polyline
                    points={timeline
                      .map(
                        (round, i) =>
                          `${x(i)},${y(round.rows.find((row) => row.id === id)?.rank || graphIds.length)}`,
                      )
                      .join(' ')}
                    fill="none"
                    stroke={id === primary ? '#28654b' : '#b57f54'}
                    strokeWidth={id === primary ? 3.5 : 1.5}
                    strokeLinejoin="round"
                  />
                  {(choice !== 'all' || id === primary) &&
                    timeline.map((round, i) => {
                      const row = round.rows.find((row) => row.id === id);
                      return (
                        row && (
                          <circle
                            key={round.round}
                            cx={x(i)}
                            cy={y(row.rank)}
                            r={timeline.length > 20 ? 2 : 3}
                            fill={id === primary ? '#28654b' : '#b57f54'}
                          >
                            <title>
                              {name(id)} · {round.round}라운드 {row.rank}위 · {row.points}점
                            </title>
                          </circle>
                        )
                      );
                    })}
                </g>
              ))}
              <text x="42" y="198">
                {timeline[0].round}라운드
              </text>
              <text x="614" y="198" textAnchor="end">
                {timeline.at(-1)!.round}라운드
              </text>
            </svg>
            <figcaption>
              <span>
                <i className={s.primaryDot} />
                {name(primary)}
              </span>
              {choice === 'all' ? (
                <span>리그 전체 {graphIds.length}팀</span>
              ) : (
                compare && (
                  <span>
                    <i className={s.compareDot} />
                    {name(compare)}
                  </span>
                )
              )}
            </figcaption>
          </figure>
          <details className={s.details}>
            <summary>라운드별 순위와 승점 보기</summary>
            <div className={s.tableWrap}>
              <table aria-label="라운드별 순위 기록">
                <thead>
                  <tr>
                    <th scope="col">라운드</th>
                    {series.map((id) => (
                      <th key={id} scope="col">
                        {name(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((round) => (
                    <tr key={round.round}>
                      <th scope="row">{round.round}</th>
                      {series.map((id) => {
                        const row = round.rows.find((row) => row.id === id);
                        return <td key={id}>{row ? `${row.rank}위 · ${row.points}점` : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function RoundResults({ w, ids }: { w: World; ids: string[] }) {
  const fixtures = leagueFixtures(w, ids),
    rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const completed = fixtures.filter((f) => f.score),
    defaultRound = completed.length ? Math.max(...completed.map((f) => f.round)) : rounds[0];
  const [selected, setSelected] = useState<number>();
  const round = selected !== undefined && rounds.includes(selected) ? selected : defaultRound;
  const results = fixtures.filter((f) => f.round === round),
    finished = results.filter((f) => f.score).length;
  const club = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const resultClass = (f: Fixture) =>
    f.home === w.playerClub || f.away === w.playerClub ? s.ownResult : '';
  if (!rounds.length || !sameMembers(ids, ownLeagueIds(w))) return null;
  return (
    <section className={s.panel} aria-label="리그 라운드 결과">
      <div className={s.panelHead}>
        <div>
          <h3>같은 라운드, 다른 경기</h3>
          <span>
            {finished
              ? `${finished}경기 종료 · 경쟁 팀의 결과를 확인하세요`
              : '예정된 경기 · 누구와 승점을 다툴까요?'}
          </span>
        </div>
        <label className={s.compare}>
          일정{' '}
          <Select
            aria-label="리그 라운드 선택"
            value={round}
            onValueChange={(value) => setSelected(Number(value))}
          >
            {rounds.map((r) => (
              <option key={r} value={r}>
                {r}라운드{fixtures.some((f) => f.round === r && f.score) ? ' · 종료' : ' · 예정'}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <ul className={s.results}>
        {results.map((f) => {
          const ours = f.home === w.playerClub || f.away === w.playerClub;
          return (
            <li key={f.id} className={resultClass(f)} data-own={ours || undefined}>
              {ours && <span className={s.ownBadge}>우리 팀</span>}
              <span className={`${s.side} ${f.home === w.playerClub ? s.ourName : ''}`}>
                <span>{club(f.home)}</span>
                <ClubCrest w={w} id={f.home} size={16} />
              </span>
              <b aria-label={f.score ? `${f.score.home} 대 ${f.score.away}` : '경기 예정'}>
                {f.score ? `${f.score.home} – ${f.score.away}` : 'vs'}
              </b>
              <span className={`${s.side} ${f.away === w.playerClub ? s.ourName : ''}`}>
                <ClubCrest w={w} id={f.away} size={16} />
                <span>{club(f.away)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LeagueInsights({ w, ids = ownLeagueIds(w) }: { w: World; ids?: string[] }) {
  const rules = leagueRules(w, ids);
  return (
    <div className={s.insights}>
      <RankHistoryGraph w={w} ids={ids} />
      <section className={s.panel}>
        <div className={s.panelHead}>
          <div>
            <h3>{rules ? `${rules.cp.name} · ${rules.first.tier + 1}부 순위표` : '리그 순위표'}</h3>
            <span>{seasonName(w.year)} · 승점이 같으면 골득실로 순위를 가릅니다</span>
          </div>
          <span className={s.roundTag}>{w.round}라운드</span>
        </div>
        <Standings w={w} ids={ids} />
      </section>
      <RoundResults w={w} ids={ids} />
    </div>
  );
}
