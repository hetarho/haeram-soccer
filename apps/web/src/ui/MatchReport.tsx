import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { kindLabel, seasonName } from './format';
import { matchRates, type observedRate } from './matchAnalysis';
import s from './Analysis.module.css';

function Rate({ rate }: { rate: ReturnType<typeof observedRate> }) {
  return (
    <strong>
      {rate.percent === undefined ? '—' : `${rate.percent.toFixed(1)}%`}
      <small>
        {rate.numerator}/{rate.denominator}
      </small>
    </strong>
  );
}
export function MatchReport({ record, w }: { record: MatchRecord; w: World }) {
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const players = new Map(w.players.map((p) => [p.id, p]));
  const contributions = record.players
    .filter((p) => players.has(p.id))
    .sort(
      (a, b) =>
        b.metrics[0] - a.metrics[0] || b.metrics[1] - a.metrics[1] || a.id.localeCompare(b.id),
    );
  return (
    <section className={s.content} aria-label="경기 분석 리포트">
      <h3>경기 분석 리포트</h3>
      <p className={s.note}>
        {seasonName(record.year)} · {kindLabel[record.kind]} · 정규 90분 최종 집계
      </p>
      <div className={s.matchTeams}>
        <b>
          {name(record.home)}
          <small>홈 · {tacticLabel[record.tactics[0]]}</small>
        </b>
        <span>
          {record.score.home}–{record.score.away}
        </span>
        <b>
          {name(record.away)}
          <small>원정 · {tacticLabel[record.tactics[1]]}</small>
        </b>
      </div>
      <div className={s.metricRows}>
        {matchRates(record).map((row) => (
          <div key={row.label}>
            <Rate rate={row.home} />
            <span>{row.label}</span>
            <Rate rate={row.away} />
          </div>
        ))}
      </div>
      <p className={s.note}>
        위 숫자는 성공/시도예요. 점유는 소유한 분/두 팀의 전체 소유 분입니다. 시도가 없으면 비율을
        계산하지 않아요.
      </p>
      <h4>우리 선수 기여 · {contributions.length}명</h4>
      <div className={s.cards}>
        {contributions.map((p) => (
          <article key={p.id}>
            <b>{players.get(p.id)!.name}</b>
            <p className={s.note}>
              {p.metrics[10]}분 · {p.metrics[0]}골 · {p.metrics[1]}도움
            </p>
            <p className={s.note}>
              패스 {p.metrics[3]}/{p.metrics[2]} · 유효 슛 {p.metrics[5]}/{p.metrics[4]} · 태클{' '}
              {p.metrics[6]} · 선방 {p.metrics[9]}
            </p>
          </article>
        ))}
      </div>
      {!contributions.length && (
        <p className={s.note}>이 경기에는 우리 선수의 개별 기여 기록이 없어요.</p>
      )}
    </section>
  );
}
