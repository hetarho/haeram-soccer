import type { ReactNode } from 'react';
import s from './DirectionRow.module.css';

/**
 * One row of the club's direction (→WEB-60, →ECON-25): a strategy card and a dial look and act
 * the same — the row's name and question, the option in force at the right, its options as equal
 * chips in their order, and one detail for the option in force or drafted. Tapping an option only
 * reports it; the board drafts it and its 적용 sends it.
 */
export function DirectionRow({
  label,
  question,
  options,
  inForce,
  drafted,
  detail,
  disabled,
  onPick,
  row,
}: {
  label: string;
  question?: string;
  options: readonly string[];
  /** The option in force, −1 when none is (a custom ticket price from an older save). */
  inForce: number;
  /** The drafted option, when the draft moves this row. */
  drafted?: number;
  detail?: ReactNode;
  disabled?: boolean;
  onPick: (index: number) => void;
  /** The row's key, for tests and scrolling. */
  row: string;
}) {
  return (
    <div className={s.row} data-row={row}>
      <div className={s.head}>
        <div>
          <h4>{label}</h4>
          {question && <small>{question}</small>}
        </div>
        <b className={s.inForce}>{inForce >= 0 ? options[inForce] : '사용자 지정'}</b>
      </div>
      <div className={s.options} role="radiogroup" aria-label={label}>
        {options.map((name, index) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={index === inForce}
            aria-label={`${label} ${name}`}
            className={index === drafted ? s.drafted : undefined}
            disabled={disabled}
            onClick={() => onPick(index)}
          >
            {name}
          </button>
        ))}
      </div>
      {detail && (
        <div className={`${s.detail} ${drafted !== undefined ? s.previewing : ''}`}>{detail}</div>
      )}
    </div>
  );
}
