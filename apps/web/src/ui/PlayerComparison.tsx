import { Select } from './Select';
import { useState } from 'react';
import type { Player, World } from '../../../../packages/contracts/src/types';
import { Dialog } from './Dialog';
import { PlayerPerformance } from './PlayerPerformance';
import { performanceRows, type PlayerScope } from './playerAnalysis';
import s from './Analysis.module.css';

const skills = [
  ['공격', 'attack'],
  ['패스', 'passing'],
  ['수비', 'defense'],
  ['골키핑', 'keeper'],
  ['체력', 'stamina'],
  ['잠재력', 'potential'],
  ['피로 · 낮을수록 회복', 'fatigue'],
] as const;
const status = (p: Player) =>
  p.status === 'active'
    ? '활동 중'
    : p.status === 'retired'
      ? '은퇴 · 마지막 보존 능력'
      : '매각 · 마지막 보존 능력';
export function PlayerComparison({
  w,
  initialScope,
  onClose,
}: {
  w: World;
  initialScope: PlayerScope;
  onClose: () => void;
}) {
  const [scope, setScope] = useState(initialScope),
    [a, setA] = useState(''),
    [b, setB] = useState('');
  const pool = w.players.filter((p) => p.status === 'active' || scope === 'career');
  const left = pool.find((p) => p.id === a) || pool[0];
  const right =
    pool.find((p) => p.id === b && p.id !== left?.id) || pool.find((p) => p.id !== left?.id);
  const statsA = left && performanceRows(left[scope]),
    statsB = right && performanceRows(right[scope]);
  return (
    <Dialog
      label="우리 선수 비교"
      onClose={onClose}
      wide
      actions={<button onClick={onClose}>비교 마치기</button>}
    >
      <div className={s.controls}>
        <label>
          함께 비교할 기록{' '}
          <Select
            aria-label="비교 지표 범위"
            value={scope}
            onValueChange={(value) => setScope(value as PlayerScope)}
          >
            <option value="season">현재 시즌 · 모든 대회</option>
            <option value="career">우리 클럽 통산</option>
          </Select>
        </label>
        <label>
          선수 A{' '}
          <Select
            aria-label="비교 선수 A"
            value={left?.id || ''}
            onValueChange={(value) => setA(value)}
          >
            {pool
              .filter((p) => p.id !== right?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role} · {status(p)}
                </option>
              ))}
          </Select>
        </label>
        <label>
          선수 B{' '}
          <Select
            aria-label="비교 선수 B"
            value={right?.id || ''}
            onValueChange={(value) => setB(value)}
          >
            {pool
              .filter((p) => p.id !== left?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role} · {status(p)}
                </option>
              ))}
          </Select>
        </label>
      </div>
      {left && right ? (
        <section className={s.content} aria-label="두 선수 비교 결과">
          <div className={s.matchTeams}>
            <b>
              {left.name}
              <small>
                {left.role} · {status(left)}
              </small>
            </b>
            <span>vs</span>
            <b>
              {right.name}
              <small>
                {right.role} · {status(right)}
              </small>
            </b>
          </div>
          <p className={s.note}>능력은 100점 척도예요. 역할이 다른 선수는 필요한 능력도 달라요.</p>
          <div className={s.metricRows}>
            {skills.map(([label, key]) => (
              <div key={key}>
                <strong>
                  {left[key].toFixed(1)}
                  <progress
                    className={s.skillBar}
                    aria-label={`${left.name} ${label}`}
                    max={100}
                    value={left[key]}
                  />
                </strong>
                <span>{label}</span>
                <strong>
                  {right[key].toFixed(1)}
                  <progress
                    className={s.skillBar}
                    aria-label={`${right.name} ${label}`}
                    max={100}
                    value={right[key]}
                  />
                </strong>
              </div>
            ))}
            <div>
              <strong>
                {left[scope][10]}
                <small>분</small>
              </strong>
              <span>실제 출전</span>
              <strong>
                {right[scope][10]}
                <small>분</small>
              </strong>
            </div>
            {statsA!.map((row, i) => (
              <div key={row.label}>
                <strong>{row.per90 === undefined ? '—' : row.per90.toFixed(2)}</strong>
                <span>{row.label} /90분</span>
                <strong>
                  {statsB![i].per90 === undefined ? '—' : statsB![i].per90!.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
          {(left[scope][10] < 180 || right[scope][10] < 180) && (
            <p className={s.note}>표본 주의 · 한 선수 이상의 출전 기록이 180분 미만이에요.</p>
          )}
          <details className={s.disclosure}>
            <summary>분모·원시 기록 펼치기</summary>
            <PlayerPerformance player={left} scope={scope} />
            <PlayerPerformance player={right} scope={scope} />
          </details>
        </section>
      ) : (
        <p className={s.note}>이 범위에서 비교할 선수 두 명이 필요해요.</p>
      )}
    </Dialog>
  );
}
