import { PixelIcon } from './PixelIcon';
import { Select } from './Select';
import { seasonName } from './format';
import s from './App.module.css';
import st from './SeasonStepper.module.css';

/** The year an arrow steps to: the next older (−1) or newer (+1) kept season, if there is one. */
export function neighbourSeason(years: readonly number[], value: number, step: -1 | 1) {
  const at = years.indexOf(value);
  return at < 0 ? undefined : years[at + step];
}

/**
 * ‹ season › (→WEB-40): the arrows step to the next older or newer kept season and the select in
 * the middle jumps to any of them, newest first. `years` run oldest first; `current` is the season
 * in progress, marked so for assistive technology without widening the row.
 */
export function SeasonStepper({
  years,
  value,
  current,
  onChange,
  label = '시즌',
}: {
  years: readonly number[];
  value: number;
  current?: number;
  onChange: (year: number) => void;
  label?: string;
}) {
  const older = neighbourSeason(years, value, -1),
    newer = neighbourSeason(years, value, 1);
  return (
    <div className={st.stepper} role="group" aria-label={`${label} 넘기기`}>
      <button
        data-ui="icon"
        type="button"
        className={st.step}
        aria-label={`이전 ${label}`}
        disabled={older === undefined}
        onClick={() => older !== undefined && onChange(older)}
      >
        <PixelIcon name="chevronLeft" size={20} />
      </button>
      <Select
        aria-label={label}
        className={`${st.select} ${value === current ? st.live : ''}`}
        value={value}
        onValueChange={(next) => onChange(Number(next))}
      >
        {[...years].reverse().map((year) => (
          <option key={year} value={year}>
            {seasonName(year)}
            {year === current && <span className={s.srOnly}> · 진행 중</span>}
          </option>
        ))}
      </Select>
      <button
        data-ui="icon"
        type="button"
        className={st.step}
        aria-label={`다음 ${label}`}
        disabled={newer === undefined}
        onClick={() => newer !== undefined && onChange(newer)}
      >
        <PixelIcon name="chevronRight" size={20} />
      </button>
    </div>
  );
}
