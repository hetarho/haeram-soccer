import type { Player } from '../../../../packages/contracts/src/types';
import { performanceRows, type PlayerScope } from './playerAnalysis';
import { observedRate } from './matchAnalysis';
import s from './Analysis.module.css';
export function PlayerPerformance({ player, scope }: { player: Player; scope: PlayerScope }) {
  const stats = player[scope],
    pass = observedRate(stats[3], stats[2]);
  return (
    <section className={s.content} aria-label="선수 생산량 분석">
      <h3>{scope === 'season' ? '이번 시즌 · 모든 대회' : '우리 클럽 통산 · 모든 대회'}</h3>
      <p className={s.note}>
        출전 {stats[10]}분 · 90분당 지표는 실제 출전 시간을 기준으로 계산해요.
      </p>
      {stats[10] < 180 && (
        <p className={s.note} role="status">
          표본 주의 · 180분 미만의 기록입니다.
        </p>
      )}
      <dl className={s.facts}>
        {performanceRows(stats).map((row) => (
          <div key={row.label}>
            <dt>{row.label} · 90분당</dt>
            <dd>
              {row.per90 === undefined ? '—' : row.per90.toFixed(2)}
              <small>
                누적 {row.total}회 / {stats[10]}분
              </small>
            </dd>
          </div>
        ))}
        <div>
          <dt>패스 정확도</dt>
          <dd>
            {pass.percent === undefined ? '—' : `${pass.percent.toFixed(1)}%`}
            <small>
              {stats[3]}/{stats[2]} 성공/시도
            </small>
          </dd>
        </div>
      </dl>
    </section>
  );
}
