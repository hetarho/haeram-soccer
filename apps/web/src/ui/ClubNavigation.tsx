import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
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
  useTextLocale();
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
        aria-label={localizeValue(
          detail
            ? sourceMessage('copy.ClubNavigation.8647a2ee50')
            : sourceMessage('copy.ClubNavigation.cb149c35fb'),
        )}
        onClick={() => (detail ? openInvestment() : openPrimary('dashboard'))}
      >
        <PixelIcon name="chevronLeft" size={16} />
        {localizeValue(
          detail ? sourceMessage('copy.ClubNavigation.156cc8acc7') : sourceMessage('fixture.home'),
        )}
      </button>
      <div
        className={s.actions}
        role="group"
        aria-label={displayMessage('copy.ClubNavigation.95d7b417ab')}
      >
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
          {richMessage('copy.ClubNavigation.940af95a36')}
        </button>
        <ApprovalButtons />
      </div>
    </div>
  );
}
