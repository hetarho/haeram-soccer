import type { Player, Tactic } from '../../../../packages/contracts/src/types';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { compareTactics, signedPoint } from './tacticComparison';
import s from './Analysis.module.css';

export function TacticalLab({
  players,
  applied,
  selected,
  opponent,
  onSelect,
}: {
  players: Player[];
  applied: Tactic;
  selected: Tactic;
  opponent?: Tactic;
  onSelect: (tactic: Tactic) => void;
}) {
  return (
    <details className={s.disclosure}>
      <summary>전술 실험실 · 네 가지 비교</summary>
      <section className={s.content} aria-label="전술 실험실">
        <p className={s.note}>
          지금 미리 보는 선발 {players.length}명 · 상대{' '}
          {opponent ? tacticLabel[opponent] : '균형 기준'} · 실제 적용 {tacticLabel[applied]} 대비
        </p>
        <div className={s.cards}>
          {compareTactics(players, applied, opponent).map((row) => (
            <article key={row.tactic}>
              <button
                aria-pressed={selected === row.tactic}
                onClick={() => onSelect(row.tactic)}
                aria-label={`${tacticLabel[row.tactic]} 실험 미리보기`}
              >
                {tacticLabel[row.tactic]}
                {row.tactic === applied ? ' · 적용 중' : ''}
              </button>
              <dl className={s.facts}>
                <div>
                  <dt>선발 적합도</dt>
                  <dd>{row.fit}/100</dd>
                </div>
                <div>
                  <dt>경기 피로 비용</dt>
                  <dd>+{row.fatigue.toFixed(1)} /100</dd>
                </div>
              </dl>
              <ul className={s.list}>
                <li>
                  점유 보정 차 <b>{signedPoint(row.possession)} pp</b>
                </li>
                <li>
                  패스 보정 차 <b>{signedPoint(row.pass)} pp</b>
                </li>
                <li>
                  슈팅 보정 차 <b>{signedPoint(row.shot)} pp</b>
                </li>
                <li>
                  수비 보정 차 <b>{signedPoint(row.defense)} pp</b>
                </li>
              </ul>
            </article>
          ))}
        </div>
        <p className={s.note}>
          pp는 확률 보정의 퍼센트포인트 차이예요. 실제 경기에는 상대 전력·압박과 보정 한도도
          작용합니다. 미리보기는 전술을 적용하지 않아요. 적용하려면 감독에게 요청하세요.
        </p>
      </section>
    </details>
  );
}
