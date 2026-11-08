import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import type { ManagerStyle } from '../../../../../packages/contracts/src/types';
import { STYLE_INFO } from '../../../../../packages/engine/src/styles';
import { tacticLabel } from '../../../../../packages/engine/src/tactics';
import s from './StyleCard.module.css';

/** A manager's school as a card: what it is, what it raises and what it costs (→STAFF-14). */
export function StyleCard({ style, compact = false }: { style?: ManagerStyle; compact?: boolean }) {
  useTextLocale();
  if (!style)
    return (
      <div data-surface="panel" className={`${s.card} ${s.neutral}`} data-testid="style-card">
        <b>{richMessage('copy.StyleCard.2add9ce620')}</b>
        <small>{richMessage('copy.StyleCard.83c88ec6d2')}</small>
      </div>
    );
  const info = STYLE_INFO[style];
  return (
    <div data-surface="panel" className={`${s.card} ${s[style]}`} data-testid="style-card">
      <b>
        {localizeValue(info.label)}
        {localizeValue(info.tactic && <span>{localizeValue(tacticLabel[info.tactic])}</span>)}
      </b>
      {localizeValue(!compact && <small>{localizeValue(info.school)}</small>)}
      <ul aria-label={displayMessage('copy.StyleCard.cc20fb2532', { p0: info.label })}>
        {localizeValue(
          info.pros.map((line) => (
            <li key={line} className={s.pro}>
              ▲ {localizeValue(line)}
            </li>
          )),
        )}
        {localizeValue(
          info.cons.map((line) => (
            <li key={line} className={s.con}>
              ▼ {localizeValue(line)}
            </li>
          )),
        )}
      </ul>
    </div>
  );
}
