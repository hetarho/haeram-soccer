import { localizeValue, useTextLocale } from '../../../presentation/text';
import type { HTMLAttributes, ReactNode } from 'react';
import s from './OfficeDesk.module.css';

export type DeskStat = { label: string; value: ReactNode; note?: ReactNode };

/** A work's live figures as one row of tiles. */
export function DeskStats({ label, stats }: { label: string; stats: readonly DeskStat[] }) {
  useTextLocale();
  return (
    <dl
      className={s.stats}
      data-count={stats.length}
      aria-label={localizeValue(label)}
      data-testid="desk-stats"
    >
      {localizeValue(
        stats.map((stat) => (
          <div key={stat.label} data-ui="stat-tile">
            <dt>{localizeValue(stat.label)}</dt>
            <dd>
              <b>{localizeValue(stat.value)}</b>
              {localizeValue(stat.note != null && <small>{localizeValue(stat.note)}</small>)}
            </dd>
          </div>
        )),
      )}
    </dl>
  );
}

/** A work's shared column. */
export function DeskBody({
  children,
  ...props
}: { children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  useTextLocale();
  return (
    <div {...props} className={s.body}>
      {localizeValue(children)}
    </div>
  );
}

/**
 * The office overview's column (→WEB-39): its room scene as an illustrated header, the 결재함 and
 * the team content below, all as wide as the queue.
 */
export function OfficeOverview({ children }: { children: ReactNode }) {
  useTextLocale();
  return (
    <div className={s.overview} data-office-view="lobby">
      {localizeValue(children)}
    </div>
  );
}

/** A desk's approval line and criteria side by side on wide screens, stacked on phones. */
export function DeskSettings({ children }: { children: ReactNode }) {
  useTextLocale();
  return <div className={s.settings}>{localizeValue(children)}</div>;
}
