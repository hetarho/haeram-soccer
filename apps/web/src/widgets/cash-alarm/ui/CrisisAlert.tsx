import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useGameState } from '../../../runtime/store';
import {
  clubCrisisDetail,
  crisisTitle,
  useProgression,
  type ProgressionController,
} from '../../../runtime/progression';
import { Dialog } from '../../../shared/ui/Dialog';
import { careerOver, ownerStatuses } from '../../../entities/office';
import s from '../../../shared/ui/styles/App.module.css';

/**
 * The warning a 파산 위기 opens when it begins in automatic play (→WEB-56, OWNER-15): the clock
 * stopped for it once, and closing the warning leaves the clock stopped until the owner starts it.
 */
export function CrisisAlert({ controller }: { controller: ProgressionController }) {
  useTextLocale();
  const crisis = useProgression(controller, (state) => state.crisis);
  const w = useGameState((state) => state.view?.world);
  if (!crisis || !w || careerOver(w)) return null;
  const owner = ownerStatuses(w).find((status) => status.id === 'owner');
  const close = () => controller.clearCrisis();
  return (
    <Dialog label={localizeValue(crisisTitle(w, crisis))} onClose={close}>
      <p data-testid="crisis-alert" data-crisis={crisis}>
        {localizeValue(crisis === 'owner' && owner ? owner.detail : clubCrisisDetail(w))}
      </p>
      <p>{richMessage('copy.CrisisAlert.paused')}</p>
      <div className={s.actions}>
        <button data-ui="primary" className={s.primary} onClick={close}>
          {richMessage('copy.stories.1aacb54c49')}
        </button>
      </div>
    </Dialog>
  );
}
