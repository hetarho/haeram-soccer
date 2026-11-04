import type { World } from '../../../../packages/contracts/src/types';
import { buildLabel, buildOf } from '../../../../packages/engine/src/build';
import { areaBase, DIRECTION_AREAS, rowInForce, type AreaKey, type RowKey } from './areas';
import s from './DirectionFacts.module.css';

/**
 * The direction rows a decision follows, as the club holds them (→ECON-25, STAFF-15/18/26): set at
 * founding and changed by no owner action or staff rule, so each line only reads.
 */
export function DirectionFacts({ w, rows }: { w: World; rows: readonly RowKey[] }) {
  return (
    <dl className={s.lines}>
      {rows.map((row) => {
        const { label, value } = rowInForce(w, row);
        return (
          <div key={row} className={s.line} data-row={row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * A section's direction areas in force (→WEB-14, WEB-110): each area's card, investment levels,
 * ticket price and staff rows by name, beside the base its rows build (→ECON-34). Nothing here
 * edits: the club keeps the direction it was founded with.
 */
export function DirectionAreas({ w, areas }: { w: World; areas: readonly AreaKey[] }) {
  if (!areas.length) return null;
  return (
    <section
      data-surface="panel"
      className={s.areas}
      aria-label="구단 방향"
      data-testid="direction-areas"
    >
      <header className={s.head}>
        <h3>구단 방향 · {buildLabel(buildOf(w))}</h3>
        <small>자동 처리가 따르는 구단 운영 기준</small>
      </header>
      {areas.map((key) => {
        const area = DIRECTION_AREAS.find((item) => item.key === key)!,
          base = areaBase(w, area);
        return (
          <section key={key} className={s.area} aria-label={area.label} data-area={key}>
            <h4>
              {area.label}
              {base && <small>{base}</small>}
            </h4>
            <DirectionFacts w={w} rows={[...(area.card ? [area.card] : []), ...area.rows]} />
          </section>
        );
      })}
    </section>
  );
}
