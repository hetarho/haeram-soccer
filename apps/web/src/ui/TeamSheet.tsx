import { lazy, Suspense, useEffect } from 'react';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { useNavigation, useTeamSheet } from './state';

// The sheet loads the first time one opens, keeping it out of the entry (→ARCH-28).
const OpenSheets = lazy(() =>
  import('./TeamSheetDialog').then((module) => ({ default: module.OpenSheets })),
);

/** The one place team sheets open, over any view or sheet (→WEB-58). */
export function TeamSheetHost({ client }: { client: GameClient }) {
  const ids = useTeamSheet((state) => state.ids);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // Sheets belong to the view and the world they were opened from.
  useEffect(() => () => useTeamSheet.getState().reset(), [page, worldId]);
  return ids.length ? (
    <Suspense fallback={null}>
      <OpenSheets ids={ids} client={client} />
    </Suspense>
  ) : null;
}
