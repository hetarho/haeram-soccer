import type { ManagerStyle } from '../../../../packages/contracts/src/types';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { tacticLabel } from '../../../../packages/engine/src/world';
import s from './StyleCard.module.css';

/** A manager's school as a card: what it is, what it raises and what it costs (→STAFF-14). */
export function StyleCard({ style, compact = false }: { style?: ManagerStyle; compact?: boolean }) {
  if (!style)
    return (
      <div className={`${s.card} ${s.neutral}`} data-testid="style-card">
        <b>기본형</b>
        <small>창단 감독 · 특정 학파의 보정 없이 균형 있게 팀을 운영해요</small>
      </div>
    );
  const info = STYLE_INFO[style];
  return (
    <div className={`${s.card} ${s[style]}`} data-testid="style-card">
      <b>
        {info.label}
        {info.tactic && <span>{tacticLabel[info.tactic]}</span>}
      </b>
      {!compact && <small>{info.school}</small>}
      <ul aria-label={`${info.label} 효과`}>
        {info.pros.map((line) => (
          <li key={line} className={s.pro}>
            ▲ {line}
          </li>
        ))}
        {info.cons.map((line) => (
          <li key={line} className={s.con}>
            ▼ {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
