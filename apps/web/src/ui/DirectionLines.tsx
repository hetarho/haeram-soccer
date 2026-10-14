import type { DirectionKey, World } from '../../../../packages/contracts/src/types';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { DIRECTION_INFO, directionOption } from '../../../../packages/engine/src/direction';
import { areaOf } from './areas';
import { openDirection } from './state';
import s from './DirectionLines.module.css';

/**
 * The direction rows a delegated decision follows (→WEB-43), each a line naming its option that
 * opens its area on the 방향 board (→WEB-71); `market` is the 매각 기조 card.
 */
export function DirectionLines({
  w,
  rows,
}: {
  w: World;
  rows: readonly (DirectionKey | 'market')[];
}) {
  return (
    <div className={s.lines}>
      {rows.map((row) => {
        const label = row === 'market' ? '매각 기조' : DIRECTION_INFO[row].label,
          value =
            row === 'market' ? cardOf(buildOf(w), 'market').label : directionOption(w, row).name;
        return (
          <button
            key={row}
            type="button"
            className={s.line}
            data-row={row}
            onClick={() => openDirection(areaOf(row).key)}
          >
            <span>
              {label} · <b>{value}</b>
            </span>
            <small>방향에서 바꿔요</small>
          </button>
        );
      })}
    </div>
  );
}
