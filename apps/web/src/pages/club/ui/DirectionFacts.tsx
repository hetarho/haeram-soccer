import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { BudgetResponsibility, World } from '../../../../../../packages/contracts/src/types';
import { buildLabel, buildOf } from '../../../../../../packages/engine/src/build';
import {
  areaBase,
  DIRECTION_AREAS,
  rowInForce,
  type AreaKey,
  type RowKey,
} from '../../../shared/routing/areas';
import {
  actedLevel,
  delegateOf,
  requestLabel,
  requestOf,
  TEMPERAMENT_INFO,
} from '../../../../../../packages/engine/src/delegation-info';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import s from './DirectionFacts.module.css';

/**
 * A compact read of the current operating effects and approval instructions; editing lives in
 * the owner's office detail pages and approval settings.
 */
export function DirectionFacts({
  w,
  rows,
  responsibility,
}: {
  w: World;
  rows: readonly RowKey[];
  responsibility?: BudgetResponsibility;
}) {
  useTextLocale();
  const lines = rows.map((row) => ({ row: row as string, ...rowInForce(w, row) }));
  // The person's plan behind the delegated work: the owner's request as he acts on it.
  if (responsibility) {
    const person = delegateOf(w, responsibility),
      request = requestOf(w, responsibility);
    lines.push({
      row: 'plan',
      label: sourceMessage('delegation.fact.plan'),
      value: isDelegated(w, responsibility)
        ? sourceMessage('delegation.fact.planValue', {
            request: requestLabel(responsibility, request),
            level: requestLabel(responsibility, actedLevel(request, person.temperament)),
            temperament: TEMPERAMENT_INFO[person.temperament].label,
          })
        : sourceMessage('delegation.badge.direct'),
    });
  }
  return (
    <dl className={s.lines}>
      {localizeValue(
        lines.map(({ row, label, value }) => (
          <div key={row} className={s.line} data-row={row}>
            <dt>{localizeValue(label)}</dt>
            <dd>{localizeValue(value)}</dd>
          </div>
        )),
      )}
    </dl>
  );
}

/**
 * A section's direction areas in force (→WEB-14, WEB-110): each area's card, investment levels,
 * ticket price and staff rows by name, beside the base its rows build (→ECON-34).
 */
export function DirectionAreas({ w, areas }: { w: World; areas: readonly AreaKey[] }) {
  useTextLocale();
  if (!areas.length) return null;
  return (
    <section
      data-surface="panel"
      className={s.areas}
      aria-label={displayMessage('copy.catalog.dd3b883de1')}
      data-testid="direction-areas"
    >
      <header className={s.head}>
        <h3>{richMessage('copy.DirectionFacts.4c534c68df', { p0: buildLabel(buildOf(w)) })}</h3>
        <small>{richMessage('copy.DirectionFacts.1dc0a73f47')}</small>
      </header>
      {localizeValue(
        areas.map((key) => {
          const area = DIRECTION_AREAS.find((item) => item.key === key)!,
            base = areaBase(w, area);
          return (
            <section
              key={key}
              className={s.area}
              aria-label={localizeValue(area.label)}
              data-area={key}
            >
              <h4>
                {localizeValue(area.label)}
                {localizeValue(base && <small>{localizeValue(base)}</small>)}
              </h4>
              <DirectionFacts w={w} rows={[...(area.card ? [area.card] : []), ...area.rows]} />
            </section>
          );
        }),
      )}
    </section>
  );
}
