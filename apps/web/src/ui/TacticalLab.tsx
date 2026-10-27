import type { Player, Tactic, World } from '../../../../packages/contracts/src/types';
import { FORMATIONS } from '../../../../packages/engine/src/player';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { FormationPitch } from './FormationPitch';
import { compareTactics, signedPoint } from './tacticComparison';
import s from './Analysis.module.css';
import pitch from './FormationPitch.module.css';

const MODIFIERS = [
  ['possession', '점유 보정'],
  ['pass', '패스 보정'],
  ['shot', '슈팅 보정'],
  ['defense', '수비 보정'],
] as const;

export function TacticalLab({
  w,
  players,
  applied,
  selected,
  opponent,
  onSelect,
}: {
  w: World;
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
          {compareTactics(w, players, applied, opponent).map((row) => (
            <article data-surface="panel" key={row.tactic}>
              <button
                aria-pressed={selected === row.tactic}
                onClick={() => onSelect(row.tactic)}
                aria-label={`${tacticLabel[row.tactic]} 실험 미리보기`}
              >
                {tacticLabel[row.tactic]}
                {row.tactic === applied ? ' · 적용 중' : ''}
              </button>
              {/* The lineup in this tactic's formation, slot by slot as the numbers read it. */}
              <FormationPitch
                compact
                tactic={row.tactic}
                label={`${tacticLabel[row.tactic]} ${FORMATIONS[row.tactic].name} 배치`}
                slot={(index) => {
                  const player = players[index];
                  return (
                    <span className={pitch.name}>
                      {player ? player.name.split(' ').at(-1) : '—'}
                    </span>
                  );
                }}
              />
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
                {MODIFIERS.map(([key, label]) => (
                  <li key={key}>
                    {label} {signedPoint(row.modifiers[key])} pp · 적용 대비{' '}
                    <b>{signedPoint(row[key])} pp</b>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className={s.note}>
          pp는 확률 보정의 퍼센트포인트예요. 보정에는 감독 스타일과 활성 시너지가 포함돼요. 실제
          경기에는 상대 전력·압박과 보정 한도도 작용합니다. 미리보기는 전술을 적용하지 않아요.
          적용하려면 감독에게 요청하세요.
        </p>
      </section>
    </details>
  );
}
