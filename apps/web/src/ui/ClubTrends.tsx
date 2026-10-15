import { useTaskState } from './taskMemory';
import { useMemo } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { country, currency } from '../../../../packages/catalogs/src/index';
import { clubOf, quote } from '../../../../packages/engine/src/world';
import { ratio } from '../../../../packages/engine/src/primitives';
import { Panel } from './App';
import { Chart, type ChartBand } from './Chart';
import { ClubLink } from './ClubLink';
import { divisionName } from './careerRecords';
import { compactMoney, number, seasonName } from './format';
import { Money } from './Money';
import {
  eloDetail,
  eloStanding,
  leaguePositionDetail,
  pyramidPosition,
  type RatedClub,
} from './recordTrends';
import { Segments } from './Segments';
import s from './App.module.css';

/** A past amount in today's money, in minor units: price index and currency change applied. */
function inToday(w: World, amount: string, year: number) {
  const code = clubOf(w).country;
  return ratio(amount, BigInt(quote(code, w.year, 10000)), BigInt(quote(code, year, 10000)));
}

/** A chart plots major units, so a point carries its amount divided down. */
const plotted = (w: World, amount: string) =>
  Number(amount) / currency(clubOf(w).country, w.year).units;

/** A chart axis writes money in the app's notation (→WEB-67), back from the plotted major units. */
const axisMoney = (w: World, plot: number) => {
  const code = clubOf(w).country;
  return compactMoney(
    BigInt(Math.round(plot * currency(code, w.year).units)).toString(),
    code,
    w.year,
  );
};

/**
 * Every records chart's series with the line each season shows in its bubble, computed once per
 * closed season (or a change of division) so moving over a chart never recomputes them.
 */
function trendSeries(w: World) {
  const club = clubOf(w),
    code = club.country,
    amount = (value: string) => compactMoney(value, code, w.year),
    seasons = w.history,
    rated = seasons.filter((h) => h.elo !== undefined),
    valued = seasons.filter((h) => h.squadValue && h.clubValue);
  const series = (list: typeof seasons, values: number[], detail: (index: number) => string) => ({
    values,
    labels: list.map((h) => seasonName(h.year)),
    details: list.map((_, i) => detail(i)),
  });
  const squad = valued.map((h) => inToday(w, h.squadValue!, h.year)),
    clubValue = valued.map((h) => inToday(w, h.clubValue!, h.year)),
    cash = seasons.map((h) => inToday(w, h.cash, h.year));
  const bands: ChartBand[] = [
    {
      label: '세계 최저–최고',
      tone: 'faint',
      lo: rated.map((h) => h.eloRange?.[0]),
      hi: rated.map((h) => h.eloRange?.[1]),
    },
    {
      label: '우리 리그 최저–최고',
      tone: 'strong',
      lo: rated.map((h) => h.eloRange?.[2]),
      hi: rated.map((h) => h.eloRange?.[3]),
    },
  ];
  return {
    axis: (value: number) => axisMoney(w, value),
    league: series(
      seasons,
      seasons.map((h) => pyramidPosition(code, h)),
      (i) => leaguePositionDetail(code, seasons, i, club.tier),
    ),
    elo: {
      ...series(
        rated,
        rated.map((h) => h.elo!),
        (i) => eloDetail(rated[i]),
      ),
      bands,
      unrated: seasons.length - rated.length,
      unranged: rated.filter((h) => !h.eloRange).length,
    },
    unvalued: seasons.length - valued.length,
    squad: series(
      valued,
      squad.map((value) => plotted(w, value)),
      (i) => `${seasonName(valued[i].year)} · ${amount(squad[i])}`,
    ),
    club: series(
      valued,
      clubValue.map((value) => plotted(w, value)),
      (i) => `${seasonName(valued[i].year)} · ${amount(clubValue[i])}`,
    ),
    fans: series(
      seasons,
      seasons.map((h) => h.fans),
      (i) => `${seasonName(seasons[i].year)} · ${number(seasons[i].fans)}명`,
    ),
    cash: series(
      seasons,
      cash.map((value) => plotted(w, value)),
      (i) => `${seasonName(seasons[i].year)} · ${amount(cash[i])}`,
    ),
  };
}

/** Our live Club Elo standing; it moves with every result, so only the clubs' ratings key it. */
export function useEloStanding(w: World) {
  return useMemo(() => eloStanding(w), [w.clubs, w.playerClub, w.lower, w.fixtures]);
}

/**
 * Where our Club Elo stands today (→HIST-12): the number alone says nothing, so it comes with the
 * world rank, the world's and our league's highest and lowest clubs and the gap to our league's
 * best, on a scale from the world's lowest to its highest.
 */
