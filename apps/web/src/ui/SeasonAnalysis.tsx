import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { Chart } from './Chart';
import { seasonName } from './format';
import { matchSplit, recentGoalDifferences } from './seasonAnalysis';
import s from './Analysis.module.css';

export function SeasonAnalysis({
  records,
  club,
  year,
  scope,
}: {
  records: MatchRecord[];
  club: string;
  year: number;
  scope: string;
}) {
  const form = recentGoalDifferences(records, club);
  return (
    <details className={s.disclosure}>
      <summary>시즌 분석 · 홈과 원정</summary>
      <section className={s.content} aria-label="선택 시즌 분석">
        <h3>
          {seasonName(year)} · {scope}
        </h3>
        <p className={s.note}>
          선택 범위의 정규 90분 성적이에요. 승부차기 승패는 이 승·무·패 집계에 포함하지 않아요.
        </p>
        <div className={s.cards}>
          {(
            [
              ['all', '전체'],
              ['home', '홈'],
              ['away', '원정'],
            ] as const
          ).map(([venue, label]) => {
            const stats = matchSplit(records, club, venue);
            return (
              <article key={venue} aria-label={`${label} 성적`}>
                <h4>
                  {label} · {stats.played}경기
                </h4>
                <p className={s.note}>
                  {stats.won}승 {stats.drawn}무 {stats.lost}패 · 득점 {stats.gf} / 실점 {stats.ga}
                </p>
                <dl className={s.facts}>
                  <div>
                    <dt>경기당 득점</dt>
                    <dd>
                      {stats.goalsPerMatch === undefined ? '—' : stats.goalsPerMatch.toFixed(2)}
                      <small>
                        {stats.gf}골 / {stats.played}경기
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>패스 정확도</dt>
                    <dd>
                      {stats.pass.percent === undefined ? '—' : `${stats.pass.percent.toFixed(1)}%`}
                      <small>
                        {stats.pass.numerator}/{stats.pass.denominator}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>슈팅 정확도</dt>
                    <dd>
                      {stats.shot.percent === undefined ? '—' : `${stats.shot.percent.toFixed(1)}%`}
                      <small>
                        {stats.shot.numerator}/{stats.shot.denominator}
                      </small>
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        {form.length ? (
          <>
            <h4>최근 {form.length}경기 득실차 · 오래된 순서</h4>
            <Chart
              label="경기 득실차"
              values={form.map((m) => m.difference)}
              labels={form.map((_, i) => `${i + 1}번째`)}
            />
            <p className={s.note}>
              {form
                .map((m, i) => `${i + 1}번째: ${m.difference > 0 ? '+' : ''}${m.difference}`)
                .join(' · ')}
            </p>
          </>
        ) : (
          <p className={s.note}>선택한 범위에는 완료한 경기가 없어요.</p>
        )}
        <p className={s.note}>
          관찰한 성적 차이예요. 상대·선발·전술과 표본이 달라 특정 선택의 효과를 입증하지는 않아요.
        </p>
      </section>
    </details>
  );
}
