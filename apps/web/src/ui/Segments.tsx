import s from './App.module.css';

/**
 * A choice between views inside a tab (→WEB-69): one pressed segment in a track. `wrap` lets
 * many segments flow onto further rows on narrow screens instead of squeezing their labels.
 */
export function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
  wrap,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  wrap?: boolean;
}) {
  return (
    <div className={`${s.segments} ${wrap ? s.segmentsWrap : ''}`} role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          className={value === id ? s.selected : undefined}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
