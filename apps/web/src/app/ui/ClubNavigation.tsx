import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { useSyncExternalStore } from 'react';
import { officeBack } from '../../shared/routing/clubSections';
import {
  HOME_AREA_ORIGIN,
  openClubOverview,
  openInvestment,
  openPrimary,
  type Page,
} from '../../shared/routing/state';
import { useTaskMemory } from '../../shared/routing/taskMemory';
import { ApprovalButtons } from '../../features/approvals';
import { PixelIcon } from '../../shared/ui/PixelIcon';
import p from '../../shared/ui/styles/ProgressControls.module.css';
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
  const homeArea = useTaskMemory((state) => state.values[HOME_AREA_ORIGIN]);
  const back = officeBack(page, search, homeArea);
  if (!back) return null;
  const detail = back === 'office';
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
            // The dialog returns focus here; focusing must not scroll the view behind it (T714).
            event.currentTarget.focus({ preventScroll: true });
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
