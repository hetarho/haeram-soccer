import { useSyncExternalStore } from 'react';
import { clubSection, operationsView } from './clubSections';
import { openClubOverview, openInvestment, openPrimary, type Page } from './state';
import { INVESTMENT_AREAS } from './investmentAreas';
import { ApprovalButtons } from './ApprovalButtons';
import { PixelIcon } from './PixelIcon';
import p from './ProgressControls.module.css';
import s from './ClubNavigation.module.css';

function subscribeAddress(change: () => void) {
  window.addEventListener('popstate', change);
  window.addEventListener('tasknavigate', change);
  return () => {
    window.removeEventListener('popstate', change);
    window.removeEventListener('tasknavigate', change);
  };
}

/** Office actions stay above the investment directory and its detail pages. */
export function ClubNavigation({ page }: { page: Page }) {
  const search = useSyncExternalStore(
    subscribeAddress,
    () => location.search,
    () => '',
  );
  const params = new URLSearchParams(search);
  const detail =
    page === 'operations' &&
    (operationsView(params.get('view')) !== 'investment' ||
      INVESTMENT_AREAS.some((area) => area.id === params.get('area')));
  if (!clubSection(page)) return null;
  return (
    <div className={s.toolbar}>
      <button
        type="button"
        data-ui="link"
        className={s.back}
        aria-label={detail ? '구단주 사무실로' : '클럽하우스 홈으로'}
        onClick={() => (detail ? openInvestment() : openPrimary('dashboard'))}
      >
        <PixelIcon name="chevronLeft" size={16} />
        {detail ? '사무실로' : '홈'}
      </button>
      <div className={s.actions} role="group" aria-label="사무실 메뉴">
        <button
          type="button"
          data-ui="secondary"
          className={p.approvals}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.currentTarget.focus();
            openClubOverview();
          }}
        >
          오버뷰
        </button>
        <ApprovalButtons />
      </div>
    </div>
  );
}
