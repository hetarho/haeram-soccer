import { useTextLocale } from '../../../presentation/text';
import { lazy, Suspense, useEffect } from 'react';
import { usePlayerDetail } from '../../../entities/player';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { useNavigation } from '../../../ui/state';

// The detail loads the first time one opens, keeping the profile out of the entry (→ARCH-28).
const OpenPlayerDetail = lazy(() =>
  import('./OpenPlayerDetail').then((module) => ({ default: module.OpenPlayerDetail })),
);

/** The one place player details open, over any view or dialog (→WEB-59). */
export function PlayerDetailHost({ client }: { client: GameClient }) {
  useTextLocale();
  const id = usePlayerDetail((state) => state.id);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // A detail belongs to the view and the world it was opened from.
  useEffect(() => () => usePlayerDetail.getState().close(), [page, worldId]);
  return id ? (
    <Suspense fallback={null}>
      <OpenPlayerDetail id={id} client={client} />
    </Suspense>
  ) : null;
}
