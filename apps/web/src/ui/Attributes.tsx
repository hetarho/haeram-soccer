import type { ReactNode } from 'react';
import s from './App.module.css';

/** One attribute: a label, a value (a number rounds, an amount comes as `<Money>`) and a hint. */
type AttributeRow = [label: string, value: ReactNode, hint?: string];

/** Label-value pairs in two columns, as a person's sheet lists them; an optional hint per label. */
export function Attributes({ rows }: { rows: AttributeRow[] }) {
  return (
    <div data-ui="attributes" className={s.attributes}>
      {rows.map(([label, v, hint]) => (
        <div data-ui="attribute" className={s.attribute} key={label}>
          <span>
            {label}
            {hint && <small>{hint}</small>}
          </span>
          <b>{typeof v === 'number' ? Math.round(v) : v}</b>
        </div>
      ))}
    </div>
  );
}
