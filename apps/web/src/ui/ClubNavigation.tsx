import { useLocale } from '../presentation/react';
import { CLUB_SECTIONS, clubSection, type ClubSection } from './clubSections';
import { TabList } from './PageTabs';
import { openPrimary, type Page } from './state';
import s from './App.module.css';

/**
 * The club's section bar (→WEB-10): 현황, 1군, 코치진, 훈련, 유소년 and 운영 over the clubhouse
 * and every club information page, as the page tabs read (→WEB-69). Each entry resumes its
 * section's retained work, a fresh one opening its default (→WEB-74).
 */
export function ClubNavigation({ page, market }: { page: Page; market: boolean }) {
  const { t } = useLocale();
  const current = clubSection(page, market);
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
