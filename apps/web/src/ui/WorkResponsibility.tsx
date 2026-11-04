import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { openDecisionSettings } from './state';
import { RESPONSIBILITY_LABELS } from './intervention';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';

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
  return (
    <section data-surface="sheet" aria-label="결재 담당">
      <p>
        {scope
          .map((key) => `${RESPONSIBILITY_LABELS[key]} · ${isDelegated(w, key) ? '자동' : '직접'}`)
          .join(' / ')}
      </p>
      <button
        type="button"
        data-ui="link"
        aria-haspopup="dialog"
        onClick={() => openDecisionSettings(scope[0] ?? 'finance')}
      >
        결재 설정에서 담당·지침 바꾸기
      </button>
    </section>
  );
}
