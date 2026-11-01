import s from './App.module.css';
import type { Page } from './state';
import type { ReactNode } from 'react';

/**
 * The one-row header of League and Cup (→WEB-40): the competition's selects and its season
 * stepper. The page is kept for the region's name; current and closed seasons share the header.
 */
export function CompetitionHeader({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div
      className={s.competitionScope}
      aria-label="대회 탐색"
      data-competition={page === 'europe' || page === 'cupHistory' ? 'cup' : 'league'}
    >
      {children}
    </div>
  );
}
