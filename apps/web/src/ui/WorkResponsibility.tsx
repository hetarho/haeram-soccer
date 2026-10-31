import { lazy, Suspense } from 'react';
import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((module) => ({ default: module.OwnerOffice })),
);

/**
 * A workflow's own saved responsibilities (→WEB-79): 1군, the market, 코치진 and 유소년 edit theirs
 * through the same guarded confirmation component the 결재라인 overview uses.
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
    <Suspense fallback={<p role="status">결재 설정을 여는 중…</p>}>
      <OwnerOffice
        key={`${w.id}:${scope.join(',')}`}
        client={client}
        controller={controller}
        scope={scope}
      />
    </Suspense>
  );
}
