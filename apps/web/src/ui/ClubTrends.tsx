import type { SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { country, currency } from '../../../../packages/catalogs/src/index';
import { clubOf, quote } from '../../../../packages/engine/src/world';
import { eloOf, eloRank } from '../../../../packages/engine/src/ratings';
import { ratio } from '../../../../packages/engine/src/primitives';
import { Panel } from './App';
import { Chart } from './Chart';
import { number, seasonName } from './format';
import s from './App.module.css';

/**
 * Overall place in the country's pyramid: every club in the divisions above, then the rank; the
 * amateur league sits below the whole professional game (→HIST-12).
 */
export function pyramidPosition(code: string, h: Pick<SeasonArchive, 'tier' | 'rank'>) {
  const groups = country(code).groups;
  let above = 0;
  for (let tier = 0; tier < Math.min(h.tier, groups.length); tier++)
    above += groups[tier].reduce((sum, size) => sum + size, 0);
  return above + h.rank;
}

/** A past amount in today's money: price index and currency changes both applied. */
function inToday(w: World, amount: string, year: number) {
  const code = clubOf(w).country;
  const today = ratio(amount, BigInt(quote(code, w.year, 10000)), BigInt(quote(code, year, 10000)));
  return Number(today) / currency(code, w.year).units;
}

function divisionText(code: string, tier: number) {
  return tier >= country(code).groups.length ? '아마추어' : `${tier + 1}부`;
}

/** League position, Elo, squad and club value across the career, and one row per season. */
export function ClubTrends({ w }: { w: World }) {
  const club = clubOf(w),
    code = club.country,
    symbol = currency(code, w.year).symbol;
  const seasons = w.history;
  const labels = seasons.map((h) => String(h.year));
  const valued = seasons.filter((h) => h.squadValue && h.clubValue);
  const rated = seasons.filter((h) => h.elo !== undefined);
  const compact = (value: number) =>
    `${symbol}${
      Math.abs(value) >= 1e9
        ? `${(value / 1e9).toFixed(1)}B`
        : Math.abs(value) >= 1e6
          ? `${(value / 1e6).toFixed(1)}M`
          : Math.abs(value) >= 1e3
            ? `${(value / 1e3).toFixed(0)}K`
            : Math.round(value)
    }`;
  return (
    <>
      <div className={s.twoCols}>
        <Panel title="리그 위치" note={`지금 ${w.lower ? '아마추어 리그' : `${club.tier + 1}부`}`}>
          <div className={s.panelBody}>
            <Chart
              label="피라미드 전체 순위"
              inverse
              values={seasons.map((h) => pyramidPosition(code, h))}
              labels={labels}
              format={(value) => `${Math.round(value)}위`}
            />
            <p className={s.muted}>
              위 디비전의 클럽 수에 그 시즌 순위를 더한 {country(code).name} 피라미드 전체 순위예요.
              1위가 1부 우승이에요.
            </p>
          </div>
        </Panel>
        <Panel title="클럽 Elo" note={`지금 ${Math.round(eloOf(club))} · 전체 ${eloRank(w)}위`}>
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 Elo"
              values={rated.map((h) => h.elo!)}
              labels={rated.map((h) => String(h.year))}
            />
            <p className={s.muted}>
              모든 대회 결과로 갱신하는 클럽 Elo예요(K 20, 홈 어드밴티지 60, 큰 점수 차 가중). 강한
              상대를 이기면 많이 오르고 약한 상대에게 지면 많이 떨어져요.
            </p>
          </div>
        </Panel>
        <Panel title="선수단 가치" note="현재 물가·화폐로 환산">
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 선수단 가치"
              values={valued.map((h) => inToday(w, h.squadValue!, h.year))}
              labels={valued.map((h) => String(h.year))}
              format={compact}
            />
            <p className={s.muted}>
              시즌 말 선수 전원의 평가 가치(다른 구단이 받아들일 이적료)의 합이에요.
            </p>
          </div>
        </Panel>
        <Panel title="구단 가치" note="현재 물가·화폐로 환산">
          <div className={s.panelBody}>
            <Chart
              label="시즌 말 구단 가치"
              values={valued.map((h) => inToday(w, h.clubValue!, h.year))}
              labels={valued.map((h) => String(h.year))}
              format={compact}
            />
            <p className={s.muted}>
              선수단 가치 + 시설 투자액의 절반 + 브랜드(서포터 20명당 1단위, 평판 가중) +
              현금(부채는 차감)이에요.
            </p>
          </div>
        </Panel>
      </div>
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
                <th scope="col">선수단 가치</th>
              </tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((h) => (
                <tr key={h.year}>
                  <td>{seasonName(h.year)}</td>
                  <td>
                    {divisionText(code, h.tier)} {h.rank}위
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
                      ? `${number(h.elo)}${h.eloRank ? ` (${h.eloRank}위)` : ''}`
                      : '—'}
                  </td>
                  <td>{h.squadValue ? compact(inToday(w, h.squadValue, h.year)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!seasons.length && <div className={s.empty}>첫 시즌이 끝나면 기록이 쌓여요.</div>}
        </div>
      </Panel>
    </>
  );
}
