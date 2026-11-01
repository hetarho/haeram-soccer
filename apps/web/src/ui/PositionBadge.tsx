import type { Position } from '../../../../packages/contracts/src/player';
import { lineOf } from '../../../../packages/engine/src/player';
import { useLocale } from '../presentation/react';
import s from './PositionBadge.module.css';

/**
 * A player's actual position code on its family's colour (→WEB-113): the engine's line decides
 * the family, and the family's name is read before the code, so colour is never the only cue.
 * Informational only: it is never a separate target inside a row's link or button.
 */
export function PositionBadge({ position }: { position: Position }) {
  const { t } = useLocale();
  const line = lineOf(position);
  const family = t(`position.family.${line}`);
  return (
    <span className={s.badge} data-ui="position-badge" data-line={line} title={family}>
      <span className={s.family}>{family} </span>
      {position}
    </span>
  );
}
