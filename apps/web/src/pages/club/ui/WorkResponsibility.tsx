import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { ResponsibilityKey, World } from '../../../../../../packages/contracts/src/types';
import type { GameClient } from '../../../runtime/client';
import type { ProgressionController } from '../../../runtime/progression';
import { openDecisionSettings } from '../../../shared/routing/state';
import { RESPONSIBILITY_LABELS } from '../../../entities/office/lib/intervention';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';

/**
 * Personnel pages display authority and open its single editing home in approval settings.
 */
export function WorkResponsibility({
  w,
  scope,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  scope: readonly ResponsibilityKey[];
}) {
  useTextLocale();
  return (
    <section data-surface="sheet" aria-label={displayMessage('copy.OwnerOfficeView.ea69dde801')}>
      <p>
        {localizeValue(
          scope
            .map(
              (key) =>
                `${RESPONSIBILITY_LABELS[key]} · ${isDelegated(w, key) ? sourceMessage('copy.ControllerBackgrounds.ca7eb2ef0a') : sourceMessage('copy.ApprovalQueue.20c483bdda')}`,
            )
            .join(' / '),
        )}
      </p>
      <button
        type="button"
        data-ui="link"
        aria-haspopup="dialog"
        onClick={() => openDecisionSettings(scope[0] ?? 'finance')}
      >
        {richMessage('copy.WorkResponsibility.c66e6d2a73')}
      </button>
    </section>
  );
}
