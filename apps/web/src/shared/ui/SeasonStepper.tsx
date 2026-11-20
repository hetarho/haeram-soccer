import type { ReactNode } from 'react';
import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { PixelIcon } from './PixelIcon';
import { Select } from './Select';
import { seasonName } from '../../presentation/format';
import s from './styles/App.module.css';
import st from './SeasonStepper.module.css';

/** The year an arrow steps to: the next older (−1) or newer (+1) kept season, if there is one. */
export function neighbourSeason(years: readonly number[], value: number, step: -1 | 1) {
  const at = years.indexOf(value);
  return at < 0 ? undefined : years[at + step];
}

/** Adjacent numeric choices share the same controls wherever the selected value is browsed. */
export function NumberStepper({
  values,
  value,
  label,
  selectLabel = label,
  current,
  onChange,
  children,
}: {
  values: readonly number[];
  value: number;
  label: string;
  selectLabel?: string;
  current?: number;
  onChange: (value: number) => void;
  children: ReactNode;
}) {
  useTextLocale();
  const previous = neighbourSeason(values, value, -1),
    next = neighbourSeason(values, value, 1);
  return (
    <div
      className={st.stepper}
      role="group"
      aria-label={displayMessage('copy.SeasonStepper.e4be6a3641', { p0: label })}
    >
      <button
        data-ui="icon"
        type="button"
        className={st.step}
        aria-label={displayMessage('copy.SeasonStepper.0caa3d74a6', { p0: label })}
        disabled={previous === undefined}
        onClick={() => previous !== undefined && onChange(previous)}
      >
        <PixelIcon name="chevronLeft" size={20} />
      </button>
      <Select
        aria-label={localizeValue(selectLabel)}
        className={`${st.select} ${value === current ? st.live : ''}`}
        value={value}
        onValueChange={(next) => onChange(Number(next))}
      >
        {children}
      </Select>
      <button
        data-ui="icon"
        type="button"
        className={st.step}
        aria-label={displayMessage('copy.SeasonStepper.af5ed0b7a4', { p0: label })}
        disabled={next === undefined}
        onClick={() => next !== undefined && onChange(next)}
      >
        <PixelIcon name="chevronRight" size={20} />
      </button>
    </div>
  );
}

/** The season select jumps directly to any retained year, newest first (→WEB-40). */
export function SeasonStepper({
  years,
  value,
  current,
  onChange,
  label = sourceMessage('copy.ClubTrends.a3142392a3'),
}: {
  years: readonly number[];
  value: number;
  current?: number;
  onChange: (year: number) => void;
  label?: string;
}) {
  useTextLocale();
  return (
    <NumberStepper values={years} value={value} label={label} current={current} onChange={onChange}>
      {localizeValue(
        [...years].reverse().map((year) => (
          <option key={year} value={year}>
            {localizeValue(seasonName(year))}
            {localizeValue(
              year === current && (
                <span className={s.srOnly}>{richMessage('copy.LeagueInsights.b2801e8117')}</span>
              ),
            )}
          </option>
        )),
      )}
    </NumberStepper>
  );
}
