import type { DirectionKey, World } from '../../../../packages/contracts/src/types';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { DIRECTION_INFO, directionOption } from '../../../../packages/engine/src/direction';
import { areaOf, DIRECTION_AREAS, type AreaKey } from './areas';
import { areaBase, areaSummary } from './board';
import { openDirection } from './state';
import { PixelIcon } from './PixelIcon';
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
            <small>업무 기준에서 바꿔요</small>
          </button>
        );
      })}
    </div>
  );
}

/** Each work view links to its authoritative area sheet, retaining independent drafts. */
export function AreaCriteria({ w, areas }: { w: World; areas: readonly AreaKey[] }) {
  if (!areas.length) return null;
  return (
    <section data-surface="panel" className={s.criteria} aria-label="적용 중인 업무 기준">
      <header className={s.criteriaHead}>
        <h3>업무 기준</h3>
        <small>자동 처리가 따르는 방향이에요</small>
      </header>
      {areas.map((key) => {
        const area = DIRECTION_AREAS.find((area) => area.key === key)!;
        return (
          <button
            type="button"
            className={s.criterion}
            key={key}
            onClick={() => openDirection(key)}
          >
            <span>
              <b>{area.label}</b> · {areaSummary(w, area)} {areaBase(w, area)}
            </span>
            <small>
              기준 편집
              <PixelIcon name="chevronRight" size={12} />
            </small>
          </button>
        );
      })}
    </section>
  );
}
