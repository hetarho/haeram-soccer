import { useTextLocale } from '../../../presentation/text';
import { lazy, Suspense, useEffect } from 'react';
import { useClubDetail } from '../../../entities/club';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { useNavigation } from '../../../shared/routing/state';

// The detail loads the first time one opens, keeping it out of the entry (→ARCH-28).
const OpenClubDetails = lazy(() =>
  import('./CareerClubDetail').then((module) => ({ default: module.OpenClubDetails })),
);

/** The one place club details of the career in play open, over any view or detail (→WEB-58). */
export function ClubDetailHost({ client }: { client: GameClient }) {
  useTextLocale();
  const ids = useClubDetail((state) => state.ids);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // Details belong to the view and the world they were opened from.
  useEffect(() => () => useClubDetail.getState().reset(), [page, worldId]);
  return ids.length ? (
    <Suspense fallback={null}>
      <OpenClubDetails ids={ids} client={client} />
    </Suspense>
  ) : null;
}
