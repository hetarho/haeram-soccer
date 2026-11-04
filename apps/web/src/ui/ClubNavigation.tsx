import { useLocale } from '../presentation/react';
import { CLUB_SECTIONS, clubSection, type ClubSection } from './clubSections';
import { TabList } from './PageTabs';
import { openPrimary, type Page } from './state';
import { ApprovalButtons } from './ApprovalButtons';
import s from './ClubNavigation.module.css';

/**
 * The owner's workspace: two left-aligned tabs and the shared approval actions on the right.
 */
export function ClubNavigation({ page }: { page: Page }) {
  const { t } = useLocale();
  const current = clubSection(page);
  if (!current) return null;
  return (
    <div className={s.toolbar}>
      <TabList<ClubSection>
        className={s.tabs}
        tabs={CLUB_SECTIONS}
        value={current}
        onChange={(section) => {
          if (section !== current) openPrimary(section);
        }}
        label={t('club.sections')}
        idPrefix="club-section"
        panel={false}
      />
      <div className={s.actions} role="group" aria-label="결재 메뉴">
        <ApprovalButtons />
      </div>
    </div>
  );
}
