import type { GameSettings, World } from '../../contracts/src/types';
import { changedResponsibilities } from './responsibilities';
import { pendingDecisions } from './stopping';

/** A pure snapshot for disclosure; applying always queries the live world again. */
export function pendingWorkPreview(w: World, settings: GameSettings) {
  const pending = pendingDecisions(w, true);
  const representedJoint = new Set<string>();
  return changedResponsibilities(w, settings).map((key) => {
    let held = 0;
    const refs = new Set(
      pending
        .filter((p) => {
          if (!p.responsibilities) return p.responsibility === key;
          if (!p.responsibilities.includes(key) || representedJoint.has(p.id)) return false;
          representedJoint.add(p.id);
          if (
            settings.responsibilities[key] === 'delegated' &&
            p.responsibilities.some((part) => settings.responsibilities[part] === 'direct')
          ) {
            held++;
            return false;
          }
          return true;
        })
        .map((p) => p.ref!),
    );
    if (key === 'recruitment')
      for (const bid of w.bids || [])
        if (bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'))
          refs.add(bid.id);
    return {
      key,
      to: settings.responsibilities[key],
      count: refs.size,
      refs: [...refs],
      ...(held ? { held } : {}),
    };
  });
}
