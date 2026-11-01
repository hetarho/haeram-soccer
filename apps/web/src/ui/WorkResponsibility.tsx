import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { OwnerOffice } from './OwnerOfficeView';

/**
 * A workflow's own saved responsibilities (→WEB-79): 1군, the market, 코치진 and 유소년 edit theirs
 * through the same guarded confirmation component the 결재라인 overview uses. Mount the panel
 * with its lazy section so it cannot arrive later and push that section's actions under a tap.
 */
export function WorkResponsibility({
  w,
  client,
  controller,
  scope,
}: {
  w: World;
  client: GameClient;
  controller: ProgressionController;
  scope: readonly ResponsibilityKey[];
}) {
  return (
    <OwnerOffice
      key={`${w.id}:${scope.join(',')}`}
      client={client}
      controller={controller}
      scope={scope}
    />
  );
}
