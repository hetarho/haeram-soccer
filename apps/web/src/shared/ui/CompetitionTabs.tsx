import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import s from './styles/App.module.css';
import type { Page } from '../routing/state';
import type { ReactNode } from 'react';

/**
 * The one-row header of League and Cup (→WEB-40): the competition's selects and its season
 * stepper. The page is kept for the region's name; current and closed seasons share the header.
 */
export function CompetitionHeader({ page, children }: { page: Page; children: ReactNode }) {
  useTextLocale();
  return (
    <div
      className={s.competitionScope}
      aria-label={displayMessage('copy.CompetitionTabs.4720b89b9a')}
      data-competition={page === 'europe' || page === 'cupHistory' ? 'cup' : 'league'}
    >
      {localizeValue(children)}
    </div>
  );
}
