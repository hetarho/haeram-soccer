import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { Chart } from './Chart';
import { kindLabel, seasonName } from './format';
import { matchSplit, seasonProgress } from './seasonTrends';
import app from './App.module.css';
import s from './Analysis.module.css';

const VENUES = [
  ['all', '전체'],
  ['home', '홈'],
  ['away', '원정'],
] as const;
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * One season of ours in the chosen competitions (→WEB-54): played, W-D-L and goals overall, at
 * home and away, then the league points and the goal difference as they built up over the season.
 * Open from the start, so a change of season or competition shows at once.
 */
export function SeasonAnalysis({
  w,
  records,
  year,
  scope,
}: {
  w: World;
  records: MatchRecord[];
  year: number;
  scope: string;
}) {
  const club = w.playerClub,
    progress = seasonProgress(records, club),
    league = progress.filter((step) => step.league);
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name ?? id;
  const line = ({ record, result }: (typeof progress)[number]) => {
    const home = record.home === club;
    return `${kindLabel[record.kind]} R${record.round} · ${home ? '홈' : '원정'} ${name(
      home ? record.away : record.home,
    )} ${result.own}–${result.other} ${result.result}`;
  };
  return (
    <div className={s.disclosure}>
      <section className={s.content} aria-label="선택 시즌 분석">
        <h3>
          {seasonName(year)} · {scope}
        </h3>
        <div className={app.tableWrap}>
          <table className={s.split} aria-label="전체·홈·원정 성적">
            <thead>
              <tr>
                <th scope="col">
                  <span className={app.srOnly}>구분</span>
                </th>
                <th scope="col">경기</th>
                <th scope="col">승</th>
                <th scope="col">무</th>
                <th scope="col">패</th>
                <th scope="col">득점</th>
                <th scope="col">실점</th>
                <th scope="col">득실</th>
              </tr>
            </thead>
            <tbody>
              {VENUES.map(([venue, label]) => {
                const split = matchSplit(records, club, venue);
                return (
                  <tr key={venue}>
                    <th scope="row">{label}</th>
                    <td>{split.played}</td>
                    <td>{split.won}</td>
                    <td>{split.drawn}</td>
                    <td>{split.lost}</td>
                    <td>{split.gf}</td>
                    <td>{split.ga}</td>
                    <td>{signed(split.gf - split.ga)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={s.note}>정규 90분 성적이에요. 승부차기 승패는 승·무·패에 넣지 않아요.</p>
        {progress.length ? (
          <>
            {league.length > 0 && (
              <>
                <h4>리그 승점 추이</h4>
                <Chart
                  label="리그 누적 승점"
                  values={league.map((step) => step.points)}
                  labels={league.map((step) => `R${step.record.round}`)}
                  format={(value) => `${Math.round(value)}점`}
                  detail={(i) => `${line(league[i])} · 누적 ${league[i].points}점`}
                />
              </>
            )}
            <h4>득실차 추이</h4>
            <Chart
              label="누적 득실차"
              values={progress.map((step) => step.difference)}
              labels={progress.map((_, i) => `${i + 1}경기`)}
              format={(value) => signed(Math.round(value))}
              detail={(i) => `${line(progress[i])} · 누적 ${signed(progress[i].difference)}`}
            />
          </>
        ) : (
          <p className={s.note}>선택한 범위에는 완료한 경기가 없어요.</p>
        )}
      </section>
    </div>
  );
}
