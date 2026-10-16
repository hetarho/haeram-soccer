import type { GameSettings, World } from '../../contracts/src/types';
import { changedResponsibilities } from './responsibilities';
import { pendingDecisions } from './stopping';

/** A pure snapshot for disclosure; applying always queries the live world again. */
export function pendingWorkPreview(w: World, settings: GameSettings) {
  const pending = pendingDecisions(w, true);
  return changedResponsibilities(w, settings).map((key) => {
    const refs = new Set(pending.filter((p) => p.responsibility === key).map((p) => p.ref!));
    if (key === 'recruitment')
      for (const bid of w.bids || [])
        if (bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'))
          refs.add(bid.id);
    return { key, to: settings.responsibilities[key], count: refs.size, refs: [...refs] };
  });
}
