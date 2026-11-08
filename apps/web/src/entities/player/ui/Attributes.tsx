import { localizeValue, useTextLocale } from '../../../presentation/text';
import type { ReactNode } from 'react';
import s from '../../../shared/ui/styles/App.module.css';

/** One attribute: a label, a value (a number rounds, an amount comes as `<Money>`) and a hint. */
type AttributeRow = [label: string, value: ReactNode, hint?: string];

/** Label-value pairs in two columns, as a person's sheet lists them; an optional hint per label. */
export function Attributes({ rows }: { rows: AttributeRow[] }) {
  useTextLocale();
  return (
    <div data-ui="attributes" className={s.attributes}>
      {localizeValue(
        rows.map(([label, v, hint]) => (
          <div data-ui="attribute" className={s.attribute} key={label}>
            <span>
              {localizeValue(label)}
              {localizeValue(hint && <small>{localizeValue(hint)}</small>)}
            </span>
            <b>{localizeValue(typeof v === 'number' ? Math.round(v) : v)}</b>
          </div>
        )),
      )}
    </div>
  );
}
