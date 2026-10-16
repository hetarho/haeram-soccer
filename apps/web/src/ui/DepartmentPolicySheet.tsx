import { lazy, Suspense, useEffect } from 'react';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { useDepartmentPolicy } from './state';
import { useTaskMemory } from './taskMemory';
import { areaOf, DIRECTION_AREAS } from './areas';
import { draftFromRequest, type BoardDraft } from './board';
import { Dialog } from './Dialog';
const StrategyBoard = lazy(() =>
  import('./StrategyBoard').then((module) => ({ default: module.StrategyBoard })),
);

export function DepartmentPolicySheet({ client }: { client: GameClient }) {
  const request = useDepartmentPolicy((state) => state.request);
  const close = useDepartmentPolicy((state) => state.close);
  const w = useGameState((state) => state.view?.world);
  const world = w?.id;
  useEffect(() => close, [world, close]);
  useEffect(() => {
    if (!request || !w) return;
    if (request.policy || request.ticket !== undefined) {
      useTaskMemory.getState().activate(w.id);
      const memory = useTaskMemory.getState();
      const draft = (memory.values['board-draft'] as BoardDraft) ?? {};
      const proposed = draftFromRequest(w, request);
      useTaskMemory.setState({
        values: {
          ...memory.values,
          'board-draft': {
            ...draft,
            ...proposed,
            policy: { ...draft.policy, ...proposed.policy },
          },
        },
      });
    }
  }, [request]);
  if (!request || !w) return null;
  const area = request.area
    ? DIRECTION_AREAS.find((item) => item.key === request.area)!
    : areaOf(request.policy?.key ?? 'ticket');
  return (
    <Dialog label={`${area.label} 운영 방침`} onClose={close} wide>
      <Suspense fallback={<p role="status">운영 방침을 불러오고 있어요.</p>}>
        <StrategyBoard w={w} client={client} department={area.key} onApplied={close} />
      </Suspense>
    </Dialog>
  );
}
