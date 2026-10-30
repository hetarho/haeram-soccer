import s from './App.module.css';
import { TabList } from './PageTabs';
import { useLocale } from '../presentation/react';
import { useNavigation, type Page } from './state';
import type { ReactNode } from 'react';

export function CompetitionHeader({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className={s.competitionScope} aria-label="대회 탐색">
      <CompetitionTabs page={page} />
      {children}
    </div>
  );
}

export function CompetitionTabs({ page }: { page: Page }) {
  const { t } = useLocale();
  const setPage = useNavigation((state) => state.setPage);
  // The league picks its season in its own filters; cups keep this season and past records.
  const tabs: [Page, string][] | undefined =
    page === 'europe' || page === 'cupHistory'
      ? [
          ['europe', t('navigation.europe')],
          ['cupHistory', t('navigation.pastCup')],
        ]
      : undefined;
  if (!tabs) return null;
  return (
    <TabList
      className={`${s.seasonTabs} ${s.operationsTabs} ${s.competitionTabs}`}
      tabs={tabs}
      value={page}
      onChange={setPage}
      label={tabs[0]![1]}
      idPrefix="competition-hub"
    />
  );
}
