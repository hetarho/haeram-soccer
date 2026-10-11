import s from './App.module.css';

/** Label-value pairs in two columns, as a person's sheet lists them; an optional hint per label. */
export function Attributes({
  rows,
}: {
  rows: [label: string, value: string | number, hint?: string][];
}) {
  return (
    <div className={s.attributes}>
      {rows.map(([label, v, hint]) => (
        <div className={s.attribute} key={label}>
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