export function EloStanding({
  w,
  standing,
}: {
  w: World;
  standing: ReturnType<typeof eloStanding>;
}) {
  const { elo, rank, total, world, league, gap } = standing;
  const span = Math.max(1, world.high.elo - world.low.elo),
    at = (value: number) => Math.min(100, Math.max(0, ((value - world.low.elo) / span) * 100));
  const clubs: [string, RatedClub][] = [
    ['세계 최고', world.high],
    ['세계 최저', world.low],
    ['우리 리그 최고', league.high],
    ['우리 리그 최저', league.low],
  ];
  return (
    <section className={s.eloStanding} aria-label="클럽 Elo 위치">
      <div className={s.eloFigures}>
        <div>
          <small>지금 Elo</small>
          <strong>{elo}</strong>
        </div>
        <div>
          <small>전체 순위</small>
          <strong>{rank}위</strong>
          <small>{number(total)}개 클럽 중</small>
        </div>
        <div>
          <small>{gap ? '리그 1위와' : '우리 리그'}</small>
          <strong>{gap ? `−${-gap}` : 'Elo 1위'}</strong>
        </div>
      </div>
      <div className={s.eloScale} aria-hidden="true">
        <i
          style={{
            left: `${at(league.low.elo)}%`,
            width: `${Math.max(1, at(league.high.elo) - at(league.low.elo))}%`,
          }}
        />
        <b style={{ left: `${at(elo)}%` }} />
      </div>
      <div className={s.eloScaleEnds} aria-hidden="true">
        <span>세계 {world.low.elo}</span>
        <span>우리 리그 {`${league.low.elo}–${league.high.elo}`}</span>
        <span>{world.high.elo}</span>
      </div>
      <dl className={s.eloClubs}>
        {clubs.map(([label, rated]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <ClubLink w={w} id={rated.club.id} crest={14} />
              <b>{rated.elo}</b>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const TREND_METRICS = [
  ['league', '리그 위치'],
  ['elo', 'Elo'],
  ['squad', '선수단 가치'],
  ['club', '구단 가치'],
  ['fans', '서포터'],
  ['cash', '자금'],
] as const;
type TrendMetric = (typeof TREND_METRICS)[number][0];

/**
 * The records charts (→WEB-54), one at a time: league position in the pyramid, Club Elo against
 * the world's and our league's spread, squad and club value, supporters and season-end cash in
 * today's money.
 */
export function ClubTrends({ w }: { w: World }) {
  const club = clubOf(w),
    code = club.country;
  const series = useMemo(() => trendSeries(w), [w.history, w.year, club.tier]);
  const standing = useEloStanding(w);
  const [metric, setMetric] = useTaskState<TrendMetric>(w.id, 'growth-metric', () =>
    new URLSearchParams(location.search).get('part') === 'elo' ? 'elo' : 'league',
  );
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label="추이 지표"
          options={TREND_METRICS}
          value={metric}
          onChange={setMetric}
          wrap
        />
      </div>
      {metric === 'league' && (
        <Panel
          title="리그 위치"
          note={`지금 ${w.lower ? '아마추어 리그' : divisionName(code, club.tier, club.group)}`}
        >
          <div className={s.panelBody}>
            <Chart
              label="피라미드 전체 순위"
              inverse
              values={series.league.values}
              labels={series.league.labels}
              format={(value) => `${Math.round(value)}위`}
              detail={(i) => series.league.details[i]}
            />
            <p className={s.muted}>
              위 디비전의 클럽 수에 그 시즌 순위를 더한 {country(code).name} 피라미드 전체 순위예요.
              1위가 1부 우승이에요. 점을 누르거나 그래프 위를 움직이면 그 시즌의 리그와 순위가 떠요.
            </p>
          </div>
        </Panel>
      )}
      {metric === 'elo' && (
        <Panel title="클럽 Elo" note={`지금 ${standing.elo} · 전체 ${standing.rank}위`}>
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 Elo"
              values={series.elo.values}
              labels={series.elo.labels}
              bands={series.elo.bands}
              format={(value) => String(Math.round(value))}
              detail={(i) => series.elo.details[i]}
            />
            {series.elo.unrated > 0 && (
              <p className={s.muted}>
                Elo가 기록되지 않은 시즌 {series.elo.unrated}개는 그래프에 없어요.
              </p>
            )}
            {series.elo.unranged > 0 && (
              <p className={s.muted}>
                Elo 범위가 기록되지 않은 시즌 {series.elo.unranged}개에는 띠가 없어요.
              </p>
            )}
            <EloStanding w={w} standing={standing} />
            <p className={s.muted}>
              모든 대회 결과로 갱신하는 클럽 Elo예요(K 20, 홈 어드밴티지 60, 큰 점수 차 가중). 강한
              상대를 이기면 많이 오르고 약한 상대에게 지면 많이 떨어져요.
            </p>
          </div>
        </Panel>
      )}
      {metric === 'squad' && (
        <Panel title="선수단 가치" note="현재 물가·화폐로 환산">
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 선수단 가치"
              values={series.squad.values}
              labels={series.squad.labels}
              format={series.axis}
              detail={(i) => series.squad.details[i]}
            />
            <p className={s.muted}>
              시즌 말 선수 전원의 평가 가치(다른 구단이 받아들일 이적료)의 합이에요.
              {series.unvalued > 0 && ` 가치가 기록되지 않은 시즌 ${series.unvalued}개는 빠졌어요.`}
            </p>
          </div>
        </Panel>
      )}
      {metric === 'club' && (
        <Panel title="구단 가치" note="현재 물가·화폐로 환산">
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 구단 가치"
              values={series.club.values}
              labels={series.club.labels}
              format={series.axis}
              detail={(i) => series.club.details[i]}
            />
            <p className={s.muted}>
              선수단 가치 + 시설 투자액의 절반 + 브랜드(서포터 20명당 1단위, 평판 가중) +
              현금(부채는 차감)이에요.
              {series.unvalued > 0 && ` 가치가 기록되지 않은 시즌 ${series.unvalued}개는 빠졌어요.`}
            </p>
          </div>
        </Panel>
      )}
      {metric === 'fans' && (
        <Panel title="서포터의 성장">
          <div className={s.panelBody}>
            <Chart
              label="서포터"
              values={series.fans.values}
              labels={series.fans.labels}
              detail={(i) => series.fans.details[i]}
            />
          </div>
        </Panel>
      )}
      {metric === 'cash' && (
        <Panel title="현재 물가로 본 시즌 말 자금">
          <div className={s.panelBody}>
            <Chart
              label="현재 물가 기준 자금"
              values={series.cash.values}
              labels={series.cash.labels}
              format={series.axis}
              detail={(i) => series.cash.details[i]}
            />
            <p className={s.muted}>
              물가와 화폐 전환을 보정해 지금 돈으로 환산했어요. 초기 국가 자료가 없으면 영국 지수
              추정을 씁니다. 실험 전후 변화는 인과관계의 증명이 아닙니다.
            </p>
          </div>
        </Panel>
      )}
    </>
  );
}

/** One row per closed season, newest first; with `onSeason` a row opens that season (→WEB-54). */
export function SeasonTable({ w, onSeason }: { w: World; onSeason?: (year: number) => void }) {
  const code = clubOf(w).country,
    seasons = w.history;
  const [limit, setLimit] = useTaskState(w.id, 'record-season-limit', 49);
  return (
    <Panel title="시즌별 기록" note={`${seasons.length}시즌`}>
      <div className={s.tableWrap}>
        <table aria-label="시즌별 기록">
          <thead>
            <tr>
              <th scope="col">시즌</th>
              <th scope="col">리그</th>
              <th scope="col">승점</th>
              <th scope="col">컵 대회</th>
              <th scope="col">Elo</th>
              <th scope="col">선수단 가치 · 현재 물가</th>
            </tr>
          </thead>
          <tbody>
            <tr
              className={onSeason ? s.seasonRow : undefined}
              onClick={onSeason && (() => onSeason(w.year))}
            >
              <td>
                <button
                  type="button"
                  className={s.seasonRowLink}
                  aria-label={`${seasonName(w.year)} 구단 시즌 기록 보기`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeason?.(w.year);
                  }}
                >
                  {seasonName(w.year)} · 진행 중
                </button>
              </td>
              <td>{divisionName(code, clubOf(w).tier, clubOf(w).group)}</td>
              <td>{w.tables[w.playerClub]?.points ?? 0}</td>
              <td>진행 중</td>
              <td>{clubOf(w).elo?.toFixed(0) ?? '—'}</td>
              <td>—</td>
            </tr>
            {[...seasons]
              .reverse()
              .slice(0, limit)
              .map((h) => (
                <tr
                  key={h.year}
                  className={onSeason ? s.seasonRow : undefined}
                  onClick={onSeason && (() => onSeason(h.year))}
                >
                  <td>
                    {onSeason ? (
                      <button
                        type="button"
                        className={s.seasonRowLink}
                        aria-label={`${seasonName(h.year)} 구단 시즌 기록 보기`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSeason(h.year);
                        }}
                      >
                        {seasonName(h.year)}
                      </button>
                    ) : (
                      seasonName(h.year)
                    )}
                  </td>
                  <td>
                    {divisionName(code, h.tier, h.group)} {h.rank}위
                  </td>
                  <td>
                    {h.points} ({h.won}-{h.drawn}-{h.lost})
                  </td>
                  <td>
                    {h.runs?.length
                      ? h.runs
                          .map(
                            (run) =>
                              `${run.key === 'cup' ? '컵' : run.name} ${run.champion ? '우승' : run.reached}`,
                          )
                          .join(' · ')
                      : '—'}
                  </td>
                  <td>
                    {h.elo !== undefined
                      ? `${Math.round(h.elo)}${h.eloRank ? ` (${h.eloRank}위)` : ''}`
                      : '—'}
                  </td>
                  <td>
                    {h.squadValue ? (
                      <Money value={inToday(w, h.squadValue, h.year)} code={code} year={w.year} />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {seasons.length > limit && (
          <button type="button" onClick={() => setLimit(limit + 50)}>
            이전 시즌 더 보기 · {seasons.length - limit}시즌
          </button>
        )}
        {!seasons.length && <div className={s.empty}>첫 시즌이 끝나면 기록이 쌓여요.</div>}
      </div>
    </Panel>
  );
}
