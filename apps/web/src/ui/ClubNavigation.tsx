import { useLocale } from '../presentation/react';
import { CLUB_SECTIONS, clubSection, type ClubSection } from './clubSections';
import { TabList } from './PageTabs';
import { openPrimary, type Page } from './state';
import s from './App.module.css';

/**
 * The office's section bar (→WEB-10): 사무실, 훈련 and 운영 over the owner office and its working
 * pages, as the page tabs read (→WEB-69). 사무실 opens the office's queue, never the home
 * briefing; the others resume their section's retained work, a fresh one opening its default
 * (→WEB-74). Our people live in the primary 팀 entry instead (→WEB-112).
 */
export function ClubNavigation({ page }: { page: Page }) {
  const { t } = useLocale();
  const current = clubSection(page);
  if (!current) return null;
  return (
    <TabList<ClubSection>
      className={`${s.seasonTabs} ${s.operationsTabs}`}
      tabs={CLUB_SECTIONS.map(([id, label]) => [id, t(label)] as const)}
      value={current}
      onChange={(section) => {
        if (section !== current) openPrimary(section);
      }}
      label={t('club.sections')}
      idPrefix="club-section"
      panel={false}
    />
  );
}
