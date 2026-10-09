import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { kindLabel, seasonName } from './format';
import { matchComparison, PD, share } from './advanced';
import { Term } from './Glossary';
import s from './Analysis.module.css';

/** Final analysis of one recorded match: both teams side by side, then our players (→WEB-22). */
export function MatchReport({ record, w }: { record: MatchRecord; w: World }) {
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const players = new Map(w.players.map((p) => [p.id, p]));
  const contributions = record.players
    .filter((p) => players.has(p.id))
    .sort(
      (a, b) =>
        b.metrics[0] - a.metrics[0] ||
        b.metrics[1] - a.metrics[1] ||
        (b.detail?.[PD.xg] ?? 0) +
          (b.detail?.[PD.xa] ?? 0) -
          ((a.detail?.[PD.xg] ?? 0) + (a.detail?.[PD.xa] ?? 0)) ||
        a.id.localeCompare(b.id),
    );
  const rows = matchComparison(record);
  const hundredths = (value: number) => (value / 100).toFixed(2);
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
      <ul className={s.compare} aria-label="두 팀 지표 비교">
        {rows.map((row) => (
          <li key={row.label}>
            <b className={row.lead === 0 ? s.leading : undefined}>{row.home}</b>
            <span>
              <Term id={row.term}>{row.label}</Term>
            </span>
            <b className={row.lead === 1 ? s.leading : undefined}>{row.away}</b>
            <i aria-hidden="true">
              <em style={{ width: `${Math.round(row.homeShare * 100)}%` }} />
            </i>
          </li>
        ))}
      </ul>
      {!record.detail && (
        <p className={s.note}>
          이 경기는 고급 지표(키패스·빅찬스·파이널 서드·PPDA 등)를 기록하기 전 규칙으로 치러졌어요.
        </p>
      )}
      <p className={s.note}>
        성공률 옆 숫자는 성공/시도예요. 시도가 없으면 비율을 계산하지 않아요. 지표 이름을 누르면
        정의를 볼 수 있어요.
      </p>
      <h4>우리 선수 기여 · {contributions.length}명</h4>
      <div className={s.cards}>
        {contributions.map((p) => {
          const d = p.detail;
          return (
            <article key={p.id}>
              <b>{players.get(p.id)!.name}</b>
              <p className={s.note}>
                {p.metrics[10]}분 · {p.metrics[0]}골 · {p.metrics[1]}도움
                {d && (
                  <>
                    {' '}
                    · <Term id="xg">xG</Term> {hundredths(d[PD.xg])} · <Term id="xa">xA</Term>{' '}
                    {hundredths(d[PD.xa])}
                  </>
                )}
              </p>
              <p className={s.note}>
                패스 {p.metrics[3]}/{p.metrics[2]}
                {d && (
                  <>
                    {' '}
                    · <Term id="key-pass">키패스</Term> {d[PD.keyPasses]} ·{' '}
                    <Term id="final-third">파이널 서드</Term>{' '}
                    {share(d[PD.finalThirdCompleted], d[PD.finalThirdPasses])} · 전진{' '}
                    {d[PD.progressivePasses]}
                  </>
                )}
              </p>
              <p className={s.note}>
                유효 슛 {p.metrics[5]}/{p.metrics[4]} · 드리블 {p.metrics[8]}
                {d ? `/${d[PD.takeOns]}` : ''} · 태클 {p.metrics[6]} · 인터셉트 {p.metrics[7]}
                {p.metrics[9] ? ` · 선방 ${p.metrics[9]}` : ''}
              </p>
            </article>
          );
        })}
      </div>
      {!contributions.length && (
        <p className={s.note}>이 경기에는 우리 선수의 개별 기여 기록이 없어요.</p>
      )}
    </section>
  );
}
