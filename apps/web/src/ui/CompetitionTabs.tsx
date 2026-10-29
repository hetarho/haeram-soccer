import s from './App.module.css';
import { TabList } from './PageTabs';
import { useLocale } from '../presentation/react';
import { useNavigation, type Page } from './state';
import { HISTORY_PAGES, SEASON_PAGES } from './competitionNavigation';
import type { ReactNode } from 'react';
import { TaskReturn } from './TaskReturn';

export function CompetitionHeader({ page, children }: { page: Page; children: ReactNode }) {
  return (
    <div className={s.competitionScope} aria-label="대회 탐색">
      <TaskReturn compact />
      <CompetitionTabs page={page} />
      {children}
    </div>
  );
}

export function CompetitionTabs({ page }: { page: Page }) {
  const { t } = useLocale();
  const setPage = useNavigation((state) => state.setPage);
  const season = SEASON_PAGES.some((candidate) => candidate === page);
  if (!season && !HISTORY_PAGES.some((candidate) => candidate === page)) return null;
  const tabs: [Page, string][] = season
    ? [
        ['league', t('navigation.league')],
        ['europe', t('navigation.europe')],
      ]
    : [
        ['history', t('navigation.clubRecords')],
        ['leagueHistory', t('navigation.pastLeague')],
        ['cupHistory', t('navigation.pastCup')],
      ];
  return (
    <TabList
      className={`${s.seasonTabs} ${s.operationsTabs} ${s.competitionTabs}`}
      tabs={tabs}
      value={page}
      onChange={setPage}
      label={t(season ? 'navigation.season' : 'navigation.history')}
      idPrefix="competition-hub"
    />
  );
}
